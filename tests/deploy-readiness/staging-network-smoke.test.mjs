import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStagingNetworkSmokePlan,
  runStagingNetworkSmoke
} from "../../packages/deploy-readiness/src/stagingNetworkSmoke.mjs";

test("staging network smoke skips without explicit flag and does not call fetch", async () => {
  let fetchCalled = false;
  const report = await runStagingNetworkSmoke({
    env: {},
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("fetch should not run");
    }
  });

  assert.equal(report.ok, true);
  assert.equal(report.status, "skipped");
  assert.equal(fetchCalled, false);
  assert.equal(report.plan.networkCallsPerformed, false);
  assert.equal(report.plan.missing.includes("SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED=true"), true);
});

test("staging network smoke plan requires https origin and secrets without printing values", () => {
  const plan = buildStagingNetworkSmokePlan({
    env: {
      SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED: "true",
      SIRINX_STAGING_ORIGIN: "https://staging.sirinx.co",
      SIRINX_LINE_CHANNEL_SECRET: "line-secret-value",
      SIRINX_META_APP_SECRET: "meta-secret-value"
    }
  });
  const serialized = JSON.stringify(plan);

  assert.equal(plan.ready, true);
  assert.equal(plan.origin.valuePrinted, false);
  assert.equal(plan.secrets.valuesPrinted, false);
  assert.equal(serialized.includes("line-secret-value"), false);
  assert.equal(serialized.includes("meta-secret-value"), false);
  assert.equal(buildStagingNetworkSmokePlan({
    env: {
      SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED: "true",
      SIRINX_STAGING_ORIGIN: "http://staging.sirinx.co",
      SIRINX_LINE_CHANNEL_SECRET: "line-secret-value",
      SIRINX_META_APP_SECRET: "meta-secret-value"
    }
  }).ready, false);
});

test("staging network smoke executes signed checks when explicitly ready", async () => {
  const calls = [];
  const report = await runStagingNetworkSmoke({
    env: {
      SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED: "true",
      SIRINX_STAGING_ORIGIN: "https://staging.sirinx.co",
      SIRINX_LINE_CHANNEL_SECRET: "line-secret-value",
      SIRINX_META_APP_SECRET: "meta-secret-value"
    },
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/health")) {
        return json(200, { status: "ok", service: "webhook-gateway" });
      }
      if (url.endsWith("/solar-calculator")) {
        return text(200, "<html></html>");
      }
      if (url.endsWith("/webhooks/line") && init.headers?.["x-line-signature"] === "invalid") {
        return json(401, {
          status: "blocked",
          reason: "signature_invalid",
          queued: false
        });
      }
      if (url.endsWith("/webhooks/line") && calls.filter((call) => call.url.endsWith("/webhooks/line")).length === 2) {
        return json(409, {
          status: "blocked",
          reason: "replay_detected",
          queued: false
        });
      }
      if (url.endsWith("/webhooks/line")) {
        return json(202, {
          status: "verified_processing_disabled",
          queued: false
        });
      }
      if (url.endsWith("/webhooks/meta")) {
        return json(202, {
          status: "verified_processing_disabled",
          queued: false
        });
      }
      return json(404, {});
    }
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, true);
  assert.equal(report.status, "passed");
  assert.equal(report.plan.networkCallsPerformed, true);
  assert.equal(calls.length, 6);
  assert.equal(serialized.includes("line-secret-value"), false);
  assert.equal(serialized.includes("meta-secret-value"), false);
});

function json(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

function text(status, body) {
  return {
    status,
    async text() {
      return body;
    }
  };
}
