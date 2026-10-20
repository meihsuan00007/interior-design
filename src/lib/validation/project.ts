import Decimal from "decimal.js";
import { z } from "zod";
import { PROJECT_CONDITIONS, PROJECT_STATUSES } from "@/db/schema/projects";

const text = (label: string, max: number) => z.string().max(max, `${label}最多 ${max} 字`);

const PING_MIN = new Decimal("0.01");
const PING_MAX = new Decimal("9999.99");

/** 坪數：空白，或 0.01～9999.99 的十進位字串（最多兩位小數）。以 Decimal 驗證，不轉 number。 */
const ping = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    if (v === "") return;
    if (!/^\d+(\.\d+)?$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "坪數必須是數字" });
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(v)) {
      ctx.addIssue({ code: "custom", message: "坪數最多兩位小數" });
      return;
    }
    const d = new Decimal(v);
    if (d.lt(PING_MIN) || d.gt(PING_MAX)) {
      ctx.addIssue({ code: "custom", message: "坪數必須介於 0.01 到 9999.99" });
    }
  });

const email = z
  .string()
  .trim()
  .max(100, "Email 最多 100 字")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Email 格式不正確");

const nationalId = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([A-Z][12]\d{8})?$/, "身分證字號格式不正確");

export const projectSchema = z
  .object({
    name: z.string().trim().min(1, "請輸入案場名稱").max(60, "案場名稱最多 60 字"),
    district: text("行政區", 20),
    addressFull: text("完整地址", 200),
    /** 編輯時使用者是否動過地址欄位；沒動過就不更新 address_full_enc */
    addressTouched: z.boolean().optional(),
    ping,
    condition: z.enum(["", ...PROJECT_CONDITIONS], { message: "屋況不正確" }),
    floor: text("樓層", 10),
    hasElevator: z.boolean().nullable(),
    hoaRules: text("社區規約", 2000),
    status: z.enum(PROJECT_STATUSES, { message: "案場狀態不正確" }),
    // 業主區塊（選填）：填了姓名才會建立業主
    clientName: z.string().trim().max(60, "業主姓名最多 60 字"),
    clientPhone: text("業主電話", 30),
    clientEmail: email,
    clientNationalId: nationalId,
  })
  .superRefine((v, ctx) => {
    const hasOther = [v.clientPhone, v.clientEmail, v.clientNationalId].some((x) => x.trim() !== "");
    if (v.clientName === "" && hasOther) {
      ctx.addIssue({ code: "custom", path: ["clientName"], message: "請填寫業主姓名" });
    }
  });

export type ProjectInput = z.infer<typeof projectSchema>;
