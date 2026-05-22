# Sprint 12 Runtime Environment Contract

## Objective

Sprint 12 adds a read-only environment contract gate before real deploy work. It separates Cloudflare Pages public vars from private runtime secrets and blocks readiness when secret-like keys appear in public config or static frontend assets.

The gate does not write to Cloudflare, Supabase, LINE, Meta, or any production system.

## Contract

Public values allowed in `wrangler.jsonc`:

```text
SIRINX_API_HOSTING_STRATEGY
SIRINX_API_ORIGIN
SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED
SIRINX_EXTERNAL_SENDS_ENABLED
```

Private runtime env values must be configured only in the hosting/runtime secret store:

```text
SIRINX_DATABASE_URL
SIRINX_ADMIN_API_TOKEN
SIRINX_LINE_CHANNEL_ACCESS_TOKEN
SIRINX_LINE_CHANNEL_SECRET
SIRINX_META_APP_SECRET
```

Operational config expected in runtime env:

```text
SIRINX_DB_SSL_MODE=require
SIRINX_LINE_ALLOWED_RECIPIENTS=...
SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS=300
SIRINX_ADMIN_LOCAL_DEV_BYPASS=false
SIRINX_ALLOW_DB_MUTATION=false
```

Staging network smoke remains disabled until explicitly enabled:

```text
SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED=false
SIRINX_STAGING_ORIGIN=
```

## Gate

Run:

```bash
npm run runtime-env:contract
npm run sprint12:gate
```

The gate checks:

- `wrangler.jsonc` contains only approved public vars
- secret-like names such as `SECRET`, `TOKEN`, `DATABASE_URL`, `SERVICE_ROLE`, and `API_KEY` do not appear in `vars`
- `.env.example` contains all required names but leaves private placeholders blank
- static frontend files do not reference private env keys
- Pages Functions reference only allowed public proxy vars
- runtime env presence is reported as booleans only, never raw values

## Current Result

The repository is contract-ready locally. Production readiness remains blocked until private runtime env is configured in the actual runtime and the existing migration, workflow, deploy readiness, and staging smoke gates pass.

## Cloudflare Notes

Cloudflare Pages Functions receive bindings through the `context.env` object, so this repo keeps only the public proxy origin in Pages config and keeps sensitive values out of static assets. Secrets should be configured through the platform secret/env mechanism rather than committed config.

## References

- Cloudflare Pages Functions bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Workers environment variables: https://developers.cloudflare.com/workers/configuration/environment-variables/
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
