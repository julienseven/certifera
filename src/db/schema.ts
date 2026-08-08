import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const waitlistSignups = pgTable("waitlist_signups", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  profile: text("profile").notNull().default("agent-builder"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const relays = pgTable("relays", {
  id: uuid("id").defaultRandom().primaryKey(),
  handle: text("handle").notNull().unique(),
  zone: text("zone").notNull(),
  specialty: text("specialty").notNull(),
  coverageCategories: jsonb("coverage_categories").$type<string[]>().notNull().default([]),
  availabilityStatus: text("availability_status").notNull().default("available"),
  serviceRadiusKm: integer("service_radius_km").notNull().default(25),
  reputation: integer("reputation").notNull().default(0),
  active: boolean("active").notNull().default(true),
  onboardingStatus: text("onboarding_status").notNull().default("approved"),
  verificationNote: text("verification_note"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  stripeAccountId: text("stripe_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("operator"),
  status: text("status").notNull().default("active"),
  relayId: uuid("relay_id").references(() => relays.id, { onDelete: "set null" }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  mfaSecret: text("mfa_secret"),
  mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subject: text("subject").notNull(),
    route: text("route").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("api_rate_limits_subject_route_window_unique").on(table.subject, table.route, table.windowStart)],
);

export const deploymentChecks = pgTable("deployment_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  checkKey: text("check_key").notNull().unique(),
  status: text("status").notNull().default("pending"),
  note: text("note").notNull().default(""),
  verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pilotPartners = pgTable("pilot_partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  requesterAlias: text("requester_alias").notNull().unique(),
  industry: text("industry").notNull(),
  city: text("city").notNull(),
  primaryContactEmail: text("primary_contact_email").notNull(),
  taskCategory: text("task_category").notNull(),
  status: text("status").notNull().default("prospect"),
  contractStatus: text("contract_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pilotCohorts = pgTable("pilot_cohorts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  taskCategory: text("task_category").notNull(),
  targetTasks: integer("target_tasks").notNull().default(25),
  status: text("status").notNull().default("planning"),
  settlementMode: text("settlement_mode").notNull().default("sandbox"),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }),
  launchedAt: timestamp("launched_at", { withTimezone: true }),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pilotCohortPartners = pgTable(
  "pilot_cohort_partners",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => pilotCohorts.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => pilotPartners.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("pilot_cohort_partners_unique").on(table.cohortId, table.partnerId)],
);

export const pilotCohortRelays = pgTable(
  "pilot_cohort_relays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => pilotCohorts.id, { onDelete: "cascade" }),
    relayId: uuid("relay_id")
      .notNull()
      .references(() => relays.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("pilot_cohort_relays_unique").on(table.cohortId, table.relayId)],
);

export const workOrders = pgTable("work_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalRef: text("external_ref").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  location: text("location").notNull(),
  rewardCents: integer("reward_cents").notNull(),
  requester: text("requester").notNull(),
  pilotPartnerId: uuid("pilot_partner_id").references(() => pilotPartners.id, { onDelete: "set null" }),
  pilotCohortId: uuid("pilot_cohort_id").references(() => pilotCohorts.id, { onDelete: "set null" }),
  status: text("status").notNull().default("open"),
  proofRequirements: jsonb("proof_requirements").$type<string[]>().notNull(),
  selectedRelayId: uuid("selected_relay_id").references(() => relays.id, { onDelete: "set null" }),
  disputeReason: text("dispute_reason"),
  executionDueAt: timestamp("execution_due_at", { withTimezone: true }),
  reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
  slaStatus: text("sla_status").notNull().default("on_track"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const relayBids = pgTable(
  "relay_bids",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    relayId: uuid("relay_id")
      .notNull()
      .references(() => relays.id, { onDelete: "cascade" }),
    quoteCents: integer("quote_cents").notNull(),
    etaMinutes: integer("eta_minutes").notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("relay_bids_work_order_relay_unique").on(table.workOrderId, table.relayId)],
);

export const partnerCheckins = pgTable("partner_checkins", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => pilotPartners.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "set null" }),
  satisfaction: integer("satisfaction"),
  riskLevel: text("risk_level").notNull().default("low"),
  feedback: text("feedback").notNull(),
  nextAction: text("next_action").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taskTemplates = pgTable("task_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  cohortId: uuid("cohort_id")
    .notNull()
    .references(() => pilotCohorts.id, { onDelete: "cascade" }),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => pilotPartners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  titleTemplate: text("title_template").notNull(),
  location: text("location").notNull(),
  category: text("category").notNull(),
  rewardCents: integer("reward_cents").notNull(),
  proofRequirements: jsonb("proof_requirements").$type<string[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const evidenceAssets = pgTable("evidence_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id")
    .notNull()
    .references(() => workOrders.id, { onDelete: "cascade" }),
  relayId: uuid("relay_id")
    .notNull()
    .references(() => relays.id, { onDelete: "cascade" }),
  uploadedByUserId: uuid("uploaded_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  storageProvider: text("storage_provider").notNull().default("database"),
  storageKey: text("storage_key"),
  contentBase64: text("content_base64"),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  scanStatus: text("scan_status").notNull().default("pending"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  intelligenceScore: integer("intelligence_score"),
  intelligenceFlags: jsonb("intelligence_flags").$type<string[]>().notNull().default([]),
  capturedMetadata: jsonb("captured_metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  intelligenceReviewedAt: timestamp("intelligence_reviewed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const proofBundles = pgTable("proof_bundles", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id")
    .notNull()
    .references(() => workOrders.id, { onDelete: "cascade" }),
  relayId: uuid("relay_id").references(() => relays.id, { onDelete: "set null" }),
  evidenceAssetId: uuid("evidence_asset_id").references(() => evidenceAssets.id, { onDelete: "set null" }),
  observation: text("observation").notNull(),
  evidenceUrl: text("evidence_url"),
  attestationHash: text("attestation_hash").notNull(),
  verificationScore: integer("verification_score").notNull(),
  status: text("status").notNull().default("pending_review"),
  reviewerNote: text("reviewer_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const executionEvents = pgTable("execution_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workOrderId: uuid("work_order_id")
    .notNull()
    .references(() => workOrders.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  actor: text("actor").notNull(),
  summary: text("summary").notNull(),
  data: jsonb("data").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    proofBundleId: uuid("proof_bundle_id")
      .notNull()
      .references(() => proofBundles.id, { onDelete: "restrict" }),
    relayId: uuid("relay_id")
      .notNull()
      .references(() => relays.id, { onDelete: "restrict" }),
    grossCents: integer("gross_cents").notNull(),
    protocolFeeCents: integer("protocol_fee_cents").notNull(),
    netCents: integer("net_cents").notNull(),
    status: text("status").notNull().default("authorized"),
    settlementProvider: text("settlement_provider").notNull().default("sandbox"),
    settlementRef: text("settlement_ref"),
    providerEventId: text("provider_event_id"),
    failureReason: text("failure_reason"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("payouts_work_order_unique").on(table.workOrderId)],
);

export const reputationEvents = pgTable("reputation_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  relayId: uuid("relay_id")
    .notNull()
    .references(() => relays.id, { onDelete: "cascade" }),
  workOrderId: uuid("work_order_id")
    .notNull()
    .references(() => workOrders.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  type: text("type").notNull(),
  payoutId: uuid("payout_id").references(() => payouts.id, { onDelete: "set null" }),
  status: text("status").notNull().default("received"),
  payloadHash: text("payload_hash").notNull(),
  failureReason: text("failure_reason"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const operationalEvents = pgTable("operational_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  level: text("level").notNull(),
  service: text("service").notNull(),
  code: text("code").notNull(),
  message: text("message").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  data: jsonb("data").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const maintenanceRuns = pgTable("maintenance_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull().default("running"),
  result: jsonb("result").$type<Record<string, number | string | boolean>>().notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  ipHash: text("ip_hash"),
  data: jsonb("data").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
