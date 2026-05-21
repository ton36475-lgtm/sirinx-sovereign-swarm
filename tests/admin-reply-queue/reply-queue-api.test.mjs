import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";

test("reply queue lists pending Hermes draft and approves without external send", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const estimate = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, estimatePayload());
    assert.equal(estimate.statusCode, 200);
    assert.equal(estimate.body.status, "estimate_created");
    assert.equal(typeof estimate.body.reply_draft_id, "string");

    const pending = await getJson(`http://127.0.0.1:${port}/api/admin/reply-drafts?status=pending`);
    assert.equal(pending.statusCode, 200);
    assert.equal(pending.body.drafts.length, 1);
    assert.equal(pending.body.drafts[0].id, estimate.body.reply_draft_id);
    assert.equal(pending.body.drafts[0].status, "pending");
    assert.equal(pending.body.drafts[0].recommended_tier, "PRO");
    assert.equal(pending.body.drafts[0].lead.current_bill, 4000);

    const approved = await postJson(
      `http://127.0.0.1:${port}/api/admin/reply-drafts/${estimate.body.reply_draft_id}/approve`,
      {
        reviewed_by: "test-operator",
        review_note: "approved in test"
      }
    );

    assert.equal(approved.statusCode, 200);
    assert.equal(approved.body.status, "approved");
    assert.equal(approved.body.external_send_performed, false);
    assert.equal(approved.body.draft.approved_by, "test-operator");

    const pendingAfter = await getJson(`http://127.0.0.1:${port}/api/admin/reply-drafts?status=pending`);
    const approvedAfter = await getJson(`http://127.0.0.1:${port}/api/admin/reply-drafts?status=approved`);
    assert.equal(pendingAfter.body.drafts.length, 0);
    assert.equal(approvedAfter.body.drafts.length, 1);
    assert.equal(
      gateway.store.state.agent_audit_logs.some((row) => row.action_type === "reply.approved" && row.metadata.external_send_performed === false),
      true
    );
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("reply queue rejects draft without external send", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const estimate = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, estimatePayload());
    const rejected = await postJson(
      `http://127.0.0.1:${port}/api/admin/reply-drafts/${estimate.body.reply_draft_id}/reject`,
      {
        reviewed_by: "test-operator",
        review_note: "needs more context"
      }
    );
    assert.equal(rejected.statusCode, 200);
    assert.equal(rejected.body.status, "rejected");
    assert.equal(rejected.body.external_send_performed, false);
    assert.equal(rejected.body.draft.rejected_by, "test-operator");
    assert.equal(
      gateway.store.state.agent_audit_logs.some((row) => row.action_type === "reply.rejected"),
      true
    );
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("admin reply queue page is served", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/admin/reply-queue`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /SIRINX Hermes Reply Queue/);
    assert.match(html, /Reply Queue/);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

function estimatePayload() {
  return {
    current_bill: 4000,
    target_saving: 2000,
    customer_type: "home_office",
    usage_pattern: "daytime_heavy",
    phase_type: "unknown",
    province: "phitsanulok"
  };
}

async function getJson(url) {
  const response = await fetch(url);
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

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
