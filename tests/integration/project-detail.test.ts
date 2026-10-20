import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import { buildStoragePath } from "@/lib/project-files";
import type { ProjectInput } from "@/lib/validation/project";
import { UserError } from "@/server/actions";
import { loadAppContext } from "@/server/context";
import { getProjectDetail, listOrgMembers } from "@/server/projects/detail";
import {
  createSignedDownloadUrl,
  deleteProjectFile,
  listProjectFiles,
  recordProjectFile,
  type FileCtx,
} from "@/server/projects/files";
import {
  clearClientContactField,
  createProject,
  getProjectClientId,
  setProjectMember,
  type ProjectWriteCtx,
} from "@/server/projects/mutations";
import { revealClientContact } from "@/server/pii";
import { revealForProject } from "@/server/projects/reveal";
import { auditVia, randomSuffix, signInAs } from "./helpers";

const sfx = randomSuffix();
const PDF = new TextEncoder().encode("%PDF-1.4\n%%EOF");

const input = (extra: Partial<ProjectInput> = {}): ProjectInput => ({
  name: `詳情-${sfx}`,
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
  ...extra,
});

let designerClient: SupabaseClient;
let supClient: SupabaseClient;
let adminClient: SupabaseClient;
let designer: ProjectWriteCtx;
let admin: ProjectWriteCtx;
let orgId: string;
let supervisorId: string;
let yiAdminId: string;

beforeAll(async () => {
  designerClient = await signInAs("designer@jia.example");
  supClient = await signInAs("supervisor@jia.example");
  adminClient = await signInAs("admin@jia.example");
  const yiClient = await signInAs("admin@yi.example");
  orgId = (await loadAppContext(designerClient))!.memberships[0].organizationId;
  designer = { orgId, role: "designer", supabase: designerClient };
  admin = { orgId, role: "admin", supabase: adminClient };
  supervisorId = (await supClient.auth.getUser()).data.user!.id;
  yiAdminId = (await yiClient.auth.getUser()).data.user!.id;
});

async function auditCount(clientId: string): Promise<number> {
  const { count } = await adminClient
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "client.view_pii")
    .eq("target_id", clientId);
  return count ?? 0;
}

describe("業主聯絡資料揭露", () => {
  test("revealClientContact 先寫稽核，metadata 不含電話本身", async () => {
    const id = await createProject(
      designer,
      input({ name: `揭露-${sfx}`, clientName: "王小明", clientPhone: "0912345678", clientEmail: "x@example.com" }),
    );
    const clientId = (await getProjectClientId(designer, id))!;
    const before = await auditCount(clientId);
    const r = await revealClientContact(clientId, orgId, {
      supabase: designerClient,
      writeAudit: auditVia(designerClient),
    });
    expect(r.phone).toBe("0912345678");
    expect(await auditCount(clientId)).toBe(before + 1);

    const { data } = await adminClient
      .from("audit_logs")
      .select("metadata")
      .eq("action", "client.view_pii")
      .eq("target_id", clientId);
    expect(JSON.stringify(data)).not.toContain("0912345678");
  });

  test("R16：清除電話後 enc 與 bidx 皆為 null，其他欄位不變", async () => {
    const id = await createProject(
      designer,
      input({ name: `清除-${sfx}`, clientName: "李小華", clientPhone: "0922333444", clientEmail: "c@example.com" }),
    );
    await clearClientContactField(designer, id, "phone");
    const clientId = (await getProjectClientId(designer, id))!;
    const { data } = await designerClient.from("clients").select("*").eq("id", clientId).single();
    expect(data!.phone_enc).toBeNull();
    expect(data!.phone_bidx).toBeNull();
    expect(data!.email_enc).not.toBeNull();
    expect(data!.email_bidx).not.toBeNull();
  });

  test("監工不能清除聯絡欄位", async () => {
    const id = await createProject(designer, input({ name: `監工清除-${sfx}`, clientName: "趙" }));
    await setProjectMember(designer, id, supervisorId, true);
    await expect(
      clearClientContactField({ orgId, role: "supervisor", supabase: supClient }, id, "phone"),
    ).rejects.toThrow("沒有權限");
  });
});

