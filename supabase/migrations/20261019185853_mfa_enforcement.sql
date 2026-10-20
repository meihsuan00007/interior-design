-- MFA 強制（Task 7 fix round 1）
-- 已啟用 TOTP 的使用者，只有 aal2 的 session 能存取資料；
-- 否則只憑密碼就能以 anon key 直接呼叫 PostgREST 繞過第二步驟驗證。

create function app.mfa_satisfied() returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    (select auth.jwt() ->> 'aal') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
$$;

revoke all on function app.mfa_satisfied() from public;
grant execute on function app.mfa_satisfied() to authenticated, service_role;

-- 所有啟用 RLS 的 public 資料表加上 RESTRICTIVE policy（與既有 permissive policy 取交集）。
-- audit_logs 只限制讀取：登入第二步驟失敗時仍需能寫稽核紀錄。
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname <> 'login_attempts'
  loop
    if t.relname = 'audit_logs' then
      execute format(
        'create policy mfa_required on public.%I as restrictive for select to authenticated
           using (app.mfa_satisfied())', t.relname);
    else
      execute format(
        'create policy mfa_required on public.%I as restrictive for all to authenticated
           using (app.mfa_satisfied()) with check (app.mfa_satisfied())', t.relname);
    end if;
  end loop;
end
$$;

-- 施工範圍 view 以擁有者權限執行、不受上述 policy 約束，需在 WHERE 內加入同樣條件
create or replace view public.quote_items_scope
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
where app.is_project_member(qi.project_id) and app.mfa_satisfied();
