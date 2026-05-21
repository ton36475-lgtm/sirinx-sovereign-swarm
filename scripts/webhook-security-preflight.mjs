import { inspectWebhookSecurityEnv } from "../packages/webhook-security/src/webhookSecurityGate.mjs";

const result = inspectWebhookSecurityEnv(process.env);

console.log(JSON.stringify({
  status: result.productionReady ? "ready" : "blocked",
  productionReady: result.productionReady,
  signatureGateReady: result.signatureGateReady,
  webhook: result,
  guardrail: "no webhook connection attempted; no secret values or signatures printed"
}, null, 2));