describe("getProjectDetail 與成員", () => {
  test("designer 加入監工；監工的 client 為 null，地址有值，無編輯權限", async () => {
    const id = await createProject(
      designer,
      input({ name: `成員-${sfx}`, addressFull: "虛構市虛構路 9 號", clientName: "孫大同", clientPhone: "0900111222" }),
    );
    const d = await getProjectDetail(designer, id);
    expect(d!.client?.name).toBe("孫大同");
    expect(d!.perms.canManageMembers).toBe(true);
    expect(d!.addableMembers.map((m) => m.userId)).toContain(supervisorId);

    await setProjectMember(designer, id, supervisorId, true);
    const s = await getProjectDetail({ orgId, role: "supervisor", supabase: supClient }, id);
    expect(s).not.toBeNull();
    expect(s!.client).toBeNull();
    expect(s!.address).toBe("虛構市虛構路 9 號");
    expect(s!.members.map((m) => m.userId)).toContain(supervisorId);
    expect(s!.perms).toMatchObject({ canEdit: false, canViewPii: false, canManageMembers: false });
    expect(s!.addableMembers).toEqual([]);
  });

  test("監工看不到未被指派的案場", async () => {
    const id = await createProject(designer, input({ name: `未指派監工-${sfx}` }));
    expect(await getProjectDetail({ orgId, role: "supervisor", supabase: supClient }, id)).toBeNull();
  });

  test("未指派的 designer 呼叫被拒；跨公司使用者與最後一位可編輯者有中文訊息", async () => {
    const adminProject = await createProject(admin, input({ name: `admin 案場-${sfx}` }));
    await expect(setProjectMember(designer, adminProject, supervisorId, true)).rejects.toThrow("沒有權限");
    expect(await getProjectDetail(designer, adminProject)).toBeNull();

    const id = await createProject(designer, input({ name: `規則-${sfx}` }));
    await expect(setProjectMember(designer, id, yiAdminId, true)).rejects.toThrow("此使用者不屬於本公司");
    await setProjectMember(designer, id, supervisorId, true);
    const designerId = (await designerClient.auth.getUser()).data.user!.id;
    await expect(setProjectMember(designer, id, designerId, false)).rejects.toThrow("案場至少需保留一位可編輯者");
    await setProjectMember(designer, id, supervisorId, false);
  });

  test("listOrgMembers 回傳同公司成員與 email", async () => {
    const m = await listOrgMembers(designerClient, orgId);
    expect(m.map((x) => x.email)).toContain("supervisor@jia.example");
    expect(m.map((x) => x.email)).not.toContain("admin@yi.example");
  });
});

