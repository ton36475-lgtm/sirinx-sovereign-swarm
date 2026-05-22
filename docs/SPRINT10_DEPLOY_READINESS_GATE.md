# Sprint 10 Deploy Readiness Gate

## Scope

Sprint 10 adds controlled deployment readiness only. It does not deploy, push, mutate Cloudflare, mutate Supabase, send LINE messages, or enable social webhook processing.

Implemented locally:

- `wrangler.jsonc` for the Cloudflare Pages surface
- Pages Function proxy skeleton at `functions/api/[[path]].js`
- Node backend origin strategy through `SIRINX_API_ORIGIN`
- read-only deploy readiness report
- runtime environment contract linkage from Sprint 12
- deploy readiness tests
- updated Sprint 10 gate

## Hosting Strategy

Current strategy:

```text
Cloudflare Pages static frontend
-> Pages Function /api/* proxy
-> Node backend origin https://api.sirinx.co
-> Lead Core / OPAL / Hermes / Queue / DLQ runtime
```

This keeps the existing Node backend as the backend source of truth while letting the public Pages site call `/api/*` without exposing private service topology in frontend code.

## Public Vars In `wrangler.jsonc`

The config may contain non-secret public deployment controls:

- `SIRINX_API_HOSTING_STRATEGY=node-backend-origin`
- `SIRINX_API_ORIGIN=https://api.sirinx.co`
- `SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED=false`
- `SIRINX_EXTERNAL_SENDS_ENABLED=false`

Do not put database URLs, service-role keys, LINE tokens, channel secrets, Meta secrets, or admin tokens in `vars`.

## Commands

```bash
npm run deploy:readiness
npm run sprint10:gate
```

## Readiness Behavior

`npm run deploy:readiness` verifies:

- `wrangler.jsonc` exists and has `name`, `pages_build_output_dir`, and `compatibility_date`
- Pages output directory exists
- public vars are present and do not use secret-like key names
- API origin is HTTPS origin-only and has no embedded credentials
- social webhook processing and external sends remain disabled in config
- Pages Function proxy exists and uses only `SIRINX_API_ORIGIN`
- Pages `_routes.json` invokes Functions only for `/api/*`
- runtime environment contract is structurally ready and private values are not printed
- network smoke remains disabled unless explicitly enabled
- workflow pipeline still reports no external writes

## Production Rule

Production remains blocked until:

1. Runtime env is configured without printing secrets.
2. DB readiness passes in local or staging mode.
3. Rollback is verified in the same target class.
4. Admin routes are behind Cloudflare Access or equivalent.
5. Signed webhook smoke passes against a staging origin.
6. LINE send worker can prove `external_send_performed=true` only after an approved real provider response.

## References

- Cloudflare Pages Functions: https://developers.cloudflare.com/pages/functions/
- Cloudflare Pages Wrangler configuration: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
