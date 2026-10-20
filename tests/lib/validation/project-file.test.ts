import { describe, expect, test } from "vitest";
import { recordFileSchema } from "@/lib/validation/project-file";

const base = {
  projectId: "5b3f4c1e-0f6e-4b0e-9a57-0d7a2b7c1f11",
  kind: "photo" as const,
  storagePath: "o/p/photo/x-file.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 10,
};

describe("recordFileSchema", () => {
  test("150 字元的檔名可通過（由 safeFileName 負責截斷）", () => {
    expect(recordFileSchema.safeParse({ ...base, fileName: "字".repeat(146) + ".jpg" }).success).toBe(true);
  });

  test("空檔名與超過 1000 字元被拒絕", () => {
    expect(recordFileSchema.safeParse({ ...base, fileName: "" }).success).toBe(false);
    expect(recordFileSchema.safeParse({ ...base, fileName: "a".repeat(1001) }).success).toBe(false);
  });
});
