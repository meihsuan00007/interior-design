import { expect, test } from "vitest";
import { can, type MemberPerms } from "@/lib/auth/permissions";

const m = (p: Partial<MemberPerms>): MemberPerms => ({
  role: "designer",
  canViewCost: true,
  canViewUnitPrice: true,
  isProjectMember: true,
  ...p,
});

test("監工看不到成本、業主個資、預算", () => {
  for (const a of ["cost:view", "client:view_pii", "price:view_total", "price:view_unit"] as const)
    expect(can(m({ role: "supervisor" }), a)).toBe(false);
  expect(can(m({ role: "supervisor" }), "project:view")).toBe(true);
  expect(can(m({ role: "supervisor" }), "project:edit")).toBe(false);
});

test("設計師未被指派到案場時什麼都看不到", () => {
  expect(can(m({ isProjectMember: false }), "project:view")).toBe(false);
  expect(can(m({ isProjectMember: false }), "price:view_total")).toBe(false);
  expect(can(m({ isProjectMember: false, role: "supervisor" }), "project:view")).toBe(false);
});

test("「看單價」與「只看總價」可個別設定", () => {
  expect(can(m({ canViewUnitPrice: false }), "price:view_unit")).toBe(false);
  expect(can(m({ canViewUnitPrice: false }), "price:view_total")).toBe(true);
});

test("設計師看成本需 canViewCost", () => {
  expect(can(m({ canViewCost: false }), "cost:view")).toBe(false);
  expect(can(m({}), "cost:view")).toBe(true);
});

test("只有 admin 能管理規則、使用者、保存年限", () => {
  expect(can(m({}), "rules:manage")).toBe(false);
  expect(can(m({}), "retention:manage")).toBe(false);
  expect(can(m({ role: "admin", isProjectMember: false }), "users:manage")).toBe(true);
  expect(can(m({ role: "admin", isProjectMember: false }), "cost:view")).toBe(true);
});
