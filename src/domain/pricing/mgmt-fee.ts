export type MgmtFeeSource = "default" | "owner_direct" | "manual";

/**
 * 判定項目是否計入工程管理費（D4）。
 * 優先順序：業主直付（強制不計入）→ 設計師手動覆寫 → 代購工種（預設不計入）→ 工種預設。
 */
export function resolveMgmtFeeInclusion(i: {
  tradeIsProxyPurchase: boolean;
  tradeDefaultInclude: boolean;
  isPaidDirectlyByOwner: boolean;
  manualInclude: boolean | null;
}): { include: boolean; source: MgmtFeeSource } {
  if (i.isPaidDirectlyByOwner) return { include: false, source: "owner_direct" };
  if (i.manualInclude !== null) return { include: i.manualInclude, source: "manual" };
  if (i.tradeIsProxyPurchase) return { include: false, source: "default" };
  return { include: i.tradeDefaultInclude, source: "default" };
}
