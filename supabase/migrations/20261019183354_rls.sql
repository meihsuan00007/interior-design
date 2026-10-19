-- 多租戶 RLS：輔助函式、一致性 trigger、row level security policy、監工用施工範圍 view。
-- 手寫遷移（drizzle-kit generate --custom --name rls）。規則見 task-6 brief 與 CLAUDE.md。

-- ════════════════════════════════════════════════════════════
-- 1. schema app 與權限輔助函式
-- ════════════════════════════════════════════════════════════
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- 目前使用者在該公司的角色；不是成員則為 null
create function app.org_role(org uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.organization_id = org and m.user_id = auth.uid()
$$;

-- 是案場成員（project_members），或是該案場所屬公司的 admin。
-- 仍須是該公司成員：被移出公司即失去所有案場權限。
create function app.is_project_member(project uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.memberships m
      on m.organization_id = p.organization_id and m.user_id = auth.uid()
    where p.id = project
      and (
        m.role = 'admin'
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.user_id = auth.uid()
        )
      )
  )
$$;

-- 案場成員且角色為 admin 或 designer（可看金額、可編輯報價）
create function app.is_project_editor(project uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_project_member(project)
    and app.org_role((select p.organization_id from public.projects p where p.id = project))
        in ('admin', 'designer')
$$;

-- 案場成員、角色為 admin 或 designer，且 memberships.can_view_cost = true
create function app.can_view_cost(project uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_project_editor(project)
    and exists (
      select 1
      from public.projects p
      join public.memberships m
        on m.organization_id = p.organization_id and m.user_id = auth.uid()
      where p.id = project and m.can_view_cost
    )
$$;

revoke all on function app.org_role(uuid), app.is_project_member(uuid),
  app.is_project_editor(uuid), app.can_view_cost(uuid) from public;
grant execute on function app.org_role(uuid), app.is_project_member(uuid),
  app.is_project_editor(uuid), app.can_view_cost(uuid) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 2. trigger：updated_at、父表一致性
-- ════════════════════════════════════════════════════════════
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 檢查外鍵指向的父表與本列屬於同一公司（及同一案場）。
-- 參數每 3 個一組：外鍵欄位名稱、父表名稱、是否同時比對 project_id（'true' / 'false'）。
-- 父表為 projects 時，比對公司即可（project_id 本身就是外鍵）。
create function app.check_parent_scope() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
  i int := 0;
  fk_column text;
  parent_table text;
  check_project boolean;
  fk_value uuid;
  parent_org uuid;
  parent_project uuid;
begin
  while i < tg_nargs loop
    fk_column := tg_argv[i];
    parent_table := tg_argv[i + 1];
    check_project := tg_argv[i + 2]::boolean;
    fk_value := (row_data ->> fk_column)::uuid;

    if fk_value is not null then
      if check_project then
        execute format('select organization_id, project_id from public.%I where id = $1', parent_table)
          into parent_org, parent_project using fk_value;
      else
        execute format('select organization_id from public.%I where id = $1', parent_table)
          into parent_org using fk_value;
      end if;

      -- 父列不存在時交由外鍵約束報錯
      if parent_org is not null and (
        parent_org <> (row_data ->> 'organization_id')::uuid
        or (check_project and parent_project is distinct from (row_data ->> 'project_id')::uuid)
      ) then
        raise exception '%.% 指向的 % 不屬於同一公司或案場', tg_table_name, fk_column, parent_table
          using errcode = '23514';
      end if;
    end if;

    i := i + 3;
  end loop;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'memberships', 'project_members',
    'trades', 'units', 'vendors', 'catalog_items',
    'clients', 'projects',
    'quotes', 'quote_versions', 'quote_sections', 'quote_items', 'quote_fees',
    'vendor_documents', 'cost_items', 'cost_prices', 'cost_adjustments', 'quote_item_cost_links'
  ] loop
    execute format(
      'create trigger touch_updated_at before update on public.%I
         for each row execute function app.touch_updated_at()', t);
  end loop;
end
$$;

create trigger check_parent_scope before insert or update on public.project_members
  for each row execute function app.check_parent_scope('project_id', 'projects', 'false');
create trigger check_parent_scope before insert or update on public.catalog_items
  for each row execute function app.check_parent_scope(
    'trade_id', 'trades', 'false', 'unit_id', 'units', 'false', 'default_vendor_id', 'vendors', 'false');
create trigger check_parent_scope before insert or update on public.projects
  for each row execute function app.check_parent_scope('client_id', 'clients', 'false');
create trigger check_parent_scope before insert or update on public.quotes
  for each row execute function app.check_parent_scope('project_id', 'projects', 'false');
create trigger check_parent_scope before insert or update on public.quote_versions
  for each row execute function app.check_parent_scope('quote_id', 'quotes', 'true');
create trigger check_parent_scope before insert or update on public.quote_sections
  for each row execute function app.check_parent_scope(
    'version_id', 'quote_versions', 'true', 'trade_id', 'trades', 'false');
create trigger check_parent_scope before insert or update on public.quote_items
  for each row execute function app.check_parent_scope(
    'version_id', 'quote_versions', 'true', 'section_id', 'quote_sections', 'true',
    'parent_id', 'quote_items', 'true', 'catalog_item_id', 'catalog_items', 'false');
create trigger check_parent_scope before insert or update on public.quote_fees
  for each row execute function app.check_parent_scope('version_id', 'quote_versions', 'true');
create trigger check_parent_scope before insert or update on public.vendor_documents
  for each row execute function app.check_parent_scope(
    'project_id', 'projects', 'false', 'vendor_id', 'vendors', 'false', 'trade_id', 'trades', 'false');
create trigger check_parent_scope before insert or update on public.cost_items
  for each row execute function app.check_parent_scope(
    'project_id', 'projects', 'false', 'vendor_id', 'vendors', 'false', 'trade_id', 'trades', 'false');
create trigger check_parent_scope before insert or update on public.cost_prices
  for each row execute function app.check_parent_scope(
    'cost_item_id', 'cost_items', 'true', 'vendor_document_id', 'vendor_documents', 'true');
create trigger check_parent_scope before insert or update on public.cost_adjustments
  for each row execute function app.check_parent_scope('vendor_document_id', 'vendor_documents', 'true');
create trigger check_parent_scope before insert or update on public.quote_item_cost_links
  for each row execute function app.check_parent_scope(
    'quote_item_id', 'quote_items', 'true', 'cost_item_id', 'cost_items', 'true');

-- 子項的版本必須與母項、區段相同（check_parent_scope 只比對公司與案場）
create function app.check_quote_item_version() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.quote_sections s where s.id = new.section_id and s.version_id = new.version_id
  ) then
    raise exception 'quote_items.section_id 不屬於同一報價版本' using errcode = '23514';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.quote_items q where q.id = new.parent_id and q.version_id = new.version_id
  ) then
    raise exception 'quote_items.parent_id 不屬於同一報價版本' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger check_quote_item_version before insert or update on public.quote_items
  for each row execute function app.check_quote_item_version();

