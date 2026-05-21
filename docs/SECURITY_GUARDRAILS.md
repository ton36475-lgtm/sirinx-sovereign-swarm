# Security Guardrails

## Hard Blocks

- No AI-created pricing.
- No AI-created discounts.
- No guaranteed savings claims.
- No production social webhook processing until signature, replay, staging smoke, and human approval gates pass.
- No third-party scraping or auto-commenting.
- No PII before consent.
- No raw PII to Cloud Judge.
- No webhook processing before signature verification in production.
- No public inbound port to Bueng Phra Node.
- No exposed secrets, tokens, API keys, internal dashboards, or private endpoints.

## Sprint 1 Boundary

`/webhooks/mock` is the only enabled webhook endpoint.

## Sprint 8+ Social Webhook Boundary

`/webhooks/line` and `/webhooks/meta` verify signatures and replay controls first, then return `verified_processing_disabled` while `SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED=false`.

They do not enqueue, process, or write externally until staging proof and human approval are complete.

## Sprint 2 Local Calculator Boundary

`/api/solar-estimate` accepts estimate context only and creates a local dry-run event through the existing queue and audit path. It does not collect direct PII, does not create a final quotation, and does not send an external LINE message. The returned LINE URL is a handoff link for the human operator/customer action.

## Prompt Injection

Detected injection routes to `human_review_only` with `risk_level = high`.

## DLQ

Failed events are not dropped. After retry exhaustion, they are stored in DLQ and can be replayed with audit trail.
