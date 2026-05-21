import { startWebhookGateway } from "./server.mjs";

const port = Number(process.env.PORT || 8787);
const gateway = startWebhookGateway({ port });

console.log(JSON.stringify({
  status: "listening",
  service: "webhook-gateway",
  port,
  social_webhooks: "disabled_in_sprint_1",
  bueng_phra_inbound: "not_exposed"
}));

process.on("SIGINT", () => {
  gateway.server.close(() => process.exit(0));
});
