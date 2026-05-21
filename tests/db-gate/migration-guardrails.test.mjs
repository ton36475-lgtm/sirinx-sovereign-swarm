import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMigrationFiles } from "../../scripts/validate-migrations.mjs";

test("migration guardrails pass with RLS migration present", () => {
  const result = validateMigrationFiles();
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.files.includes("002_lead_core_rls_policies.sql"), true);
  assert.equal(result.files.includes("003_reply_draft_approval_queue.sql"), true);
  assert.equal(result.files.includes("004_reply_outbox_gated_send.sql"), true);
});

test("RLS migration revokes direct public roles and enables forced RLS", () => {
  const sql = readFileSync(
    new URL("../../infra/supabase/migrations/002_lead_core_rls_policies.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /revoke all on table leads from anon, authenticated/i);
  assert.match(sql, /alter table leads enable row level security/i);
  assert.match(sql, /alter table leads force row level security/i);
  assert.match(sql, /grant select, insert, update, delete on table leads to service_role/i);
});

test("reply outbox migration creates gated send table with RLS", () => {
  const sql = readFileSync(
    new URL("../../infra/supabase/migrations/004_reply_outbox_gated_send.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /create table if not exists reply_outbox/i);
  assert.match(sql, /external_send_allowed boolean default false/i);
  assert.match(sql, /external_send_performed boolean default false/i);
  assert.match(sql, /revoke all on table reply_outbox from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table reply_outbox to service_role/i);
  assert.match(sql, /alter table reply_outbox force row level security/i);
});

test("reply draft migration creates backend-only approval queue with RLS", () => {
  const sql = readFileSync(
    new URL("../../infra/supabase/migrations/003_reply_draft_approval_queue.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /create table if not exists reply_drafts/i);
  assert.match(sql, /check \(status in \('pending', 'approved', 'rejected'\)\)/i);
  assert.match(sql, /revoke all on table reply_drafts from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table reply_drafts to service_role/i);
  assert.match(sql, /alter table reply_drafts force row level security/i);
});

test("rollback draft exists and is explicit about human approval", () => {
  const sql = readFileSync(
    new URL("../../infra/supabase/rollback/002_lead_core_rls_policies.rollback.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /Do not run in production without explicit human approval/i);
  assert.match(sql, /disable row level security/i);
});
