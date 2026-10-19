import Decimal from "decimal.js";
import { roundYuan } from "./decimal";

const EMPTY = "—";

/** 新台幣整數元，千分位（以字串處理，不經過 Number）。 */
export function formatTWD(x: Decimal): string {
  const rounded = roundYuan(x);
  if (rounded.isZero()) return "0";
  const digits = rounded.abs().toFixed(0);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rounded.isNegative() ? `-${grouped}` : grouped;
}

/** 加成率以倍數顯示，兩位小數（例：1.35）。 */
export function formatMarkup(x: Decimal | null): string {
  if (x === null) return EMPTY;
  return x.toFixed(2, Decimal.ROUND_HALF_UP);
}

/** 毛利率以整數百分比顯示（例：26%）。 */
export function formatMarginRate(x: Decimal | null): string {
  if (x === null) return EMPTY;
  const pct = roundYuan(x.mul(100));
  return `${pct.isZero() ? "0" : pct.toFixed(0)}%`;
}
