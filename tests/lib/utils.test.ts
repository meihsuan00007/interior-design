import { describe, expect, test } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  test("後者覆蓋衝突的 Tailwind class", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
  test("忽略 falsy 值", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
