import { describe, expect, test } from "vitest";
import { buildStoragePath, MAX_UPLOAD_BYTES, isAllowedMime, resolveUploadMime, safeFileName, validateUpload } from "@/server/projects/files";

const MB = 1024 * 1024;

describe("validateUpload", () => {
  test("50 MB 通過，多 1 位元組被拒", () => {
    expect(validateUpload({ name: "a.pdf", size: 50 * MB, type: "application/pdf" })).toEqual({ ok: true });
    const r = validateUpload({ name: "a.pdf", size: 50 * MB + 1, type: "application/pdf" });
    expect(r.ok).toBe(false);
    expect(MAX_UPLOAD_BYTES).toBe(52428800);
  });

  test("0 位元組被拒", () => {
    expect(validateUpload({ name: "a.pdf", size: 0, type: "application/pdf" }).ok).toBe(false);
  });

  test(".dwg 與 .dxf 在 type 為空或 octet-stream 時通過", () => {
    for (const type of ["", "application/octet-stream"]) {
      expect(validateUpload({ name: "平面.dwg", size: 10, type })).toEqual({ ok: true });
      expect(validateUpload({ name: "平面.DXF", size: 10, type })).toEqual({ ok: true });
    }
  });

  test(".exe 與其他不明類型被拒；空 type 的非 CAD 檔被拒", () => {
    expect(validateUpload({ name: "a.exe", size: 10, type: "application/x-msdownload" }).ok).toBe(false);
    expect(validateUpload({ name: "a.exe", size: 10, type: "" }).ok).toBe(false);
    expect(validateUpload({ name: "a.pdf", size: 10, type: "" }).ok).toBe(false);
    expect(validateUpload({ name: "a.zip", size: 10, type: "application/zip" }).ok).toBe(false);
  });

  test("SVG 一律被拒（副檔名或類型）", () => {
    expect(validateUpload({ name: "a.svg", size: 10, type: "image/svg+xml" }).ok).toBe(false);
    expect(validateUpload({ name: "a.svg", size: 10, type: "image/png" }).ok).toBe(false);
    expect(validateUpload({ name: "a.png", size: 10, type: "image/svg+xml" }).ok).toBe(false);
  });

  test("bucket 允許的影像與 PDF 通過；不在清單的 image/* 被拒", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]) {
      expect(validateUpload({ name: "x.img", size: 10, type })).toEqual({ ok: true });
    }
    expect(validateUpload({ name: "x.bmp", size: 10, type: "image/bmp" }).ok).toBe(false);
  });
});

describe("resolveUploadMime", () => {
  test("空 type 的 dwg/dxf 以 octet-stream 上傳；其他維持原類型", () => {
    expect(resolveUploadMime({ name: "a.dwg", type: "" })).toBe("application/octet-stream");
    expect(resolveUploadMime({ name: "a.pdf", type: "application/pdf" })).toBe("application/pdf");
  });
});

describe("buildStoragePath", () => {
  const org = "10000000-0000-4000-8000-0000000000aa";
  const proj = "20000000-0000-4000-8000-0000000000bb";
  const uuid = "30000000-0000-4000-8000-0000000000cc";

  test("路徑格式正確；Storage 鍵只含 ASCII（中文改為底線，原名另存 file_name）", () => {
    expect(buildStoragePath(org, proj, "floor_plan", "平面圖.pdf", uuid)).toBe(
      `${org}/${proj}/floor_plan/${uuid}-_.pdf`,
    );
    expect(buildStoragePath(org, proj, "other", "plan v2.pdf", uuid)).toBe(
      `${org}/${proj}/other/${uuid}-plan v2.pdf`,
    );
  });

  test("../../平面圖 v2.pdf：路徑不含分隔與 ..；safeFileName 保留中文", () => {
    const p = buildStoragePath(org, proj, "other", "../../平面圖 v2.pdf", uuid);
    expect(p.split("/")).toHaveLength(4);
    expect(p).not.toContain("..");
    expect(p).not.toContain("\\");
    expect(p).toMatch(/^[ -~]+$/);
    expect(safeFileName("../../平面圖 v2.pdf")).toBe("平面圖 v2.pdf");
  });

  test("控制字元、反斜線被移除；空白收合；超長截斷至 100 字元", () => {
    const p = buildStoragePath(org, proj, "other", "a\u0000b\c\n  d.pdf", uuid);
    expect(p.endsWith(`${uuid}-abc d.pdf`)).toBe(true);
    expect(safeFileName("字".repeat(300) + ".pdf").length).toBeLessThanOrEqual(100);
    const long = buildStoragePath(org, proj, "other", "字".repeat(300) + ".pdf", uuid);
    expect(long.slice(`${org}/${proj}/other/${uuid}-`.length).length).toBeLessThanOrEqual(100);
  });

  test("清理後為空則使用 file", () => {
    expect(buildStoragePath(org, proj, "other", "...", uuid).endsWith(`${uuid}-file`)).toBe(true);
    expect(buildStoragePath(org, proj, "other", "//", uuid).endsWith(`${uuid}-file`)).toBe(true);
  });
});

describe("safeFileName（反斜線與雙向控制字元）", () => {
  test("真正的反斜線被移除", () => {
    expect(safeFileName("a\\b\\..\\c.pdf")).toBe("ab.c.pdf");
    expect(safeFileName("C:\\dir\\file.pdf")).not.toContain("\\");
  });

  test("U+202E 等雙向控制字元被移除", () => {
    expect(safeFileName("abc\u202Efdp.exe")).toBe("abcfdp.exe");
    expect(safeFileName("a\u2066b\u2069c\u202Ad")).toBe("abcd");
  });
});

describe("isAllowedMime", () => {
  test("沿用 bucket 允許清單，SVG 與未知類型被拒", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("IMAGE/PNG")).toBe(true);
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime("")).toBe(false);
  });
});

describe("safeFileName（長檔名保留副檔名，以 code point 計）", () => {
  test("字 × 300 + .pdf：剛好 100 個 code point 且以 .pdf 結尾", () => {
    const n = safeFileName("字".repeat(300) + ".pdf");
    expect(Array.from(n)).toHaveLength(100);
    expect(n.endsWith(".pdf")).toBe(true);
  });

  test("大量 emoji 不超過 100 個 code point，副檔名保留", () => {
    const n = safeFileName("😀".repeat(200) + ".jpeg");
    expect(Array.from(n).length).toBeLessThanOrEqual(100);
    expect(n.endsWith(".jpeg")).toBe(true);
    expect(n).not.toMatch(/[\ud800-\udbff]$/); // 不會切在代理對中間
  });

  test("副檔名超過 10 字元視為沒有副檔名，直接截斷", () => {
    const n = safeFileName("a".repeat(150) + "." + "b".repeat(20));
    expect(Array.from(n)).toHaveLength(100);
  });

  test("沒有副檔名的長名稱截斷為 100", () => {
    expect(Array.from(safeFileName("x".repeat(150)))).toHaveLength(100);
  });

  test("100 以內不變", () => {
    expect(safeFileName("平面圖.pdf")).toBe("平面圖.pdf");
  });
});
