import { beforeAll, describe, expect, test, vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgres://x");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "a");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s");
  vi.stubEnv("FIELD_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  vi.stubEnv("BLIND_INDEX_KEY", Buffer.alloc(32, 5).toString("base64"));
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("encryptClientPii", () => {
  test("空白電話得到 null 欄位，姓名以 v1: 開頭", async () => {
    const { encryptClientPii } = await import("@/server/pii");
    const r = encryptClientPii({ name: "王小明", phone: "" });
    expect(r.phoneEnc).toBeNull();
    expect(r.phoneBidx).toBeNull();
    expect(r.nameEnc.startsWith("v1:")).toBe(true);
    expect(r.nameBidx).toMatch(/^[0-9a-f]{64}$/);
  });

  test("可解密姓名", async () => {
    const { encryptClientPii, decryptClientName } = await import("@/server/pii");
    const r = encryptClientPii({ name: "王小明", phone: "0912-345-678" });
    expect(decryptClientName({ name_enc: r.nameEnc })).toBe("王小明");
    expect(r.phoneEnc).not.toBeNull();
  });
});

describe("maskPhone", () => {
  test("遮罩", async () => {
    const { maskPhone } = await import("@/server/pii");
    expect(maskPhone("0912345678")).toBe("0912-***-678");
    expect(maskPhone("123")).toBe("***");
  });
});

describe("revealClientContact", () => {
  test("稽核寫入失敗時中止，不讀取也不回傳資料", async () => {
    const { revealClientContact } = await import("@/server/pii");
    const from = vi.fn();
    const writeAudit = vi.fn().mockRejectedValue(new Error("audit down"));
    await expect(
      revealClientContact("c1", "o1", { supabase: { from } as never, writeAudit }),
    ).rejects.toThrow("audit down");
    expect(from).not.toHaveBeenCalled();
  });

  test("先稽核再讀取並解密", async () => {
    const { revealClientContact, encryptClientPii } = await import("@/server/pii");
    const enc = encryptClientPii({ name: "王小明", phone: "0912345678", email: "A@b.com" });
    const order: string[] = [];
    const writeAudit = vi.fn(async () => {
      order.push("audit");
    });
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        order.push("read");
        return {
          data: { phone_enc: enc.phoneEnc, email_enc: enc.emailEnc, national_id_enc: null },
          error: null,
        };
      },
    };
    const r = await revealClientContact("c1", "o1", {
      supabase: { from: () => chain } as never,
      writeAudit,
    });
    expect(order).toEqual(["audit", "read"]);
    expect(r).toEqual({ phone: "0912345678", email: "A@b.com", nationalId: null });
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "client.view_pii",
        metadata: { fields: "phone,email,national_id" },
      }),
    );
  });
});
