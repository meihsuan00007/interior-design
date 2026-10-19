-- 工程管理費由系統計算，不可手填：先刪除既有 mgmt 列再收緊 check
DELETE FROM "quote_fees" WHERE "kind" = 'mgmt';--> statement-breakpoint
ALTER TABLE "quote_fees" DROP CONSTRAINT "quote_fees_kind_check";--> statement-breakpoint
ALTER TABLE "quote_fees" ADD CONSTRAINT "quote_fees_kind_check" CHECK ("quote_fees"."kind" in ('design', 'warranty', 'discount', 'other'));