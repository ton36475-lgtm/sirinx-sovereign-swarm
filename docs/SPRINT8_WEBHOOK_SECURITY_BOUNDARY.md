# Sprint 8 Webhook Security Boundary

## Scope

Sprint 8 adds a fail-closed security boundary for future LINE and Meta webhooks.

Implemented locally:

- raw-body HMAC verification for LINE `x-line-signature`
- raw-body HMAC verification for Meta `x-hub-signature-256`
- timestamp replay window using `x-sirinx-webhook-timestamp`
- in-memory replay cache for local proof
- in-memory rate limiter abstraction for local proof
- backend-only `webhook_security_audit_logs` migration
- redacted webhook security preflight
- `/webhooks/line` and `/webhooks/meta` return verified-but-disabled responses

Not implemented:

- no real LINE/Facebook production processing
- no external SaaS write
- no queue enqueue from signed social webhooks
- no public Bueng Phra inbound route
- no token, signature, raw body, or secret logging

## Env

Required before production readiness:

```text
SIRINX_LINE_CHANNEL_SECRET=
SIRINX_META_APP_SECRET=
SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED=false
SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS=300
```

`SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED` must remain `false` until a signed production smoke test and human approval exist.

## Local Behavior

`POST /webhooks/line`

1. reads raw request body
2. checks rate limit
3. verifies `x-line-signature`
4. verifies `x-sirinx-webhook-timestamp`
5. rejects replayed payload/signature/timestamp tuples
6. writes a security audit record
7. returns `verified_processing_disabled`

`POST /webhooks/meta`

Same flow, using `x-hub-signature-256`.

## Audit Boundary

`webhook_security_audit_logs` stores only decision metadata:

- provider
- route and method
- status/reason
- boolean signature/replay/rate-limit flags
- replay key hash
- metadata confirming raw body/signature/secret were not stored

It must never store raw bodies, raw signatures, PII, or secret values.

## Verification

```bash
npm test
npm run sprint8:gate
npm run webhook-security:preflight
```

Expected preflight status without production secrets is `blocked`. This is correct for local development.
