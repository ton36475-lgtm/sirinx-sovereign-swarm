import { test } from "node:test";
import assert from "node:assert/strict";
import { createPostgresLeadCoreAdapter } from "../../packages/lead-core/src/postgresLeadCoreAdapter.mjs";
import { processWithRetries } from "../../workers/queue-consumer/src/processLeadIntent.mjs";
import fixture from "../fixtures/evt_test_001.json" with { type: "json" };

test("Postgres adapter uses parameterized SQL for processing path", async () => {
  const calls = [];
  const adapter = createPostgresLeadCoreAdapter({
    now: () => new Date("2026-05-22T00:00:00+07:00"),
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [rowFor(sql, values)] };
    }
  });

  const result = await processWithRetries(fixture, {
    store: adapter
  });

  assert.equal(result.status, "processed");
  assert.equal(result.opal_match.recommended_tier, "PRO");
  assert.equal(calls.length >= 5, true);
  for (const call of calls) {
    assert.equal(Array.isArray(call.values), true);
    assert.doesNotMatch(call.sql, /\$\{/);
  }
  assert.equal(calls.some((call) => /insert into leads/i.test(call.sql)), true);
  assert.equal(calls.some((call) => /insert into reply_drafts/i.test(call.sql)), true);
  assert.equal(calls.some((call) => /insert into agent_audit_logs/i.test(call.sql)), true);
});

test("Postgres adapter exposes DLQ lookup and replay update SQL", async () => {
  const calls = [];
  const adapter = createPostgresLeadCoreAdapter({
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ id: values[0], original_event_id: "evt_fail_001", payload: fixture }] };
    }
  });

  const record = await adapter.getDeadLetterById("00000000-0000-0000-0000-000000000001");
  const replayed = await adapter.markDeadLetterReplayed({
    deadLetterId: "00000000-0000-0000-0000-000000000001",
    replayedBy: "test-operator"
  });

  assert.equal(record.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(replayed.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(calls.some((call) => /from dead_letter_events/i.test(call.sql)), true);
  assert.equal(calls.some((call) => /update dead_letter_events/i.test(call.sql)), true);
});

test("Postgres adapter queues and cancels reply outbox with parameterized SQL", async () => {
  const calls = [];
  const adapter = createPostgresLeadCoreAdapter({
    now: () => new Date("2026-05-22T00:00:00+07:00"),
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [rowFor(sql, values)] };
    }
  });

  const queued = await adapter.createReplyOutboxFromApprovedDraft({
    replyDraftId: "00000000-0000-0000-0000-000000000010",
    channel: "line_oa",
    queuedBy: "test-operator",
    recipientRef: "line_user:U1234567890"
  });
  const cancelled = await adapter.cancelReplyOutbox({
    outboxId: queued.id,
    cancelledBy: "test-operator",
    cancelReason: "test"
  });

  assert.equal(queued.status, "queued");
  assert.equal(queued.recipient_ref, "line_user:U1234567890");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(calls.some((call) => /insert into reply_outbox/i.test(call.sql)), true);
  assert.equal(calls.some((call) => /update reply_outbox/i.test(call.sql)), true);
  for (const call of calls) {
    assert.equal(Array.isArray(call.values), true);
    assert.doesNotMatch(call.sql, /\$\{/);
  }
});

test("Postgres adapter can lookup and block reply outbox with parameterized SQL", async () => {
  const calls = [];
  const adapter = createPostgresLeadCoreAdapter({
    now: () => new Date("2026-05-22T00:00:00+07:00"),
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [rowFor(sql, values)] };
    }
  });

  const item = await adapter.getReplyOutboxById("00000000-0000-0000-0000-000000000011");
  const blocked = await adapter.markReplyOutboxBlocked({
    outboxId: item.id,
    blockedBy: "test-operator",
    blockedReason: "send_disabled_worker_no_external_writes"
  });

  assert.equal(item.id, "00000000-0000-0000-0000-000000000011");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blocked_by, "test-operator");
  assert.equal(calls.some((call) => /from reply_outbox/i.test(call.sql)), true);
  assert.equal(calls.some((call) => /update reply_outbox/i.test(call.sql) && /status = 'blocked'/i.test(call.sql)), true);
  for (const call of calls) {
    assert.equal(Array.isArray(call.values), true);
    assert.doesNotMatch(call.sql, /\$\{/);
  }
});

