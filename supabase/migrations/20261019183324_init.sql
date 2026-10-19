CREATE TABLE "cost_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"vendor_document_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 0) NOT NULL,
	"allocation" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "cost_adjustments_allocation_check" CHECK ("cost_adjustments"."allocation" in ('proportional', 'none'))
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"vendor_id" uuid,
	"trade_id" uuid,
	"name" text NOT NULL,
	"unit_name" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "cost_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"cost_item_id" uuid NOT NULL,
	"source" text NOT NULL,
	"quantity" numeric(14, 2),
	"unit_price" numeric(14, 2),
	"amount" numeric(14, 0) NOT NULL,
	"priced_on" date NOT NULL,
	"vendor_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "cost_prices_source_check" CHECK ("cost_prices"."source" in ('quote', 'settlement'))
);
--> statement-breakpoint
CREATE TABLE "quote_item_cost_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"quote_item_id" uuid NOT NULL,
	"cost_item_id" uuid NOT NULL,
	"allocation_ratio" numeric(7, 6) DEFAULT '1.000000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "quote_item_cost_links_quote_item_id_cost_item_id_key" UNIQUE("quote_item_id","cost_item_id"),
	CONSTRAINT "quote_item_cost_links_allocation_ratio_check" CHECK ("quote_item_cost_links"."allocation_ratio" > 0 and "quote_item_cost_links"."allocation_ratio" <= 1)
);
--> statement-breakpoint
CREATE TABLE "vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"vendor_id" uuid,
	"trade_id" uuid,
	"kind" text NOT NULL,
	"document_date" date,
	"total_amount" numeric(14, 0),
	"file_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "vendor_documents_kind_check" CHECK ("vendor_documents"."kind" in ('quote', 'settlement'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid DEFAULT auth.uid(),
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"can_view_unit_price" boolean DEFAULT false NOT NULL,
	"can_view_cost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "memberships_organization_id_user_id_key" UNIQUE("organization_id","user_id"),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" in ('admin', 'designer', 'supervisor'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_mgmt_fee_rate" numeric(7, 6) DEFAULT '0.100000' NOT NULL,
	"default_tax_mode" text DEFAULT 'exclusive' NOT NULL,
	"retention_years" integer,
	"confidence_thresholds" jsonb DEFAULT '{"low_max":2,"medium_max":9}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "organizations_default_tax_mode_check" CHECK ("organizations"."default_tax_mode" in ('exclusive', 'inclusive')),
	CONSTRAINT "organizations_default_mgmt_fee_rate_check" CHECK ("organizations"."default_mgmt_fee_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "project_members_project_id_user_id_key" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"trade_id" uuid,
	"name" text NOT NULL,
	"unit_id" uuid,
	"spec" text,
	"default_vendor_id" uuid,
	"pricing_method" text DEFAULT 'unit_x_qty' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "catalog_items_pricing_method_check" CHECK ("catalog_items"."pricing_method" in ('unit_x_qty', 'per_ping', 'lump_sum', 'package', 'percent'))
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"default_include_in_mgmt_fee" boolean DEFAULT true NOT NULL,
	"is_proxy_purchase" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trade_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"contact_name" text,
	"phone_enc" text,
	"tax_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name_enc" text NOT NULL,
	"phone_enc" text,
	"email_enc" text,
	"national_id_enc" text,
	"name_bidx" text,
	"phone_bidx" text,
	"email_bidx" text,
	"national_id_bidx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid,
	"district" text,
	"address_full_enc" text,
	"ping" numeric(10, 2),
	"condition" text,
	"floor" text,
	"has_elevator" boolean,
	"hoa_rules" text,
	"status" text DEFAULT 'lead' NOT NULL,
	"mgmt_fee_rate" numeric(7, 6),
	"tax_mode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "projects_condition_check" CHECK ("projects"."condition" in ('new', 'resale', 'old')),
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('lead', 'quoting', 'contracted', 'in_progress', 'completed', 'closed')),
	CONSTRAINT "projects_tax_mode_check" CHECK ("projects"."tax_mode" in ('exclusive', 'inclusive')),
	CONSTRAINT "projects_mgmt_fee_rate_check" CHECK ("projects"."mgmt_fee_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"label" text,
	"rate" numeric(7, 6),
	"amount" numeric(14, 0),
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "quote_fees_kind_check" CHECK ("quote_fees"."kind" in ('mgmt', 'design', 'warranty', 'discount', 'other')),
	CONSTRAINT "quote_fees_mode_check" CHECK ("quote_fees"."mode" in ('percent', 'fixed')),
	CONSTRAINT "quote_fees_value_check" CHECK (("quote_fees"."mode" = 'percent' and "quote_fees"."rate" is not null) or ("quote_fees"."mode" = 'fixed' and "quote_fees"."amount" is not null))
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"parent_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"item_no_label" text,
	"catalog_item_id" uuid,
	"name" text NOT NULL,
	"unit_name" text,
	"spec" text,
	"note" text,
	"quantity" numeric(14, 2),
	"client_unit_price" numeric(14, 2),
	"client_price_mode" text DEFAULT 'manual' NOT NULL,
	"markup_rate_used" numeric(10, 6),
	"is_optional" boolean DEFAULT false NOT NULL,
	"is_complimentary" boolean DEFAULT false NOT NULL,
	"is_owner_supplied" boolean DEFAULT false NOT NULL,
	"is_actual_cost" boolean DEFAULT false NOT NULL,
	"ref_price_min" numeric(14, 0),
	"ref_price_max" numeric(14, 0),
	"is_paid_directly_by_owner" boolean DEFAULT false NOT NULL,
	"include_in_mgmt_fee" boolean DEFAULT true NOT NULL,
	"include_in_mgmt_fee_source" text DEFAULT 'default' NOT NULL,
	"legacy_red_font" boolean,
	"source_import_row_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "quote_items_client_price_mode_check" CHECK ("quote_items"."client_price_mode" in ('auto', 'manual')),
	CONSTRAINT "quote_items_include_in_mgmt_fee_source_check" CHECK ("quote_items"."include_in_mgmt_fee_source" in ('default', 'owner_direct', 'manual')),
	CONSTRAINT "quote_items_owner_direct_excluded_check" CHECK (not ("quote_items"."is_paid_directly_by_owner" and "quote_items"."include_in_mgmt_fee"))
);
--> statement-breakpoint
CREATE TABLE "quote_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"trade_id" uuid,
	"title" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"footnote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
CREATE TABLE "quote_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"content_hash" text,
	"mgmt_fee_rate_snapshot" numeric(7, 6),
	"tax_mode" text DEFAULT 'exclusive' NOT NULL,
	"included_subtotal" numeric(14, 0),
	"proxy_subtotal" numeric(14, 0),
	"mgmt_fee_amount" numeric(14, 0),
	"other_fees_amount" numeric(14, 0),
	"discount_amount" numeric(14, 0),
	"net_total" numeric(14, 0),
	"tax_amount" numeric(14, 0),
	"grand_total" numeric(14, 0),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid(),
	CONSTRAINT "quote_versions_quote_id_version_no_key" UNIQUE("quote_id","version_no"),
	CONSTRAINT "quote_versions_status_check" CHECK ("quote_versions"."status" in ('draft', 'issued', 'signed')),
	CONSTRAINT "quote_versions_tax_mode_check" CHECK ("quote_versions"."tax_mode" in ('exclusive', 'inclusive'))
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid DEFAULT auth.uid()
);
--> statement-breakpoint
ALTER TABLE "cost_adjustments" ADD CONSTRAINT "cost_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_adjustments" ADD CONSTRAINT "cost_adjustments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_adjustments" ADD CONSTRAINT "cost_adjustments_vendor_document_id_vendor_documents_id_fk" FOREIGN KEY ("vendor_document_id") REFERENCES "public"."vendor_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_prices" ADD CONSTRAINT "cost_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_prices" ADD CONSTRAINT "cost_prices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_prices" ADD CONSTRAINT "cost_prices_cost_item_id_cost_items_id_fk" FOREIGN KEY ("cost_item_id") REFERENCES "public"."cost_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_prices" ADD CONSTRAINT "cost_prices_vendor_document_id_vendor_documents_id_fk" FOREIGN KEY ("vendor_document_id") REFERENCES "public"."vendor_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_item_cost_links" ADD CONSTRAINT "quote_item_cost_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_item_cost_links" ADD CONSTRAINT "quote_item_cost_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_item_cost_links" ADD CONSTRAINT "quote_item_cost_links_quote_item_id_quote_items_id_fk" FOREIGN KEY ("quote_item_id") REFERENCES "public"."quote_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_item_cost_links" ADD CONSTRAINT "quote_item_cost_links_cost_item_id_cost_items_id_fk" FOREIGN KEY ("cost_item_id") REFERENCES "public"."cost_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_default_vendor_id_vendors_id_fk" FOREIGN KEY ("default_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_fees" ADD CONSTRAINT "quote_fees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_fees" ADD CONSTRAINT "quote_fees_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_fees" ADD CONSTRAINT "quote_fees_version_id_quote_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_version_id_quote_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_section_id_quote_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."quote_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_parent_id_quote_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."quote_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_sections" ADD CONSTRAINT "quote_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_sections" ADD CONSTRAINT "quote_sections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_sections" ADD CONSTRAINT "quote_sections_version_id_quote_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_sections" ADD CONSTRAINT "quote_sections_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_adjustments_vendor_document_id_idx" ON "cost_adjustments" USING btree ("vendor_document_id");--> statement-breakpoint
CREATE INDEX "cost_items_project_id_idx" ON "cost_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cost_prices_cost_item_id_idx" ON "cost_prices" USING btree ("cost_item_id");--> statement-breakpoint
CREATE INDEX "cost_prices_project_id_idx" ON "cost_prices" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_prices_one_settlement_idx" ON "cost_prices" USING btree ("cost_item_id") WHERE "cost_prices"."source" = 'settlement';--> statement-breakpoint
CREATE INDEX "quote_item_cost_links_cost_item_id_idx" ON "quote_item_cost_links" USING btree ("cost_item_id");--> statement-breakpoint
CREATE INDEX "vendor_documents_project_id_idx" ON "vendor_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_members_user_id_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "catalog_items_organization_id_idx" ON "catalog_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "trades_organization_id_idx" ON "trades" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "units_organization_id_idx" ON "units" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "vendors_organization_id_idx" ON "vendors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "clients_organization_id_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "clients_name_bidx_idx" ON "clients" USING btree ("organization_id","name_bidx");--> statement-breakpoint
CREATE INDEX "clients_phone_bidx_idx" ON "clients" USING btree ("organization_id","phone_bidx");--> statement-breakpoint
CREATE INDEX "clients_email_bidx_idx" ON "clients" USING btree ("organization_id","email_bidx");--> statement-breakpoint
CREATE INDEX "clients_national_id_bidx_idx" ON "clients" USING btree ("organization_id","national_id_bidx");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_client_id_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "quote_fees_version_id_idx" ON "quote_fees" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "quote_items_version_id_idx" ON "quote_items" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "quote_items_section_id_idx" ON "quote_items" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "quote_items_parent_id_idx" ON "quote_items" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "quote_items_project_id_idx" ON "quote_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quote_sections_version_id_idx" ON "quote_sections" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "quote_sections_project_id_idx" ON "quote_sections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quote_versions_project_id_idx" ON "quote_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quotes_project_id_idx" ON "quotes" USING btree ("project_id");