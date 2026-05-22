import { buildRuntimeEnvContractReport } from "../packages/runtime-env-contract/src/runtimeEnvContract.mjs";

const report = buildRuntimeEnvContractReport();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.validation.ok || !report.contractReady) {
  process.exitCode = 1;
}
