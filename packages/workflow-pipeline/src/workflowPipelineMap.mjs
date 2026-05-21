import { inspectAdminAuthEnv } from "../../admin-auth/src/adminAuthGate.mjs";
import { inspectLineChannelEnv } from "../../channel-gate/src/lineChannelGate.mjs";
import { inspectDbEnv } from "../../lead-core/src/dbEnvGate.mjs";
import { buildMigrationReadinessReport } from "../../migration-readiness/src/migrationReadinessGate.mjs";
import { inspectWebhookSecurityEnv } from "../../webhook-security/src/webhookSecurityGate.mjs";

export const PIPELINE_STAGES = [
  {
    id: "website-calculator",
    order: 10,
    name: "Website Solar Calculator",
    component: "apps/www + apps/webhook-gateway",
    type: "public-ui",
    routes: ["GET /solar-calculator", "POST /api/solar-estimate"],
    scripts: ["npm run sprint2:gate"],
    guards: ["consent_before_pii", "opal_static_pricing_only"],
    status: "local-implemented"
  },
  {
    id: "mock-webhook-gateway",
    order: 20,
    name: "Mock Webhook Gateway",
    component: "apps/webhook-gateway",
    type: "inbound-gateway",
    routes: ["POST /webhooks/mock", "GET /health"],
    scripts: ["npm run sprint1:gate"],
    guards: ["schema_validation", "idempotency", "no_external_write"],
    status: "local-implemented"
  },
  {
    id: "queue-dlq",
    order: 30,
    name: "Queue Retry And DLQ",
    component: "workers/queue-consumer",
    type: "reliability-layer",
    routes: ["POST /dlq/replay/:deadLetterId"],
    scripts: ["npm run sprint1:gate"],
    guards: ["max_retries_3", "dlq_after_retry_exhaustion", "replay_audit_required"],
    status: "local-implemented"
  },
  {
    id: "opal-static-core",
    order: 40,
    name: "OPAL Static Pricing Core",
    component: "packages/opal-pricing-config",
    type: "pricing-source-of-truth",
    routes: [],
    scripts: ["npm run sprint1:gate"],
    guards: ["ai_may_not_create_new_price", "ai_may_not_offer_discount"],
    status: "local-implemented"
  },
  {
    id: "hermes-draft",
    order: 50,
    name: "Hermes Draft Copilot",
    component: "packages/hermes-core",
    type: "draft-agent",
    routes: [],
    scripts: ["npm run sprint1:gate"],
    guards: ["human_approval_required", "pricing_guardrail", "prompt_injection_guardrail"],
    status: "local-implemented"
  },
  {
    id: "lead-core",
    order: 60,
    name: "Lead Core Persistence Boundary",
    component: "packages/audit-core + packages/lead-core + infra/supabase",
    type: "source-of-truth",
    routes: [],
    scripts: ["npm run db:preflight", "npm run migration:readiness"],
    guards: ["rls_required", "parameterized_sql", "db_values_not_printed"],
    status: "schema-ready-runtime-env-blocked"
  },
  {
    id: "human-approval",
    order: 70,
    name: "Human Approval Queue",
    component: "apps/admin/hermes",
    type: "brand-safety-layer",
    routes: [
      "GET /admin/reply-queue",
      "GET /api/admin/reply-drafts",
      "POST /api/admin/reply-drafts/:id/approve",
      "POST /api/admin/reply-drafts/:id/reject"
    ],
    scripts: ["npm run sprint4:gate"],
    guards: ["admin_auth_required", "external_send_false"],
    status: "local-implemented-auth-gated"
  },
  {
    id: "reply-outbox",
    order: 80,
    name: "Gated Reply Outbox",
    component: "apps/admin/outbox + workers/reply-send-worker",
    type: "send-boundary",
    routes: [
      "GET /admin/outbox",
      "GET /api/admin/reply-outbox",
      "POST /api/admin/reply-drafts/:id/queue-send",
      "POST /api/admin/reply-outbox/:id/simulate-send"
    ],
    scripts: ["npm run channel:preflight", "npm run sprint6:gate"],
    guards: ["recipient_allowlist", "send_disabled_by_default", "external_send_performed_false"],
    status: "local-implemented-send-disabled"
  },
  {
    id: "social-webhook-security",
    order: 90,
    name: "Signed LINE And Meta Webhook Boundary",
    component: "packages/webhook-security + apps/webhook-gateway",
    type: "security-boundary",
    routes: ["POST /webhooks/line", "POST /webhooks/meta"],
    scripts: ["npm run webhook-security:preflight", "npm run webhook:smoke:signed"],
    guards: ["signature_required", "replay_window", "rate_limit", "processing_disabled_by_default"],
    status: "local-implemented-processing-disabled"
  },
  {
    id: "migration-readiness",
    order: 100,
    name: "Migration Readiness Gate",
    component: "packages/migration-readiness",
    type: "deployment-gate",
    routes: [],
    scripts: ["npm run migration:readiness"],
    guards: ["rollback_coverage", "no_destructive_forward_sql", "mutation_flag_required"],
    status: "validate-only-by-default"
  }
];

