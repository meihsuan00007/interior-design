-- 特權函式測試：app.create_project、app.create_client_for_project、app.set_project_member、app.list_org_members
-- 使用 seed.sql 的虛構資料（固定 UUID），另於本交易內建立虛構使用者：
--   甲設計  org      10000000-0000-4000-8000-000000000001
--   乙設計  org      10000000-0000-4000-8000-000000000002
--   甲 admin         20000000-0000-4000-8000-000000000001
--   甲 designer      20000000-0000-4000-8000-000000000002（被指派到案場 A1）
--   甲 supervisor    20000000-0000-4000-8000-000000000003（被指派到案場 A1）
--   乙 admin         20000000-0000-4000-8000-000000000004
--   甲 designer2     20000000-0000-4000-8000-0000000000f5（本測試建立，未指派任何案場）
--   案場 A1          30000000-0000-4000-8000-000000000001
--   案場 A2          30000000-0000-4000-8000-000000000002（無人指派）
begin;

select plan(53);

-- ── 本測試用虛構使用者：未指派案場的甲公司設計師 ─────────────
insert into auth.users (id, aud, role, email)
values ('20000000-0000-4000-8000-0000000000f5', 'authenticated', 'authenticated', 'designer2-fn@jia.example');
insert into memberships (organization_id, user_id, role, can_view_unit_price, can_view_cost)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000f5', 'designer', true, true);

-- ════════════════════════════════════════════════════════════
-- 函式宣告：security definer、search_path 為空、anon／public 不可執行
-- ════════════════════════════════════════════════════════════
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('create_project', 'create_client_for_project', 'set_project_member', 'list_org_members')
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  4::bigint, '四個特權函式皆為 security definer 且 search_path 為空');

select ok(
  not has_function_privilege('anon',
    'app.create_project(uuid, text, text, text, numeric, text, text, boolean, text, text)', 'execute')
  and not has_function_privilege('anon',
    'app.create_client_for_project(uuid, text, text, text, text, text, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'app.set_project_member(uuid, uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'app.list_org_members(uuid)', 'execute'),
  'anon 不能執行任何特權函式');

select is(
  (select count(*) from pg_proc p
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.pronamespace = 'app'::regnamespace
     and p.proname in ('create_project', 'create_client_for_project', 'set_project_member', 'list_org_members')
     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0::bigint, 'public 沒有特權函式的執行權');

select ok(
  has_function_privilege('authenticated', 'app.set_project_member(uuid, uuid, boolean)', 'execute'),
  'authenticated 可執行特權函式');

-- ════════════════════════════════════════════════════════════
-- create_project
-- ════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select set_config('test.p_new', app.create_project(
       '10000000-0000-4000-8000-000000000001', '  虛構新案場 fn  ', '虛構區', 'v1:seed:seed:seed',
       25.5, 'new', '5F', true, '虛構管委會規定', 'lead')::text, true) $$,
  '設計師可建立案場');
select is(
  (select count(*) from projects where id = current_setting('test.p_new')::uuid),
  1::bigint, '建立後同一交易內設計師讀得到新案場');
select is(
  (select name from projects where id = current_setting('test.p_new')::uuid),
  '虛構新案場 fn', '案場名稱前後空白已去除');
select is(
  (select organization_id from projects where id = current_setting('test.p_new')::uuid),
  '10000000-0000-4000-8000-000000000001'::uuid, '新案場屬於指定公司');
select is(
  (select count(*) from project_members
   where project_id = current_setting('test.p_new')::uuid
     and user_id = '20000000-0000-4000-8000-000000000002'),
  1::bigint, '呼叫者自動成為案場成員');

select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '   ', null, null,
       null, null, null, null, null, 'lead') $$,
  '22023', null, '案場名稱空白拋錯');
select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場', null, null,
       null, null, null, null, null, 'closed') $$,
  '22023', null, '不合法的狀態拋錯');
select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場', null, null,
       null, 'ruined', null, null, null, 'lead') $$,
  '22023', null, '不合法的屋況拋錯');
select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場', null, null,
       -1, null, null, null, null, 'lead') $$,
  '22023', null, '坪數為負拋錯');
select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000002', '虛構案場', null, null,
       null, null, null, null, null, 'lead') $$,
  '42501', null, '設計師不能在非所屬公司建立案場');

-- 監工
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場', null, null,
       null, null, null, null, null, 'lead') $$,
  '42501', null, '監工不能建立案場');

-- 乙公司 admin
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場', null, null,
       null, null, null, null, null, 'lead') $$,
  '42501', null, '乙公司 admin 不能在甲公司建立案場');

-- 未登入（無 sub）
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場', null, null,
       null, null, null, null, null, 'lead') $$,
  '42501', null, '沒有使用者身分不能建立案場');

-- ════════════════════════════════════════════════════════════
-- create_client_for_project
-- ════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select set_config('test.c_new', app.create_client_for_project(
       current_setting('test.p_new')::uuid, 'v1:seed:seed:seed', 'v1:seed:seed:seed', null,
       null, 'bidx-name-fn', 'bidx-phone-fn', null, null)::text, true) $$,
  '設計師可為自己的案場建立業主');
select is(
  (select count(*) from clients where id = current_setting('test.c_new')::uuid),
  1::bigint, '設計師讀得到剛建立的業主');
select is(
  (select client_id from projects where id = current_setting('test.p_new')::uuid),
  current_setting('test.c_new')::uuid, '案場已指向新業主');
select is(
  (select organization_id from clients where id = current_setting('test.c_new')::uuid),
  '10000000-0000-4000-8000-000000000001'::uuid, '業主建立在案場所屬公司');

