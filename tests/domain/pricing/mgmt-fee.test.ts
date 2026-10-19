import { describe, expect, test } from "vitest";
import { resolveMgmtFeeInclusion } from "@/domain/pricing/mgmt-fee";

describe("resolveMgmtFeeInclusion", () => {
  test("業主直付強制不計入，手動也不能覆寫", () => {
    expect(
      resolveMgmtFeeInclusion({ tradeIsProxyPurchase: false, tradeDefaultInclude: true, isPaidDirectlyByOwner: true, manualInclude: true }),
    ).toEqual({ include: false, source: "owner_direct" });
  });
  test("代購工種預設不計入，設計師可手動改為計入", () => {
    const base = { tradeIsProxyPurchase: true, tradeDefaultInclude: true, isPaidDirectlyByOwner: false };
    expect(resolveMgmtFeeInclusion({ ...base, manualInclude: null })).toEqual({ include: false, source: "default" });
    expect(resolveMgmtFeeInclusion({ ...base, manualInclude: true })).toEqual({ include: true, source: "manual" });
  });
  test("一般工種採工種預設，手動可改為不計入", () => {
    const base = { tradeIsProxyPurchase: false, tradeDefaultInclude: true, isPaidDirectlyByOwner: false };
    expect(resolveMgmtFeeInclusion({ ...base, manualInclude: null })).toEqual({ include: true, source: "default" });
    expect(resolveMgmtFeeInclusion({ ...base, manualInclude: false })).toEqual({ include: false, source: "manual" });
  });
});
