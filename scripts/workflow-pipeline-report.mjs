import { buildWorkflowPipelineReport } from "../packages/workflow-pipeline/src/workflowPipelineMap.mjs";

const report = buildWorkflowPipelineReport();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.validation.ok) {
  process.exitCode = 1;
}
