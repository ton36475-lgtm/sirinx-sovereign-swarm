import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCommandPlan,
  buildMigrationReadinessReport,
  inspectMigrationDryRunEnv,
  inspectMigrationPlan
} from "../../packages/migration-readiness/src/migrationReadinessGate.mjs";

test("migration plan is sequential and rollback-covered after the baseline migration", () => {
  const plan = inspectMigrationPlan();

  assert.equal(plan.ok, true);
  assert.equal(plan.latest, "007_webhook_security_audit.sql");
  assert.equal(plan.migrationCount, 7);
  assert.equal(plan.rows[0].baseMigration, true);
  assert.equal(plan.rows.slice(1).every((row) => row.rollbackPresent), true);
});

test("migration readiness defaults to validate-only and never prints DB values", () => {
  const report = buildMigrationReadinessReport({
    env: {
      SIRINX_DATABASE_URL: "postgres://user:secret@example.test:5432/db",
      SIRINX_DB_SSL_MODE: "require"
    }
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.productionReady, false);
  assert.equal(report.db.productionReady, true);
  assert.equal(report.dryRun.mode, "validate-only");
  assert.equal(report.commandPlan.executed, false);
  assert.doesNotMatch(JSON.stringify(report), /postgres:\/\/user:secret|example\.test/);
});

test("migration readiness requires explicit mutation flag for local or staging dry runs", () => {
  const blocked = inspectMigrationDryRunEnv({
    SIRINX_DB_DRY_RUN_MODE: "staging"
  });
  assert.equal(blocked.mutationExplicitlyAllowed, false);
  assert.equal(blocked.wouldRunDatabaseMutation, false);
  assert.equal(blocked.missing.includes("SIRINX_ALLOW_DB_MUTATION=true"), true);

  const allowed = inspectMigrationDryRunEnv({
    SIRINX_DB_DRY_RUN_MODE: "local",
    SIRINX_ALLOW_DB_MUTATION: "true"
  });
  assert.equal(allowed.mutationExplicitlyAllowed, true);
  assert.equal(allowed.wouldRunDatabaseMutation, true);
});

test("command plan is advisory and does not execute database commands", () => {
  const plan = buildCommandPlan({
    dryRun: {
      mode: "staging"
    }
  });

  assert.equal(plan.executed, false);
  assert.equal(plan.valuesPrinted, false);
  assert.equal(plan.commands.includes("supabase migration list --linked"), true);
  assert.equal(plan.commands.includes("supabase db push --dry-run"), true);
});
