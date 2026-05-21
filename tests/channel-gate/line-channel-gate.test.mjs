import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectLineChannelEnv,
  isRecipientAllowed,
  isValidLineRecipientRef,
  parseRecipientAllowlist
} from "../../packages/channel-gate/src/lineChannelGate.mjs";

test("LINE channel env inspection never prints secret values", () => {
  const result = inspectLineChannelEnv({
    SIRINX_LINE_CHANNEL_ACCESS_TOKEN: "secret-line-token",
    SIRINX_LINE_ALLOWED_RECIPIENTS: "line_user:U1234567890",
    SIRINX_EXTERNAL_SENDS_ENABLED: "true"
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.productionReady, true);
  assert.equal(result.token.present, true);
  assert.equal(result.token.valuePrinted, false);
  assert.equal(result.allowlist.count, 1);
  assert.equal(result.allowlist.valuePrinted, false);
  assert.doesNotMatch(serialized, /secret-line-token/);
  assert.doesNotMatch(serialized, /U1234567890/);
});

test("LINE channel env blocks readiness when token, allowlist, or send flag is missing", () => {
  const result = inspectLineChannelEnv({});

  assert.equal(result.productionReady, false);
  assert.equal(result.externalSendsEnabled, false);
  assert.deepEqual(result.missing, [
    "SIRINX_LINE_CHANNEL_ACCESS_TOKEN",
    "SIRINX_LINE_ALLOWED_RECIPIENTS",
    "SIRINX_EXTERNAL_SENDS_ENABLED"
  ]);
});

test("recipient allowlist validates shape and membership", () => {
  const env = {
    SIRINX_LINE_ALLOWED_RECIPIENTS: "line_user:U1234567890,line_group:C1234567890"
  };

  assert.deepEqual(parseRecipientAllowlist(env.SIRINX_LINE_ALLOWED_RECIPIENTS), [
    "line_user:U1234567890",
    "line_group:C1234567890"
  ]);
  assert.equal(isValidLineRecipientRef("line_user:U1234567890"), true);
  assert.equal(isValidLineRecipientRef("plain-secret"), false);
  assert.equal(isRecipientAllowed("line_group:C1234567890", env), true);
  assert.equal(isRecipientAllowed("line_user:U0000000000", env), false);
});
