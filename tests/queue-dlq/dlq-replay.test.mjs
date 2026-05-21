import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";
import { processWithRetries } from "../../workers/queue-consumer/src/processLeadIntent.mjs";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/evt_fail_001.json", import.meta.url), "utf8"));

test("force error event retries, enters DLQ, and can be replayed with audit trail", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const accepted = await postJson(`http://127.0.0.1:${port}/webhooks/mock`, fixture);
    assert.equal(accepted.statusCode, 202);

    const results = await gateway.queue.consume((message) =>
      processWithRetries(message, {
        store: gateway.store,
        maxRetries: 3
      })
    );

    assert.equal(results[0].status, "dead_lettered");
    assert.equal(results[0].retry_count, 3);
    assert.equal(gateway.store.state.dead_letter_events.length, 1);
    const deadLetter = gateway.store.state.dead_letter_events[0];
    assert.equal(deadLetter.original_event_id, "evt_fail_001");
    assert.equal(deadLetter.retry_count, 3);
    assert.equal(deadLetter.replay_status, "pending");

    const replay = await postJson(`http://127.0.0.1:${port}/dlq/replay/${deadLetter.id}`, {
      replayed_by: "test-operator",
      patch_payload: {
        force_error: false,
        text: "ค่าไฟ 4000 ติดโซลาร์กี่ kW ดีครับ",
        current_bill: 4000,
        customer_type: "home_office",
        province: "phitsanulok",
        usage_pattern: "daytime_heavy",
        phase_type: "unknown"
      }
    });

    assert.equal(replay.statusCode, 200);
    assert.equal(replay.body.status, "replayed");
    assert.equal(gateway.store.state.dead_letter_events[0].replay_status, "replayed");
    assert.equal(
      gateway.store.state.agent_audit_logs.some((row) => row.action_type === "dlq.event_replayed"),
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
