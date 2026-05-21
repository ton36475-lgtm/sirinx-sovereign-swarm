import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectDbEnv } from "../../packages/lead-core/src/dbEnvGate.mjs";

test("DB env gate blocks when required env is missing without printing values", () => {
  const result = inspectDbEnv({});
  assert.equal(result.productionReady, false);
  assert.deepEqual(result.missing, ["SIRINX_DATABASE_URL", "SIRINX_DB_SSL_MODE"]);
  assert.equal(result.redaction, "values_not_printed");
});

test("DB env gate passes with required presence and allowed SSL mode", () => {
  const result = inspectDbEnv({
    SIRINX_DATABASE_URL: "postgres://example.invalid/db",
    SIRINX_DB_SSL_MODE: "require"
  });
  assert.equal(result.productionReady, true);
  assert.equal(result.present.SIRINX_DATABASE_URL, true);
  assert.equal(result.present.SIRINX_DB_SSL_MODE, true);
});

test("DB env gate rejects unsupported SSL mode", () => {
  const result = inspectDbEnv({
    SIRINX_DATABASE_URL: "postgres://example.invalid/db",
    SIRINX_DB_SSL_MODE: "disable"
  });
  assert.equal(result.productionReady, false);
  assert.equal(result.checks.sslModeAllowed, false);
});
