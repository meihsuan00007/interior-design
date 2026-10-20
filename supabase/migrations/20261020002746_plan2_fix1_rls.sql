-- Plan 2 fix round 1：project_files 強化、seed_org_defaults 改用 ON CONFLICT

-- 監工上傳照片時，不可標記為已去識別化（該旗標由設計師審核後設定）
drop policy project_files_insert on public.project_files;
create policy project_files_insert on public.project_files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      app.is_project_editor(project_id)
      or (kind = 'photo' and not is_deidentified and app.is_project_member(project_id))
    )
  );

-- 建立時間一律由資料庫決定，客戶端不能回填日期
create function app.force_created_timestamps() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_at := now();
  new.updated_at := now();
  return new;
end
$$;

create trigger force_created_timestamps before insert on public.project_files
  for each row execute function app.force_created_timestamps();

-- 改用唯一約束 (organization_id, name) 的 ON CONFLICT，避免併發重複
create or replace function app.seed_org_defaults(org uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.trades (organization_id, name, sort, is_proxy_purchase, default_include_in_mgmt_fee)
  select org, d.name, d.ord * 10, d.name = '代購', d.name <> '代購'
  from unnest(array[
    '保護工程', '拆除', '泥作', '水電', '空調', '木作', '鋁門窗', '玄關門', '系統櫃', '衛浴', '玻璃',
    '油漆', '木地板', '石材', '燈具', '窗簾', '貼膜', '清潔', '垃圾清運', '設計費', '監工管理費', '代購', '其他'
  ]) with ordinality as d(name, ord)
  on conflict (organization_id, name) do nothing;

  insert into public.units (organization_id, name, sort)
  select org, d.name, d.ord * 10
  from unnest(array[
    '式', '坪', '尺', '才', '組', '只', '樘', 'm²', '處', '迴', '開', '支', '個', '張', '台', '片', '米', '條', '公分'
  ]) with ordinality as d(name, ord)
  on conflict (organization_id, name) do nothing;
end
$$;
