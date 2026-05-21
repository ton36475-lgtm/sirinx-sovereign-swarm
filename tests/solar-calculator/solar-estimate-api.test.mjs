import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";

test("solar estimate API creates OPAL PRO estimate and LINE handoff", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const response = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, {
      current_bill: 4000,
      target_saving: 2000,
      customer_type: "home_office",
      usage_pattern: "daytime_heavy",
      phase_type: "unknown",
      province: "phitsanulok"
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "estimate_created");
    assert.equal(response.body.recommended_tier, "PRO");
    assert.equal(response.body.estimated_budget_min, 315000);
    assert.match(response.body.draft_reply, /315,000/);
    assert.match(response.body.line_handoff_url, /^https:\/\/line\.me/);
    assert.equal(gateway.store.state.lead_events.length, 1);
    assert.equal(gateway.store.state.solar_estimates.length, 1);
    assert.equal(gateway.store.state.agent_audit_logs.length, 1);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("solar estimate API blocks duplicate calculator submission", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();
  const payload = {
    current_bill: 4000,
    customer_type: "home_office",
    usage_pattern: "daytime_heavy",
    phase_type: "unknown",
    province: "phitsanulok"
  };

  try {
    const first = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, payload);
    const second = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, payload);

    assert.equal(first.body.status, "estimate_created");
    assert.equal(second.body.status, "duplicate_ignored");
    assert.equal(gateway.store.state.lead_events.length, 1);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("static calculator page is served by gateway", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/solar-calculator`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(html, /SIRINX OPAL Solar Estimate/);
    assert.match(html, /estimate-form/);
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
