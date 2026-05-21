# Workflow Pipeline Map

This document is the operator-facing map for the current local SIRINX Sovereign Agentic Swarm v2.1 pipeline.

It is intentionally read-only:

- no external SaaS writes
- no social auto-replies
- no database mutation
- no secret values printed
- no Bueng Phra public inbound route

## Command

```bash
npm run workflow:pipeline
```

The command prints a JSON report with:

- implemented stages
- end-to-end flows
- redacted readiness state
- blocked production components
- production blockers
- runnable debug commands
- guardrail invariants

## Current Flow

```mermaid
flowchart TD
  A["Website calculator"] --> B["POST /api/solar-estimate"]
  B --> C["lead.intent_detected"]
  C --> D["Schema validation and idempotency"]
  D --> E["Queue enqueue"]
  E --> F["Queue consumer with retries"]
  F --> G["OPAL static tier match"]
  G --> H["Hermes draft mock"]
  H --> I["Lead Core local store or DB adapter"]
  I --> J["Agent audit log"]
  J --> K["Human approval queue"]
  K --> L["Gated reply outbox"]
  L --> M["Send-disabled worker"]
```

## Security Boundary Flow

```mermaid
flowchart TD
  A["POST /webhooks/line or /webhooks/meta"] --> B["Provider signature verification"]
  B --> C["Replay window check"]
  C --> D["Rate limit check"]
  D --> E["Webhook security audit"]
  E --> F["verified_processing_disabled"]
  F --> G["queued=false"]
```

## Failure Flow

```mermaid
flowchart TD
  A["force_error event"] --> B["retry 1"]
  B --> C["retry 2"]
  C --> D["retry 3"]
  D --> E["dead_letter_events"]
  E --> F["POST /dlq/replay/:deadLetterId"]
  F --> G["reprocess with patch"]
  G --> H["DLQ replay audit"]
```

## Production Rule

Production remains blocked until the report returns `productionReady=true`, a real staging DB dry-run has passed with rollback verification, admin access is behind the approved boundary, and LINE/Meta/LINE OA runtime secrets are configured without printing values.
