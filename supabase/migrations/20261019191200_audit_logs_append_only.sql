-- audit_logs 為僅追加：即使是 postgres 擁有者角色也不可 UPDATE / DELETE
create function app.block_audit_log_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_logs 為僅追加，不可 %', lower(tg_op) using errcode = '42501';
end
$$;

create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function app.block_audit_log_change();
