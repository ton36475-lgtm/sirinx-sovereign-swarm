import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowPipelineReport,
  PIPELINE_FLOWS,
  PIPELINE_STAGES,
  validateWorkflowPipelineReport
} from "../../packages/workflow-pipeline/src/workflowPipelineMap.mjs";

test("workflow pipeline map contains every implemented safety-critical stage", () => {
  const stageIds = PIPELINE_STAGES.map((stage) => stage.id);
  assert.deepEqual(stageIds, [
    "website-calculator",
    "mock-webhook-gateway",
    "queue-dlq",
    "opal-static-core",
    "hermes-draft",
    "lead-core",
    "human-approval",
    "reply-outbox",
    "social-webhook-security",
    "migration-readiness",
    "runtime-env-contract",
    "deploy-readiness",
    "staging-network-smoke"
  ]);
});

test("workflow flows preserve dry-run boundaries and do not perform external writes", () => {
  assert.equal(PIPELINE_FLOWS.length >= 6, true);
  assert.equal(
    PIPELINE_FLOWS.every((flow) => flow.externalWrite === false),
    true
  );
  assert.deepEqual(PIPELINE_FLOWS[0].steps.slice(0, 4), [
    "GET /solar-calculator",
    "POST /api/solar-estimate",
    "lead.intent_detected",
    "schema_validation"
  ]);
  assert.equal(
    PIPELINE_FLOWS.some((flow) => flow.steps.includes("verified_processing_disabled")),
    true
  );
});

test("pipeline report is redacted even when env contains real-looking secret values", () => {
  const env = {
    SIRINX_DATABASE_URL: "postgres://sirinx:very-secret-password@example.supabase.co/postgres",
    SIRINX_DB_SSL_MODE: "require",
    SIRINX_DB_DRY_RUN_MODE: "staging",
    SIRINX_ALLOW_DB_MUTATION: "false",
    SIRINX_ADMIN_API_TOKEN: "admin-secret-token-that-must-not-print",
    SIRINX_LINE_CHANNEL_ACCESS_TOKEN: "line-token-that-must-not-print",
    SIRINX_LINE_ALLOWED_RECIPIENTS: "line_user:U123456789abcdef",
    SIRINX_EXTERNAL_SENDS_ENABLED: "false",
    SIRINX_LINE_CHANNEL_SECRET: "line-secret-that-must-not-print",
    SIRINX_META_APP_SECRET: "meta-secret-that-must-not-print",
    SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "false",
    SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: "300"
  };
  const report = buildWorkflowPipelineReport({ env });
  const body = JSON.stringify(report);

  assert.equal(report.validation.ok, true);
  assert.equal(report.productionReady, false);
  assert.equal(report.readiness.runtimeEnvContract.runtimeReady, true);
  assert.equal(report.readiness.runtimeEnvContract.contractReady, true);
  assert.equal(report.invariants.externalWritesPerformedByReport, false);
  assert.equal(body.includes("very-secret-password"), false);
  assert.equal(body.includes("admin-secret-token-that-must-not-print"), false);
  assert.equal(body.includes("line-token-that-must-not-print"), false);
  assert.equal(body.includes("line-secret-that-must-not-print"), false);
  assert.equal(body.includes("meta-secret-that-must-not-print"), false);
});

test("pipeline validation fails if a flow claims external write execution", () => {
  const report = buildWorkflowPipelineReport({ env: {} });
  const mutated = {
    ...report,
    flows: report.flows.map((flow, index) =>
      index === 0 ? { ...flow, externalWrite: true } : flow
    )
  };
  const validation = validateWorkflowPipelineReport(mutated);

  assert.equal(validation.ok, false);
  assert.equal(
    validation.findings.some((finding) => finding.startsWith("external_write_not_false")),
    true
  );
});
