import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";

test("approved draft can be queued into gated outbox without external send", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const estimate = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, estimatePayload());
    const draftId = estimate.body.reply_draft_id;
    await postJson(`http://127.0.0.1:${port}/api/admin/reply-drafts/${draftId}/approve`, {
      reviewed_by: "test-operator"
    });

    const queued = await postJson(`http://127.0.0.1:${port}/api/admin/reply-drafts/${draftId}/queue-send`, {
      queued_by: "test-operator",
      channel: "line_oa"
    });

    assert.equal(queued.statusCode, 200);
    assert.equal(queued.body.status, "queued");
    assert.equal(queued.body.external_send_allowed, false);
    assert.equal(queued.body.external_send_performed, false);
    assert.equal(queued.body.outbox.status, "queued");
    assert.equal(queued.body.outbox.channel, "line_oa");

    const outbox = await getJson(`http://127.0.0.1:${port}/api/admin/reply-outbox?status=queued`);
    assert.equal(outbox.statusCode, 200);
    assert.equal(outbox.body.items.length, 1);
    assert.equal(outbox.body.items[0].external_send_performed, false);
    assert.equal(
      gateway.store.state.agent_audit_logs.some((row) => row.action_type === "reply.outbox_queued"),
      true
    );
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("pending draft cannot be queued into outbox", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const estimate = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, estimatePayload());
    const queued = await postJson(`http://127.0.0.1:${port}/api/admin/reply-drafts/${estimate.body.reply_draft_id}/queue-send`, {
      queued_by: "test-operator"
    });

    assert.equal(queued.statusCode, 500);
    assert.match(queued.body.message, /must be approved/);
    assert.equal(gateway.store.state.reply_outbox.length, 0);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("outbox item can be cancelled without external send", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const estimate = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, estimatePayload());
    const draftId = estimate.body.reply_draft_id;
    await postJson(`http://127.0.0.1:${port}/api/admin/reply-drafts/${draftId}/approve`, {
      reviewed_by: "test-operator"
    });
    const queued = await postJson(`http://127.0.0.1:${port}/api/admin/reply-drafts/${draftId}/queue-send`, {
      queued_by: "test-operator"
    });
    const cancelled = await postJson(`http://127.0.0.1:${port}/api/admin/reply-outbox/${queued.body.outbox.id}/cancel`, {
      cancelled_by: "test-operator",
      cancel_reason: "test cancellation"
    });

    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.body.status, "cancelled");
    assert.equal(cancelled.body.external_send_performed, false);
    assert.equal(cancelled.body.outbox.status, "cancelled");
    assert.equal(
      gateway.store.state.agent_audit_logs.some((row) => row.action_type === "reply.outbox_cancelled"),
      true
    );
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("outbox simulate-send blocks locally and writes audit without external send", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const estimate = await postJson(`http://127.0.0.1:${port}/api/solar-estimate`, estimatePayload());
    const draftId = estimate.body.reply_draft_id;
    await postJson(`http://127.0.0.1:${port}/api/admin/reply-drafts/${draftId}/approve`, {
      reviewed_by: "test-operator"
    });
    const queued = await postJson(`http://127.0.0.1:${port}/api/admin/reply-drafts/${draftId}/queue-send`, {
      queued_by: "test-operator",
      recipient_ref: "line_user:U1234567890"
    });
    const blocked = await postJson(`http://127.0.0.1:${port}/api/admin/reply-outbox/${queued.body.outbox.id}/simulate-send`, {
      simulated_by: "test-operator"
    });

    assert.equal(blocked.statusCode, 200);
    assert.equal(blocked.body.status, "blocked");
    assert.equal(blocked.body.external_send_performed, false);
    assert.equal(blocked.body.outbox.status, "blocked");
    assert.equal(blocked.body.outbox.external_send_performed, false);
    assert.equal(
      blocked.body.simulation.blockedReasons.includes("send_disabled_worker_no_external_writes"),
      true
    );
    assert.equal(
      gateway.store.state.agent_audit_logs.some((row) => row.action_type === "reply.send_blocked"),
      true
    );
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("admin outbox page is served", async () => {
  const gateway = createWebhookGateway();
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/admin/outbox`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /SIRINX Reply Outbox/);
    assert.match(html, /Gated Send Layer/);
    assert.match(html, /No LINE\/Facebook message is sent/);
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
