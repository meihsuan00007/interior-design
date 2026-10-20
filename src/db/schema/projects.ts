import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, numeric, pgSchema, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
export const PROJECT_STATUSES = [
  "lead",
  "quoting",
  "contracted",
  "in_progress",
  "completed",
  "warranty",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: "洽談中",
  quoting: "報價中",
  contracted: "已簽約",
  in_progress: "施工中",
  completed: "完工",
  warranty: "保固中",
  archived: "已封存",
};

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
      sql`${t.status} in ('lead', 'quoting', 'contracted', 'in_progress', 'completed', 'warranty', 'archived')`,
    ),
    check("projects_tax_mode_check", sql`${t.taxMode} in ('exclusive', 'inclusive')`),
    check("projects_mgmt_fee_rate_check", sql`${t.mgmtFeeRate} >= 0`),
  ],
);

export const PROJECT_FILE_KINDS = ["floor_plan", "photo", "rendering", "drawing", "other"] as const;
export type ProjectFileKind = (typeof PROJECT_FILE_KINDS)[number];

/** 僅供外鍵參照（auth schema 由 Supabase 管理，不由 drizzle 遷移建立） */
const authUsers = pgSchema("auth").table("users", { id: uuid("id").primaryKey() });

/** 案場檔案（平面圖、現場照片等）。實體檔案存在 Storage，這裡只存中繼資料 */
export const projectFiles = pgTable(
  "project_files",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    kind: text("kind", { enum: PROJECT_FILE_KINDS }).notNull(),
    isDeidentified: boolean("is_deidentified").notNull().default(false),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .default(sql`auth.uid()`)
      .references(() => authUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_files_organization_id_idx").on(t.organizationId),
    index("project_files_project_id_idx").on(t.projectId),
    check("project_files_size_bytes_check", sql`${t.sizeBytes} between 1 and 52428800`),
    check(
      "project_files_storage_path_check",
      sql`starts_with(${t.storagePath}, ${t.organizationId}::text || '/' || ${t.projectId}::text || '/' || ${t.kind} || '/')
        and position('..' in ${t.storagePath}) = 0 and position(chr(92) in ${t.storagePath}) = 0`,
    ),
    check(
      "project_files_mime_type_check",
      sql`(${t.mimeType} like 'image/%' or ${t.mimeType} in ('application/pdf', 'application/acad', 'image/vnd.dwg', 'application/dxf', 'application/octet-stream'))
        and (${t.kind} <> 'photo' or ${t.mimeType} like 'image/%')`,
    ),
    // SVG 可內嵌指令碼，一律不接受（大小寫與參數變化皆擋）
    check("project_files_mime_type_no_svg_check", sql`lower(${t.mimeType}) not like 'image/svg%'`),
    check("project_files_kind_check", sql`${t.kind} in ('floor_plan', 'photo', 'rendering', 'drawing', 'other')`),
  ],
);
