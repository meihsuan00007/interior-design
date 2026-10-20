import { describe, expect, test } from "vitest";
import { D, roundYuan, sum } from "@/lib/money/decimal";

describe("decimal", () => {
  test("roundYuan 四捨五入遠離零", () => {
    expect(roundYuan(D("17.1").mul("675")).toString()).toBe("11543");
    expect(roundYuan(D("-11542.5")).toString()).toBe("-11543");
    expect(roundYuan(D("104868.50000000001")).toString()).toBe("104869");
  });
  test("D() 拒絕非整數的 JS number", () => {
    expect(() => D(0.1)).toThrow();
    expect(D(3).toString()).toBe("3");
  });
  test("sum 加總且空陣列為 0", () => {
    expect(sum([D("0.1"), D("0.2")]).toString()).toBe("0.3");
    expect(sum([]).toString()).toBe("0");
  });
});
