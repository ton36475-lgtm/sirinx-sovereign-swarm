import { buildMigrationReadinessReport } from "../packages/migration-readiness/src/migrationReadinessGate.mjs";

const report = buildMigrationReadinessReport({
  env: process.env
});

console.log(JSON.stringify(report, null, 2));

if (!report.migrations.ok || !report.plan.ok || !report.dryRun.modeAllowed) {
  process.exitCode = 1;
}
