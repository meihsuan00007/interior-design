import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import type { AuditEvent } from "@/lib/audit";
import { loadAppContext } from "@/server/context";
import { createCatalogItem, deleteCatalogItem, listCatalogItems } from "@/server/master/catalog";
import { UserError } from "@/server/db-errors";
import type { MasterDeps } from "@/server/master/common";
import { createTrade, deleteTrade, listTrades, moveTrade, updateTrade } from "@/server/master/trades";
import { createUnit, deleteUnit, listUnits } from "@/server/master/units";
import { createVendor, deleteVendor, listVendors, updateVendor } from "@/server/master/vendors";
import { randomSuffix, signInAs } from "./helpers";

/** 與 writeAudit 相同的寫入規則，但使用測試 client 而非 cookie client。 */
function auditVia(supabase: SupabaseClient): MasterDeps["writeAudit"] {
  return async (e: AuditEvent) => {
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: e.organizationId,
      actor_id: data.user!.id,
      action: e.action,
      target_type: e.targetType,
      target_id: e.targetId,
      metadata: e.metadata ?? {},
    });
    if (error) throw new Error(error.message);
  };
}

const trade = (name: string, extra: object = {}) => ({
  name,
  sort: 0,
  defaultIncludeInMgmtFee: true,
  isProxyPurchase: false,
  ...extra,
});

const vendorInput = (name: string, extra: object = {}) => ({
  name,
  tradeIds: [] as string[],
  contactName: "",
  phone: "",
  taxId: "",
  note: "",
  ...extra,
});

const itemInput = (name: string, extra: object = {}) => ({
  name,
  tradeId: null,
  unitId: null,
  spec: "",
  defaultVendorId: null,
  pricingMethod: "unit_x_qty" as const,
  note: "",
  ...extra,
});

let jiaOrg: string;
let designer: MasterDeps;
let supervisor: MasterDeps;
let admin: MasterDeps;
let yiAdmin: MasterDeps;
let yiOrg: string;
const sfx = randomSuffix();

beforeAll(async () => {
  const clients: Record<string, SupabaseClient> = {};
  for (const e of ["designer@jia.example", "supervisor@jia.example", "admin@jia.example", "admin@yi.example"]) {
    clients[e] = await signInAs(e);
  }
  const mk = (c: SupabaseClient): MasterDeps => ({ supabase: c, writeAudit: auditVia(c) });
  designer = mk(clients["designer@jia.example"]);
  supervisor = mk(clients["supervisor@jia.example"]);
  admin = mk(clients["admin@jia.example"]);
  yiAdmin = mk(clients["admin@yi.example"]);
  jiaOrg = (await loadAppContext(clients["designer@jia.example"]))!.memberships[0].organizationId;
  yiOrg = (await loadAppContext(clients["admin@yi.example"]))!.memberships[0].organizationId;
});

