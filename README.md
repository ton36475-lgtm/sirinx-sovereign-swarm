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
node apps/webhook-gateway/src/index.mjs
```

This repository intentionally uses Node built-ins for Sprint 1 so the gate can run without dependency installation.
