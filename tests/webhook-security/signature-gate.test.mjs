import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInMemoryRateLimiter,
  createLineSignature,
  createMetaSignature,
  evaluateSocialWebhookRequest,
  inspectWebhookSecurityEnv,
  verifyLineSignature,
  verifyMetaSignature,
  verifyReplayWindow
} from "../../packages/webhook-security/src/webhookSecurityGate.mjs";

const LINE_DOC_BODY = '{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}';
const LINE_DOC_SECRET = "8c570fa6dd201bb328f1c1eac23a96d8";
const LINE_DOC_SIGNATURE = "GhRKmvmHys4Pi8DxkF4+EayaH0OqtJtaZxgTD9fMDLs=";

test("LINE signature matches official HMAC-SHA256 base64 vector", () => {
  assert.equal(createLineSignature(LINE_DOC_BODY, LINE_DOC_SECRET), LINE_DOC_SIGNATURE);
  assert.equal(
    verifyLineSignature({
      rawBody: LINE_DOC_BODY,
      signature: LINE_DOC_SIGNATURE,
      channelSecret: LINE_DOC_SECRET
    }),
    true
  );
});

test("Meta signature uses sha256-prefixed HMAC-SHA256 hex and rejects malformed signatures", () => {
  const body = '{"object":"page","entry":[]}';
  const secret = "meta-test-secret";
  const signature = createMetaSignature(body, secret);

  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
  assert.equal(verifyMetaSignature({ rawBody: body, signature, appSecret: secret }), true);
  assert.equal(verifyMetaSignature({ rawBody: body, signature: signature.replace("sha256=", ""), appSecret: secret }), false);
  assert.equal(verifyMetaSignature({ rawBody: `${body} `, signature, appSecret: secret }), false);
});

test("webhook security env inspection is redacted and fail-closed by default", () => {
  const blocked = inspectWebhookSecurityEnv({});
  assert.equal(blocked.productionReady, false);
  assert.equal(blocked.line.secretPresent, false);
  assert.equal(blocked.line.secretValuePrinted, false);
  assert.equal(blocked.meta.secretValuePrinted, false);

  const ready = inspectWebhookSecurityEnv({
    SIRINX_LINE_CHANNEL_SECRET: "line-secret",
    SIRINX_META_APP_SECRET: "meta-secret",
    SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "true",
    SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: "300"
  });
  assert.equal(ready.productionReady, true);
  assert.doesNotMatch(JSON.stringify(ready), /line-secret|meta-secret/);
});

test("replay window accepts current timestamps and rejects stale or missing timestamps", () => {
  const nowMs = Date.parse("2026-05-22T10:00:00.000Z");

  assert.equal(
    verifyReplayWindow({
      timestamp: "2026-05-22T09:59:00.000Z",
      nowMs,
      windowSeconds: 300
    }).ok,
    true
  );
  assert.equal(
    verifyReplayWindow({
      timestamp: "2026-05-22T09:00:00.000Z",
      nowMs,
      windowSeconds: 300
    }).reason,
    "timestamp_expired"
  );
  assert.equal(
    verifyReplayWindow({
      timestamp: null,
      nowMs,
      windowSeconds: 300
    }).reason,
    "timestamp_missing"
  );
});

test("in-memory rate limiter blocks after configured threshold", () => {
  const limiter = createInMemoryRateLimiter({ limit: 2, windowMs: 60_000 });
  const nowMs = Date.parse("2026-05-22T10:00:00.000Z");

  assert.equal(limiter.check({ key: "line:remote", nowMs }).allowed, true);
  assert.equal(limiter.check({ key: "line:remote", nowMs }).allowed, true);
  assert.equal(limiter.check({ key: "line:remote", nowMs }).allowed, false);
});

test("verified social webhook still stays disabled when processing flag is false", () => {
  const rawBody = Buffer.from('{"events":[]}');
  const timestamp = "2026-05-22T10:00:00.000Z";
  const signature = createLineSignature(rawBody, "line-secret");
  const decision = evaluateSocialWebhookRequest({
    provider: "line",
    rawBody,
    headers: {
      "x-line-signature": signature,
      "x-sirinx-webhook-timestamp": timestamp
    },
    env: {
      SIRINX_LINE_CHANNEL_SECRET: "line-secret",
      SIRINX_META_APP_SECRET: "meta-secret",
      SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "false",
      SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: "300"
    },
    nowMs: Date.parse(timestamp),
    replayStore: new Set()
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.statusCode, 202);
  assert.equal(decision.reason, "verified_processing_disabled");
  assert.equal(decision.production_ready, false);
  assert.equal(decision.raw_body_stored, false);
  assert.equal(decision.signature_value_stored, false);
});
