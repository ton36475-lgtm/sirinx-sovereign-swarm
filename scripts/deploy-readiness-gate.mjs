import { buildDeployReadinessReport } from "../packages/deploy-readiness/src/deployReadinessGate.mjs";

const report = buildDeployReadinessReport();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.validation.ok) {
  process.exitCode = 1;
}
