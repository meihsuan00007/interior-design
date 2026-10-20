-- 多租戶 RLS 測試：使用 seed.sql 中的虛構公司、使用者與案場（固定 UUID）
--   甲設計  org      10000000-0000-4000-8000-000000000001
--   乙設計  org      10000000-0000-4000-8000-000000000002
--   甲 admin         20000000-0000-4000-8000-000000000001
--   甲 designer      20000000-0000-4000-8000-000000000002（只被指派到案場 A1）
--   甲 supervisor    20000000-0000-4000-8000-000000000003（被指派到案場 A1）
--   乙 admin         20000000-0000-4000-8000-000000000004
--   案場 A1          30000000-0000-4000-8000-000000000001（業主 40000000-…-0001）
--   案場 A2          30000000-0000-4000-8000-000000000002（無人指派；業主 40000000-…-0002）
--   報價項目 A1      53000000-0000-4000-8000-000000000001
begin;

select plan(51);

-- ── 乙公司 admin ────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(
  (select count(*) from projects where organization_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint, '跨租戶讀不到案場');
select is(
  (select count(*) from clients where organization_id = '10000000-0000-4000-8000-000000000001'),
  0::bigint, '跨租戶讀不到業主');
select is((select count(*) from quote_items_scope), 0::bigint, '跨租戶讀不到施工範圍');
select is(
  (select count(*) from quote_items_scope where project_id = '30000000-0000-4000-8000-000000000001'),
  0::bigint, '跨租戶指定案場也讀不到施工範圍');

reset role;

-- ── 甲公司 designer ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*) from projects), 1::bigint, '未指派的案場讀不到');
select ok((select count(*) from cost_prices) > 0, 'designer 讀得到被指派案場的成本');
select ok((select count(*) from quote_items) > 0, 'designer 讀得到含金額的報價項目');
select ok((select count(*) from clients) > 0, 'designer 讀得到被指派案場的業主');
select is((select count(*) from quote_item_pricing_meta), 1::bigint, '可看成本的 designer 讀得到加成率');

reset role;

-- ── 甲公司 designer 改為不可看成本 ──────────────────────────
update memberships set can_view_cost = false
where user_id = '20000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*) from quote_item_pricing_meta), 0::bigint, '不可看成本的 designer 讀不到加成率');
select ok((select count(*) from quote_items) > 0, '不可看成本的 designer 仍讀得到報價項目');

reset role;

update memberships set can_view_cost = true
where user_id = '20000000-0000-4000-8000-000000000002';

-- ── 甲公司 supervisor（被指派到案場 A1）────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((select count(*) from projects), 1::bigint, '監工讀得到被指派的案場');
select is((select count(*) from cost_prices), 0::bigint, '監工讀不到成本');
select is((select count(*) from clients), 0::bigint, '監工讀不到業主資料');
select is((select count(*) from quote_items), 0::bigint, '監工讀不到含金額的報價項目');
select is((select count(*) from quote_versions), 0::bigint, '監工讀不到報價版本（含總計快取）');
select is((select count(*) from quote_item_pricing_meta), 0::bigint, '監工讀不到加成率');
select isnt_empty('select 1 from quote_items_scope', '監工讀得到施工範圍（無金額欄位）');
select is((select count(*) from quote_items_scope), 1::bigint, '監工只讀得到被指派案場的施工範圍');
select is(
  (select count(*) from quote_items_scope where project_id = '30000000-0000-4000-8000-000000000002'),
  0::bigint, '監工讀不到未指派案場的施工範圍');

reset role;

-- ── quote_items_scope 不含任何價格或金額欄位 ────────────────
select is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'quote_items_scope'
     and column_name in ('client_unit_price', 'markup_rate_used', 'ref_price_min', 'ref_price_max')),
  0::bigint, '施工範圍 view 不含單價、加成率、參考價欄位');
select is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'quote_items_scope'
     and (column_name like '%price%' or column_name like '%amount%')),
  0::bigint, '施工範圍 view 沒有名稱含 price 或 amount 的欄位');

-- ── designer 不能把案場指向無權限的業主 ────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ update projects set client_id = '40000000-0000-4000-8000-000000000002'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  '42501', '無權將案場指向此業主', 'designer 不能把案場改指向未指派案場的業主');
select is(
  (select count(*) from clients where id = '40000000-0000-4000-8000-000000000002'),
  0::bigint, 'designer 讀不到未指派案場的業主');

reset role;

-- ── 歸屬欄位不可變更（designer 同時是乙公司 designer）────────
insert into memberships (organization_id, user_id, role, can_view_unit_price, can_view_cost)
values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'designer', true, true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$ update projects set organization_id = '10000000-0000-4000-8000-000000000002'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  '23514', 'projects.organization_id 不可變更', '案場不能搬到其他公司');
select throws_ok(
  $$ update quote_items set organization_id = '10000000-0000-4000-8000-000000000002'
     where id = '53000000-0000-4000-8000-000000000001' $$,
  '23514', 'quote_items.organization_id 不可變更', '報價項目不能搬到其他公司');
select throws_ok(
  $$ update quote_items set project_id = '30000000-0000-4000-8000-000000000002'
     where id = '53000000-0000-4000-8000-000000000001' $$,
  '23514', 'quote_items.project_id 不可變更', '報價項目不能搬到其他案場');

