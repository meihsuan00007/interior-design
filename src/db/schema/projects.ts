import { sql } from "drizzle-orm";
import { boolean, check, index, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, ratio, TAX_MODES, timestamps } from "./columns";
import { organizations } from "./tenancy";

/**
 * 業主。*_enc 為 AES-256-GCM 加密欄位（encryptField 輸出），
 * *_bidx 為盲索引（HMAC），供等值搜尋。
 */
export const clients = pgTable(
  "clients",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nameEnc: text("name_enc").notNull(),
    phoneEnc: text("phone_enc"),
    emailEnc: text("email_enc"),
    nationalIdEnc: text("national_id_enc"),
    nameBidx: text("name_bidx"),
    phoneBidx: text("phone_bidx"),
    emailBidx: text("email_bidx"),
    nationalIdBidx: text("national_id_bidx"),
    ...timestamps(),
  },
  (t) => [
    index("clients_organization_id_idx").on(t.organizationId),
    index("clients_name_bidx_idx").on(t.organizationId, t.nameBidx),
    index("clients_phone_bidx_idx").on(t.organizationId, t.phoneBidx),
    index("clients_email_bidx_idx").on(t.organizationId, t.emailBidx),
    index("clients_national_id_bidx_idx").on(t.organizationId, t.nationalIdBidx),
  ],
);

export const PROJECT_CONDITIONS = ["new", "resale", "old"] as const;
export const PROJECT_STATUSES = ["lead", "quoting", "contracted", "in_progress", "completed", "closed"] as const;

/** 案場。address_full_enc 為加密欄位；district 為公開的行政區 */
export const projects = pgTable(
  "projects",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    district: text("district"),
    addressFullEnc: text("address_full_enc"),
    ping: numeric("ping", { precision: 10, scale: 2 }),
    condition: text("condition", { enum: PROJECT_CONDITIONS }),
    floor: text("floor"),
    hasElevator: boolean("has_elevator"),
    hoaRules: text("hoa_rules"),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("lead"),
    /** null = 使用公司預設比例 */
    mgmtFeeRate: ratio("mgmt_fee_rate"),
    /** null = 使用公司預設稅別 */
    taxMode: text("tax_mode", { enum: TAX_MODES }),
    ...timestamps(),
  },
  (t) => [
    index("projects_organization_id_idx").on(t.organizationId),
    index("projects_client_id_idx").on(t.clientId),
    check("projects_condition_check", sql`${t.condition} in ('new', 'resale', 'old')`),
    check(
      "projects_status_check",
      sql`${t.status} in ('lead', 'quoting', 'contracted', 'in_progress', 'completed', 'closed')`,
    ),
    check("projects_tax_mode_check", sql`${t.taxMode} in ('exclusive', 'inclusive')`),
    check("projects_mgmt_fee_rate_check", sql`${t.mgmtFeeRate} >= 0`),
  ],
);