export const PIPELINE_FLOWS = [
  {
    id: "website-estimate-to-human-review",
    name: "Website Estimate To Human Review",
    currentMode: "local-dry-run",
    steps: [
      "GET /solar-calculator",
      "POST /api/solar-estimate",
      "lead.intent_detected",
      "schema_validation",
      "idempotency_check",
      "queue_enqueue",
      "queue_consume",
      "opal_tier_match",
      "hermes_draft_mock",
      "lead_event_saved",
      "solar_estimate_saved",
      "reply_draft_saved",
      "agent_audit_saved",
      "human_approval_queue"
    ],
    terminal: "draft_waits_for_human_approval",
    externalWrite: false
  },
  {
    id: "mock-event-dry-run",
    name: "Mock Event Dry Run",
    currentMode: "local-dry-run",
    steps: [
      "POST /webhooks/mock",
      "schema_validation",
      "idempotency_check",
      "processing_log_received",
      "queue_enqueue",
      "process_with_retries",
      "opal_tier_match",
      "hermes_draft_mock",
      "lead_core_write",
      "audit_write"
    ],
    terminal: "processed_or_dlq",
    externalWrite: false
  },
  {
    id: "failure-to-dlq-replay",
    name: "Failure To DLQ Replay",
    currentMode: "local-dry-run",
    steps: [
      "force_error_event",
      "retry_1",
      "retry_2",
      "retry_3",
      "dead_letter_events_insert",
      "POST /dlq/replay/:deadLetterId",
      "patch_force_error_false",
      "reprocess_event",
      "dlq_replay_audit"
    ],
    terminal: "replayed_with_audit",
    externalWrite: false
  },
  {
    id: "human-approved-reply-outbox",
    name: "Human Approved Reply Outbox",
    currentMode: "send-disabled-local",
    steps: [
      "GET /admin/reply-queue",
      "admin_auth_gate",
      "POST /api/admin/reply-drafts/:id/approve",
      "POST /api/admin/reply-drafts/:id/queue-send",
      "recipient_allowlist_check",
      "POST /api/admin/reply-outbox/:id/simulate-send",
      "blocked_send_audit"
    ],
    terminal: "blocked_until_real_channel_approval",
    externalWrite: false
  },
  {
    id: "signed-social-webhook-smoke",
    name: "Signed Social Webhook Smoke",
    currentMode: "verified-processing-disabled",
    steps: [
      "POST /webhooks/line",
      "line_hmac_sha256_base64_verify",
      "replay_window_check",
      "rate_limit_check",
      "webhook_security_audit",
      "verified_processing_disabled",
      "POST /webhooks/meta",
      "meta_sha256_hmac_verify",
      "verified_processing_disabled"
    ],
    terminal: "queued_false_processing_disabled",
    externalWrite: false
  },
  {
    id: "migration-readiness",
    name: "Migration Readiness",
    currentMode: "validate-only-default",
    steps: [
      "db_env_redacted_inspection",
      "dry_run_mode_inspection",
      "migration_sequence_check",
      "rollback_coverage_check",
      "destructive_sql_check",
      "advisory_command_plan"
    ],
    terminal: "blocked_until_db_env_and_mutation_gate",
    externalWrite: false
  }
];

