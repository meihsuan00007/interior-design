import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit as defaultWriteAudit } from "@/lib/audit";
import { blindIndexOrNull } from "@/lib/crypto/blind-index";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import { createClient } from "@/lib/supabase/server";

export interface ClientPiiInput {
  name: string;
  phone?: string;
  email?: string;
  nationalId?: string;
}

export interface EncryptedClientPii {
  nameEnc: string;
  phoneEnc: string | null;
  emailEnc: string | null;
  nationalIdEnc: string | null;
  nameBidx: string | null;
  phoneBidx: string | null;
  emailBidx: string | null;
  nationalIdBidx: string | null;
}

function encOrNull(
  kind: "phone" | "email" | "national_id",
  value: string | undefined,
): [string | null, string | null] {
  const bidx = blindIndexOrNull(kind, value);
  // 正規化後為空（例如 "-"）視為未填
  return bidx === null ? [null, null] : [encryptField(value!.trim()), bidx];
}

export function encryptClientPii(i: ClientPiiInput): EncryptedClientPii {
  const nameBidx = blindIndexOrNull("name", i.name);
  if (nameBidx === null) throw new Error("業主姓名不可為空");
  const [phoneEnc, phoneBidx] = encOrNull("phone", i.phone);
  const [emailEnc, emailBidx] = encOrNull("email", i.email);
  const [nationalIdEnc, nationalIdBidx] = encOrNull("national_id", i.nationalId);
  return {
    nameEnc: encryptField(i.name.trim()),
    phoneEnc,
    emailEnc,
    nationalIdEnc,
    nameBidx,
    phoneBidx,
    emailBidx,
    nationalIdBidx,
  };
}

export function decryptClientName(row: { name_enc: string }): string {
  return decryptField(row.name_enc);
}

export interface RevealDeps {
  supabase?: SupabaseClient;
  writeAudit?: typeof defaultWriteAudit;
}

/** 先寫稽核（失敗即中止、不回傳資料），再以 RLS client 讀取並解密聯絡資料。 */
export async function revealClientContact(
  clientId: string,
  organizationId: string,
  deps: RevealDeps = {},
): Promise<{ phone: string | null; email: string | null; nationalId: string | null }> {
  const audit = deps.writeAudit ?? defaultWriteAudit;
  await audit({
    action: "client.view_pii",
    targetType: "client",
    targetId: clientId,
    organizationId,
    metadata: { fields: "phone,email,national_id" },
  });

  const supabase = deps.supabase ?? (await createClient());
  const { data, error } = await supabase
    .from("clients")
    .select("phone_enc, email_enc, national_id_enc")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`讀取業主資料失敗：${error.message}`);
  if (!data) throw new Error("找不到業主或沒有權限檢視");

  const dec = (v: string | null) => (v ? decryptField(v) : null);
  return {
    phone: dec(data.phone_enc),
    email: dec(data.email_enc),
    nationalId: dec(data.national_id_enc),
  };
}

/** "0912345678" → "0912-***-678"；位數不足 6 回傳 "***"。 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "***";
  return `${digits.slice(0, 4)}-***-${digits.slice(-3)}`;
}