describe("工種", () => {
  test("designer 新增工種後列表看得到", async () => {
    const name = `測試工種-${sfx}-a`;
    const created = await createTrade(jiaOrg, trade(name, { isProxyPurchase: true, defaultIncludeInMgmtFee: false }), designer);
    const list = await listTrades(jiaOrg, designer);
    const found = list.find((t) => t.id === created.id);
    expect(found?.name).toBe(name);
    expect(found?.isProxyPurchase).toBe(true);
    expect(found?.defaultIncludeInMgmtFee).toBe(false);
  });

  test("supervisor 新增工種被拒，回傳「沒有權限」", async () => {
    await expect(createTrade(jiaOrg, trade(`測試工種-${sfx}-sup`), supervisor)).rejects.toThrow("沒有權限");
    const list = await listTrades(jiaOrg, designer);
    expect(list.some((t) => t.name === `測試工種-${sfx}-sup`)).toBe(false);
  });

  test("supervisor 可讀取工種列表", async () => {
    const list = await listTrades(jiaOrg, supervisor);
    expect(Array.isArray(list)).toBe(true);
  });

  test("名稱重複回傳「名稱已存在」", async () => {
    const name = `測試工種-${sfx}-dup`;
    await createTrade(jiaOrg, trade(name), designer);
    const err = await createTrade(jiaOrg, trade(name), designer).catch((e) => e);
    expect(err).toBeInstanceOf(UserError);
    expect(err.message).toBe("名稱已存在");
  });

  test("supervisor 更新工種被拒（RLS 不命中任何列）", async () => {
    const created = await createTrade(jiaOrg, trade(`測試工種-${sfx}-upd`), designer);
    await expect(updateTrade(jiaOrg, created.id, trade("被改掉了"), supervisor)).rejects.toBeInstanceOf(UserError);
    const list = await listTrades(jiaOrg, designer);
    expect(list.find((t) => t.id === created.id)?.name).toBe(`測試工種-${sfx}-upd`);
  });

  test("刪除被品項引用的工種回傳友善錯誤，且不刪除也不清掉品項的工種", async () => {
    const t = await createTrade(jiaOrg, trade(`測試工種-${sfx}-ref`), designer);
    const item = await createCatalogItem(jiaOrg, itemInput(`測試品項-${sfx}-ref`, { tradeId: t.id }), designer);
    const err = await deleteTrade(jiaOrg, t.id, designer).catch((e) => e);
    expect(err).toBeInstanceOf(UserError);
    expect(err.message).toBe("此工種仍有品項使用，無法刪除");
    expect((await listTrades(jiaOrg, designer)).some((x) => x.id === t.id)).toBe(true);
    const items = await listCatalogItems(jiaOrg, { tradeId: t.id }, designer);
    expect(items.map((i) => i.id)).toContain(item.id);

    // 品項刪除後即可刪除工種
    await deleteCatalogItem(jiaOrg, item.id, designer);
    await deleteTrade(jiaOrg, t.id, designer);
    expect((await listTrades(jiaOrg, designer)).some((x) => x.id === t.id)).toBe(false);
  });

  test("刪除工種寫入 record.delete 稽核，並從廠商的 trade_ids 移除", async () => {
    const t = await createTrade(jiaOrg, trade(`測試工種-${sfx}-aud`), designer);
    const v = await createVendor(jiaOrg, vendorInput(`測試廠商-${sfx}-tr`, { tradeIds: [t.id] }), designer);
    await deleteTrade(jiaOrg, t.id, designer);
    const { data } = await admin.supabase!
      .from("audit_logs")
      .select("action, target_type")
      .eq("target_id", t.id);
    expect(data).toEqual([{ action: "record.delete", target_type: "trade" }]);
    const vendor = (await listVendors(jiaOrg, designer)).find((x) => x.id === v.id);
    expect(vendor?.tradeIds).toEqual([]);
  });

  test("上下移動會交換排序", async () => {
    // 根因：先前執行殘留的列也用 9001／9002，a、b 之間可能夾著別人的列，上移一格追不上 a。
    // 改成排在目前最大 sort 之後，a、b 必定是最後兩列且相鄰。
    const maxSort = Math.max(0, ...(await listTrades(jiaOrg, designer)).map((t) => t.sort));
    const a = await createTrade(jiaOrg, trade(`測試工種-${sfx}-m1`, { sort: maxSort + 10 }), designer);
    const b = await createTrade(jiaOrg, trade(`測試工種-${sfx}-m2`, { sort: maxSort + 20 }), designer);
    await moveTrade(jiaOrg, b.id, "up", designer);
    const ids = (await listTrades(jiaOrg, designer)).map((t) => t.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  test("乙公司看不到甲公司的工種", async () => {
    const created = await createTrade(jiaOrg, trade(`測試工種-${sfx}-iso`), designer);
    const list = await listTrades(yiOrg, yiAdmin);
    expect(list.some((t) => t.id === created.id)).toBe(false);
    const cross = await listTrades(jiaOrg, yiAdmin);
    expect(cross).toEqual([]);
  });
});

describe("單位", () => {
  test("新增、重複、被品項引用時不可刪除", async () => {
    const name = `u${sfx}`.slice(0, 10);
    const u = await createUnit(jiaOrg, { name, sort: 0 }, designer);
    expect((await listUnits(jiaOrg, designer)).some((x) => x.id === u.id)).toBe(true);
    await expect(createUnit(jiaOrg, { name, sort: 0 }, designer)).rejects.toThrow("名稱已存在");

    const item = await createCatalogItem(jiaOrg, itemInput(`測試品項-${sfx}-u`, { unitId: u.id }), designer);
    await expect(deleteUnit(jiaOrg, u.id, designer)).rejects.toThrow("此單位仍有品項使用，無法刪除");
    await deleteCatalogItem(jiaOrg, item.id, designer);
    await deleteUnit(jiaOrg, u.id, designer);
    expect((await listUnits(jiaOrg, designer)).some((x) => x.id === u.id)).toBe(false);
  });

  test("supervisor 新增單位被拒", async () => {
    await expect(createUnit(jiaOrg, { name: `s${sfx}`.slice(0, 10), sort: 0 }, supervisor)).rejects.toThrow("沒有權限");
  });
});

describe("品項", () => {
  test("可依工種篩選、依名稱搜尋（不分大小寫，萬用字元被轉義）", async () => {
    const t1 = await createTrade(jiaOrg, trade(`測試工種-${sfx}-c1`), designer);
    const t2 = await createTrade(jiaOrg, trade(`測試工種-${sfx}-c2`), designer);
    const a = await createCatalogItem(jiaOrg, itemInput(`Alpha磁磚-${sfx}`, { tradeId: t1.id }), designer);
    const b = await createCatalogItem(jiaOrg, itemInput(`Beta地板-${sfx}`, { tradeId: t2.id }), designer);

    expect((await listCatalogItems(jiaOrg, { tradeId: t1.id }, designer)).map((i) => i.id)).toEqual([a.id]);
    expect((await listCatalogItems(jiaOrg, { q: `alpha磁磚-${sfx}` }, designer)).map((i) => i.id)).toEqual([a.id]);
    expect(await listCatalogItems(jiaOrg, { q: `%${sfx}%` }, designer)).toEqual([]);
    const both = await listCatalogItems(jiaOrg, { q: sfx }, designer);
    expect(both.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());

    await deleteCatalogItem(jiaOrg, a.id, designer);
    await deleteCatalogItem(jiaOrg, b.id, designer);
  });

  test("supervisor 新增品項被拒", async () => {
    await expect(createCatalogItem(jiaOrg, itemInput(`測試品項-${sfx}-sup`), supervisor)).rejects.toThrow("沒有權限");
  });
});

describe("廠商", () => {
  test("電話在資料庫為 v1: 密文，列表解密並提供遮罩", async () => {
    const created = await createVendor(
      jiaOrg,
      vendorInput(`測試廠商-${sfx}-p`, { phone: "0912345678", taxId: "12345678", contactName: "王師傅" }),
      designer,
    );
    const { data } = await designer.supabase!.from("vendors").select("phone_enc").eq("id", created.id).single();
    expect(data!.phone_enc.startsWith("v1:")).toBe(true);
    expect(data!.phone_enc).not.toContain("0912345678");

    const row = (await listVendors(jiaOrg, designer)).find((v) => v.id === created.id)!;
    expect(row.phone).toBe("0912345678");
    expect(row.phoneMasked).toBe("0912-***-678");
    expect(row.taxId).toBe("12345678");
  });

  test("更新可清空電話；supervisor 可讀不可寫", async () => {
    const created = await createVendor(jiaOrg, vendorInput(`測試廠商-${sfx}-w`, { phone: "0912345678" }), designer);
    expect((await listVendors(jiaOrg, supervisor)).some((v) => v.id === created.id)).toBe(true);
    await expect(updateVendor(jiaOrg, created.id, vendorInput("改名"), supervisor)).rejects.toBeInstanceOf(UserError);
    await expect(createVendor(jiaOrg, vendorInput(`測試廠商-${sfx}-sup`), supervisor)).rejects.toThrow("沒有權限");

    await updateVendor(jiaOrg, created.id, vendorInput(`測試廠商-${sfx}-w`, { phone: "" }), designer);
    const row = (await listVendors(jiaOrg, designer)).find((v) => v.id === created.id)!;
    expect(row.phone).toBe("");
    expect(row.phoneMasked).toBe("");
  });

  test("刪除廠商後品項的預設廠商被清空，並寫入稽核", async () => {
    const v = await createVendor(jiaOrg, vendorInput(`測試廠商-${sfx}-d`), designer);
    const item = await createCatalogItem(jiaOrg, itemInput(`測試品項-${sfx}-dv`, { defaultVendorId: v.id }), designer);
    await deleteVendor(jiaOrg, v.id, designer);
    const { data } = await admin.supabase!.from("audit_logs").select("action").eq("target_id", v.id);
    expect(data).toEqual([{ action: "record.delete" }]);
    const items = await listCatalogItems(jiaOrg, { q: `測試品項-${sfx}-dv` }, designer);
    expect(items[0].defaultVendorId).toBeNull();
    await deleteCatalogItem(jiaOrg, item.id, designer);
  });
});

describe("R14／R15 補強", () => {
  test("稽核寫入失敗時不刪除（fail closed）", async () => {
    const t = await createTrade(jiaOrg, trade(`測試工種-${sfx}-fc`), designer);
    const failing: MasterDeps = {
      supabase: designer.supabase,
      writeAudit: async () => {
        throw new Error("audit down");
      },
    };
    await expect(deleteTrade(jiaOrg, t.id, failing)).rejects.toThrow();
    expect((await listTrades(jiaOrg, designer)).some((x) => x.id === t.id)).toBe(true);
  });

  test("supervisor 刪除工種被拒，資料仍在", async () => {
    const t = await createTrade(jiaOrg, trade(`測試工種-${sfx}-sd`), designer);
    await expect(deleteTrade(jiaOrg, t.id, supervisor)).rejects.toBeInstanceOf(UserError);
    expect((await listTrades(jiaOrg, designer)).some((x) => x.id === t.id)).toBe(true);
  });

  test("引用其他公司的工種／單位／廠商 id 回「選項無效」", async () => {
    const yiTrade = await createTrade(yiOrg, trade(`乙工種-${sfx}`), yiAdmin);
    const yiUnit = await createUnit(yiOrg, { name: `y${sfx}`.slice(0, 10), sort: 0 }, yiAdmin);
    const yiVendor = await createVendor(yiOrg, vendorInput(`乙廠商-${sfx}`), yiAdmin);

    const e1 = await createCatalogItem(jiaOrg, itemInput(`x-${sfx}`, { tradeId: yiTrade.id }), designer).catch((e) => e);
    expect(e1).toBeInstanceOf(UserError);
    expect(e1.fieldErrors).toEqual({ tradeId: "選項無效" });
    const e2 = await createCatalogItem(jiaOrg, itemInput(`x-${sfx}`, { unitId: yiUnit.id }), designer).catch((e) => e);
    expect(e2.fieldErrors).toEqual({ unitId: "選項無效" });
    const e3 = await createCatalogItem(jiaOrg, itemInput(`x-${sfx}`, { defaultVendorId: yiVendor.id }), designer).catch((e) => e);
    expect(e3.fieldErrors).toEqual({ defaultVendorId: "選項無效" });
    const e4 = await createVendor(jiaOrg, vendorInput(`x-${sfx}`, { tradeIds: [yiTrade.id] }), designer).catch((e) => e);
    expect(e4).toBeInstanceOf(UserError);
    expect(e4.fieldErrors).toEqual({ tradeIds: "選項無效" });
    expect(await listCatalogItems(jiaOrg, { q: `x-${sfx}` }, designer)).toEqual([]);
  });

  test("廠商電話無法解密時，未動電話欄位的更新不會覆蓋密文", async () => {
    const v = await createVendor(jiaOrg, vendorInput(`測試廠商-${sfx}-bad`), designer);
    await designer.supabase!.from("vendors").update({ phone_enc: "v1:bad:bad:bad" }).eq("id", v.id);
    await updateVendor(jiaOrg, v.id, { ...vendorInput(`測試廠商-${sfx}-bad2`), phoneTouched: false }, designer);
    const { data } = await designer.supabase!.from("vendors").select("name, phone_enc").eq("id", v.id).single();
    expect(data).toEqual({ name: `測試廠商-${sfx}-bad2`, phone_enc: "v1:bad:bad:bad" });
    // 使用者真的改了電話才更新
    await updateVendor(jiaOrg, v.id, { ...vendorInput(`測試廠商-${sfx}-bad2`, { phone: "0922333444" }), phoneTouched: true }, designer);
    const row = (await listVendors(jiaOrg, designer)).find((x) => x.id === v.id)!;
    expect(row.phone).toBe("0922333444");
  });
});
