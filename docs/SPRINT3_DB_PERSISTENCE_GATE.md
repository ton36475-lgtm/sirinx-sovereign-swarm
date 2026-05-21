# Sprint 3 DB Persistence Gate

## Scope

Sprint 3 prepares real database persistence without mutating a live Supabase project.

Implemented:

- Postgres Lead Core adapter with injected `query(sql, values)`
- Async-compatible queue processor
- env-safe DB readiness gate
- migration validator
- RLS baseline migration
- rollback draft
- adapter contract tests

## Access Model

The public browser never writes directly to Supabase.

```text
browser
-> SIRINX backend API
-> queue / OPAL / Hermes
-> Lead Core adapter
-> Supabase/Postgres using server-side credentials
```

## Required Environment

Use a private runtime env file or host secret manager.

Never print values.

```bash
SIRINX_DATABASE_URL=
SIRINX_DB_SSL_MODE=require
```

Allowed SSL modes:

- `require`
- `verify-full`

## Preflight

```bash
npm run db:preflight
```

Current expected local result without env:

```json
{
  "status": "blocked",
  "productionReady": false,
  "guardrail": "no database connection attempted; no secret values printed"
}
```

## RLS Baseline

Migration:

`infra/supabase/migrations/002_lead_core_rls_policies.sql`

Behavior:

- revoke direct `anon` and `authenticated` table access
- grant backend-only table access to `service_role`
- enable RLS
- force RLS
- add table comments documenting the data boundary

## Rollback

Rollback draft:

`infra/supabase/rollback/002_lead_core_rls_policies.rollback.sql`

This file must not be run in production without explicit human approval.

## Production Not Ready Until

- real Supabase project target is confirmed
- migration dry-run succeeds in staging/local DB
- rollback is verified in staging/local DB
- `SIRINX_DATABASE_URL` and SSL mode are configured in private runtime env
- dashboard/human approval model is chosen
- RLS policies are reviewed against the exact access model
