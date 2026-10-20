-- Plan 2 Task 2：Storage bucket project-files 與 storage.objects policy
-- 物件路徑：<organization_id>/<project_id>/<kind>/<uuid>-<檔名>（kind 同 project_files.kind）
-- anon 沒有任何 policy（RLS 下讀寫皆為 0 列／被拒），也不能執行判斷函式。

-- ════════════════════════════════════════════════════════════
-- 1. bucket
-- ════════════════════════════════════════════════════════════
-- 不使用 image/* 萬用字元，避免接受 image/svg+xml（SVG 可內嵌指令碼）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files', 'project-files', false, 52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/pdf', 'application/acad', 'image/vnd.dwg', 'application/dxf', 'application/octet-stream'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ════════════════════════════════════════════════════════════
-- 2. 權限判斷函式
-- ════════════════════════════════════════════════════════════
-- security definer：以 postgres 查 projects，不受呼叫者 RLS 可見範圍影響。
-- 格式錯誤的路徑一律回傳 false，不拋出轉型錯誤（避免洩漏資訊或讓 Storage API 回 500）。
-- p_mode：'read'（讀取）、'insert'（上傳）、'delete'（刪除）。
create function app.storage_project_ok(p_name text, p_mode text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[];
  v_project uuid;
  v_org uuid;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_name is null or p_mode is null or auth.uid() is null or not app.mfa_satisfied() then
    return false;
  end if;

  -- 不允許 ..、反斜線；路徑必須恰好 4 段且檔名非空
  if position('..' in p_name) > 0 or position(chr(92) in p_name) > 0 then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  if cardinality(v_parts) <> 4 or v_parts[4] = '' then
    return false;
  end if;

  -- 第 1、2 段須為小寫 uuid 文字（與 project_files.storage_path 的格式一致）
  if v_parts[1] !~ v_uuid_re or v_parts[2] !~ v_uuid_re then
    return false;
  end if;
  if v_parts[3] not in ('floor_plan', 'photo', 'rendering', 'drawing', 'other') then
    return false;
  end if;

  v_project := v_parts[2]::uuid;
  select p.organization_id into v_org from public.projects p where p.id = v_project;
  if v_org is null or v_org::text <> v_parts[1] then
    return false;
  end if;

  return case p_mode
    when 'read' then app.is_project_member(v_project)
    when 'insert' then
      app.is_project_editor(v_project)
      or (v_parts[3] = 'photo' and app.is_project_member(v_project))
    when 'delete' then app.is_project_editor(v_project)
    else false
  end;
end
$$;

revoke all on function app.storage_project_ok(text, text) from public, anon;
grant execute on function app.storage_project_ok(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════
-- 3. storage.objects policy（不建立 update policy：檔案不可覆寫或改名，要換檔就刪除再上傳）
-- ════════════════════════════════════════════════════════════
create policy project_files_select on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and app.storage_project_ok(name, 'read'));

create policy project_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and app.storage_project_ok(name, 'insert'));

create policy project_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and app.storage_project_ok(name, 'delete'));
