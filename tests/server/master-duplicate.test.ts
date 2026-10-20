import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { createCatalogItem, updateCatalogItem } from "@/server/master/catalog";
import { MasterError } from "@/server/master/common";
import { createVendor, updateVendor } from "@/server/master/vendors";

// vendors、catalog_items 目前沒有唯一限制；若日後加上，23505 必須對應「名稱已存在」。
// 這裡用假 client 模擬資料庫回傳 23505。
function fakeClient(code: string): SupabaseClient {
  const result = { data: null, error: { code, message: "x" } };
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => void) => res(result);
      if (prop === "single") return () => Promise.resolve(result);
      return () => self;
    },
  });
  return { from: () => self } as unknown as SupabaseClient;
}

const vendor = { name: "a", tradeIds: [], contactName: "", phone: "", taxId: "", note: "" };
const item = {
  name: "a",
  tradeId: null,
  unitId: null,
  spec: "",
  defaultVendorId: null,
  pricingMethod: "unit_x_qty" as const,
  note: "",
};
const ORG = "10000000-0000-4000-8000-000000000001";
const ID = "10000000-0000-4000-8000-000000000009";

describe("23505 對應「名稱已存在」", () => {
  const deps = { supabase: fakeClient("23505") };

  test("廠商 create／update", async () => {
    await expect(createVendor(ORG, vendor, deps)).rejects.toThrow(new MasterError("名稱已存在"));
    await expect(updateVendor(ORG, ID, vendor, deps)).rejects.toThrow("名稱已存在");
  });

  test("品項 create／update", async () => {
    await expect(createCatalogItem(ORG, item, deps)).rejects.toThrow("名稱已存在");
    await expect(updateCatalogItem(ORG, ID, item, deps)).rejects.toThrow("名稱已存在");
  });
});
