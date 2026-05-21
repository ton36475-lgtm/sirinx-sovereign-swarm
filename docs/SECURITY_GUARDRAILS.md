# Security Guardrails

## Hard Blocks

- No AI-created pricing.
- No AI-created discounts.
- No guaranteed savings claims.
- No production social webhooks in Sprint 1.
- No third-party scraping or auto-commenting.
- No PII before consent.
- No raw PII to Cloud Judge.
- No webhook processing before signature verification in production.
- No public inbound port to Bueng Phra Node.
- No exposed secrets, tokens, API keys, internal dashboards, or private endpoints.

## Sprint 1 Boundary

`/webhooks/mock` is the only enabled webhook endpoint.

`/webhooks/line` and `/webhooks/meta` return `501 not_enabled_in_sprint_1`.

## Sprint 2 Local Calculator Boundary

`/api/solar-estimate` accepts estimate context only and creates a local dry-run event through the existing queue and audit path. It does not collect direct PII, does not create a final quotation, and does not send an external LINE message. The returned LINE URL is a handoff link for the human operator/customer action.

## Prompt Injection

Detected injection routes to `human_review_only` with `risk_level = high`.

## DLQ

Failed events are not dropped. After retry exhaustion, they are stored in DLQ and can be replayed with audit trail.
