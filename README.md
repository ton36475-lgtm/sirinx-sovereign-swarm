# SIRINX Sovereign Agentic Swarm v2.1

Sprint 1 local-first implementation for the event pipeline:

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
npm run db:preflight
node apps/webhook-gateway/src/index.mjs
```

This repository intentionally uses Node built-ins for Sprint 1 so the gate can run without dependency installation.

Open the local calculator after starting the gateway:

```text
http://127.0.0.1:8787/solar-calculator
http://127.0.0.1:8787/admin/reply-queue
```

Database persistence preparation is documented in:

`docs/SPRINT3_DB_PERSISTENCE_GATE.md`

Human approval queue is documented in:

`docs/SPRINT4_HUMAN_APPROVAL_QUEUE.md`
