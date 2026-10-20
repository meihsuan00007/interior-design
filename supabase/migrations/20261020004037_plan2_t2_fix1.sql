-- Plan 2 Task 2 fix round 1
--   1. [R9] public 包裝函式：PostgREST 只暴露 public，前端以 supabase.rpc() 呼叫；不暴露 schema app。
--   2. [R10] create_client_for_project：案場已有業主時拒絕（22023）。
--   3. storage_project_ok：檔名段不可為 '.'、全空白或含控制字元；監工上傳 photo 須為圖片 mimetype。
--   4. set_project_member：只有移除前案場有可編輯者時，才套用「至少保留一位可編輯者」規則。

-- ════════════════════════════════════════════════════════════
-- 1. create_client_for_project：已有業主則拒絕
-- ════════════════════════════════════════════════════════════
create or replace function app.create_client_for_project(
  p_project uuid,
  p_name_enc text,
  p_phone_enc text,
  p_email_enc text,
  p_national_id_enc text,
  p_name_bidx text,
  p_phone_bidx text,
  p_email_bidx text,
  p_national_id_bidx text
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_client uuid;
  v_id uuid;
begin
  if v_uid is null or not app.mfa_satisfied() then
    raise exception '權限不足' using errcode = '42501';
  end if;

  select p.organization_id into v_org from public.projects p where p.id = p_project;

  -- 案場不存在與無權限回傳同樣的錯誤，不洩漏案場是否存在
  if v_org is null or not app.is_project_editor(p_project) then
    raise exception '無權為此案場建立業主' using errcode = '42501';
  end if;

  if p_name_enc is null or btrim(p_name_enc) = '' then
    raise exception '業主姓名不可空白' using errcode = '22023';
  end if;

  -- 通過權限檢查後才鎖住案場列，避免同時為同一案場建立兩位業主
  select p.client_id into v_client from public.projects p where p.id = p_project for update;
  if v_client is not null then
    raise exception '此案場已有業主' using errcode = '22023';
  end if;

  insert into public.clients (
    organization_id, name_enc, phone_enc, email_enc, national_id_enc,
    name_bidx, phone_bidx, email_bidx, national_id_bidx, created_by
  ) values (
    v_org, p_name_enc, nullif(p_phone_enc, ''), nullif(p_email_enc, ''), nullif(p_national_id_enc, ''),
    nullif(p_name_bidx, ''), nullif(p_phone_bidx, ''), nullif(p_email_bidx, ''), nullif(p_national_id_bidx, ''),
    v_uid
  )
  returning id into v_id;

  update public.projects set client_id = v_id where id = p_project;

  return v_id;
end
$$;

-- ════════════════════════════════════════════════════════════
-- 2. set_project_member：移除前若本來就沒有可編輯者（例如只剩監工），admin 仍可移除
-- ════════════════════════════════════════════════════════════
create or replace function app.set_project_member(p_project uuid, p_user uuid, p_add boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_had_editor boolean;
begin
  if v_uid is null or not app.mfa_satisfied() then
    raise exception '權限不足' using errcode = '42501';
  end if;

  select p.organization_id into v_org from public.projects p where p.id = p_project;

  v_role := case when v_org is null then null else app.org_role(v_org) end;
  if v_role is null or not (
    v_role = 'admin'
    or (
      v_role = 'designer'
      and exists (
        select 1 from public.project_members pm
        where pm.project_id = p_project and pm.user_id = v_uid
      )
    )
  ) then
    raise exception '無權指派此案場成員' using errcode = '42501';
  end if;

  if p_user is null or p_add is null then
    raise exception '使用者與動作不可為空' using errcode = '22023';
  end if;

  -- 通過權限檢查後才鎖住案場列，讓同一案場的成員異動依序執行（避免併發移除造成沒有可編輯者）
  perform 1 from public.projects p where p.id = p_project for update;

  if p_add then
    if not exists (
      select 1 from public.memberships m
      where m.organization_id = v_org and m.user_id = p_user
    ) then
      raise exception '使用者不是此公司成員' using errcode = '22023';
    end if;

    insert into public.project_members (organization_id, project_id, user_id, created_by)
    values (v_org, p_project, p_user, v_uid)
    on conflict (project_id, user_id) do nothing;
  else
    select exists (
      select 1
      from public.project_members pm
      join public.memberships m
        on m.organization_id = v_org and m.user_id = pm.user_id
      where pm.project_id = p_project and m.role in ('admin', 'designer')
    ) into v_had_editor;

    delete from public.project_members pm
    where pm.project_id = p_project and pm.user_id = p_user;

    if found and v_had_editor and not exists (
      select 1
      from public.project_members pm
      join public.memberships m
        on m.organization_id = v_org and m.user_id = pm.user_id
      where pm.project_id = p_project and m.role in ('admin', 'designer')
    ) then
      raise exception '案場至少需保留一位設計師或管理者' using errcode = '22023';
    end if;
  end if;
end
$$;

-- ════════════════════════════════════════════════════════════
-- 3. storage_project_ok：檔名段檢查；監工上傳 photo 須為圖片
-- ════════════════════════════════════════════════════════════
-- Storage API 在 RLS insert 檢查時已填入 metadata.mimetype（取自上傳的 Content-Type），
-- 因此多一個參數 p_mimetype 供 insert 判斷；read／delete 不使用。
create function app.storage_project_ok(p_name text, p_mode text, p_mimetype text) returns boolean
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

  -- 不允許 ..、反斜線、控制字元；路徑必須恰好 4 段
  if position('..' in p_name) > 0 or position(chr(92) in p_name) > 0 or p_name ~ '[[:cntrl:]]' then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  if cardinality(v_parts) <> 4 then
    return false;
  end if;
  -- 檔名段不可為 '.'，且至少要有一個非空白字元
  if v_parts[4] = '.' or v_parts[4] !~ '[^[:space:]]' then
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
      or (
        v_parts[3] = 'photo'
        and coalesce(lower(p_mimetype), '') like 'image/%'
        and lower(p_mimetype) not like 'image/svg%'
        and app.is_project_member(v_project)
      )
    when 'delete' then app.is_project_editor(v_project)
    else false
  end;
end
$$;

revoke all on function app.storage_project_ok(text, text, text) from public, anon;
grant execute on function app.storage_project_ok(text, text, text) to authenticated;

-- 兩參數版本保留介面，轉呼叫三參數版本（無 mimetype：監工上傳一律不通過）
create or replace function app.storage_project_ok(p_name text, p_mode text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.storage_project_ok(p_name, p_mode, null)
$$;

drop policy project_files_insert on storage.objects;
create policy project_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and app.storage_project_ok(name, 'insert', metadata ->> 'mimetype')
  );

-- ════════════════════════════════════════════════════════════
-- 4. [R9] public 包裝函式（security invoker；權限檢查全在 app.* 內）
-- ════════════════════════════════════════════════════════════
create function public.create_project(
  p_org uuid,
  p_name text,
  p_district text,
  p_address_full_enc text,
  p_ping numeric,
  p_condition text,
  p_floor text,
  p_has_elevator boolean,
  p_hoa_rules text,
  p_status text
) returns uuid
language sql volatile security invoker set search_path = ''
as $$
  select app.create_project(p_org, p_name, p_district, p_address_full_enc, p_ping,
                            p_condition, p_floor, p_has_elevator, p_hoa_rules, p_status)
$$;

create function public.create_client_for_project(
  p_project uuid,
  p_name_enc text,
  p_phone_enc text,
  p_email_enc text,
  p_national_id_enc text,
  p_name_bidx text,
  p_phone_bidx text,
  p_email_bidx text,
  p_national_id_bidx text
) returns uuid
language sql volatile security invoker set search_path = ''
as $$
  select app.create_client_for_project(p_project, p_name_enc, p_phone_enc, p_email_enc,
                                       p_national_id_enc, p_name_bidx, p_phone_bidx,
                                       p_email_bidx, p_national_id_bidx)
$$;

create function public.set_project_member(p_project uuid, p_user uuid, p_add boolean) returns void
language sql volatile security invoker set search_path = ''
as $$
  select app.set_project_member(p_project, p_user, p_add)
$$;

create function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, role text)
language sql stable security invoker set search_path = ''
as $$
  select l.user_id, l.email, l.role from app.list_org_members(p_org) l
$$;

revoke all on function
  public.create_project(uuid, text, text, text, numeric, text, text, boolean, text, text),
  public.create_client_for_project(uuid, text, text, text, text, text, text, text, text),
  public.set_project_member(uuid, uuid, boolean),
  public.list_org_members(uuid)
from public, anon;

grant execute on function
  public.create_project(uuid, text, text, text, numeric, text, text, boolean, text, text),
  public.create_client_for_project(uuid, text, text, text, text, text, text, text, text),
  public.set_project_member(uuid, uuid, boolean),
  public.list_org_members(uuid)
to authenticated;
