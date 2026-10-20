CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"email_bidx" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_email_bidx_attempted_at_idx" ON "login_attempts" USING btree ("email_bidx","attempted_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_hash_attempted_at_idx" ON "login_attempts" USING btree ("ip_hash","attempted_at");--> statement-breakpoint
-- 僅限伺服器端存取：啟用 RLS 且不建立任何 policy，並收回前端角色權限
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "login_attempts" FROM anon, authenticated;
