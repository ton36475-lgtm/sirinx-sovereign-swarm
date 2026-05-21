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
  if (/insert into event_processing_log/i.test(sql)) {
    return { id: values[0], event_id: values[1], status: values[3] };
  }
  if (/insert into agent_audit_logs/i.test(sql)) {
    return { id: values[0], agent_name: values[1], action_type: values[2] };
  }
  if (/insert into dead_letter_events/i.test(sql)) {
    return { id: values[0], original_event_id: values[1] };
  }
  return { id: values[0] };
}
