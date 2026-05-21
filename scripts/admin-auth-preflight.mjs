import { inspectAdminAuthEnv } from "../packages/admin-auth/src/adminAuthGate.mjs";

const admin = inspectAdminAuthEnv(process.env);

console.log(JSON.stringify({
  status: admin.productionReady ? "ready" : "blocked",
  productionReady: admin.productionReady,
  admin,
  guardrail: "no admin connection attempted; no token value printed"
}, null, 2));