export const PRODUCTION_BLOCKERS = [
  "Confirm actual hosting topology.",
  "Configure private database env without printing values.",
  "Run DB migration dry-run in a real staging or local Supabase database.",
  "Verify rollback in the same staging/local DB class.",
  "Put admin behind Cloudflare Access or equivalent.",
  "Configure private admin token/runtime env without printing values.",
  "Configure production LINE/Meta webhook secrets without printing values.",
  "Run signed webhook smoke tests against staging origin before enabling production processing.",
  "Configure LINE OA recipient/token and message send gate.",
  "Add a send worker that can only send approved outbox items.",
  "Add production smoke tests that prove external_send_performed only changes after real send response.",
  "Add proposal PDF as draft-only output after approval.",
  "Add Ghost Claw only as design draft with engineer review."
];

export const PIPELINE_COMMANDS = [
  "npm test",
  "npm run workflow:pipeline",
  "npm run db:preflight",
  "npm run channel:preflight",
  "npm run admin-auth:preflight",
  "npm run webhook-security:preflight",
  "npm run migration:readiness",
  "npm run webhook:smoke:signed",
  "npm run sprint9:gate"
];

export function buildWorkflowPipelineReport({ env = process.env } = {}) {
  const db = inspectDbEnv(env);
  const line = inspectLineChannelEnv(env);
  const admin = inspectAdminAuthEnv(env);
  const webhookSecurity = inspectWebhookSecurityEnv(env);
  const migration = buildMigrationReadinessReport({ env });

  const readiness = {
    db,
    line,
    admin,
    webhookSecurity,
    migration: {
      status: migration.status,
      productionReady: migration.productionReady,
      dryRun: migration.dryRun,
      latestMigration: migration.plan.latest,
      migrationCount: migration.plan.migrationCount,
      rollbackCount: migration.plan.rollbackCount,
      findings: [
        ...migration.migrations.findings,
        ...migration.plan.findings
      ]
    }
  };
  const blockedComponents = Object.entries(readiness)
    .filter(([, value]) => value && value.productionReady === false)
    .map(([key]) => key);
  const productionReady = blockedComponents.length === 0;

  const report = {
    system: "SIRINX Sovereign Agentic Swarm v2.1",
    report_version: "workflow-pipeline-1",
    status: productionReady ? "ready" : "blocked",
    productionReady,
    guardrail: "read-only pipeline report; no external writes; no secret values printed",
    stages: PIPELINE_STAGES,
    flows: PIPELINE_FLOWS,
    readiness,
    blockedComponents,
    productionBlockers: productionReady ? [] : PRODUCTION_BLOCKERS,
    commands: PIPELINE_COMMANDS,
    invariants: {
      aiInventsPrice: false,
      dynamicPricingEnabled: false,
      productionSocialProcessingEnabled: webhookSecurity.processing.enabled,
      externalSendsEnabled: line.externalSendsEnabled,
      databaseMutationAllowed: migration.dryRun.wouldRunDatabaseMutation,
      buengPhraPublicInbound: false,
      externalWritesPerformedByReport: false
    }
  };
  return {
    ...report,
    validation: validateWorkflowPipelineReport(report)
  };
}

export function validateWorkflowPipelineReport(report) {
  const findings = [];
  const stageIds = new Set(report.stages.map((stage) => stage.id));
  const requiredStages = [
    "website-calculator",
    "mock-webhook-gateway",
    "queue-dlq",
    "opal-static-core",
    "hermes-draft",
    "lead-core",
    "human-approval",
    "reply-outbox",
    "social-webhook-security",
    "migration-readiness"
  ];

  for (const stageId of requiredStages) {
    if (!stageIds.has(stageId)) {
      findings.push(`missing_stage:${stageId}`);
    }
  }

  for (const flow of report.flows) {
    if (flow.externalWrite !== false) {
      findings.push(`external_write_not_false:${flow.id}`);
    }
  }

  if (report.invariants.aiInventsPrice !== false) {
    findings.push("ai_price_invention_not_blocked");
  }
  if (report.invariants.buengPhraPublicInbound !== false) {
    findings.push("bueng_phra_public_inbound_not_blocked");
  }
  if (!report.guardrail.includes("no secret values printed")) {
    findings.push("secret_value_print_guardrail_regressed");
  }

  return {
    ok: findings.length === 0,
    findings
  };
}
