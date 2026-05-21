import { runSignedWebhookSmoke } from "../packages/webhook-security/src/signedWebhookSmoke.mjs";

const result = await runSignedWebhookSmoke();

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
