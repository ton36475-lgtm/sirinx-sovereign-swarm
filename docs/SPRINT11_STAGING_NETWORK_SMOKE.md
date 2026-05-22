# Sprint 11 Staging Network Smoke

## Scope

Sprint 11 adds route hardening and a disabled-by-default staging network smoke harness. It does not deploy, push, mutate Cloudflare, mutate Supabase, send LINE messages, or enable social webhook processing.

Implemented locally:

- `_routes.json` in the Pages output directory to invoke Functions only for `/api/*`
- deploy readiness validation for `_routes.json`
- `npm run staging:smoke`
- staging smoke tests with injected fake fetch
- `npm run sprint11:gate`

## Pages Function Invocation Boundary

`apps/www/static/_routes.json`:

```json
{
  "version": 1,
  "include": ["/api/*"],
  "exclude": []
}
```

This keeps the Pages proxy scoped to API calls and prevents static marketing pages from invoking the Function.

## Staging Smoke Env

The staging network smoke command is skipped unless all required env exists:

```text
SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED=true
SIRINX_STAGING_ORIGIN=https://staging.example.com
SIRINX_LINE_CHANNEL_SECRET=...
SIRINX_META_APP_SECRET=...
```

The command never prints secret values.

## Staging Smoke Flow

When explicitly enabled, `npm run staging:smoke` performs:

- `GET /health`
- `GET /solar-calculator`
- signed `POST /webhooks/line`
- replayed signed `POST /webhooks/line`
- bad-signature `POST /webhooks/line`
- signed `POST /webhooks/meta`

Expected result: webhooks verify but remain `verified_processing_disabled`, `queued=false`, and no external write occurs.

## References

- Cloudflare Pages Functions routing: https://developers.cloudflare.com/pages/functions/routing/
- Cloudflare Pages Functions bindings: https://developers.cloudflare.com/pages/functions/bindings/
