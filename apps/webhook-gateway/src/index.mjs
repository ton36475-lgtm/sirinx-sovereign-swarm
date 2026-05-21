import { startWebhookGateway } from "./server.mjs";

const port = Number(process.env.PORT || 8787);
const gateway = startWebhookGateway({ port });

console.log(JSON.stringify({
  status: "listening",
  service: "webhook-gateway",
  port,
  social_webhooks: "verify_then_disabled_in_sprint_8",
  bueng_phra_inbound: "not_exposed"
}));

process.on("SIGINT", () => {
  gateway.server.close(() => process.exit(0));
});
