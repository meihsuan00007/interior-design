-- 多租戶 RLS 測試：使用 seed.sql 中的虛構公司、使用者與案場（固定 UUID）
--   甲設計  org      10000000-0000-4000-8000-000000000001
--   乙設計  org      10000000-0000-4000-8000-000000000002
--   甲 admin         20000000-0000-4000-8000-000000000001
--   甲 designer      20000000-0000-4000-8000-000000000002（只被指派到案場 A1）
--   甲 supervisor    20000000-0000-4000-8000-000000000003（被指派到案場 A1）
--   乙 admin         20000000-0000-4000-8000-000000000004
--   案場 A1          30000000-0000-4000-8000-000000000001
--   案場 A2          30000000-0000-4000-8000-000000000002（無人指派）
begin;

select plan(16);

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

reset role;

-- ── 甲公司 designer ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*) from projects), 1::bigint, '未指派的案場讀不到');
select ok((select count(*) from cost_prices) > 0, 'designer 讀得到被指派案場的成本');
select ok((select count(*) from quote_items) > 0, 'designer 讀得到含金額的報價項目');
select ok((select count(*) from clients) > 0, 'designer 讀得到被指派案場的業主');

reset role;

-- ── 甲公司 supervisor（被指派到案場 A1）────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is((select count(*) from projects), 1::bigint, '監工讀得到被指派的案場');
select is((select count(*) from cost_prices), 0::bigint, '監工讀不到成本');
select is((select count(*) from clients), 0::bigint, '監工讀不到業主資料');
select is((select count(*) from quote_items), 0::bigint, '監工讀不到含金額的報價項目');
select is((select count(*) from quote_versions), 0::bigint, '監工讀不到報價版本（含總計快取）');
select isnt_empty('select 1 from quote_items_scope', '監工讀得到施工範圍（無金額欄位）');

reset role;

-- ── 甲公司 admin 將 designer 移出案場 ────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

delete from project_members where user_id = '20000000-0000-4000-8000-000000000002';

-- audit_logs 不能改、不能刪（admin 也一樣）
select throws_ok($$ update audit_logs set action = 'x' $$, '42501', null, 'audit_logs 不可修改');
select throws_ok($$ delete from audit_logs $$, '42501', null, 'audit_logs 不可刪除');

reset role;

-- ── 移出後的 designer ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*) from projects), 0::bigint, '移出案場後讀不到');
select is((select count(*) from cost_prices), 0::bigint, '移出案場後讀不到成本');

reset role;

select * from finish();
rollback;
