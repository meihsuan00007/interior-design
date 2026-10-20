-- Plan 2 Task 2：特權函式（建立案場、為案場建立業主、指派案場成員、列出公司成員）
-- 這些函式為 security definer（以 postgres 身分執行、繞過 RLS），所以每個呼叫者檢查都必須明確寫在函式內：
--   * 必須有使用者身分（auth.uid()）且通過 MFA（app.mfa_satisfied()）
--   * 角色與案場權限檢查
--   * 所有引用的 id 都必須屬於呼叫者的公司
-- 錯誤代碼：權限不足 42501；參數不合法 22023。
-- 只授權給 authenticated；public、anon 不可執行。

-- ════════════════════════════════════════════════════════════
-- 1. 建立案場：呼叫者在 p_org 為 admin 或 designer；建立後自動成為案場成員
-- ════════════════════════════════════════════════════════════
create function app.create_project(
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
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := coalesce(p_status, 'lead');
  v_id uuid;
begin
  if v_uid is null or not app.mfa_satisfied() then
    raise exception '權限不足' using errcode = '42501';
  end if;
  if p_org is null or coalesce(app.org_role(p_org), '') not in ('admin', 'designer') then
    raise exception '無權在此公司建立案場' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception '案場名稱不可空白' using errcode = '22023';
  end if;
  if v_status not in ('lead', 'quoting', 'contracted', 'in_progress', 'completed', 'warranty', 'archived') then
    raise exception '不合法的案場狀態：%', v_status using errcode = '22023';
  end if;
  if p_condition is not null and p_condition not in ('new', 'resale', 'old') then
    raise exception '不合法的屋況：%', p_condition using errcode = '22023';
  end if;
  if p_ping is not null and p_ping <= 0 then
    raise exception '坪數必須大於 0' using errcode = '22023';
  end if;

  insert into public.projects (
    organization_id, name, district, address_full_enc, ping, condition,
    floor, has_elevator, hoa_rules, status, created_by
  ) values (
    p_org, btrim(p_name), p_district, p_address_full_enc, p_ping, p_condition,
    p_floor, p_has_elevator, p_hoa_rules, v_status, v_uid
  )
  returning id into v_id;

  insert into public.project_members (organization_id, project_id, user_id, created_by)
  values (p_org, v_id, v_uid, v_uid);

  return v_id;
end
$$;

-- ════════════════════════════════════════════════════════════
-- 2. 為案場建立業主：呼叫者須為案場編輯者（admin，或被指派的 designer）
--    新業主建立在案場所屬公司，並設定 projects.client_id。
--    以 postgres 身分更新，app.check_project_client（Ruling 16）不適用；
--    新業主只連到這一個案場，不會讓呼叫者取得其他業主的個資。
-- ════════════════════════════════════════════════════════════
create function app.create_client_for_project(
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

  -- 通過權限檢查後才鎖住案場列，避免同時為同一案場建立兩位業主
  perform 1 from public.projects p where p.id = p_project for update;

  if p_name_enc is null or btrim(p_name_enc) = '' then
    raise exception '業主姓名不可空白' using errcode = '22023';
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
-- 3. 指派／移除案場成員
--    呼叫者：該公司 admin，或該案場的 designer 成員。
--    加入的使用者必須是同公司成員；重複加入不報錯。移除非成員為 no-op。
--    移除後案場須至少保留一位公司角色為 admin 或 designer 的成員。
-- ════════════════════════════════════════════════════════════
create function app.set_project_member(p_project uuid, p_user uuid, p_add boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
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
    delete from public.project_members pm
    where pm.project_id = p_project and pm.user_id = p_user;

    if found and not exists (
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
-- 4. 列出公司成員（含 Email）：呼叫者須為該公司成員
--    auth.users 不開放給 authenticated，故以 security definer 讀取，且只回傳該公司成員。
-- ════════════════════════════════════════════════════════════
create function app.list_org_members(p_org uuid)
returns table (user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not app.mfa_satisfied()
     or p_org is null or app.org_role(p_org) is null then
    raise exception '無權查看此公司成員' using errcode = '42501';
  end if;

  return query
    select m.user_id, u.email::text, m.role
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_org
    order by m.role, u.email;
end
$$;

-- ════════════════════════════════════════════════════════════
-- 5. 執行權限
-- ════════════════════════════════════════════════════════════
revoke all on function
  app.create_project(uuid, text, text, text, numeric, text, text, boolean, text, text),
  app.create_client_for_project(uuid, text, text, text, text, text, text, text, text),
  app.set_project_member(uuid, uuid, boolean),
  app.list_org_members(uuid)
from public, anon;

grant execute on function
  app.create_project(uuid, text, text, text, numeric, text, text, boolean, text, text),
  app.create_client_for_project(uuid, text, text, text, text, text, text, text, text),
  app.set_project_member(uuid, uuid, boolean),
  app.list_org_members(uuid)
to authenticated;
