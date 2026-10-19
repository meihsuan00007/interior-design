import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { decimal14x2, id, money, ratio, TAX_MODES, timestamps } from "./columns";
import { catalogItems, trades } from "./master";
import { projects } from "./projects";
import { organizations } from "./tenancy";

// 沒有直接隸屬案場的子表也冗餘存放 project_id，讓 RLS policy 不需多層 join；
// 由資料庫 trigger（app.check_parent_scope）檢查其與父表一致。

const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const projectId = () =>
  uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    title: text("title").notNull(),
    ...timestamps(),
  },
  (t) => [index("quotes_project_id_idx").on(t.projectId)],
);

export const QUOTE_VERSION_STATUSES = ["draft", "issued", "signed"] as const;

/** 報價版本；總計欄位為快取（numeric(14,0)，元） */
export const quoteVersions = pgTable(
  "quote_versions",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    status: text("status", { enum: QUOTE_VERSION_STATUSES }).notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    contentHash: text("content_hash"),
    mgmtFeeRateSnapshot: ratio("mgmt_fee_rate_snapshot"),
    taxMode: text("tax_mode", { enum: TAX_MODES }).notNull().default("exclusive"),
    // 總計快取（計算順序見 CLAUDE.md D7）
    includedSubtotal: money("included_subtotal"), // S1 計入管銷小計
    proxySubtotal: money("proxy_subtotal"), // S2 代購（不計管銷、公司收款）
    mgmtFeeAmount: money("mgmt_fee_amount"), // F
    otherFeesAmount: money("other_fees_amount"), // D
    discountAmount: money("discount_amount"), // X
    netTotal: money("net_total"), // N 未稅合計
    taxAmount: money("tax_amount"),
    grandTotal: money("grand_total"),
    ...timestamps(),
  },
  (t) => [
    unique("quote_versions_quote_id_version_no_key").on(t.quoteId, t.versionNo),
    index("quote_versions_project_id_idx").on(t.projectId),
    check("quote_versions_status_check", sql`${t.status} in ('draft', 'issued', 'signed')`),
    check("quote_versions_tax_mode_check", sql`${t.taxMode} in ('exclusive', 'inclusive')`),
  ],
);

/** 報價區段（依工種分區）；不含金額，監工可讀 */
export const quoteSections = pgTable(
  "quote_sections",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => quoteVersions.id, { onDelete: "cascade" }),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
    title: text("title"),
    sort: integer("sort").notNull().default(0),
    footnote: text("footnote"),
    ...timestamps(),
  },
  (t) => [
    index("quote_sections_version_id_idx").on(t.versionId),
    index("quote_sections_project_id_idx").on(t.projectId),
  ],
);

export const CLIENT_PRICE_MODES = ["auto", "manual"] as const;
export const MGMT_FEE_SOURCES = ["default", "owner_direct", "manual"] as const;

export const quoteItems = pgTable(
  "quote_items",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => quoteVersions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => quoteSections.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => quoteItems.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    itemNoLabel: text("item_no_label"),
    // 快照
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    unitName: text("unit_name"),
    spec: text("spec"),
    note: text("note"),
    quantity: decimal14x2("quantity"),
    clientUnitPrice: decimal14x2("client_unit_price"),
    clientPriceMode: text("client_price_mode", { enum: CLIENT_PRICE_MODES }).notNull().default("manual"),
    // 加成率放在 quote_item_pricing_meta（單價 ÷ 加成率 = 成本，須受 can_view_cost 保護）
    // 旗標
    isOptional: boolean("is_optional").notNull().default(false),
    isComplimentary: boolean("is_complimentary").notNull().default(false),
    isOwnerSupplied: boolean("is_owner_supplied").notNull().default(false),
    isActualCost: boolean("is_actual_cost").notNull().default(false),
    refPriceMin: money("ref_price_min"),
    refPriceMax: money("ref_price_max"),
    /** 業主直付；為 true 時強制不計入管銷 */
    isPaidDirectlyByOwner: boolean("is_paid_directly_by_owner").notNull().default(false),
    includeInMgmtFee: boolean("include_in_mgmt_fee").notNull().default(true),
    includeInMgmtFeeSource: text("include_in_mgmt_fee_source", { enum: MGMT_FEE_SOURCES })
      .notNull()
      .default("default"),
    /** 原表紅字：只有匯入資料會有值，不具任何商業意義 */
    legacyRedFont: boolean("legacy_red_font"),
    /** 匯入來源列（import_rows 於後續計畫建立，暫不加外鍵） */
    sourceImportRowId: uuid("source_import_row_id"),
    ...timestamps(),
  },
  (t) => [
    index("quote_items_version_id_idx").on(t.versionId),
    index("quote_items_section_id_idx").on(t.sectionId),
    index("quote_items_parent_id_idx").on(t.parentId),
    index("quote_items_project_id_idx").on(t.projectId),
    check("quote_items_client_price_mode_check", sql`${t.clientPriceMode} in ('auto', 'manual')`),
    check(
      "quote_items_include_in_mgmt_fee_source_check",
      sql`${t.includeInMgmtFeeSource} in ('default', 'owner_direct', 'manual')`,
    ),
    check(
      "quote_items_owner_direct_excluded_check",
      sql`not (${t.isPaidDirectlyByOwner} and ${t.includeInMgmtFee})`,
    ),
  ],
);

/**
 * 報價項目的計價中繼資料（可反推成本）。RLS 以 app.can_view_cost(project_id) 保護，
 * 與 quote_items 一對一。
 */
export const quoteItemPricingMeta = pgTable("quote_item_pricing_meta", {
  quoteItemId: uuid("quote_item_id")
    .primaryKey()
    .references(() => quoteItems.id, { onDelete: "cascade" }),
  organizationId: orgId(),
  projectId: projectId(),
  /** 加成率（倍數，例 1.350000）；可能大於 10，故不用 numeric(7,6) */
  markupRateUsed: numeric("markup_rate_used", { precision: 10, scale: 6 }),
  ...timestamps(),
});

export const QUOTE_FEE_KINDS =["mgmt", "design", "warranty", "discount", "other"] as const;
export const QUOTE_FEE_MODES = ["percent", "fixed"] as const;

/** 浮動費用；percent 用 rate（numeric(7,6)），fixed 用 amount（numeric(14,0)） */
export const quoteFees = pgTable(
  "quote_fees",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => quoteVersions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: QUOTE_FEE_KINDS }).notNull(),
    mode: text("mode", { enum: QUOTE_FEE_MODES }).notNull(),
    label: text("label"),
    rate: ratio("rate"),
    amount: money("amount"),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("quote_fees_version_id_idx").on(t.versionId),
    check(
      "quote_fees_kind_check",
      sql`${t.kind} in ('mgmt', 'design', 'warranty', 'discount', 'other')`,
    ),
    check("quote_fees_mode_check", sql`${t.mode} in ('percent', 'fixed')`),
    check(
      "quote_fees_value_check",
      sql`(${t.mode} = 'percent' and ${t.rate} is not null) or (${t.mode} = 'fixed' and ${t.amount} is not null)`,
    ),
  ],
);
