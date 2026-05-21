import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";
import { processWithRetries } from "../../workers/queue-consumer/src/processLeadIntent.mjs";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/evt_test_001.json", import.meta.url), "utf8"));

test("valid mock event is accepted, queued, processed, audited, and not sent to DLQ", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const accepted = await postJson(`http://127.0.0.1:${port}/webhooks/mock`, fixture);
    assert.equal(accepted.statusCode, 202);
    assert.deepEqual(accepted.body, {
      status: "accepted",
      event_id: "evt_test_001",
      request_id: "req_test_001",
      queued: true
    });

    const duplicate = await postJson(`http://127.0.0.1:${port}/webhooks/mock`, fixture);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.body.status, "duplicate_ignored");
    assert.equal(gateway.queue.messages.length, 1);

    const results = await gateway.queue.consume((message) =>
      processWithRetries(message, {
        store: gateway.store
      })
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "processed");
    assert.equal(results[0].opal_match.recommended_tier, "PRO");
    assert.equal(results[0].hermes_draft.recommended_tier, "PRO");
    assert.match(results[0].hermes_draft.draft_reply, /315,000/);
    assert.equal(gateway.store.state.lead_events.length, 1);
    assert.equal(gateway.store.state.solar_estimates.length, 1);
    assert.equal(gateway.store.state.dead_letter_events.length, 0);
    assert.equal(
      gateway.store.state.agent_audit_logs.some((row) => row.action_type === "reply.draft_created"),
      true
    );
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}
