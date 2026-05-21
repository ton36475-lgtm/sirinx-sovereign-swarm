import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";

const ADMIN_ENV = {
  SIRINX_ADMIN_API_TOKEN: "test-admin-token"
};

test("admin API fails closed without token and writes admin access audit", async () => {
  const gateway = createWebhookGateway({ adminAuthEnv: ADMIN_ENV });
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/reply-drafts?status=pending`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.status, "admin_auth_required");
    assert.equal(body.reason, "admin_token_missing");
    assert.equal(body.auth.token_value_printed, false);
    assert.equal(gateway.store.state.admin_access_audit_logs.length, 1);
    assert.equal(gateway.store.state.admin_access_audit_logs[0].allowed, false);
    assert.equal(gateway.store.state.admin_access_audit_logs[0].reason, "admin_token_missing");
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("admin API rejects invalid token without printing token", async () => {
  const gateway = createWebhookGateway({ adminAuthEnv: ADMIN_ENV });
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/reply-drafts?status=pending`, {
      headers: {
        "x-sirinx-admin-token": "wrong-token"
      }
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.reason, "admin_token_invalid");
    assert.doesNotMatch(JSON.stringify(body), /wrong-token|test-admin-token/);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("admin page requires token while public calculator stays open", async () => {
  const gateway = createWebhookGateway({ adminAuthEnv: ADMIN_ENV });
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const admin = await fetch(`http://127.0.0.1:${port}/admin/outbox`);
    const publicPage = await fetch(`http://127.0.0.1:${port}/solar-calculator`);

    assert.equal(admin.status, 401);
    assert.equal(publicPage.status, 200);
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

test("admin API accepts valid token and records allowed audit", async () => {
  const gateway = createWebhookGateway({ adminAuthEnv: ADMIN_ENV });
  await new Promise((resolve) => gateway.server.listen(0, resolve));
  const { port } = gateway.server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/reply-drafts?status=pending`, {
      headers: adminHeaders()
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(gateway.store.state.admin_access_audit_logs.at(-1).allowed, true);
    assert.equal(gateway.store.state.admin_access_audit_logs.at(-1).auth_mode, "token");
  } finally {
    await new Promise((resolve) => gateway.server.close(resolve));
  }
});

function adminHeaders() {
  return {
    "x-sirinx-admin-token": "test-admin-token",
    "x-sirinx-admin-actor": "test-operator"
  };
}
