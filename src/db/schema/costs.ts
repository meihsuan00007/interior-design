import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uniqueIndex, unique, uuid } from "drizzle-orm/pg-core";
import { decimal14x2, id, money, ratio, timestamps } from "./columns";
import { trades, vendors } from "./master";
import { projects } from "./projects";
import { quoteItems } from "./quotes";
import { organizations } from "./tenancy";

// 成本資料（CLAUDE.md D2）：同一成本項目可有多筆報價、至多一筆結算。
// 只有 app.can_view_cost(project_id) 的使用者讀得到。

const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const projectId = () =>
  uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

export const COST_SOURCES = ["quote", "settlement"] as const;

/** 廠商文件（一張師傅報價單或結算單） */
export const vendorDocuments = pgTable(
  "vendor_documents",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
    kind: text("kind", { enum: COST_SOURCES }).notNull(),
    documentDate: date("document_date"),
    /** 整筆結算金額（逐列未輸入時，依最新報價按比例分攤） */
    totalAmount: money("total_amount"),
    /** 原始檔案（project_files 於後續計畫建立，暫不加外鍵） */
    fileId: uuid("file_id"),
    note: text("note"),
    ...timestamps(),
  },
  (t) => [
    index("vendor_documents_project_id_idx").on(t.projectId),
    check("vendor_documents_kind_check", sql`${t.kind} in ('quote', 'settlement')`),
  ],
);

/** 成本項目（例：拆除 6.5 坪） */
export const costItems = pgTable(
  "cost_items",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    unitName: text("unit_name"),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("cost_items_project_id_idx").on(t.projectId)],
);

/** 成本價格：source = quote（可多筆）或 settlement（至多一筆） */
export const costPrices = pgTable(
  "cost_prices",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    costItemId: uuid("cost_item_id")
      .notNull()
      .references(() => costItems.id, { onDelete: "cascade" }),
    source: text("source", { enum: COST_SOURCES }).notNull(),
    quantity: decimal14x2("quantity"),
    unitPrice: decimal14x2("unit_price"),
    amount: money("amount").notNull(),
    pricedOn: date("priced_on").notNull(),
    vendorDocumentId: uuid("vendor_document_id").references(() => vendorDocuments.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    index("cost_prices_cost_item_id_idx").on(t.costItemId),
    index("cost_prices_project_id_idx").on(t.projectId),
    uniqueIndex("cost_prices_one_settlement_idx")
      .on(t.costItemId)
      .where(sql`${t.source} = 'settlement'`),
    check("cost_prices_source_check", sql`${t.source} in ('quote', 'settlement')`),
  ],
);

export const COST_ADJUSTMENT_ALLOCATIONS = ["proportional", "none"] as const;

/** 文件層級的調整（優惠、補整數、預先追加） */
export const costAdjustments = pgTable(
  "cost_adjustments",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    vendorDocumentId: uuid("vendor_document_id")
      .notNull()
      .references(() => vendorDocuments.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amount: money("amount").notNull(),
    allocation: text("allocation", { enum: COST_ADJUSTMENT_ALLOCATIONS }).notNull().default("none"),
    ...timestamps(),
  },
  (t) => [
    index("cost_adjustments_vendor_document_id_idx").on(t.vendorDocumentId),
    check("cost_adjustments_allocation_check", sql`${t.allocation} in ('proportional', 'none')`),
  ],
);

/** 報價項目與成本項目的對應（一對一、多對一、一對多） */
export const quoteItemCostLinks = pgTable(
  "quote_item_cost_links",
  {
    id: id(),
    organizationId: orgId(),
    projectId: projectId(),
    quoteItemId: uuid("quote_item_id")
      .notNull()
      .references(() => quoteItems.id, { onDelete: "cascade" }),
    costItemId: uuid("cost_item_id")
      .notNull()
      .references(() => costItems.id, { onDelete: "cascade" }),
    allocationRatio: ratio("allocation_ratio").notNull().default("1.000000"),
    ...timestamps(),
  },
  (t) => [
    unique("quote_item_cost_links_quote_item_id_cost_item_id_key").on(t.quoteItemId, t.costItemId),
    index("quote_item_cost_links_cost_item_id_idx").on(t.costItemId),
    check(
      "quote_item_cost_links_allocation_ratio_check",
      sql`${t.allocationRatio} > 0 and ${t.allocationRatio} <= 1`,
    ),
  ],
);
