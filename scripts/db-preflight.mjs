import { inspectDbEnv } from "../packages/lead-core/src/dbEnvGate.mjs";
import { validateMigrationFiles } from "./validate-migrations.mjs";

const envResult = inspectDbEnv(process.env);
const migrationResult = validateMigrationFiles();
const productionReady = envResult.productionReady && migrationResult.ok;

console.log(JSON.stringify({
  status: productionReady ? "ready" : "blocked",
  productionReady,
  env: envResult,
  migrations: migrationResult,
  guardrail: "no database connection attempted; no secret values printed"
}, null, 2));

if (!migrationResult.ok) {
  process.exitCode = 1;
}
