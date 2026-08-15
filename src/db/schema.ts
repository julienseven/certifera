import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/*
 * Indexing note. Postgres creates an index for a PRIMARY KEY and for UNIQUE,
 * but *not* for a foreign key — the referencing side is unindexed unless it is
 * declared here. Every `where(eq(table.someFkId, …))` below was a sequential
 * scan, which is invisible at seed-data volume and becomes the dominant cost
 * once a table has real rows. The append-only tables (execution_events,
 * audit_logs, operational_events) are the ones that grow without bound, so
 * they are indexed on their lookup key together with the column actually used
 * to order the result.
 */

export const waitlistSignups = pgTable("waitlist_signups", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  profile: text("profile").notNull().default("agent-builder"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const relays = pgTable(
  "relays",
  {
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
  },
  // Dispatch preflight ranks active relays by reputation.
  (table) => [
    index("relays_active_reputation_idx").on(table.active, table.reputation),
    // The admin roster pages newest-first; without this the bounded top-N still
    // scans the table to sort it.
    index("relays_created_at_idx").on(table.createdAt),
  ],
);

export const users = pgTable(
  "users",
  {
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
  },
  (table) => [index("users_relay_id_idx").on(table.relayId), index("users_role_idx").on(table.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    // The hourly maintenance sweep deletes on this predicate.
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
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
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    // Demo-key reaping filters on (name, expires_at).
    index("api_keys_name_expires_at_idx").on(table.name, table.expiresAt),
  ],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("email_verification_tokens_user_id_idx").on(table.userId), index("email_verification_tokens_expires_at_idx").on(table.expiresAt)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("password_reset_tokens_user_id_idx").on(table.userId), index("password_reset_tokens_expires_at_idx").on(table.expiresAt)],
);

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
  (table) => [
    uniqueIndex("api_rate_limits_subject_route_window_unique").on(table.subject, table.route, table.windowStart),
    // Sweep predicate. Without this the hourly delete scans a table that takes
    // one row per subject per route per window — the fastest-growing table here.
    index("api_rate_limits_window_start_idx").on(table.windowStart),
  ],
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

export const pilotPartners = pgTable(
  "pilot_partners",
  {
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
  },
  (table) => [index("pilot_partners_created_at_idx").on(table.createdAt)],
);

export const pilotCohorts = pgTable(
  "pilot_cohorts",
  {
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
  },
  (table) => [index("pilot_cohorts_owner_user_id_idx").on(table.ownerUserId), index("pilot_cohorts_status_idx").on(table.status)],
);

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

export const workOrders = pgTable(
  "work_orders",
  {
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
  },
  (table) => [
    // The market list: filter on status, newest first.
    index("work_orders_status_created_at_idx").on(table.status, table.createdAt),
    // The unfiltered feed orders by created_at with no status predicate, which
    // the composite above cannot serve because it leads on status.
    index("work_orders_created_at_idx").on(table.createdAt),
    index("work_orders_selected_relay_id_idx").on(table.selectedRelayId),
    index("work_orders_pilot_partner_id_idx").on(table.pilotPartnerId),
    index("work_orders_pilot_cohort_id_idx").on(table.pilotCohortId),
    // The two SLA sweep predicates, each (status, deadline).
    index("work_orders_status_execution_due_at_idx").on(table.status, table.executionDueAt),
    index("work_orders_status_review_due_at_idx").on(table.status, table.reviewDueAt),
  ],
);

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
  (table) => [
    uniqueIndex("relay_bids_work_order_relay_unique").on(table.workOrderId, table.relayId),
    // Selecting the winning quote filters (work_order_id, status). The unique
    // index above leads on work_order_id so it can serve a prefix scan, but not
    // the status predicate — this one does both.
    index("relay_bids_work_order_status_idx").on(table.workOrderId, table.status),
    // Quotes are listed cheapest-first per outcome.
    index("relay_bids_work_order_quote_idx").on(table.workOrderId, table.quoteCents),
    index("relay_bids_relay_id_idx").on(table.relayId),
  ],
);

export const partnerCheckins = pgTable(
  "partner_checkins",
  {
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
  },
  (table) => [
    index("partner_checkins_partner_created_at_idx").on(table.partnerId, table.createdAt),
    index("partner_checkins_owner_user_id_idx").on(table.ownerUserId),
    index("partner_checkins_work_order_id_idx").on(table.workOrderId),
  ],
);

export const taskTemplates = pgTable(
  "task_templates",
  {
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
  },
  (table) => [
    index("task_templates_cohort_id_idx").on(table.cohortId),
    index("task_templates_created_at_idx").on(table.createdAt),
    index("task_templates_partner_id_idx").on(table.partnerId),
    index("task_templates_created_by_user_id_idx").on(table.createdByUserId),
  ],
);

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
},
  (table) => [
    index("evidence_assets_work_order_id_idx").on(table.workOrderId),
    index("evidence_assets_relay_id_idx").on(table.relayId),
    index("evidence_assets_uploaded_by_user_id_idx").on(table.uploadedByUserId),
    index("evidence_assets_sha256_idx").on(table.sha256),
  ],
);

