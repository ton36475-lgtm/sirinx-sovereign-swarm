import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeAdminRequest,
  inspectAdminAuthEnv
} from "../../packages/admin-auth/src/adminAuthGate.mjs";

test("admin auth env inspection never prints token values", () => {
  const result = inspectAdminAuthEnv({
    SIRINX_ADMIN_API_TOKEN: "secret-admin-token",
    SIRINX_ADMIN_LOCAL_DEV_BYPASS: "false"
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.productionReady, true);
  assert.equal(result.token.present, true);
  assert.equal(result.token.valuePrinted, false);
  assert.doesNotMatch(serialized, /secret-admin-token/);
});

test("admin auth preflight blocks missing token and local dev bypass", () => {
  const missing = inspectAdminAuthEnv({});
  const bypass = inspectAdminAuthEnv({
    SIRINX_ADMIN_API_TOKEN: "secret-admin-token",
    SIRINX_ADMIN_LOCAL_DEV_BYPASS: "true"
  });

  assert.equal(missing.productionReady, false);
  assert.deepEqual(missing.missing, ["SIRINX_ADMIN_API_TOKEN"]);
  assert.equal(bypass.productionReady, false);
  assert.equal(bypass.missing.includes("disable_local_dev_bypass_for_production"), true);
});

test("admin request denies missing and invalid tokens", () => {
  const env = {
    SIRINX_ADMIN_API_TOKEN: "secret-admin-token"
  };

  const missing = authorizeAdminRequest({ headers: {}, env, remoteAddress: "127.0.0.1" });
  const invalid = authorizeAdminRequest({
    headers: {
      "x-sirinx-admin-token": "wrong-token"
    },
    env,
    remoteAddress: "127.0.0.1"
  });

  assert.equal(missing.allowed, false);
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.reason, "admin_token_missing");
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.statusCode, 403);
  assert.equal(invalid.reason, "admin_token_invalid");
});

test("admin request allows valid token or explicit loopback local-dev bypass", () => {
  const tokenAllowed = authorizeAdminRequest({
    headers: {
      "x-sirinx-admin-token": "secret-admin-token",
      "x-sirinx-admin-actor": "test-operator"
    },
    env: {
      SIRINX_ADMIN_API_TOKEN: "secret-admin-token"
    },
    remoteAddress: "10.0.0.1"
  });
  const bypassAllowed = authorizeAdminRequest({
    headers: {},
    env: {
      SIRINX_ADMIN_LOCAL_DEV_BYPASS: "true"
    },
    remoteAddress: "127.0.0.1"
  });

  assert.equal(tokenAllowed.allowed, true);
  assert.equal(tokenAllowed.mode, "token");
  assert.equal(tokenAllowed.actorRef, "test-operator");
  assert.equal(bypassAllowed.allowed, true);
  assert.equal(bypassAllowed.mode, "local-dev-bypass");
});
