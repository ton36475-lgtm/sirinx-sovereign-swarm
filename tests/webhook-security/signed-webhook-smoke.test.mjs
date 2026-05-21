import { test } from "node:test";
import assert from "node:assert/strict";
import { runSignedWebhookSmoke } from "../../packages/webhook-security/src/signedWebhookSmoke.mjs";

test("signed webhook smoke verifies LINE and Meta without external writes or secret leaks", async () => {
  const result = await runSignedWebhookSmoke();

  assert.equal(result.ok, true);
  assert.equal(result.checks.healthOk, true);
  assert.equal(result.checks.lineVerifiedDisabled, true);
  assert.equal(result.checks.lineReplayBlocked, true);
  assert.equal(result.checks.lineBadSignatureBlocked, true);
  assert.equal(result.checks.metaVerifiedDisabled, true);
  assert.equal(result.checks.noExternalWrite, true);
  assert.equal(result.checks.noSecretLeak, true);
  assert.equal(JSON.stringify(result).includes(["local", "smoke", "line", "fixture"].join("-")), false);
  assert.equal(JSON.stringify(result).includes(["local", "smoke", "meta", "fixture"].join("-")), false);
});
