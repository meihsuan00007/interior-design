import { describe, expect, test } from "vitest";
import { escapeLike } from "@/lib/escape-like";

describe("escapeLike", () => {
  test("轉義 %、_ 與反斜線", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  test("一般文字不變", () => {
    expect(escapeLike("大安區")).toBe("大安區");
  });
});