describe("檔案上傳與簽名網址", () => {
  async function upload(client: SupabaseClient, projectId: string, kind: "floor_plan" | "photo", name: string) {
    const path = buildStoragePath(orgId, projectId, kind, name, crypto.randomUUID());
    const { error } = await client.storage
      .from("project-files")
      .upload(path, PDF, { contentType: kind === "photo" ? "image/png" : "application/pdf", upsert: false });
    return { path, error };
  }

  test("designer 上傳 PDF、寫列、簽名網址可下載 (200)；未指派 designer 取不到", async () => {
    const id = await createProject(designer, input({ name: `檔案-${sfx}` }));
    const { path, error } = await upload(designerClient, id, "floor_plan", "平面圖.pdf");
    expect(error).toBeNull();
    const ctx: FileCtx = { orgId, supabase: designerClient };
    await recordProjectFile(ctx, {
      projectId: id,
      kind: "floor_plan",
      storagePath: path,
      fileName: "平面圖.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
    });
    const files = await listProjectFiles(ctx, id);
    expect(files).toHaveLength(1);

    const url = await createSignedDownloadUrl(ctx, files[0].id);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer()).byteLength).toBe(PDF.byteLength);
    // 非圖片以附件下載
    expect(url).toContain("download=");

    // admin 建立的案場，designer 不是成員
    const adminProject = await createProject(admin, input({ name: `admin 檔案-${sfx}` }));
    const ap = await upload(adminClient, adminProject, "floor_plan", "a.pdf");
    expect(ap.error).toBeNull();
    await recordProjectFile(
      { orgId, supabase: adminClient },
      {
        projectId: adminProject,
        kind: "floor_plan",
        storagePath: ap.path,
        fileName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: PDF.byteLength,
      },
    );
    const adminFiles = await listProjectFiles({ orgId, supabase: adminClient }, adminProject);
    await expect(createSignedDownloadUrl(ctx, adminFiles[0].id)).rejects.toThrow(UserError);
    const direct = await designerClient.storage.from("project-files").createSignedUrl(ap.path, 60);
    expect(direct.data?.signedUrl).toBeUndefined();
  });

  test("監工只能上傳 photo；上傳 floor_plan 被 Storage 擋下", async () => {
    const id = await createProject(designer, input({ name: `監工檔案-${sfx}` }));
    await setProjectMember(designer, id, supervisorId, true);
    const ok = await upload(supClient, id, "photo", "現場.png");
    expect(ok.error).toBeNull();
    const bad = await upload(supClient, id, "floor_plan", "x.pdf");
    expect(bad.error).not.toBeNull();
  });

  test("SVG 被 Storage bucket 與 project_files 兩層拒絕", async () => {
    const id = await createProject(designer, input({ name: `svg-${sfx}` }));
    const path = buildStoragePath(orgId, id, "other", "x.svg", crypto.randomUUID());
    const { error } = await designerClient.storage
      .from("project-files")
      .upload(path, new TextEncoder().encode("<svg/>"), { contentType: "image/svg+xml" });
    expect(error).not.toBeNull();
    await expect(
      recordProjectFile(
        { orgId, supabase: designerClient },
        { projectId: id, kind: "other", storagePath: path, fileName: "x.svg", mimeType: "image/svg+xml", sizeBytes: 6 },
      ),
    ).rejects.toThrow(UserError);
  });

  test("刪除：稽核失敗則不刪除；成功則列與物件皆移除並寫 record.delete", async () => {
    const id = await createProject(designer, input({ name: `刪檔-${sfx}` }));
    const { path } = await upload(designerClient, id, "floor_plan", "d.pdf");
    const base: FileCtx = { orgId, supabase: designerClient };
    await recordProjectFile(base, {
      projectId: id,
      kind: "floor_plan",
      storagePath: path,
      fileName: "d.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
    });
    const [file] = await listProjectFiles(base, id);

    await expect(
      deleteProjectFile(
        {
          ...base,
          writeAudit: async () => {
            throw new Error("boom");
          },
        },
        file.id,
        id,
      ),
    ).rejects.toThrow("稽核寫入失敗");
    expect(await listProjectFiles(base, id)).toHaveLength(1);

    await deleteProjectFile({ ...base, writeAudit: auditVia(designerClient) }, file.id, id);
    expect(await listProjectFiles(base, id)).toHaveLength(0);
    const dl = await designerClient.storage.from("project-files").download(path);
    expect(dl.error).not.toBeNull();
    const { count } = await adminClient
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "record.delete")
      .eq("target_id", file.id);
    expect(count).toBe(1);
  });
});

