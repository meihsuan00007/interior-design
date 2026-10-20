-- 主檔原子操作：刪除工種／單位（檢查與刪除同一交易）、交換排序。
-- 皆為 security invoker：以呼叫者身分執行，RLS 仍然生效（supervisor、其他公司的人什麼都動不了）。
-- 錯誤代碼：仍被品項使用 23503；找不到或無權限 P0002；參數不合法 22023。

-- ════════════════════════════════════════════════════════════
-- 刪除工種：鎖定該列 → 檢查品項 → 刪除 → 從廠商的 trade_ids 移除
-- 品項新增時外鍵會對工種列取 KEY SHARE 鎖，與這裡的 FOR UPDATE 互斥，因此不會有檢查後才插入的競態。
-- ════════════════════════════════════════════════════════════
create function public.delete_trade(p_id uuid) returns void
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.trades where id = p_id for update;
  if not found then
    raise exception '找不到資料，或沒有權限' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.catalog_items where trade_id = p_id) then
    raise exception '此工種仍有品項使用，無法刪除' using errcode = '23503';
  end if;
  delete from public.trades where id = p_id;
  if not found then
    raise exception '找不到資料，或沒有權限' using errcode = 'P0002';
  end if;
  update public.vendors
     set trade_ids = array_remove(trade_ids, p_id)
   where organization_id = v_org and trade_ids @> array[p_id];
end;
$$;

create function public.delete_unit(p_id uuid) returns void
language plpgsql volatile security invoker set search_path = ''
as $$
begin
  perform 1 from public.units where id = p_id for update;
  if not found then
    raise exception '找不到資料，或沒有權限' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.catalog_items where unit_id = p_id) then
    raise exception '此單位仍有品項使用，無法刪除' using errcode = '23503';
  end if;
  delete from public.units where id = p_id;
  if not found then
    raise exception '找不到資料，或沒有權限' using errcode = 'P0002';
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- 交換兩列的 sort（只限 trades、units；兩列必須同公司）
-- ════════════════════════════════════════════════════════════
create function public.swap_sort(p_table text, p_a uuid, p_b uuid) returns void
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_sort_a integer;
  v_sort_b integer;
  v_n integer;
begin
  if p_table not in ('trades', 'units') then
    raise exception '不支援的資料表：%', p_table using errcode = '22023';
  end if;
  if p_a is null or p_b is null or p_a = p_b then
    raise exception '必須指定兩個不同的項目' using errcode = '22023';
  end if;

  -- 依 id 順序鎖定，避免兩個方向相反的交換互相死結
  if p_a < p_b then
    execute format('select organization_id, sort from public.%I where id = $1 for update', p_table)
      into v_org_a, v_sort_a using p_a;
    execute format('select organization_id, sort from public.%I where id = $1 for update', p_table)
      into v_org_b, v_sort_b using p_b;
  else
    execute format('select organization_id, sort from public.%I where id = $1 for update', p_table)
      into v_org_b, v_sort_b using p_b;
    execute format('select organization_id, sort from public.%I where id = $1 for update', p_table)
      into v_org_a, v_sort_a using p_a;
  end if;

  if v_org_a is null or v_org_b is null then
    raise exception '找不到資料，或沒有權限' using errcode = 'P0002';
  end if;
  if v_org_a <> v_org_b then
    raise exception '兩個項目不屬於同一間公司' using errcode = '22023';
  end if;

  execute format('update public.%I set sort = $2 where id = $1', p_table) using p_a, v_sort_b;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception '找不到資料，或沒有權限' using errcode = 'P0002';
  end if;
  execute format('update public.%I set sort = $2 where id = $1', p_table) using p_b, v_sort_a;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception '找不到資料，或沒有權限' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_trade(uuid) from public, anon;
revoke all on function public.delete_unit(uuid) from public, anon;
revoke all on function public.swap_sort(text, uuid, uuid) from public, anon;
grant execute on function public.delete_trade(uuid) to authenticated;
grant execute on function public.delete_unit(uuid) to authenticated;
grant execute on function public.swap_sort(text, uuid, uuid) to authenticated;
