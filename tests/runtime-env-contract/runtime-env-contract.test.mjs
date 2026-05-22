import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRuntimeEnvContractReport,
  inspectEnvExampleContract,
  inspectFunctionsRuntimeContract,
  inspectWranglerRuntimeContract
} from "../../packages/runtime-env-contract/src/runtimeEnvContract.mjs";

test("runtime env contract validates public config but remains blocked without private runtime env", () => {
  const report = buildRuntimeEnvContractReport({ env: {} });

  assert.equal(report.validation.ok, true);
  assert.equal(report.contractReady, true);
  assert.equal(report.runtimeReady, false);
  assert.equal(report.productionReady, false);
  assert.equal(report.wrangler.ok, true);
  assert.equal(report.envExample.ok, true);
  assert.equal(report.publicStatic.ok, true);
  assert.equal(report.functions.ok, true);
  assert.equal(report.runtime.missing.includes("SIRINX_DATABASE_URL"), true);
  assert.equal(report.guardrail.includes("secret values are never printed"), true);
});

test("runtime env contract redacts real-looking runtime values", () => {
  const report = buildRuntimeEnvContractReport({
    env: {
      SIRINX_DATABASE_URL: "postgres://sirinx:very-secret-password@example.supabase.co/postgres",
      SIRINX_DB_SSL_MODE: "require",
      SIRINX_ADMIN_API_TOKEN: "admin-secret-token-that-must-not-print",
      SIRINX_LINE_CHANNEL_ACCESS_TOKEN: "line-token-that-must-not-print",
      SIRINX_LINE_ALLOWED_RECIPIENTS: "line_user:U123456789abcdef",
      SIRINX_EXTERNAL_SENDS_ENABLED: "false",
      SIRINX_LINE_CHANNEL_SECRET: "line-secret-that-must-not-print",
      SIRINX_META_APP_SECRET: "meta-secret-that-must-not-print",
      SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "false",
      SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: "300",
      SIRINX_ADMIN_LOCAL_DEV_BYPASS: "false",
      SIRINX_ALLOW_DB_MUTATION: "false"
    }
  });
  const body = JSON.stringify(report);

  assert.equal(report.validation.ok, true);
  assert.equal(report.runtimeReady, true);
  assert.equal(body.includes("very-secret-password"), false);
  assert.equal(body.includes("admin-secret-token-that-must-not-print"), false);
  assert.equal(body.includes("line-token-that-must-not-print"), false);
  assert.equal(body.includes("line-secret-that-must-not-print"), false);
  assert.equal(body.includes("meta-secret-that-must-not-print"), false);
});

test("wrangler contract rejects secret-like vars in public config", () => {
  const dir = mkdtempSync(join(tmpdir(), "sirinx-runtime-contract-"));
  const wranglerPath = join(dir, "wrangler.jsonc");
  writeFileSync(
    wranglerPath,
    JSON.stringify({
      vars: {
        SIRINX_API_HOSTING_STRATEGY: "node-backend-origin",
        SIRINX_API_ORIGIN: "https://api.sirinx.co",
        SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "false",
        SIRINX_EXTERNAL_SENDS_ENABLED: "false",
        SIRINX_DATABASE_URL: "postgres://user:secret@example.test/db"
      }
    })
  );

  const report = inspectWranglerRuntimeContract({
    wranglerPath: pathToFileURL(wranglerPath)
  });

  assert.equal(report.ok, false);
  assert.equal(
    report.findings.some((finding) => finding.includes("SIRINX_DATABASE_URL")),
    true
  );
});

test("env example contract requires private placeholders to remain blank", () => {
  const dir = mkdtempSync(join(tmpdir(), "sirinx-env-example-"));
  const envExamplePath = join(dir, ".env.example");
  writeFileSync(
    envExamplePath,
    [
      "SIRINX_DATABASE_URL=postgres://user:secret@example.test/db",
      "SIRINX_DB_SSL_MODE=require",
      "SIRINX_LINE_CHANNEL_ACCESS_TOKEN=",
      "SIRINX_LINE_ALLOWED_RECIPIENTS=",
      "SIRINX_EXTERNAL_SENDS_ENABLED=false",
      "SIRINX_ADMIN_API_TOKEN=",
      "SIRINX_ADMIN_LOCAL_DEV_BYPASS=false",
      "SIRINX_LINE_CHANNEL_SECRET=",
      "SIRINX_META_APP_SECRET=",
      "SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED=false",
      "SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS=300",
      "SIRINX_DB_DRY_RUN_MODE=validate-only",
      "SIRINX_ALLOW_DB_MUTATION=false",
      "SIRINX_API_HOSTING_STRATEGY=node-backend-origin",
      "SIRINX_API_ORIGIN=https://api.sirinx.co",
      "SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED=false",
      "SIRINX_STAGING_ORIGIN="
    ].join("\n")
  );

  const report = inspectEnvExampleContract({
    envExamplePath: pathToFileURL(envExamplePath)
  });

  assert.equal(report.ok, false);
  assert.equal(
    report.findings.includes("private_env_example_must_be_blank:SIRINX_DATABASE_URL"),
    true
  );
});

test("functions contract allows only safe Pages proxy env references", () => {
  const dir = mkdtempSync(join(tmpdir(), "sirinx-functions-contract-"));
  mkdirSync(join(dir, "api"), { recursive: true });
  const functionPath = join(dir, "api", "index.js");
  writeFileSync(
    functionPath,
    "export function onRequest(context) { return context.env.SIRINX_LINE_CHANNEL_SECRET; }\n"
  );

  const report = inspectFunctionsRuntimeContract({
    rootDir: pathToFileURL(dir),
    functionsRoot: pathToFileURL(dir)
  });

  assert.equal(report.ok, false);
  assert.equal(
    report.findings.some((finding) => finding.includes("SIRINX_LINE_CHANNEL_SECRET")),
    true
  );
});