test("Postgres adapter writes admin access audit without token values", async () => {
  const calls = [];
  const adapter = createPostgresLeadCoreAdapter({
    now: () => new Date("2026-05-22T00:00:00+07:00"),
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [rowFor(sql, values)] };
    }
  });

  const audit = await adapter.saveAdminAccessAuditLog({
    route: "/api/admin/reply-drafts",
    method: "GET",
    allowed: false,
    status_code: 401,
    reason: "admin_token_missing",
    actor_ref: "unknown",
    auth_mode: "blocked",
    metadata: {
      token_value_printed: false
    }
  });

  assert.equal(audit.route, "/api/admin/reply-drafts");
  assert.equal(audit.allowed, false);
  assert.equal(calls.some((call) => /insert into admin_access_audit_logs/i.test(call.sql)), true);
  for (const call of calls) {
    assert.equal(Array.isArray(call.values), true);
    assert.doesNotMatch(call.sql, /\$\{/);
    assert.doesNotMatch(JSON.stringify(call.values), /test-admin-token|secret-admin-token/);
  }
});

test("Postgres adapter writes webhook security audit without raw body, signature, or secret", async () => {
  const calls = [];
  const adapter = createPostgresLeadCoreAdapter({
    now: () => new Date("2026-05-22T00:00:00+07:00"),
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [rowFor(sql, values)] };
    }
  });

  const audit = await adapter.saveWebhookSecurityAuditLog({
    provider: "line",
    route: "/webhooks/line",
    method: "POST",
    allowed: true,
    status_code: 202,
    reason: "verified_processing_disabled",
    signature_valid: true,
    replay_valid: true,
    rate_limited: false,
    idempotency_key_hash: "hash-only",
    remote_ref: "remote-present",
    metadata: {
      raw_body_stored: false,
      signature_value_stored: false,
      secret_value_printed: false
    }
  });

  assert.equal(audit.provider, "line");
  assert.equal(audit.reason, "verified_processing_disabled");
  assert.equal(calls.some((call) => /insert into webhook_security_audit_logs/i.test(call.sql)), true);
  for (const call of calls) {
    assert.equal(Array.isArray(call.values), true);
    assert.doesNotMatch(call.sql, /\$\{/);
    assert.doesNotMatch(JSON.stringify(call.values), /line-test-secret|x-line-signature|"\{\"events\"\:\[\]\}"/);
  }
});

function rowFor(sql, values) {
  if (/insert into leads/i.test(sql)) {
    return { id: values[0], current_bill: values[3], target_saving: values[4] };
  }
  if (/insert into lead_events/i.test(sql)) {
    return { id: values[0], lead_id: values[1], event_id: values[2] };
  }
  if (/insert into solar_estimates/i.test(sql)) {
    return { id: values[0], lead_id: values[1], recommended_tier: values[3] };
  }
  if (/insert into reply_drafts/i.test(sql)) {
    return { id: values[0], lead_id: values[1], event_id: values[2], status: "pending" };
  }
  if (/insert into event_processing_log/i.test(sql)) {
    return { id: values[0], event_id: values[1], status: values[3] };
  }
  if (/insert into agent_audit_logs/i.test(sql)) {
    return { id: values[0], agent_name: values[1], action_type: values[2] };
  }
  if (/insert into admin_access_audit_logs/i.test(sql)) {
    return {
      id: values[0],
      route: values[1],
      method: values[2],
      allowed: values[3],
      status_code: values[4],
      reason: values[5],
      actor_ref: values[6],
      auth_mode: values[7]
    };
  }
  if (/insert into webhook_security_audit_logs/i.test(sql)) {
    return {
      id: values[0],
      provider: values[1],
      route: values[2],
      method: values[3],
      allowed: values[4],
      status_code: values[5],
      reason: values[6],
      signature_valid: values[7],
      replay_valid: values[8],
      rate_limited: values[9]
    };
  }
  if (/insert into dead_letter_events/i.test(sql)) {
    return { id: values[0], original_event_id: values[1] };
  }
  if (/insert into reply_outbox/i.test(sql)) {
    return {
      id: values[0],
      channel: values[1],
      recipient_ref: values[2],
      queued_by: values[4],
      reply_draft_id: values[5],
      status: "queued",
      external_send_allowed: false,
      external_send_performed: false
    };
  }
  if (/from reply_outbox/i.test(sql)) {
    return {
      id: values[0],
      status: "queued",
      external_send_allowed: false,
      external_send_performed: false
    };
  }
  if (/update reply_outbox/i.test(sql)) {
    if (/status = 'blocked'/i.test(sql)) {
      return {
        id: values[0],
        blocked_by: values[1],
        last_error: values[2],
        status: "blocked",
        external_send_performed: false
      };
    }
    return {
      id: values[0],
      cancelled_by: values[1],
      cancel_reason: values[2],
      status: "cancelled",
      external_send_performed: false
    };
  }
  return { id: values[0] };
}
