import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";
import {
  createLineSignature,
  createMetaSignature
} from "../../packages/webhook-security/src/webhookSecurityGate.mjs";

const WEBHOOK_ENV = {
  SIRINX_LINE_CHANNEL_SECRET: "line-test-secret",
  SIRINX_META_APP_SECRET: "meta-test-secret",
  SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "false",
  SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: "300"
};

test("LINE webhook verifies raw-body signature then remains processing-disabled", async () => {
  const gateway = createWebhookGateway({
    webhookSecurityEnv: WEBHOOK_ENV
  });
  const body = Buffer.from('{"events":[]}');
  const timestamp = new Date().toISOString();
  const request = requestFor({
    path: "/webhooks/line",
    body,
    headers: {
      "x-line-signature": createLineSignature(body, WEBHOOK_ENV.SIRINX_LINE_CHANNEL_SECRET),
      "x-sirinx-webhook-timestamp": timestamp
    }
  });

  const result = await post(gateway, request);

  assert.equal(result.statusCode, 202);
  assert.equal(result.body.status, "verified_processing_disabled");
  assert.equal(result.body.queued, false);
  assert.equal(result.body.signature_valid, true);
  assert.equal(result.body.replay_valid, true);
  assert.equal(result.body.raw_body_stored, false);
  assert.equal(result.body.signature_value_stored, false);
  assert.equal(gateway.store.state.webhook_security_audit_logs.length, 1);
  assert.equal(gateway.store.state.webhook_security_audit_logs[0].reason, "verified_processing_disabled");
  assert.doesNotMatch(JSON.stringify(gateway.store.state.webhook_security_audit_logs), /line-test-secret|GhRKm|events/);
});

test("LINE webhook duplicate is blocked as replay before any enqueue", async () => {
  const gateway = createWebhookGateway({
    webhookSecurityEnv: WEBHOOK_ENV
  });
  const body = Buffer.from('{"events":[]}');
  const timestamp = new Date().toISOString();
  const headers = {
    "x-line-signature": createLineSignature(body, WEBHOOK_ENV.SIRINX_LINE_CHANNEL_SECRET),
    "x-sirinx-webhook-timestamp": timestamp
  };

  await post(gateway, requestFor({ path: "/webhooks/line", body, headers }));
  const replay = await post(gateway, requestFor({ path: "/webhooks/line", body, headers }));

  assert.equal(replay.statusCode, 409);
  assert.equal(replay.body.status, "blocked");
  assert.equal(replay.body.reason, "replay_detected");
  assert.equal(gateway.queue.messages.length, 0);
});

test("LINE webhook rejects invalid signatures", async () => {
  const gateway = createWebhookGateway({
    webhookSecurityEnv: WEBHOOK_ENV
  });
  const body = Buffer.from('{"events":[]}');
  const result = await post(gateway, requestFor({
    path: "/webhooks/line",
    body,
    headers: {
      "x-line-signature": "invalid",
      "x-sirinx-webhook-timestamp": "2026-05-22T10:00:00.000Z"
    }
  }));

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.reason, "signature_invalid");
  assert.equal(result.body.queued, false);
  assert.equal(gateway.queue.messages.length, 0);
});

test("Meta webhook verifies x-hub-signature-256 and stays disabled", async () => {
  const gateway = createWebhookGateway({
    webhookSecurityEnv: WEBHOOK_ENV
  });
  const body = Buffer.from('{"object":"page","entry":[]}');
  const timestamp = new Date().toISOString();
  const result = await post(gateway, requestFor({
    path: "/webhooks/meta",
    body,
    headers: {
      "x-hub-signature-256": createMetaSignature(body, WEBHOOK_ENV.SIRINX_META_APP_SECRET),
      "x-sirinx-webhook-timestamp": timestamp
    }
  }));

  assert.equal(result.statusCode, 202);
  assert.equal(result.body.status, "verified_processing_disabled");
  assert.equal(result.body.provider, "meta");
  assert.equal(result.body.queued, false);
  assert.equal(gateway.store.state.webhook_security_audit_logs[0].provider, "meta");
});

test("social webhook returns backend misconfiguration without printing secrets", async () => {
  const gateway = createWebhookGateway({
    webhookSecurityEnv: {
      SIRINX_META_APP_SECRET: "meta-test-secret",
      SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: "300"
    }
  });
  const body = Buffer.from('{"events":[]}');
  const result = await post(gateway, requestFor({
    path: "/webhooks/line",
    body,
    headers: {
      "x-line-signature": createLineSignature(body, WEBHOOK_ENV.SIRINX_LINE_CHANNEL_SECRET),
      "x-sirinx-webhook-timestamp": "2026-05-22T10:00:00.000Z"
    }
  }));

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.reason, "webhook_secret_not_configured");
  assert.doesNotMatch(JSON.stringify(result), /line-test-secret|meta-test-secret/);
});

function requestFor({ path, body, headers }) {
  return {
    method: "POST",
    url: path,
    headers,
    socket: {
      remoteAddress: "127.0.0.1"
    },
    async *[Symbol.asyncIterator]() {
      yield body;
    }
  };
}

async function post(gateway, request) {
  const chunks = [];
  const response = {};
  response.writeHead = function writeHead(statusCode, headers) {
    response.statusCode = statusCode;
    response.headers = headers;
  };
  response.end = function end(chunk) {
    chunks.push(Buffer.from(chunk || ""));
  };
  await new Promise((resolve) => gateway.server.emit("request", request, {
    ...response,
    writeHead: response.writeHead,
    end(chunk) {
      response.end(chunk);
      resolve();
    }
  }));
  return {
    statusCode: response.statusCode,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
  };
}
