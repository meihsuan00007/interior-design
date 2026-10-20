/** 動畫常數（秒）：列表項目間隔 30ms、只對前 20 筆做依序出現。 */
export const STAGGER_STEP = 0.03;
export const STAGGER_LIMIT = 20;

/** 第 index 筆的延遲秒數；超過前 20 筆（或不合法）回傳 null，代表不需動畫、直接顯示。 */
export function staggerDelay(index: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= STAGGER_LIMIT) return null;
  return index * STAGGER_STEP;
}
