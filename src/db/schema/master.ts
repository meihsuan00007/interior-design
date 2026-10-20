import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { organizations } from "./tenancy";

const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

/** 工種 */
export const trades = pgTable(
  "trades",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    defaultIncludeInMgmtFee: boolean("default_include_in_mgmt_fee").notNull().default(true),
    /** 代購工種：預設不計入管銷 */
    isProxyPurchase: boolean("is_proxy_purchase").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("trades_organization_id_idx").on(t.organizationId),
    unique("trades_organization_id_name_unique").on(t.organizationId, t.name),
  ],
);

/** 單位（式、坪、尺、才、組…） */
export const units = pgTable(
  "units",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("units_organization_id_idx").on(t.organizationId),
    unique("units_organization_id_name_unique").on(t.organizationId, t.name),
  ],
);

/** 廠商；phone 為加密欄位（encryptField 輸出） */
export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    tradeIds: uuid("trade_ids").array().notNull().default(sql`'{}'::uuid[]`),
    contactName: text("contact_name"),
    phoneEnc: text("phone_enc"),
    taxId: text("tax_id"),
    note: text("note"),
    ...timestamps(),
  },
  (t) => [index("vendors_organization_id_idx").on(t.organizationId)],
);

export const PRICING_METHODS = ["unit_x_qty", "per_ping", "lump_sum", "package", "percent"] as const;

/** 品項主檔：報價時帶入快照，主檔日後變動不影響既有報價 */
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: id(),
    organizationId: orgId(),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    spec: text("spec"),
    defaultVendorId: uuid("default_vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    pricingMethod: text("pricing_method", { enum: PRICING_METHODS }).notNull().default("unit_x_qty"),
    note: text("note"),
    ...timestamps(),
  },
  (t) => [
    index("catalog_items_organization_id_idx").on(t.organizationId),
    check(
      "catalog_items_pricing_method_check",
      sql`${t.pricingMethod} in ('unit_x_qty', 'per_ping', 'lump_sum', 'package', 'percent')`,
    ),
  ],
);