select throws_ok(
  $$ select app.create_client_for_project('30000000-0000-4000-8000-000000000002',
       'v1:seed:seed:seed', null, null, null, null, null, null, null) $$,
  '42501', null, '設計師不能為未指派的案場建立業主');
select throws_ok(
  $$ select app.create_client_for_project(current_setting('test.p_new')::uuid,
       '  ', null, null, null, null, null, null, null) $$,
  '22023', null, '業主姓名空白拋錯');
select throws_ok(
  $$ select app.create_client_for_project('30000000-0000-4000-8000-0000000000ff',
       'v1:seed:seed:seed', null, null, null, null, null, null, null) $$,
  '42501', null, '不存在的案場拋錯');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select app.create_client_for_project('30000000-0000-4000-8000-000000000001',
       'v1:seed:seed:seed', null, null, null, null, null, null, null) $$,
  '42501', null, '監工不能建立業主');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select app.create_client_for_project('30000000-0000-4000-8000-000000000001',
       'v1:seed:seed:seed', null, null, null, null, null, null, null) $$,
  '42501', null, '乙公司 admin 不能為甲公司案場建立業主');

-- ════════════════════════════════════════════════════════════
-- set_project_member
-- ════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-000000000003', true) $$,
  '設計師可把同公司監工加入自己的案場');
select lives_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-000000000003', true) $$,
  '重複加入不拋錯');
select is(
  (select count(*) from project_members
   where project_id = current_setting('test.p_new')::uuid
     and user_id = '20000000-0000-4000-8000-000000000003'),
  1::bigint, '重複加入不會產生重複列');

select throws_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-000000000004', true) $$,
  '22023', null, '不能加入乙公司使用者');
select throws_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-0000000000ee', true) $$,
  '22023', null, '不能加入不存在的使用者');
select throws_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid, null, true) $$,
  '22023', null, '使用者為空拋錯');
select throws_ok(
  $$ select app.set_project_member('30000000-0000-4000-8000-000000000002',
       '20000000-0000-4000-8000-000000000003', true) $$,
  '42501', null, '設計師不能指派未參與的案場');

select throws_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-000000000002', false) $$,
  '22023', null, '不能移除案場唯一的設計師');
select is(
  (select count(*) from project_members
   where project_id = current_setting('test.p_new')::uuid
     and user_id = '20000000-0000-4000-8000-000000000002'),
  1::bigint, '移除失敗後設計師仍是成員');
select lives_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-000000000001', false) $$,
  '移除不是成員的人為 no-op');

-- 未指派的設計師
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-0000000000f5","role":"authenticated"}', true);
select throws_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-0000000000f5', true) $$,
  '42501', null, '未指派的設計師不能把自己加入案場');

-- 監工（已是成員）
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-0000000000f5', true) $$,
  '42501', null, '監工不能指派成員');

-- 乙公司 admin
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select app.set_project_member('30000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000004', true) $$,
  '42501', null, '乙公司 admin 不能指派甲公司案場成員');

-- 甲公司 admin：未參與案場也可指派
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-0000000000f5', true) $$,
  '公司 admin 可指派設計師');

-- 有第二位設計師後，原設計師可移除監工與自己
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-000000000003', false) $$,
  '設計師可移除監工');
select lives_ok(
  $$ select app.set_project_member(current_setting('test.p_new')::uuid,
       '20000000-0000-4000-8000-000000000002', false) $$,
  '還有其他設計師時可移除自己');

reset role;
select is(
  (select array_agg(user_id order by user_id) from project_members
   where project_id = current_setting('test.p_new')::uuid),
  array['20000000-0000-4000-8000-0000000000f5'::uuid], '案場剩下第二位設計師');
set local role authenticated;

-- ════════════════════════════════════════════════════════════
-- list_org_members
-- ════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select role from app.list_org_members('10000000-0000-4000-8000-000000000001')
   where email = 'designer2-fn@jia.example'),
  'designer', '公司成員可列出同公司成員與角色');
select is(
  (select count(*) from app.list_org_members('10000000-0000-4000-8000-000000000001')
   where email = 'admin@yi.example'),
  0::bigint, '列表不含其他公司成員');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ select * from app.list_org_members('10000000-0000-4000-8000-000000000001') $$,
  '42501', null, '乙公司 admin 不能列出甲公司成員');
select ok(
  (select count(*) from app.list_org_members('10000000-0000-4000-8000-000000000002')
   where email = 'admin@yi.example') = 1,
  '乙公司 admin 可列出自己公司成員');

-- ════════════════════════════════════════════════════════════
-- MFA：有 verified factor 而 session 為 aal1 時一律拒絕
-- ════════════════════════════════════════════════════════════
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('90000000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-000000000002',
        'test-fn', 'totp', 'verified', now(), now());
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);

select throws_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場', null, null,
       null, null, null, null, null, 'lead') $$,
  '42501', null, 'aal1：不能建立案場');
select throws_ok(
  $$ select app.create_client_for_project('30000000-0000-4000-8000-000000000001',
       'v1:seed:seed:seed', null, null, null, null, null, null, null) $$,
  '42501', null, 'aal1：不能建立業主');
select throws_ok(
  $$ select app.set_project_member('30000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-0000000000f5', true) $$,
  '42501', null, 'aal1：不能指派成員');
select throws_ok(
  $$ select * from app.list_org_members('10000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'aal1：不能列出成員');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$ select app.create_project('10000000-0000-4000-8000-000000000001', '虛構案場 aal2', null, null,
       null, null, null, null, null, null) $$,
  'aal2：可建立案場（狀態為空時使用預設 lead）');

-- ════════════════════════════════════════════════════════════
-- anon 實際呼叫
-- ════════════════════════════════════════════════════════════
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select app.list_org_members('10000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon 呼叫特權函式被拒');

reset role;
select * from finish();
rollback;