export const proofBundles = pgTable(
  "proof_bundles",
  {
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
  },
  (table) => [
    // The review path reads the newest bundle for one outcome on every decision.
    index("proof_bundles_work_order_created_at_idx").on(table.workOrderId, table.createdAt),
    index("proof_bundles_relay_id_idx").on(table.relayId),
    index("proof_bundles_evidence_asset_id_idx").on(table.evidenceAssetId),
  ],
);

export const executionEvents = pgTable(
  "execution_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Append-only and unbounded: this table gets a row on every state transition
  // and is read back in full by the activity endpoint.
  (table) => [index("execution_events_work_order_created_at_idx").on(table.workOrderId, table.createdAt)],
);

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
    /**
     * authorized -> releasing -> released | failed.
     *
     * "releasing" is the durable record that a transfer is about to be
     * attempted at the provider. It is committed before the provider call so a
     * crash mid-transfer is recoverable: the row names an in-flight attempt
     * rather than reverting to a state a second caller would happily re-release.
     */
    status: text("status").notNull().default("authorized"),
    /** Set when the row is claimed for release; bounds how long a "releasing" row may sit before the reconciler adopts it. */
    releaseClaimedAt: timestamp("release_claimed_at", { withTimezone: true }),
    /** Sent to the provider as the idempotency key, so a retry of a claim cannot produce a second transfer. */
    releaseAttemptId: uuid("release_attempt_id"),
    settlementProvider: text("settlement_provider").notNull().default("sandbox"),
    settlementRef: text("settlement_ref"),
    providerEventId: text("provider_event_id"),
    failureReason: text("failure_reason"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payouts_work_order_unique").on(table.workOrderId),
    index("payouts_relay_id_idx").on(table.relayId),
    index("payouts_proof_bundle_id_idx").on(table.proofBundleId),
    // Reconciliation sweeps read unreleased payouts oldest-first.
    index("payouts_status_created_at_idx").on(table.status, table.createdAt),
    // The finance export orders by created_at across all statuses, which the
    // status-leading composite above cannot serve.
    index("payouts_created_at_idx").on(table.createdAt),
  ],
);

export const reputationEvents = pgTable(
  "reputation_events",
  {
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
  },
  (table) => [
    index("reputation_events_relay_created_at_idx").on(table.relayId, table.createdAt),
    // Carries created_at so the per-outcome read is an index scan rather than a
    // bitmap scan followed by a sort. Supersedes the work_order_id-only index,
    // which this one serves as a prefix.
    index("reputation_events_work_order_created_at_idx").on(table.workOrderId, table.createdAt),
  ],
);

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    type: text("type").notNull(),
    payoutId: uuid("payout_id").references(() => payouts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("received"),
    payloadHash: text("payload_hash").notNull(),
    failureReason: text("failure_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("stripe_webhook_events_payout_id_idx").on(table.payoutId), index("stripe_webhook_events_status_created_at_idx").on(table.status, table.createdAt)],
);

export const operationalEvents = pgTable(
  "operational_events",
  {
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
  },
  // Append-only. The incident view reads newest-first, filtered by level.
  (table) => [index("operational_events_created_at_idx").on(table.createdAt), index("operational_events_level_created_at_idx").on(table.level, table.createdAt)],
);

export const maintenanceRuns = pgTable("maintenance_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull().default("running"),
  result: jsonb("result").$type<Record<string, number | string | boolean>>().notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    ipHash: text("ip_hash"),
    data: jsonb("data").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Append-only. Audit review is "what did this actor do", newest-first, and
  // "who touched this resource".
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_actor_created_at_idx").on(table.actorId, table.createdAt),
    index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  ],
);
