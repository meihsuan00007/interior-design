-- 主檔函式測試：public.delete_trade、public.delete_unit、public.swap_sort（security invoker，RLS 仍生效）
--   甲設計 org 10000000-…-0001；乙設計 org …-0002
--   甲 designer 20000000-…-0002；甲 supervisor …-0003；乙 admin …-0004
begin;

select plan(19);

-- 以 postgres 身分準備虛構資料
insert into trades (id, organization_id, name, sort) values
  ('a1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'fn-工種-被引用', 10),
  ('a1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'fn-工種-可刪', 20),
  ('a1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'fn-工種-排序A', 30),
  ('a1000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'fn-工種-排序B', 40),
  ('a1000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'fn-乙-工種', 50);
insert into units (id, organization_id, name, sort) values
  ('a2000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'fn-單位-被引用', 10),
  ('a2000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'fn-單位-可刪', 20),
  ('a2000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'fn-單位-排序', 30);
insert into catalog_items (id, organization_id, name, trade_id, unit_id) values
  ('a3000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'fn-品項',
   'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001');
insert into vendors (id, organization_id, name, trade_ids) values
  ('a4000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'fn-廠商',
   array['a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003']::uuid[]);

-- 函式宣告：security invoker、search_path 為空、anon／public 不可執行
select is(
  (select count(*) from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('delete_trade', 'delete_unit', 'swap_sort')
     and not p.prosecdef and p.proconfig @> array['search_path=""']),
  3::bigint, '三個函式皆為 security invoker 且 search_path 為空');
select ok(
  not has_function_privilege('anon', 'public.delete_trade(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.delete_unit(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.swap_sort(text, uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.delete_trade(uuid)', 'execute'),
  'anon 不可執行、authenticated 可執行');

-- ── 甲 designer ──────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.delete_trade('a1000000-0000-4000-8000-000000000001')$$,
  '23503', '此工種仍有品項使用，無法刪除', '被品項引用的工種不可刪除');
select is(
  (select count(*) from trades where id = 'a1000000-0000-4000-8000-000000000001'),
  1::bigint, '被引用的工種仍在');
select is(
  (select trade_id from catalog_items where id = 'a3000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000001'::uuid, '品項的工種沒有被清掉');

select lives_ok(
  $$select public.delete_trade('a1000000-0000-4000-8000-000000000002')$$,
  '未被引用的工種可刪除');
select is(
  (select count(*) from trades where id = 'a1000000-0000-4000-8000-000000000002'),
  0::bigint, '工種已刪除');
select is(
  (select trade_ids from vendors where id = 'a4000000-0000-4000-8000-000000000001'),
  array['a1000000-0000-4000-8000-000000000003']::uuid[], '廠商的 trade_ids 已移除該工種');

select throws_ok(
  $$select public.delete_trade('a1000000-0000-4000-8000-000000000002')$$,
  'P0002', null, '不存在的工種回報找不到');

select throws_ok(
  $$select public.delete_unit('a2000000-0000-4000-8000-000000000001')$$,
  '23503', '此單位仍有品項使用，無法刪除', '被品項引用的單位不可刪除');
select lives_ok(
  $$select public.delete_unit('a2000000-0000-4000-8000-000000000002')$$, '未被引用的單位可刪除');

select lives_ok(
  $$select public.swap_sort('trades', 'a1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000004')$$,
  'swap_sort 交換工種排序');
select is(
  (select sort from trades where id = 'a1000000-0000-4000-8000-000000000003'),
  40, '排序 A 變成 40');
select is(
  (select sort from trades where id = 'a1000000-0000-4000-8000-000000000004'),
  30, '排序 B 變成 30');

select throws_ok(
  $$select public.swap_sort('vendors', 'a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'swap_sort 只允許 trades、units');
select throws_ok(
  $$select public.swap_sort('trades', 'a1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000005')$$,
  null, null, '跨公司的兩列不可交換');

-- ── 甲 supervisor：RLS 擋下 ───────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.delete_trade('a1000000-0000-4000-8000-000000000003')$$,
  null, null, 'supervisor 不能刪工種');

-- ── 乙 admin：看不到甲公司資料 ─────────────────────────────────
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.delete_trade('a1000000-0000-4000-8000-000000000003')$$,
  null, null, '乙公司不能刪甲公司的工種');

reset role;
select is(
  (select count(*) from trades where id = 'a1000000-0000-4000-8000-000000000003'),
  1::bigint, '甲公司的工種仍在');

select * from finish();
rollback;
