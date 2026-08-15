ALTER TABLE "payouts" ADD COLUMN "release_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "release_attempt_id" uuid;