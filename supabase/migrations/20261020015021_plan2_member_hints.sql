-- 終審修正 R24：set_project_member 以 HINT 區分 22023 的原因，讓伺服器端依錯誤碼＋HINT 對應訊息，
-- 不再比對中文訊息文字。函式本體與先前版本相同，只在兩個 22023 加上 hint。

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
      raise exception '使用者不是此公司成員' using errcode = '22023', hint = 'not_org_member';
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
      raise exception '案場至少需保留一位設計師或管理者' using errcode = '22023', hint = 'last_editor';
    end if;
  end if;
end
$$;
