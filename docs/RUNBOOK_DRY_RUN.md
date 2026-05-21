# Dry Run Runbook

## Run All Gates

```bash
cd /Users/sirinx/sirinx-sovereign-swarm
npm test
npm run sprint2:gate
```

## Expected Valid Flow

Fixture:

`tests/fixtures/evt_test_001.json`

Expected:

- gateway accepts event with `202`
- duplicate event returns `duplicate_ignored`
- queue contains one message
- consumer processes message
- OPAL returns `PRO`
- Hermes draft uses `315,000` only as package price
- one lead event is saved
- one solar estimate is saved
- one Hermes audit log is saved
- no DLQ row is created

## Manual Gateway

```bash
node apps/webhook-gateway/src/index.mjs
curl -s http://127.0.0.1:8787/health
```

## Local Calculator Proof

```bash
node apps/webhook-gateway/src/index.mjs
open http://127.0.0.1:8787/solar-calculator
```

API:

```text
POST /api/solar-estimate
```

The API builds a `lead.intent_detected` event and runs it through the same queue, OPAL, Hermes, Lead Core, and audit path. It does not create a final quotation.
