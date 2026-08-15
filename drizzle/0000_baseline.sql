CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"route" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"ip_hash" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_checks_check_key_unique" UNIQUE("check_key")
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "evidence_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"relay_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"storage_provider" text DEFAULT 'database' NOT NULL,
	"storage_key" text,
	"content_base64" text,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"scanned_at" timestamp with time zone,
	"intelligence_score" integer,
	"intelligence_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captured_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"intelligence_reviewed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operational_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"service" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"work_order_id" uuid,
	"satisfaction" integer,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"feedback" text NOT NULL,
	"next_action" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"proof_bundle_id" uuid NOT NULL,
	"relay_id" uuid NOT NULL,
	"gross_cents" integer NOT NULL,
	"protocol_fee_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"status" text DEFAULT 'authorized' NOT NULL,
	"settlement_provider" text DEFAULT 'sandbox' NOT NULL,
	"settlement_ref" text,
	"provider_event_id" text,
	"failure_reason" text,
	"reconciled_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pilot_cohort_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pilot_cohort_relays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"relay_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pilot_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"task_category" text NOT NULL,
	"target_tasks" integer DEFAULT 25 NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"settlement_mode" text DEFAULT 'sandbox' NOT NULL,
	"kickoff_at" timestamp with time zone,
	"launched_at" timestamp with time zone,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pilot_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"requester_alias" text NOT NULL,
	"industry" text NOT NULL,
	"city" text NOT NULL,
	"primary_contact_email" text NOT NULL,
	"task_category" text NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"contract_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_partners_requester_alias_unique" UNIQUE("requester_alias")
);
--> statement-breakpoint
CREATE TABLE "proof_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"relay_id" uuid,
	"evidence_asset_id" uuid,
	"observation" text NOT NULL,
	"evidence_url" text,
	"attestation_hash" text NOT NULL,
	"verification_score" integer NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"reviewer_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"relay_id" uuid NOT NULL,
	"quote_cents" integer NOT NULL,
	"eta_minutes" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"zone" text NOT NULL,
	"specialty" text NOT NULL,
	"coverage_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"availability_status" text DEFAULT 'available' NOT NULL,
	"service_radius_km" integer DEFAULT 25 NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"onboarding_status" text DEFAULT 'approved' NOT NULL,
	"verification_note" text,
	"verified_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"stripe_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relays_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relay_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payout_id" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"payload_hash" text NOT NULL,
	"failure_reason" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title_template" text NOT NULL,
	"location" text NOT NULL,
	"category" text NOT NULL,
	"reward_cents" integer NOT NULL,
	"proof_requirements" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"relay_id" uuid,
	"email_verified_at" timestamp with time zone,
	"mfa_secret" text,
	"mfa_enabled_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"profile" text DEFAULT 'agent-builder' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_signups_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_ref" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"location" text NOT NULL,
	"reward_cents" integer NOT NULL,
	"requester" text NOT NULL,
	"pilot_partner_id" uuid,
	"pilot_cohort_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"proof_requirements" jsonb NOT NULL,
	"selected_relay_id" uuid,
	"dispute_reason" text,
	"execution_due_at" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"sla_status" text DEFAULT 'on_track' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_external_ref_unique" UNIQUE("external_ref")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_checks" ADD CONSTRAINT "deployment_checks_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_assets" ADD CONSTRAINT "evidence_assets_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_assets" ADD CONSTRAINT "evidence_assets_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_assets" ADD CONSTRAINT "evidence_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_checkins" ADD CONSTRAINT "partner_checkins_partner_id_pilot_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."pilot_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_checkins" ADD CONSTRAINT "partner_checkins_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_checkins" ADD CONSTRAINT "partner_checkins_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_proof_bundle_id_proof_bundles_id_fk" FOREIGN KEY ("proof_bundle_id") REFERENCES "public"."proof_bundles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_cohort_partners" ADD CONSTRAINT "pilot_cohort_partners_cohort_id_pilot_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."pilot_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_cohort_partners" ADD CONSTRAINT "pilot_cohort_partners_partner_id_pilot_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."pilot_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_cohort_relays" ADD CONSTRAINT "pilot_cohort_relays_cohort_id_pilot_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."pilot_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_cohort_relays" ADD CONSTRAINT "pilot_cohort_relays_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_cohorts" ADD CONSTRAINT "pilot_cohorts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_bundles" ADD CONSTRAINT "proof_bundles_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_bundles" ADD CONSTRAINT "proof_bundles_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_bundles" ADD CONSTRAINT "proof_bundles_evidence_asset_id_evidence_assets_id_fk" FOREIGN KEY ("evidence_asset_id") REFERENCES "public"."evidence_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_bids" ADD CONSTRAINT "relay_bids_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_bids" ADD CONSTRAINT "relay_bids_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_cohort_id_pilot_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."pilot_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_partner_id_pilot_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."pilot_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_pilot_partner_id_pilot_partners_id_fk" FOREIGN KEY ("pilot_partner_id") REFERENCES "public"."pilot_partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_pilot_cohort_id_pilot_cohorts_id_fk" FOREIGN KEY ("pilot_cohort_id") REFERENCES "public"."pilot_cohorts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_selected_relay_id_relays_id_fk" FOREIGN KEY ("selected_relay_id") REFERENCES "public"."relays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_name_expires_at_idx" ON "api_keys" USING btree ("name","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_rate_limits_subject_route_window_unique" ON "api_rate_limits" USING btree ("subject","route","window_start");--> statement-breakpoint
CREATE INDEX "api_rate_limits_window_start_idx" ON "api_rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_at_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "evidence_assets_work_order_id_idx" ON "evidence_assets" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "evidence_assets_relay_id_idx" ON "evidence_assets" USING btree ("relay_id");--> statement-breakpoint
CREATE INDEX "evidence_assets_uploaded_by_user_id_idx" ON "evidence_assets" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "evidence_assets_sha256_idx" ON "evidence_assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "execution_events_work_order_created_at_idx" ON "execution_events" USING btree ("work_order_id","created_at");--> statement-breakpoint
CREATE INDEX "operational_events_created_at_idx" ON "operational_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "operational_events_level_created_at_idx" ON "operational_events" USING btree ("level","created_at");--> statement-breakpoint
CREATE INDEX "partner_checkins_partner_created_at_idx" ON "partner_checkins" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "partner_checkins_owner_user_id_idx" ON "partner_checkins" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "partner_checkins_work_order_id_idx" ON "partner_checkins" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_work_order_unique" ON "payouts" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "payouts_relay_id_idx" ON "payouts" USING btree ("relay_id");--> statement-breakpoint
CREATE INDEX "payouts_proof_bundle_id_idx" ON "payouts" USING btree ("proof_bundle_id");--> statement-breakpoint
CREATE INDEX "payouts_status_created_at_idx" ON "payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payouts_created_at_idx" ON "payouts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pilot_cohort_partners_unique" ON "pilot_cohort_partners" USING btree ("cohort_id","partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pilot_cohort_relays_unique" ON "pilot_cohort_relays" USING btree ("cohort_id","relay_id");--> statement-breakpoint
CREATE INDEX "pilot_cohorts_owner_user_id_idx" ON "pilot_cohorts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "pilot_cohorts_status_idx" ON "pilot_cohorts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pilot_partners_created_at_idx" ON "pilot_partners" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "proof_bundles_work_order_created_at_idx" ON "proof_bundles" USING btree ("work_order_id","created_at");--> statement-breakpoint
CREATE INDEX "proof_bundles_relay_id_idx" ON "proof_bundles" USING btree ("relay_id");--> statement-breakpoint
CREATE INDEX "proof_bundles_evidence_asset_id_idx" ON "proof_bundles" USING btree ("evidence_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relay_bids_work_order_relay_unique" ON "relay_bids" USING btree ("work_order_id","relay_id");--> statement-breakpoint
CREATE INDEX "relay_bids_work_order_status_idx" ON "relay_bids" USING btree ("work_order_id","status");--> statement-breakpoint
CREATE INDEX "relay_bids_work_order_quote_idx" ON "relay_bids" USING btree ("work_order_id","quote_cents");--> statement-breakpoint
CREATE INDEX "relay_bids_relay_id_idx" ON "relay_bids" USING btree ("relay_id");--> statement-breakpoint
CREATE INDEX "relays_active_reputation_idx" ON "relays" USING btree ("active","reputation");--> statement-breakpoint
CREATE INDEX "relays_created_at_idx" ON "relays" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reputation_events_relay_created_at_idx" ON "reputation_events" USING btree ("relay_id","created_at");--> statement-breakpoint
CREATE INDEX "reputation_events_work_order_created_at_idx" ON "reputation_events" USING btree ("work_order_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_payout_id_idx" ON "stripe_webhook_events" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_created_at_idx" ON "stripe_webhook_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "task_templates_cohort_id_idx" ON "task_templates" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "task_templates_created_at_idx" ON "task_templates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_templates_partner_id_idx" ON "task_templates" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "task_templates_created_by_user_id_idx" ON "task_templates" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "users_relay_id_idx" ON "users" USING btree ("relay_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "work_orders_status_created_at_idx" ON "work_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "work_orders_created_at_idx" ON "work_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "work_orders_selected_relay_id_idx" ON "work_orders" USING btree ("selected_relay_id");--> statement-breakpoint
CREATE INDEX "work_orders_pilot_partner_id_idx" ON "work_orders" USING btree ("pilot_partner_id");--> statement-breakpoint
CREATE INDEX "work_orders_pilot_cohort_id_idx" ON "work_orders" USING btree ("pilot_cohort_id");--> statement-breakpoint
CREATE INDEX "work_orders_status_execution_due_at_idx" ON "work_orders" USING btree ("status","execution_due_at");--> statement-breakpoint
CREATE INDEX "work_orders_status_review_due_at_idx" ON "work_orders" USING btree ("status","review_due_at");