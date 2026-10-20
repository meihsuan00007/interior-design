import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import { decryptField } from "@/lib/crypto/field-encryption";
import type { ProjectInput } from "@/lib/validation/project";
import { loadAppContext } from "@/server/context";
import { createProject, updateProject, type ProjectWriteCtx } from "@/server/projects/mutations";
import { getProjectForEdit, listProjects } from "@/server/projects/queries";
import { randomSuffix, signInAs } from "./helpers";

const sfx = randomSuffix();

const input = (extra: Partial<ProjectInput> = {}): ProjectInput => ({
  name: `測試案場-${sfx}`,
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
let designer: ProjectWriteCtx;
let supervisor: ProjectWriteCtx;

beforeAll(async () => {
  designerClient = await signInAs("designer@jia.example");
  const supClient = await signInAs("supervisor@jia.example");
  const orgId = (await loadAppContext(designerClient))!.memberships[0].organizationId;
  designer = { orgId, role: "designer", supabase: designerClient };
  supervisor = { orgId, role: "supervisor", supabase: supClient };
});

async function clientRowOf(supabase: SupabaseClient, projectId: string) {
  const { data: p } = await supabase.from("projects").select("client_id").eq("id", projectId).single();
  const { data } = await supabase.from("clients").select("*").eq("id", p!.client_id).single();
  return data!;
}

describe("createProject", () => {
  test("designer 建立含業主的案場：回傳 id、列表看得到、業主個資為密文與盲索引", async () => {
    const id = await createProject(
      designer,
      input({
        name: `含業主-${sfx}`,
        district: `甲區-${sfx}`,
        addressFull: "虛構市虛構路 1 號",
        ping: "12.50",
        condition: "resale",
        hasElevator: true,
        clientName: "王小明",
        clientPhone: "0912-345-678",
        clientEmail: "ming@example.com",
        clientNationalId: "A123456789",
      }),
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await listProjects(designer, { q: `含業主-${sfx}` });
    const row = rows.find((r) => r.id === id)!;
    expect(row).toMatchObject({ name: `含業主-${sfx}`, district: `甲區-${sfx}`, status: "lead", ping: "12.50" });

    const c = await clientRowOf(designerClient, id);
    expect(c.phone_enc).not.toContain("0912");
    expect(decryptField(c.phone_enc)).toBe("0912-345-678");
    expect(c.phone_bidx).not.toBeNull();
    expect(c.name_bidx).not.toBeNull();
    expect(c.national_id_bidx).not.toBeNull();

    const { data: p } = await designerClient.from("projects").select("address_full_enc").eq("id", id).single();
    expect(p!.address_full_enc).not.toContain("虛構");
  });

  test("只填空白電話：phone_enc、phone_bidx 皆為 null", async () => {
    const id = await createProject(designer, input({ name: `空電話-${sfx}`, clientName: "李小華", clientPhone: "   " }));
    const c = await clientRowOf(designerClient, id);
    expect(c.phone_enc).toBeNull();
    expect(c.phone_bidx).toBeNull();
    expect(c.name_bidx).not.toBeNull();
  });

  test("沒有業主姓名就不建立業主", async () => {
    const id = await createProject(designer, input({ name: `無業主-${sfx}` }));
    const { data } = await designerClient.from("projects").select("client_id").eq("id", id).single();
    expect(data!.client_id).toBeNull();
  });

  test("supervisor 建立被拒", async () => {
    await expect(createProject(supervisor, input({ name: `監工-${sfx}` }))).rejects.toThrow("沒有權限");
  });
});

describe("listProjects", () => {
  test("q 以行政區比對，只回傳相符案場", async () => {
    const d = `搜尋區-${sfx}`;
    const a = await createProject(designer, input({ name: `搜尋A-${sfx}`, district: d }));
    await createProject(designer, input({ name: `搜尋B-${sfx}`, district: `別區-${sfx}` }));
    const rows = await listProjects(designer, { q: d });
    expect(rows.map((r) => r.id)).toEqual([a]);
  });

  test("q 的 % 、底線、逗號、括號、引號被當成字面字元，不會比對全部", async () => {
    await createProject(designer, input({ name: `字元-${sfx}` }));
    for (const q of ["%", "_", "a,b)(", '"x\\']) {
      expect(await listProjects(designer, { q: `${q}${sfx}` })).toEqual([]);
    }
  });

  test("status=active 不含 archived；status=archived 只含 archived", async () => {
    const arch = await createProject(designer, input({ name: `封存-${sfx}`, status: "archived" }));
    const live = await createProject(designer, input({ name: `進行-${sfx}`, status: "quoting" }));
    const active = (await listProjects(designer, { q: sfx, status: "active" })).map((r) => r.id);
    expect(active).toContain(live);
    expect(active).not.toContain(arch);
    const archived = (await listProjects(designer, { q: sfx, status: "archived" })).map((r) => r.id);
    expect(archived).toContain(arch);
    expect(archived).not.toContain(live);
  });

  test("不回傳任何個資欄位", async () => {
    const rows = await listProjects(designer, { q: `含業主-${sfx}` });
    expect(Object.keys(rows[0]).sort()).toEqual(["district", "id", "name", "ping", "status", "updatedAt"]);
  });

  test("跨公司看不到（乙公司 admin）", async () => {
    const yi = await signInAs("admin@yi.example");
    const yiOrg = (await loadAppContext(yi))!.memberships[0].organizationId;
    expect(await listProjects({ orgId: yiOrg, supabase: yi }, { q: sfx })).toEqual([]);
  });
});

describe("updateProject", () => {
  test("更新一般欄位與地址（解密後讀回）", async () => {
    const id = await createProject(designer, input({ name: `更新-${sfx}`, addressFull: "舊地址" }));
    await updateProject(
      designer,
      id,
      input({ name: `更新後-${sfx}`, addressFull: "新地址 5 號", addressTouched: true, ping: "30", status: "quoting" }),
    );
    const p = await getProjectForEdit(designer, id);
    expect(p).toMatchObject({ name: `更新後-${sfx}`, addressFull: "新地址 5 號", ping: "30.00", status: "quoting" });
  });

  test("已有業主：改名；空白電話／Email／身分證表示不變更", async () => {
    const id = await createProject(
      designer,
      input({ name: `改業主-${sfx}`, clientName: "舊名", clientPhone: "0922333444", clientEmail: "old@example.com" }),
    );
    const before = await clientRowOf(designerClient, id);
    await updateProject(designer, id, input({ name: `改業主-${sfx}`, clientName: "新名" }));
    const after = await clientRowOf(designerClient, id);
    expect(decryptField(after.name_enc)).toBe("新名");
    expect(after.name_bidx).not.toBe(before.name_bidx);
    expect(after.phone_enc).toBe(before.phone_enc);
    expect(after.phone_bidx).toBe(before.phone_bidx);
    expect(after.email_bidx).toBe(before.email_bidx);

    await updateProject(designer, id, input({ name: `改業主-${sfx}`, clientName: "新名", clientPhone: "0955666777" }));
    const again = await clientRowOf(designerClient, id);
    expect(decryptField(again.phone_enc)).toBe("0955666777");
    expect(again.phone_bidx).not.toBe(before.phone_bidx);
  });

  test("沒有業主時，表單填了業主姓名就建立", async () => {
    const id = await createProject(designer, input({ name: `補業主-${sfx}` }));
    await updateProject(designer, id, input({ name: `補業主-${sfx}`, clientName: "補登者", clientPhone: "0911000111" }));
    const c = await clientRowOf(designerClient, id);
    expect(decryptField(c.name_enc)).toBe("補登者");
    expect(c.phone_bidx).not.toBeNull();
  });

  test("沒有 client:view_pii 權限時伺服器忽略業主欄位", async () => {
    const id = await createProject(designer, input({ name: `忽略-${sfx}` }));
    // 角色欄位決定是否處理業主區塊（supervisor 沒有 client:view_pii）
    await updateProject({ ...designer, role: "supervisor" }, id, input({ name: `忽略-${sfx}`, clientName: "不該建立" }));
    const { data } = await designerClient.from("projects").select("client_id").eq("id", id).single();
    expect(data!.client_id).toBeNull();
  });

  test("getProjectForEdit：有權限才帶出業主姓名；不帶電話／Email／身分證", async () => {
    const id = await createProject(
      designer,
      input({ name: `預填-${sfx}`, clientName: "預填名", clientPhone: "0900111222" }),
    );
    const withPii = await getProjectForEdit(designer, id);
    expect(withPii).toMatchObject({ hasClient: true, clientName: "預填名" });
    expect(JSON.stringify(withPii)).not.toContain("0900111222");
    const without = await getProjectForEdit({ ...designer, role: "supervisor" }, id);
    expect(without).toMatchObject({ clientName: "" });
  });

  test("getProjectForEdit 輸出沒有電話、Email、身分證欄位", async () => {
    const id = await createProject(
      designer,
      input({
        name: `欄位-${sfx}`,
        clientName: "欄位名",
        clientPhone: "0900123123",
        clientEmail: "leak@example.com",
        clientNationalId: "B123456789",
      }),
    );
    const p = await getProjectForEdit(designer, id);
    expect(Object.keys(p!).sort()).toEqual(
      [
        "addressFull", "addressUnreadable", "clientName", "condition", "district", "floor", "hasClient",
        "hasElevator", "hoaRules", "id", "name", "ping", "status",
      ].sort(),
    );
    const json = JSON.stringify(p);
    for (const secret of ["0900123123", "leak@example.com", "B123456789"]) expect(json).not.toContain(secret);
  });

  test("地址無法解密：標示無法讀取；存其他欄位時地址密文不變；明確修改才覆寫", async () => {
    const id = await createProject(designer, input({ name: `壞地址-${sfx}`, addressFull: "原地址" }));
    await designerClient.from("projects").update({ address_full_enc: "v1:bad:bad:bad" }).eq("id", id);

    const p = await getProjectForEdit(designer, id);
    expect(p).toMatchObject({ addressFull: "", addressUnreadable: true });

    // 表單送出空地址但沒有動過地址欄位（addressTouched 未設）→ 不更新地址
    await updateProject(designer, id, input({ name: `壞地址改名-${sfx}`, addressFull: "" }));
    const { data } = await designerClient.from("projects").select("name, address_full_enc").eq("id", id).single();
    expect(data).toEqual({ name: `壞地址改名-${sfx}`, address_full_enc: "v1:bad:bad:bad" });

    await updateProject(designer, id, input({ name: `壞地址改名-${sfx}`, addressFull: "新地址", addressTouched: true }));
    const after = await getProjectForEdit(designer, id);
    expect(after).toMatchObject({ addressFull: "新地址", addressUnreadable: false });
  });

  test("找不到或無權限的案場回傳 null／拒絕", async () => {
    expect(await getProjectForEdit(designer, "00000000-0000-4000-8000-00000000dead")).toBeNull();
    await expect(updateProject(designer, "00000000-0000-4000-8000-00000000dead", input())).rejects.toThrow(
      "找不到資料，或沒有權限",
    );
  });
});
