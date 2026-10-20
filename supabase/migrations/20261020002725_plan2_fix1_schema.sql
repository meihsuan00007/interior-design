ALTER TABLE "project_files" DROP CONSTRAINT "project_files_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- 加唯一約束前先清掉同公司同名的重複列（保留最早建立者；既有外鍵為 set null，不會失敗）
DELETE FROM "trades" t USING (
  SELECT id, row_number() OVER (PARTITION BY organization_id, name ORDER BY created_at, id) AS rn FROM "trades"
) d WHERE t.id = d.id AND d.rn > 1;--> statement-breakpoint
DELETE FROM "units" u USING (
  SELECT id, row_number() OVER (PARTITION BY organization_id, name ORDER BY created_at, id) AS rn FROM "units"
) d WHERE u.id = d.id AND d.rn > 1;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_organization_id_name_unique" UNIQUE("organization_id","name");--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_name_unique" UNIQUE("organization_id","name");--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_storage_path_check" CHECK (starts_with("project_files"."storage_path", "project_files"."organization_id"::text || '/' || "project_files"."project_id"::text || '/' || "project_files"."kind" || '/')
        and position('..' in "project_files"."storage_path") = 0 and position(chr(92) in "project_files"."storage_path") = 0);--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_mime_type_check" CHECK (("project_files"."mime_type" like 'image/%' or "project_files"."mime_type" in ('application/pdf', 'application/acad', 'image/vnd.dwg', 'application/dxf', 'application/octet-stream'))
        and ("project_files"."kind" <> 'photo' or "project_files"."mime_type" like 'image/%'));