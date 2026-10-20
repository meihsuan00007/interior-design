import { describe, expect, test } from "vitest";
import { projectSchema } from "@/lib/validation/project";

const base = {
  name: "虛構案場",
  district: "",
  addressFull: "",
  ping: "",
  condition: "",
  floor: "",
  hasElevator: null,
  hoaRules: "",
  status: "lead",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  clientNationalId: "",
};
const parse = (extra: object) => projectSchema.safeParse({ ...base, ...extra });
const errorOf = (extra: object, field: string) => {
  const r = parse(extra);
  return r.success ? undefined : r.error.issues.find((i) => i.path[0] === field)?.message;
};

describe("projectSchema", () => {
  test("最小合法輸入通過", () => {
    expect(parse({}).success).toBe(true);
  });

  test("案名必填、最多 60 字", () => {
    expect(errorOf({ name: "  " }, "name")).toBe("請輸入案場名稱");
    expect(parse({ name: "字".repeat(61) }).success).toBe(false);
  });

  test.each(["12.5", "12", "0.01", "9999.99", ""])("坪數 %s 通過", (ping) => {
    expect(parse({ ping }).success).toBe(true);
  });

  test.each(["12.555", "abc", "0", "0.00", "10000", "-3", "1e3"])("坪數 %s 失敗", (ping) => {
    expect(errorOf({ ping }, "ping")).toBeTruthy();
  });

  test("坪數保持字串，不轉成 number", () => {
    const r = parse({ ping: "12.50" });
    expect(r.success && r.data.ping).toBe("12.50");
  });

  test("屋況只接受 new／resale／old 或空", () => {
    expect(parse({ condition: "old" }).success).toBe(true);
    expect(parse({ condition: "x" }).success).toBe(false);
  });

  test("狀態必須是合法值", () => {
    expect(parse({ status: "in_progress" }).success).toBe(true);
    expect(parse({ status: "nope" }).success).toBe(false);
  });

  test("樓層 ≤ 10、規約 ≤ 2000、地址 ≤ 200", () => {
    expect(parse({ floor: "12345678901" }).success).toBe(false);
    expect(parse({ hoaRules: "a".repeat(2001) }).success).toBe(false);
    expect(parse({ addressFull: "a".repeat(201) }).success).toBe(false);
  });

  test("身分證格式", () => {
    expect(parse({ clientName: "王", clientNationalId: "A123456789" }).success).toBe(true);
    expect(parse({ clientName: "王", clientNationalId: "a123456789" }).success).toBe(true);
    expect(errorOf({ clientName: "王", clientNationalId: "A323456789" }, "clientNationalId")).toBeTruthy();
    expect(errorOf({ clientName: "王", clientNationalId: "A12345678" }, "clientNationalId")).toBeTruthy();
  });

  test("Email 格式", () => {
    expect(parse({ clientName: "王", clientEmail: "a@example.com" }).success).toBe(true);
    expect(errorOf({ clientName: "王", clientEmail: "not-mail" }, "clientEmail")).toBeTruthy();
  });

  test("有業主電話但沒有業主姓名 → 請填寫業主姓名", () => {
    expect(errorOf({ clientPhone: "0912345678" }, "clientName")).toBe("請填寫業主姓名");
  });

  test("完全沒填業主資料時不建立業主（通過）", () => {
    expect(parse({}).success).toBe(true);
  });
});