reset role;

delete from memberships
where organization_id = '10000000-0000-4000-8000-000000000002'
  and user_id = '20000000-0000-4000-8000-000000000002';

-- ── 甲公司 admin ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ update projects set client_id = '40000000-0000-4000-8000-000000000002'
     where id = '30000000-0000-4000-8000-000000000001' $$,
  'admin 可以把案場改指向公司內任何業主');

-- audit_logs 不能改、不能刪、不能清空（admin 也一樣）
select throws_ok($$ update audit_logs set action = 'x' $$, '42501', null, 'audit_logs 不可修改');
select throws_ok($$ delete from audit_logs $$, '42501', null, 'audit_logs 不可刪除');
select throws_ok($$ truncate quote_fees $$, '42501', null, '一般使用者不可 truncate 任何資料表');

-- 將 designer 移出案場
delete from project_members where user_id = '20000000-0000-4000-8000-000000000002';

reset role;

-- ── 移出後的 designer ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*) from projects), 0::bigint, '移出案場後讀不到');
select is((select count(*) from cost_prices), 0::bigint, '移出案場後讀不到成本');

reset role;

-- ── Plan 2：案場檔案、預設工種與單位、案場狀態 ─────────────
-- 先以特權角色建立一個檔案（上傳者為甲 admin）
insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind, uploaded_by)
values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  'seed/plan2-floor.pdf', '平面圖.pdf', 'application/pdf', 1000, 'floor_plan',
  '20000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ update projects set status = 'closed' where id = '30000000-0000-4000-8000-000000000001' $$,
  '23514', null, '舊狀態 closed 已移除');

select app.seed_org_defaults('10000000-0000-4000-8000-000000000001');
select app.seed_org_defaults('10000000-0000-4000-8000-000000000001');

select is(
  (select count(*) from unnest(array['保護工程','拆除','泥作','水電','空調','木作','鋁門窗','玄關門','系統櫃','衛浴','玻璃',
    '油漆','木地板','石材','燈具','窗簾','貼膜','清潔','垃圾清運','設計費','監工管理費','代購','其他']) n
   where (select count(*) from trades where organization_id = '10000000-0000-4000-8000-000000000001' and name = n) = 1),
  23::bigint, '23 個預設工種各恰好一筆（重複執行不重複）');
select is(
  (select count(*) from unnest(array['式','坪','尺','才','組','只','樘','m²','處','迴','開','支','個','張','台','片','米','條','公分']) n
   where (select count(*) from units where organization_id = '10000000-0000-4000-8000-000000000001' and name = n) = 1),
  19::bigint, '19 個預設單位各恰好一筆');
select is(
  (select is_proxy_purchase and not default_include_in_mgmt_fee from trades
   where organization_id = '10000000-0000-4000-8000-000000000001' and name = '代購' limit 1),
  true, '代購工種為代購且預設不計管銷');
select is(has_function_privilege('authenticated', 'app.seed_org_defaults(uuid)', 'execute'), false,
  'authenticated 不可執行 seed_org_defaults');

set local role authenticated;

-- 乙公司 admin 看不到甲的檔案
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from project_files), 0::bigint, '乙公司 admin 讀不到甲的案場檔案');

-- 已被移出案場的設計師
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from project_files), 0::bigint, '未指派的設計師讀不到案場檔案');

-- 監工（案場成員）
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from project_files), 1::bigint, '監工可讀案場檔案');
select lives_ok(
  $$ insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind)
     values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
       'seed/plan2-site.jpg', '現場.jpg', 'image/jpeg', 2000, 'photo') $$,
  '監工可上傳 photo');
select throws_ok(
  $$ insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind)
     values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
       'seed/plan2-fp2.pdf', '平面.pdf', 'application/pdf', 2000, 'floor_plan') $$,
  '42501', null, '監工不可上傳 floor_plan');
select throws_ok(
  $$ insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind, uploaded_by)
     values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
       'seed/plan2-site2.jpg', '現場2.jpg', 'image/jpeg', 2000, 'photo', '20000000-0000-4000-8000-000000000001') $$,
  '42501', null, '上傳者必須是自己');
select throws_ok(
  $$ update project_files set file_name = 'x' $$, '42501', null, '檔案資料不可修改');
select lives_ok($$ delete from project_files where kind = 'photo' $$, '監工刪除不會報錯但無作用');
select is((select count(*) from project_files where kind = 'photo'), 1::bigint, '監工不可刪除檔案');

-- 甲 admin
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind)
     values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
       'seed/plan2-draw.pdf', '施工圖.pdf', 'application/pdf', 3000, 'drawing') $$,
  'admin 可上傳任何類型');
select throws_ok(
  $$ insert into project_files (organization_id, project_id, storage_path, file_name, mime_type, size_bytes, kind)
     values ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
       'seed/plan2-big.pdf', '大檔.pdf', 'application/pdf', 52428801, 'other') $$,
  '23514', null, '檔案超過 50MB 被拒絕');
select lives_ok($$ delete from project_files where kind = 'photo' $$, 'admin 刪除檔案');
select is((select count(*) from project_files where kind = 'photo'), 0::bigint, 'admin 可刪除檔案');

reset role;

select * from finish();

rollback;
