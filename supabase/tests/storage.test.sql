-- Storage 權限測試：bucket project-files 的 storage.objects policy 與 app.storage_project_ok
-- 直接以 authenticated + jwt claims 對 storage.objects 讀寫，模擬 Storage API 的權限判斷。
--   甲設計  org      10000000-0000-4000-8000-000000000001
--   乙設計  org      10000000-0000-4000-8000-000000000002
--   甲 admin         20000000-0000-4000-8000-000000000001
--   甲 designer      20000000-0000-4000-8000-000000000002（被指派到案場 A1）
--   甲 supervisor    20000000-0000-4000-8000-000000000003（被指派到案場 A1）
--   乙 admin         20000000-0000-4000-8000-000000000004
--   甲 designer2     20000000-0000-4000-8000-0000000000f6（本測試建立，未指派任何案場）
--   案場 A1          30000000-0000-4000-8000-000000000001
--   案場 A2          30000000-0000-4000-8000-000000000002（無人指派）
begin;

select plan(44);

insert into auth.users (id, aud, role, email)
values ('20000000-0000-4000-8000-0000000000f6', 'authenticated', 'authenticated', 'designer2-st@jia.example');
insert into memberships (organization_id, user_id, role, can_view_unit_price, can_view_cost)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000f6', 'designer', true, true);

-- ════════════════════════════════════════════════════════════
-- bucket 設定
-- ════════════════════════════════════════════════════════════
select is((select public from storage.buckets where id = 'project-files'), false, 'bucket 非公開');
select is((select file_size_limit from storage.buckets where id = 'project-files'), 52428800::bigint,
  'bucket 單檔上限 50 MiB');
select ok((select allowed_mime_types from storage.buckets where id = 'project-files')
  @> array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
           'application/pdf', 'application/acad', 'image/vnd.dwg', 'application/dxf', 'application/octet-stream'],
  'bucket 允許的檔案類型齊全');
select ok(not (select allowed_mime_types from storage.buckets where id = 'project-files')
  && array['image/svg+xml', 'image/*'],
  'bucket 不允許 SVG，也不使用 image/* 萬用字元');
select is(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'project_files%' and cmd in ('UPDATE', 'ALL')),
  0::bigint, 'project-files 沒有 update policy');
select is(
  (select coalesce(string_agg(policyname, ', '), '') from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'project_files%'
     and roles <> array['authenticated']::name[]),
  '', 'project-files policy 只授予 authenticated');

-- ════════════════════════════════════════════════════════════
-- project_files 不允許 SVG
-- ════════════════════════════════════════════════════════════
select throws_ok(
  $$ insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind, uploaded_by)
     values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
             '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/drawing/a-x.svg',
             'x.svg', 'image/svg+xml', 10, 'drawing', '20000000-0000-4000-8000-000000000002') $$,
  '23514', null, 'project_files 不接受 image/svg+xml');
select throws_ok(
  $$ insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind, uploaded_by)
     values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
             '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/a-x.svg',
             'x.svg', 'Image/SVG+XML', 10, 'photo', '20000000-0000-4000-8000-000000000002') $$,
  '23514', null, 'project_files 不接受大小寫變化的 SVG');

-- ════════════════════════════════════════════════════════════
-- 輔助函式：格式錯誤的路徑回傳 false、不拋錯
-- ════════════════════════════════════════════════════════════
select is(app.storage_project_ok('garbage', 'read'), false, '單段路徑回傳 false');
select is(app.storage_project_ok('not-a-uuid/also-not/photo/a.jpg', 'read'), false, '非 uuid 段回傳 false');
select is(app.storage_project_ok(null, 'read'), false, 'null 路徑回傳 false');
select is(
  app.storage_project_ok('10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/a.jpg', 'bogus'),
  false, '未知模式回傳 false');

-- ════════════════════════════════════════════════════════════
-- 測試物件（以 postgres 建立，模擬既有檔案）
-- ════════════════════════════════════════════════════════════
insert into storage.objects (id, bucket_id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'project-files',
   '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/floor_plan/a1-plan.pdf'),
  ('a0000000-0000-4000-8000-000000000002', 'project-files',
   '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/photo/a2-site.jpg'),
  -- 第 1 段公司與案場不符（乙公司 + 甲公司案場 A1）
  ('a0000000-0000-4000-8000-000000000003', 'project-files',
   '10000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000001/photo/spoof.jpg'),
  -- 格式錯誤
  ('a0000000-0000-4000-8000-000000000004', 'project-files', 'not-a-uuid/whatever/photo/bad.jpg'),
  ('a0000000-0000-4000-8000-000000000005', 'project-files',
   '10000000-0000-4000-8000-000000000001/not-a-uuid/photo/bad.jpg');

