CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"kind" text NOT NULL,
	"is_deidentified" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid DEFAULT auth.uid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_files_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "project_files_size_bytes_check" CHECK ("project_files"."size_bytes" between 1 and 52428800),
	CONSTRAINT "project_files_kind_check" CHECK ("project_files"."kind" in ('floor_plan', 'photo', 'rendering', 'drawing', 'other'))
);
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_status_check";--> statement-breakpoint
-- 舊狀態 closed 改為 archived（須在換 check 之前）
UPDATE "projects" SET "status" = 'archived' WHERE "status" = 'closed';--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_files_organization_id_idx" ON "project_files" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_files_project_id_idx" ON "project_files" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('lead', 'quoting', 'contracted', 'in_progress', 'completed', 'warranty', 'archived'));