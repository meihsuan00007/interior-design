import { integer, pgView, text, uuid } from "drizzle-orm/pg-core";
import { decimal14x2 } from "./schema/columns";

// 檢視（view）放在 schema 資料夾之外：drizzle-kit 會重複讀到 index.ts 的轉出而誤判名稱重複。
// 這些 view 由手寫的 RLS 遷移建立，drizzle-kit 不產生（.existing()）。

/**
 * 施工範圍檢視（監工用）：不含任何單價或金額欄位。
 * 由 RLS 遷移以 security_barrier 建立，view 內以 app.is_project_member(project_id) 過濾。
 */
export const quoteItemsScope = pgView("quote_items_scope", {
  id: uuid("id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  projectId: uuid("project_id").notNull(),
  versionId: uuid("version_id").notNull(),
  sectionId: uuid("section_id").notNull(),
  parentId: uuid("parent_id"),
  sort: integer("sort").notNull(),
  itemNoLabel: text("item_no_label"),
  name: text("name").notNull(),
  unitName: text("unit_name"),
  spec: text("spec"),
  quantity: decimal14x2("quantity"),
  note: text("note"),
}).existing();
