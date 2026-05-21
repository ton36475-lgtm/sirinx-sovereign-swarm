# Sprint 2 Local Calculator Proof

## Scope

Sprint 2 extends Sprint 1 with a browser-visible local calculator and API:

- `GET /solar-calculator`
- `POST /api/solar-estimate`
- OPAL static tier response
- Hermes draft response
- LINE handoff URL generation
- duplicate submission protection
- audit trail through the same Sprint 1 Lead Core path

## Data Boundary

The local calculator currently collects only estimate context:

- current bill
- target saving
- customer type
- usage pattern
- phase type
- province
- consent checkbox

It does not collect name, phone, email, LINE user id, bill upload, roof image, or private PII.

## Processing Path

```text
browser form
-> POST /api/solar-estimate
-> create lead.intent_detected event
-> Webhook Gateway idempotency
-> in-memory queue
-> OPAL tier matcher
-> Hermes draft mock
-> Lead Core in-memory store
-> audit log
-> response with LINE handoff URL
```

## Run

```bash
cd /Users/sirinx/sirinx-sovereign-swarm
node apps/webhook-gateway/src/index.mjs
```

Open:

```text
http://127.0.0.1:8787/solar-calculator
```

## Gate

```bash
npm run sprint2:gate
```

Expected:

- OPAL `PRO` for `home_office + daytime_heavy + current_bill 4000`
- no non-OPAL price in Hermes draft
- duplicate calculator submission is blocked
- no production social webhook is enabled
- no Bueng Phra inbound exposure

## Still Not Production

Before production:

- replace in-memory Lead Core with Supabase/Postgres through migrations and RLS review
- add platform signature verification for LINE and Meta
- add rate limiting
- configure secret manager
- add consented PII capture
- add human approval dashboard
- run DB preflight and rollback gate
