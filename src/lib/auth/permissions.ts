// 畫面顯示用的同步權限判斷。真正的存取控制由 Postgres RLS 執行，兩者規則必須一致。

export type Role = "admin" | "designer" | "supervisor";

export type Action =
  | "project:view"
  | "project:edit"
  | "client:view_pii"
  | "cost:view"
  | "price:view_unit"
  | "price:view_total"
  | "rules:manage"
  | "users:manage"
  | "retention:manage";

export interface MemberPerms {
  role: Role;
  canViewCost: boolean;
  canViewUnitPrice: boolean;
  /** 是否為該案場的指派成員 */
  isProjectMember: boolean;
}

export function can(m: MemberPerms, action: Action): boolean {
  if (m.role === "admin") return true;

  switch (action) {
    case "project:view":
      return m.isProjectMember;
    case "project:edit":
    case "client:view_pii":
    case "price:view_total":
      return m.role === "designer" && m.isProjectMember;
    case "cost:view":
      return m.role === "designer" && m.isProjectMember && m.canViewCost;
    case "price:view_unit":
      return m.role === "designer" && m.isProjectMember && m.canViewUnitPrice;
    case "rules:manage":
    case "users:manage":
    case "retention:manage":
      return false;
  }
}
