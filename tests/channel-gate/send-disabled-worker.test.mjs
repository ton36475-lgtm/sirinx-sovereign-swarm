import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateReplyOutboxForSend,
  simulateSendDisabledWorker
} from "../../workers/reply-send-worker/src/sendDisabledWorker.mjs";

test("send-disabled worker blocks queued outbox and never performs external send", () => {
  const outbox = createOutbox({
    external_send_allowed: true,
    recipient_ref: "line_user:U1234567890"
  });
  const result = simulateSendDisabledWorker(outbox, {
    env: {
      SIRINX_LINE_CHANNEL_ACCESS_TOKEN: "secret-token",
      SIRINX_LINE_ALLOWED_RECIPIENTS: "line_user:U1234567890",
      SIRINX_EXTERNAL_SENDS_ENABLED: "true"
    }
  });

  assert.equal(result.status, "blocked_send_disabled");
  assert.equal(result.readyForProductionWorker, true);
  assert.equal(result.external_send_performed, false);
  assert.equal(result.blockedReasons.includes("send_disabled_worker_no_external_writes"), true);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
  assert.doesNotMatch(JSON.stringify(result), /U1234567890/);
});

test("production readiness evaluation blocks unapproved or malformed outbox items", () => {
  const result = evaluateReplyOutboxForSend(createOutbox(), {
    env: {}
  });

  assert.equal(result.readyForProductionWorker, false);
  assert.equal(result.external_send_performed, false);
  assert.equal(result.blockedReasons.includes("external_send_not_allowed"), true);
  assert.equal(result.blockedReasons.includes("recipient_ref_missing_or_invalid"), true);
  assert.equal(result.blockedReasons.includes("line_env_not_production_ready"), true);
});

test("production readiness evaluation blocks non-queued items", () => {
  const result = evaluateReplyOutboxForSend(createOutbox({
    status: "cancelled",
    external_send_allowed: true,
    recipient_ref: "line_user:U1234567890"
  }), {
    env: {
      SIRINX_LINE_CHANNEL_ACCESS_TOKEN: "secret-token",
      SIRINX_LINE_ALLOWED_RECIPIENTS: "line_user:U1234567890",
      SIRINX_EXTERNAL_SENDS_ENABLED: "true"
    }
  });

  assert.equal(result.readyForProductionWorker, false);
  assert.deepEqual(result.blockedReasons, ["outbox_status_not_queued"]);
});

function createOutbox(overrides = {}) {
  return {
    id: "outbox-test-1",
    status: "queued",
    channel: "line_oa",
    recipient_ref: null,
    external_send_allowed: false,
    external_send_performed: false,
    ...overrides
  };
}
