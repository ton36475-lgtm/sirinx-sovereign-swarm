import { runStagingNetworkSmoke } from "../packages/deploy-readiness/src/stagingNetworkSmoke.mjs";

const report = await runStagingNetworkSmoke();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  process.exitCode = 1;
}