describe("fix round 1", () => {
  async function putPdf(client: SupabaseClient, projectId: string, name: string) {
    const path = buildStoragePath(orgId, projectId, "floor_plan", name, crypto.randomUUID());
    const { error } = await client.storage
      .from("project-files")
      .upload(path, PDF, { contentType: "application/pdf", upsert: false });
    expect(error).toBeNull();
    return path;
  }

  test("recordProjectFile 在伺服器端清理檔名後才寫入", async () => {
    const id = await createProject(designer, input({ name: `清名-${sfx}` }));
    const path = await putPdf(designerClient, id, "x.pdf");
    const ctx: FileCtx = { orgId, supabase: designerClient };
    await recordProjectFile(ctx, {
      projectId: id,
      kind: "floor_plan",
      storagePath: path,
      fileName: "a\\b‮fdp\u0001c.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
    });
    const [f] = await listProjectFiles(ctx, id);
    expect(f.fileName).toBe("abfdpc.pdf");
  });

  test("recordProjectFile 拒絕不在允許清單的 MIME（含 SVG）", async () => {
    const id = await createProject(designer, input({ name: `mime-${sfx}` }));
    const path = await putPdf(designerClient, id, "y.pdf");
    const ctx: FileCtx = { orgId, supabase: designerClient };
    for (const mimeType of ["image/svg+xml", "text/html", "image/bmp"]) {
      await expect(
        recordProjectFile(ctx, { projectId: id, kind: "floor_plan", storagePath: path, fileName: "y.pdf", mimeType, sizeBytes: 5 }),
      ).rejects.toThrow("不支援的檔案類型");
    }
  });

  test("deleteProjectFile 帶入其他案場的檔案 id 被拒", async () => {
    const a = await createProject(designer, input({ name: `刪A-${sfx}` }));
    const b = await createProject(designer, input({ name: `刪B-${sfx}` }));
    const path = await putPdf(designerClient, a, "z.pdf");
    const ctx: FileCtx = { orgId, supabase: designerClient };
    await recordProjectFile(ctx, {
      projectId: a, kind: "floor_plan", storagePath: path, fileName: "z.pdf", mimeType: "application/pdf", sizeBytes: 5,
    });
    const [f] = await listProjectFiles(ctx, a);
    await expect(deleteProjectFile(ctx, f.id, b)).rejects.toThrow();
    expect(await listProjectFiles(ctx, a)).toHaveLength(1);
  });

  test("revealForProject：監工、非成員 designer、他案場 id 皆被擋且不寫稽核", async () => {
    const withClient = await createProject(designer, input({ name: `守門-${sfx}`, clientName: "周", clientPhone: "0911000111" }));
    const clientId = (await getProjectClientId(designer, withClient))!;
    await setProjectMember(designer, withClient, supervisorId, true);
    const noClient = await createProject(designer, input({ name: `守門無業主-${sfx}` }));
    const adminOnly = await createProject(admin, input({ name: `守門admin-${sfx}`, clientName: "吳" }));

    const before = await auditCount(clientId);
    const audit = auditVia(designerClient);
    let calls = 0;
    const deps = (c: SupabaseClient) => ({
      supabase: c,
      writeAudit: async (e: Parameters<typeof audit>[0]) => {
        calls++;
        await audit(e);
      },
    });

    const sup = await revealForProject({ orgId, role: "supervisor", supabase: supClient }, withClient, deps(supClient));
    expect(sup).toEqual({ ok: false, message: "沒有權限" });
    const nonMember = await revealForProject({ orgId, role: "designer", supabase: designerClient }, adminOnly, deps(designerClient));
    expect(nonMember.ok).toBe(false);
    const none = await revealForProject(designer, noClient, deps(designerClient));
    expect(none.ok).toBe(false);
    // 偽造的 projectId：不是案場
    const fake = await revealForProject(designer, "00000000-0000-4000-8000-000000000000", deps(designerClient));
    expect(fake.ok).toBe(false);
    expect(calls).toBe(0);
    expect(await auditCount(clientId)).toBe(before);

    const ok = await revealForProject(designer, withClient, deps(designerClient));
    expect(ok.ok).toBe(true);
    expect(calls).toBe(1);
  });
});
