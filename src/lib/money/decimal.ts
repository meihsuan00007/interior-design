import Decimal from "decimal.js";

// 全專案唯一的 Decimal 設定處：40 位精度、四捨五入（遠離零）。
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal;

/** 建立 Decimal。JS number 僅接受整數，避免浮點數流入金額運算。 */
export function D(value: Decimal.Value): Decimal {
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new Error(`不允許以非整數的 JS number 建立金額：${value}，請改用字串`);
  }
  return new Decimal(value);
}

/** 四捨五入到整數元（遠離零）。 */
export function roundYuan(x: Decimal): Decimal {
  return x.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export function sum(xs: Decimal[]): Decimal {
  return xs.reduce((acc, x) => acc.plus(x), new Decimal(0));
}
