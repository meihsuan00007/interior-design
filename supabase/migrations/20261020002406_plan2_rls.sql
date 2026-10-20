-- Plan 2：project_files 的 RLS／trigger、預設工種與單位函式

-- ════════════════════════════════════════════════════════════
-- 1. project_files
-- ════════════════════════════════════════════════════════════
alter table public.project_files enable row level security;
revoke all on public.project_files from anon;
-- 檔案中繼資料建立後不可修改（要換檔就刪除再上傳）
revoke update on public.project_files from authenticated;

create policy project_files_select on public.project_files for select to authenticated
  using (app.is_project_member(project_id));

-- 設計師／admin（案場編輯者）可上傳任何類型；監工只能上傳 photo。上傳者必須是自己。
create policy project_files_insert on public.project_files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      app.is_project_editor(project_id)
      or (kind = 'photo' and app.is_project_member(project_id))
    )
  );

create policy project_files_delete on public.project_files for delete to authenticated
  using (app.is_project_editor(project_id));

create policy mfa_required on public.project_files as restrictive for all to authenticated
  using (app.mfa_satisfied()) with check (app.mfa_satisfied());

create trigger touch_updated_at before update on public.project_files
  for each row execute function app.touch_updated_at();
create trigger block_scope_change before update on public.project_files
  for each row execute function app.block_scope_change('organization_id', 'project_id');
create trigger check_parent_scope before insert or update on public.project_files
  for each row execute function app.check_parent_scope('project_id', 'projects', 'false');

-- ════════════════════════════════════════════════════════════
-- 2. 預設工種與單位
-- ════════════════════════════════════════════════════════════
-- 只供特權路徑（種子、日後的公司註冊流程）呼叫；已存在同名項目則略過，可重複執行。
create function app.seed_org_defaults(org uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.trades (organization_id, name, sort, is_proxy_purchase, default_include_in_mgmt_fee)
  select org, d.name, d.ord * 10, d.name = '代購', d.name <> '代購'
  from unnest(array[
    '保護工程', '拆除', '泥作', '水電', '空調', '木作', '鋁門窗', '玄關門', '系統櫃', '衛浴', '玻璃',
    '油漆', '木地板', '石材', '燈具', '窗簾', '貼膜', '清潔', '垃圾清運', '設計費', '監工管理費', '代購', '其他'
  ]) with ordinality as d(name, ord)
  where not exists (
    select 1 from public.trades t where t.organization_id = org and t.name = d.name
  );

  insert into public.units (organization_id, name, sort)
  select org, d.name, d.ord * 10
  from unnest(array[
    '式', '坪', '尺', '才', '組', '只', '樘', 'm²', '處', '迴', '開', '支', '個', '張', '台', '片', '米', '條', '公分'
  ]) with ordinality as d(name, ord)
  where not exists (
    select 1 from public.units u where u.organization_id = org and u.name = d.name
  );
end
$$;

revoke all on function app.seed_org_defaults(uuid) from public, anon, authenticated;
grant execute on function app.seed_org_defaults(uuid) to postgres, service_role;
