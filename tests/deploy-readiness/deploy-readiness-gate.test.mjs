import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeployReadinessReport,
  inspectPagesRoutes,
  inspectWranglerConfig
} from "../../packages/deploy-readiness/src/deployReadinessGate.mjs";
import {
  buildApiProxyTargetUrl,
  validateApiOrigin
} from "../../functions/api/[[path]].js";

test("deploy readiness config is valid but production remains blocked without runtime gates", () => {
  const report = buildDeployReadinessReport({ env: {} });

  assert.equal(report.validation.ok, true);
  assert.equal(report.configReady, true);
  assert.equal(report.productionReady, false);
  assert.equal(report.hostingStrategy, "node-backend-origin");
  assert.equal(report.pagesRoutes.ok, true);
  assert.equal(report.runtimeEnvContract.contractReady, true);
  assert.equal(report.runtimeEnvContract.runtimeReady, false);
  assert.equal(report.networkSmoke.missing.includes("SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED=true"), true);
  assert.equal(report.workflow.productionReady, false);
  assert.equal(report.guardrail.includes("no secret values printed"), true);
});

test("pages routes invoke functions only for /api wildcard", () => {
  const routes = inspectPagesRoutes();

  assert.equal(routes.ok, true);
  assert.deepEqual(routes.include, ["/api/*"]);
  assert.deepEqual(routes.exclude, []);
});

test("wrangler config keeps secret-like values out of vars", () => {
  const wrangler = inspectWranglerConfig();
  const serialized = JSON.stringify(wrangler);

  assert.equal(wrangler.ok, true);
  assert.equal(serialized.includes("DATABASE_URL"), false);
  assert.equal(serialized.includes("SERVICE_ROLE"), false);
  assert.equal(serialized.includes("TOKEN"), false);
  assert.equal(serialized.includes("SECRET"), false);
});

test("api proxy accepts only safe origin-only backend URLs by default", () => {
  assert.deepEqual(validateApiOrigin("https://api.sirinx.co"), {
    ok: true,
    reason: "api_origin_valid"
  });
  assert.equal(validateApiOrigin("http://api.sirinx.co").ok, false);
  assert.equal(validateApiOrigin("https://user:pass@api.sirinx.co").ok, false);
  assert.equal(validateApiOrigin("https://api.sirinx.co/path").ok, false);
  assert.equal(validateApiOrigin("http://127.0.0.1:8787").ok, false);
  assert.equal(
    validateApiOrigin("http://127.0.0.1:8787", { localOriginAllowed: true }).ok,
    true
  );
});

test("api proxy target stays under /api and preserves query string", () => {
  const target = buildApiProxyTargetUrl({
    apiOrigin: "https://api.sirinx.co",
    requestPathname: "/api/solar-estimate",
    requestSearch: "?dryRun=1"
  });

  assert.equal(target.ok, true);
  assert.equal(target.url, "https://api.sirinx.co/api/solar-estimate?dryRun=1");
  assert.equal(
    buildApiProxyTargetUrl({
      apiOrigin: "https://api.sirinx.co",
      requestPathname: "/admin/reply-queue"
    }).ok,
    false
  );
});
