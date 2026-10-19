import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { id, MEMBER_ROLES, ratio, TAX_MODES, timestamps } from "./columns";
import { projects } from "./projects";

/** 信心等級門檻：樣本案場數 ≤ low_max 為低信心、≤ medium_max 為中信心、其餘高信心 */
export interface ConfidenceThresholds {
  low_max: number;
  medium_max: number;
}

export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    defaultMgmtFeeRate: ratio("default_mgmt_fee_rate").notNull().default("0.100000"),
    defaultTaxMode: text("default_tax_mode", { enum: TAX_MODES }).notNull().default("exclusive"),
    retentionYears: integer("retention_years"),
    confidenceThresholds: jsonb("confidence_thresholds")
      .$type<ConfidenceThresholds>()
      .notNull()
      .default({ low_max: 2, medium_max: 9 }),
    ...timestamps(),
  },
  (t) => [
    check("organizations_default_tax_mode_check", sql`${t.defaultTaxMode} in ('exclusive', 'inclusive')`),
    check("organizations_default_mgmt_fee_rate_check", sql`${t.defaultMgmtFeeRate} >= 0`),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role", { enum: MEMBER_ROLES }).notNull(),
    canViewUnitPrice: boolean("can_view_unit_price").notNull().default(false),
    canViewCost: boolean("can_view_cost").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    unique("memberships_organization_id_user_id_key").on(t.organizationId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
    check("memberships_role_check", sql`${t.role} in ('admin', 'designer', 'supervisor')`),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    unique("project_members_project_id_user_id_key").on(t.projectId, t.userId),
    index("project_members_user_id_idx").on(t.userId),
  ],
);

/** 稽核紀錄：metadata 不得含個資；資料庫層禁止 update / delete */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").default(sql`auth.uid()`),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_organization_id_created_at_idx").on(t.organizationId, t.createdAt)],
);