-- ════════════════════════════════════════════════════════════
-- 讀取
-- ════════════════════════════════════════════════════════════
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select array_agg(id order by id) from storage.objects where id::text like 'a0000000-%'),
  array['a0000000-0000-4000-8000-000000000001'::uuid], '設計師只讀得到自己案場的物件（格式錯誤者不拋錯）');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select array_agg(id order by id) from storage.objects where id::text like 'a0000000-%'),
  array['a0000000-0000-4000-8000-000000000001'::uuid], '監工讀得到被指派案場的物件');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select array_agg(id order by id) from storage.objects where id::text like 'a0000000-%'),
  array['a0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid],
  '甲 admin 讀得到全公司案場物件，但讀不到公司段不符的物件');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
select is((select count(*) from storage.objects where id::text like 'a0000000-%'), 0::bigint,
  '未指派的設計師讀到 0');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from storage.objects where id::text like 'a0000000-%'), 0::bigint,
  '乙公司 admin 讀到 0');

-- ════════════════════════════════════════════════════════════
-- 上傳（insert）
-- ════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/b1-site.jpg') $$,
  '監工可上傳到被指派案場的 photo');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/floor_plan/b2-plan.pdf') $$,
  '42501', null, '監工不能上傳 floor_plan');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/photo/b3-site.jpg') $$,
  '42501', null, '監工不能上傳到未指派案場');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/floor_plan/b4-plan.pdf') $$,
  '設計師可上傳 floor_plan 到自己案場');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000002/floor_plan/b5-plan.pdf') $$,
  '42501', null, '設計師不能上傳到未指派案場');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000001/photo/b6-spoof.jpg') $$,
  '42501', null, '路徑第 1 段公司與案場不符時不能上傳');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       'not-a-uuid/30000000-0000-4000-8000-000000000001/photo/b7.jpg') $$,
  '42501', null, '格式錯誤的路徑被拒（不洩漏轉型錯誤）');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/secret/b8.pdf') $$,
  '42501', null, '不合法的 kind 被拒');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/../b9.jpg') $$,
  '42501', null, '含 .. 的路徑被拒');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/') $$,
  '42501', null, '沒有檔名的路徑被拒');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/sub/b10.jpg') $$,
  '42501', null, '多一層目錄的路徑被拒');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo\b11.jpg') $$,
  '42501', null, '含反斜線的路徑被拒');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/b12.jpg') $$,
  '42501', null, '乙公司 admin 不能上傳到甲公司案場');

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/b13.jpg') $$,
  '42501', null, '未指派的設計師不能上傳');

-- ════════════════════════════════════════════════════════════
-- 更新：一律不允許
-- ════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
with u as (
  update storage.objects set metadata = '{"x":1}'
  where id = 'a0000000-0000-4000-8000-000000000001' returning 1
)
select is(count(*), 0::bigint, 'admin 也不能更新物件') from u;

-- ════════════════════════════════════════════════════════════
-- 刪除（Storage 內建 trigger 預設阻擋直接刪除，測試時開啟）
-- ════════════════════════════════════════════════════════════
select set_config('storage.allow_delete_query', 'true', true);

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
with d as (
  delete from storage.objects where id = 'a0000000-0000-4000-8000-000000000001' returning 1
)
select is(count(*), 0::bigint, '監工不能刪除物件') from d;

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
with d as (
  delete from storage.objects where id = 'a0000000-0000-4000-8000-000000000001' returning 1
)
select is(count(*), 0::bigint, '乙公司 admin 不能刪除甲公司物件') from d;

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
with d as (
  delete from storage.objects where id = 'a0000000-0000-4000-8000-000000000002' returning 1
)
select is(count(*), 0::bigint, '設計師不能刪除未指派案場的物件') from d;
with d as (
  delete from storage.objects where id = 'a0000000-0000-4000-8000-000000000001' returning 1
)
select is(count(*), 1::bigint, '設計師可刪除自己案場的物件') from d;

-- ════════════════════════════════════════════════════════════
-- MFA：有 verified factor 而 session 為 aal1 時讀寫皆被拒
-- ════════════════════════════════════════════════════════════
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('90000000-0000-4000-8000-0000000000f2', '20000000-0000-4000-8000-000000000003',
        'test-st', 'totp', 'verified', now(), now());
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from storage.objects where bucket_id = 'project-files'), 0::bigint,
  'aal1：監工讀到 0');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/c1.jpg') $$,
  '42501', null, 'aal1：監工不能上傳');
with d as (
  delete from storage.objects where bucket_id = 'project-files' returning 1
)
select is(count(*), 0::bigint, 'aal1：不能刪除') from d;

select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
select ok((select count(*) from storage.objects where bucket_id = 'project-files') > 0,
  'aal2：監工讀得到被指派案場的物件');

-- ════════════════════════════════════════════════════════════
-- anon
-- ════════════════════════════════════════════════════════════
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*) from storage.objects where bucket_id = 'project-files'), 0::bigint,
  'anon 讀到 0');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('project-files',
       '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/photo/d1.jpg') $$,
  '42501', null, 'anon 不能上傳');
with d as (
  delete from storage.objects where bucket_id = 'project-files' returning 1
)
select is(count(*), 0::bigint, 'anon 不能刪除') from d;

reset role;
select ok(not has_function_privilege('anon', 'app.storage_project_ok(text, text)', 'execute'),
  'anon 不能執行 storage_project_ok');
select * from finish();
rollback;
