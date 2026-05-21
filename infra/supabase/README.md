# Supabase Lead Core

Sprint 3 prepares database persistence but does not run migrations automatically.

## Migration Order

1. `001_lead_core_minimal.sql`
2. `002_lead_core_rls_policies.sql`
3. `003_reply_draft_approval_queue.sql`
4. `004_reply_outbox_gated_send.sql`
5. `005_reply_outbox_channel_gate.sql`
6. `006_admin_access_audit.sql`

## Access Model

Lead Core is backend-only.

- `anon`: no direct table grants
- `authenticated`: no direct table grants
- `service_role`: server-side access only

The public calculator must call the backend API. It must not write directly to Supabase from browser code.

## Required Production Env

The preflight checks only for presence and never prints values:

- `SIRINX_DATABASE_URL`
- `SIRINX_DB_SSL_MODE=require` or `verify-full`
- `SIRINX_LINE_CHANNEL_ACCESS_TOKEN` only in the production channel runtime
- `SIRINX_LINE_ALLOWED_RECIPIENTS` only in the production channel runtime
- `SIRINX_EXTERNAL_SENDS_ENABLED=true` only after explicit production approval
- `SIRINX_ADMIN_API_TOKEN` only in backend/admin runtime
- `SIRINX_ADMIN_LOCAL_DEV_BYPASS=false` in production

## Preflight

```bash
npm run db:preflight
```

The command validates environment readiness and migration guardrails without attempting a network connection.

## Rollback

Rollback SQL is stored in `infra/supabase/rollback/`. It is for staged rollback review only and must not be run in production without explicit human approval.
