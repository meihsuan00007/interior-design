-- 守門測試：未來新增的資料表若漏掉 RLS／MFA／anon 收權／歸屬不可變更，這裡會失敗
begin;

select plan(5);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '', '所有 public 資料表皆啟用 RLS');

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and c.relname <> 'login_attempts'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'mfa_required')),
  '', '除 login_attempts 外，啟用 RLS 的資料表皆有 mfa_required policy');

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
          or exists (
            select 1 from pg_attribute a
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('anon', c.oid, a.attnum, 'select, insert, update, references')))),
  '', 'anon 對 public 的任何關聯都沒有權限');

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (select 1 from pg_attribute a
                 where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped)
     and not exists (
       select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
       join pg_namespace pn on pn.oid = p.pronamespace
       where t.tgrelid = c.oid and not t.tgisinternal
         and pn.nspname = 'app' and p.proname = 'block_scope_change')),
  '', '有 organization_id 的資料表皆有 block_scope_change trigger');

-- audit_logs 僅追加：postgres 擁有者也不可改
insert into organizations (id, name) values ('99000000-0000-4000-8000-000000000001', '守門測試公司');
insert into audit_logs (organization_id, action, target_type) values
  ('99000000-0000-4000-8000-000000000001', 'test.guard', 'test');
select throws_ok($$ update audit_logs set action = 'x' $$, '42501', null, 'postgres 也不可更新 audit_logs');

select * from finish();
rollback;