-- ════════════════════════════════════════════════════════════
-- 3. 啟用 RLS；匿名角色不得直接存取任何資料表
-- ════════════════════════════════════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'memberships', 'project_members', 'audit_logs',
    'trades', 'units', 'vendors', 'catalog_items',
    'clients', 'projects',
    'quotes', 'quote_versions', 'quote_sections', 'quote_items', 'quote_fees',
    'vendor_documents', 'cost_items', 'cost_prices', 'cost_adjustments', 'quote_item_cost_links'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

revoke all on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- ════════════════════════════════════════════════════════════
-- 4. policy
-- ════════════════════════════════════════════════════════════

-- 公司
create policy organizations_select on public.organizations for select to authenticated
  using (app.org_role(id) is not null);
create policy organizations_admin_write on public.organizations for all to authenticated
  using (app.org_role(id) = 'admin') with check (app.org_role(id) = 'admin');

-- 公司成員
create policy memberships_select on public.memberships for select to authenticated
  using (app.org_role(organization_id) is not null);
create policy memberships_admin_write on public.memberships for all to authenticated
  using (app.org_role(organization_id) = 'admin')
  with check (app.org_role(organization_id) = 'admin');

-- 案場成員：成員可看同案場名單，只有 admin 能指派或移出
create policy project_members_select on public.project_members for select to authenticated
  using (app.is_project_member(project_id));
create policy project_members_admin_write on public.project_members for all to authenticated
  using (app.org_role(organization_id) = 'admin')
  with check (app.org_role(organization_id) = 'admin');

