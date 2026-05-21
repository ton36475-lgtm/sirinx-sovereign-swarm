import { inspectLineChannelEnv } from "../packages/channel-gate/src/lineChannelGate.mjs";

const line = inspectLineChannelEnv(process.env);

console.log(JSON.stringify({
  status: line.productionReady ? "ready" : "blocked",
  productionReady: line.productionReady,
  line,
  guardrail: "no channel connection attempted; no token or recipient values printed"
}, null, 2));
