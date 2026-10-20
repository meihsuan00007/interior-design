CREATE TABLE "quote_item_pricing_meta" (
	"quote_item_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"markup_rate_used" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
ALTER TABLE "quote_item_pricing_meta" ADD CONSTRAINT "quote_item_pricing_meta_quote_item_id_quote_items_id_fk" FOREIGN KEY ("quote_item_id") REFERENCES "public"."quote_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_item_pricing_meta" ADD CONSTRAINT "quote_item_pricing_meta_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_item_pricing_meta" ADD CONSTRAINT "quote_item_pricing_meta_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- 手動加入：刪除欄位前先搬移既有加成率（drizzle-kit 產生的遷移不會搬資料）
INSERT INTO "quote_item_pricing_meta" ("quote_item_id", "organization_id", "project_id", "markup_rate_used", "created_by")
SELECT "id", "organization_id", "project_id", "markup_rate_used", "created_by"
FROM "quote_items" WHERE "markup_rate_used" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" DROP COLUMN "markup_rate_used";