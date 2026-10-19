-- MFA 強制：已啟用 TOTP 的使用者，aal1 session 讀不到任何資料，aal2 才可
--   甲 designer 20000000-0000-4000-8000-000000000002（被指派到案場 A1）
--   甲 supervisor 20000000-0000-4000-8000-000000000003
begin;

select plan(7);

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('90000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
        'test', 'totp', 'verified', now(), now());

set local role authenticated;

-- 有 verified factor 且 aal1
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from projects), 0::bigint, 'aal1：設計師讀不到案場');
select is((select count(*) from memberships), 0::bigint, 'aal1：讀不到 memberships');
select is((select count(*) from quote_items), 0::bigint, 'aal1：讀不到報價項目');

-- 同一人 aal2
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
select is((select count(*) from projects), 1::bigint, 'aal2：設計師讀得到被指派的案場');

-- 無 factor 的使用者（監工）aal1 不受影響
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from projects), 1::bigint, '未啟用 TOTP 者 aal1 照常存取');
select ok((select count(*) from quote_items_scope) > 0, '未啟用 TOTP 者讀得到施工範圍');

-- 有 factor 的監工需要 aal2：以 postgres 加入 factor 後重測 view
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('90000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
        'test', 'totp', 'verified', now(), now());
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from quote_items_scope), 0::bigint, 'aal1：施工範圍 view 也讀不到');

select * from finish();
rollback;
