# Sprint 7 Admin Auth Boundary

## Objective

Sprint 7 adds a fail-closed operator boundary around local admin pages and admin APIs before any production dashboard, Cloudflare Access, or LINE/Facebook send worker is connected.

This sprint does not add production identity, OAuth, Supabase Auth, Cloudflare Access, or external writes. It adds the local contract those layers must satisfy later.

## Implemented

- `packages/admin-auth` with token-based admin request authorization.
- Redacted admin auth env inspection.
- `npm run admin-auth:preflight`.
- Admin guard for:
  - `/admin/*`
  - `/api/admin/*`
- Explicit local-dev bypass only when `SIRINX_ADMIN_LOCAL_DEV_BYPASS=true` and the request is loopback.
- Admin access audit trail in memory and Postgres adapter.
- Supabase migration `006_admin_access_audit.sql` and rollback draft.

## Required Env Names

Values are never printed by the preflight or auth failure response.

- `SIRINX_ADMIN_API_TOKEN`
- `SIRINX_ADMIN_LOCAL_DEV_BYPASS=false`

For local browser-only review, an operator may explicitly run with:

```text
SIRINX_ADMIN_LOCAL_DEV_BYPASS=true
```

This is not production ready and is reported as blocked by preflight.

## Request Contract

Admin API requests must include:

```text
x-sirinx-admin-token: <private operator token>
x-sirinx-admin-actor: <operator label>
```

Failure modes:

- `401 admin_token_not_configured`
- `401 admin_token_missing`
- `403 admin_token_invalid`

## Guardrails

- Public calculator routes stay open.
- Admin pages and admin APIs fail closed by default.
- Token values are never stored in audit logs.
- Audit rows store route, method, allow/deny, status, reason, actor ref, and auth mode.
- No production send, social webhook, Supabase migration execution, or external SaaS write is performed.

## Verification

```bash
npm run sprint7:gate
npm run admin-auth:preflight
```

Expected:

- admin API without token returns 401
- admin API with wrong token returns 403
- admin API with valid token succeeds
- admin page without token returns 401
- public calculator still returns 200
- admin preflight remains blocked until a private token is configured and local bypass is disabled
