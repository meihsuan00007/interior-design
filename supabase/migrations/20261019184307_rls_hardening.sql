-- RLS 強化（Task 6 fix round 1）：
--   1. organization_id、project_id 一經建立不可變更（防止把資料搬到別的租戶／案場）
--   2. projects.client_id 只能指向自己有權限的業主（防止藉改指向讀取他案業主個資）
--   3. quote_item_pricing_meta（加成率可反推成本）的 RLS 與 trigger
--   4. 收回 authenticated / anon 的 truncate、trigger、references 權限

-- ════════════════════════════════════════════════════════════
-- 1. 歸屬欄位不可變更
-- ════════════════════════════════════════════════════════════
-- 參數為不可變更的欄位名稱；trigger 名稱以 b 開頭，確保先於 check_parent_scope 執行，錯誤訊息明確。
create function app.block_scope_change() returns trigger
language plpgsql set search_path = ''
as $$
declare
  col text;
  old_data jsonb := to_jsonb(old);
  new_data jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if (old_data -> col) is distinct from (new_data -> col) then
      raise exception '%.% 不可變更', tg_table_name, col using errcode = '23514';
    end if;
  end loop;
  return new;
end
$$;

do $$
declare
  t text;
begin
  -- 只有 organization_id 的表
  foreach t in array array[
    'memberships', 'audit_logs', 'trades', 'units', 'vendors', 'catalog_items', 'clients', 'projects'
  ] loop
    execute format(
      'create trigger block_scope_change before update on public.%I
         for each row execute function app.block_scope_change(''organization_id'')', t);
  end loop;

  -- 同時有 organization_id 與 project_id 的子表
  foreach t in array array[
    'project_members',
    'quotes', 'quote_versions', 'quote_sections', 'quote_items', 'quote_fees', 'quote_item_pricing_meta',
    'vendor_documents', 'cost_items', 'cost_prices', 'cost_adjustments', 'quote_item_cost_links'
  ] loop
    execute format(
      'create trigger block_scope_change before update on public.%I
         for each row execute function app.block_scope_change(''organization_id'', ''project_id'')', t);
  end loop;
end
$$;

-- ════════════════════════════════════════════════════════════
-- 2. projects.client_id 指向限制
-- ════════════════════════════════════════════════════════════
-- 以呼叫者身分執行（非 security definer），current_user 才能區分一般使用者與特權角色。
-- 一般使用者（authenticated / anon）只有在：該公司 admin，或新業主已關聯到自己可編輯的其他案場時，才可指向。
create function app.check_project_client() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.client_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.client_id is not distinct from old.client_id then
    return new;
  end if;
  -- postgres、service_role 等伺服器端特權角色不受限
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if app.org_role(new.organization_id) = 'admin' then
    return new;
  end if;
  if exists (
    select 1 from public.projects p
    where p.client_id = new.client_id
      and p.id <> new.id
      and app.is_project_editor(p.id)
  ) then
    return new;
  end if;
  raise exception '無權將案場指向此業主' using errcode = '42501';
end
$$;

create trigger check_project_client before insert or update of client_id on public.projects
  for each row execute function app.check_project_client();

-- ════════════════════════════════════════════════════════════
-- 3. quote_item_pricing_meta
-- ════════════════════════════════════════════════════════════
create trigger touch_updated_at before update on public.quote_item_pricing_meta
  for each row execute function app.touch_updated_at();
create trigger check_parent_scope before insert or update on public.quote_item_pricing_meta
  for each row execute function app.check_parent_scope('quote_item_id', 'quote_items', 'true');

alter table public.quote_item_pricing_meta enable row level security;

create policy quote_item_pricing_meta_cost on public.quote_item_pricing_meta for all to authenticated
  using (app.can_view_cost(project_id))
  with check (app.can_view_cost(project_id));

-- ════════════════════════════════════════════════════════════
-- 4. 收回不需要的資料表權限（含日後新建的資料表）
-- ════════════════════════════════════════════════════════════
revoke all on public.quote_item_pricing_meta from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from authenticated, anon;