-- 稽核紀錄：只有 admin 能讀；同公司成員能以自己的身分新增；不允許 update / delete
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (app.org_role(organization_id) = 'admin');
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (app.org_role(organization_id) is not null and actor_id = auth.uid());
revoke update, delete, truncate on public.audit_logs from authenticated, anon, service_role;

-- 主檔：同公司成員可讀，admin / designer 可寫
do $$
declare
  t text;
begin
  foreach t in array array['trades', 'units', 'vendors', 'catalog_items'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (app.org_role(organization_id) is not null)', t);
    execute format(
      'create policy %1$s_write on public.%1$I for all to authenticated
         using (app.org_role(organization_id) in (''admin'', ''designer''))
         with check (app.org_role(organization_id) in (''admin'', ''designer''))', t);
  end loop;
end
$$;

-- 案場：成員可讀；admin / designer 可在自己公司新增，可修改、刪除自己參與的案場
create policy projects_select on public.projects for select to authenticated
  using (app.is_project_member(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (app.org_role(organization_id) in ('admin', 'designer'));
create policy projects_update on public.projects for update to authenticated
  using (app.is_project_editor(id))
  with check (app.org_role(organization_id) in ('admin', 'designer'));
create policy projects_delete on public.projects for delete to authenticated
  using (app.is_project_editor(id));

-- 業主（個資）：admin 可讀寫全公司；designer 只能讀寫關聯到自己參與案場的業主；監工完全讀不到
create policy clients_select on public.clients for select to authenticated
  using (
    app.org_role(organization_id) = 'admin'
    or exists (
      select 1 from public.projects p
      where p.client_id = clients.id and app.is_project_editor(p.id)
    )
  );
create policy clients_insert on public.clients for insert to authenticated
  with check (app.org_role(organization_id) in ('admin', 'designer'));
create policy clients_update on public.clients for update to authenticated
  using (
    app.org_role(organization_id) = 'admin'
    or exists (
      select 1 from public.projects p
      where p.client_id = clients.id and app.is_project_editor(p.id)
    )
  )
  with check (app.org_role(organization_id) in ('admin', 'designer'));
create policy clients_delete on public.clients for delete to authenticated
  using (app.org_role(organization_id) = 'admin');

-- 報價區段（不含金額）：案場成員可讀，admin / designer 可寫
create policy quote_sections_select on public.quote_sections for select to authenticated
  using (app.is_project_member(project_id));
create policy quote_sections_write on public.quote_sections for all to authenticated
  using (app.is_project_editor(project_id)) with check (app.is_project_editor(project_id));

-- 含金額的報價資料：只有案場的 admin / designer（監工讀不到，改讀 quote_items_scope）
do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'quote_versions', 'quote_items', 'quote_fees'] loop
    execute format(
      'create policy %1$s_editor on public.%1$I for all to authenticated
         using (app.is_project_editor(project_id))
         with check (app.is_project_editor(project_id))', t);
  end loop;
end
$$;

-- 成本：只有 app.can_view_cost
do $$
declare
  t text;
begin
  foreach t in array array[
    'vendor_documents', 'cost_items', 'cost_prices', 'cost_adjustments', 'quote_item_cost_links'
  ] loop
    execute format(
      'create policy %1$s_cost on public.%1$I for all to authenticated
         using (app.can_view_cost(project_id))
         with check (app.can_view_cost(project_id))', t);
  end loop;
end
$$;

-- ════════════════════════════════════════════════════════════
-- 5. 施工範圍 view（監工用，無任何單價或金額欄位）
-- ════════════════════════════════════════════════════════════
-- 擁有者為 postgres（具 BYPASSRLS），以擁有者權限讀 quote_items（security_invoker = false），
-- 再於 view 內以 app.is_project_member 過濾；security_barrier 防止使用者條件先於過濾執行。
create view public.quote_items_scope
with (security_invoker = false, security_barrier = true)
as
select
  qi.id,
  qi.organization_id,
  qi.project_id,
  qi.version_id,
  qi.section_id,
  qi.parent_id,
  qi.sort,
  qi.item_no_label,
  qi.name,
  qi.unit_name,
  qi.spec,
  qi.quantity,
  qi.note
from public.quote_items qi
where app.is_project_member(qi.project_id);

revoke all on public.quote_items_scope from public, anon, authenticated;
grant select on public.quote_items_scope to authenticated, service_role;
