# SIRINX Sovereign Agentic Swarm v2.1

Local-first implementation for the event pipeline and guarded deploy-readiness path:

`Webhook Gateway -> Queue -> DLQ -> OPAL Static Pricing -> Hermes Draft Mock -> Lead Core Minimal`

## Non-negotiable boundaries

- No production LINE/Facebook webhook integration in Sprint 1.
- No third-party scraping or public-channel auto-commenting.
- No dynamic pricing.
- No Ghost Claw final design.
- No proposal PDF generation.
- No public inbound route to Bueng Phra Node.
- No secrets in repository or console output.
- Hermes draft may only use OPAL package prices and must not offer discounts or guarantee savings.

## Local commands

```bash
npm test
npm run sprint1:gate
npm run sprint2:gate
npm run sprint3:gate
npm run sprint4:gate
npm run sprint5:gate
npm run sprint6:gate
npm run sprint7:gate
npm run sprint8:gate
npm run sprint9:gate
npm run db:preflight
npm run channel:preflight
npm run admin-auth:preflight
npm run webhook-security:preflight
npm run migration:readiness
npm run webhook:smoke:signed
npm run workflow:pipeline
npm run deploy:readiness
npm run runtime-env:contract
npm run staging:smoke
npm run sprint10:gate
npm run sprint11:gate
npm run sprint12:gate
node apps/webhook-gateway/src/index.mjs
```

This repository intentionally uses Node built-ins for Sprint 1 so the gate can run without dependency installation.

Open the local calculator after starting the gateway:

```text
http://127.0.0.1:8787/solar-calculator
http://127.0.0.1:8787/admin/reply-queue
http://127.0.0.1:8787/admin/outbox
```

Database persistence preparation is documented in:

`docs/SPRINT3_DB_PERSISTENCE_GATE.md`

Human approval queue is documented in:

`docs/SPRINT4_HUMAN_APPROVAL_QUEUE.md`

Gated reply outbox is documented in:

`docs/SPRINT5_GATED_REPLY_OUTBOX.md`

Channel gate simulator is documented in:

`docs/SPRINT6_CHANNEL_GATE_SIMULATOR.md`

Admin auth boundary is documented in:

`docs/SPRINT7_ADMIN_AUTH_BOUNDARY.md`

Webhook signature/replay boundary is documented in:

`docs/SPRINT8_WEBHOOK_SECURITY_BOUNDARY.md`

Staging readiness gate is documented in:

`docs/SPRINT9_STAGING_READINESS_GATE.md`

Deploy readiness gate is documented in:

`docs/SPRINT10_DEPLOY_READINESS_GATE.md`

Staging network smoke gate is documented in:

`docs/SPRINT11_STAGING_NETWORK_SMOKE.md`

Runtime environment contract gate is documented in:

`docs/SPRINT12_RUNTIME_ENV_CONTRACT.md`
