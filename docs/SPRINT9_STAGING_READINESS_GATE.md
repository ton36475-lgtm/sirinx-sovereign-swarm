# Sprint 9 Staging Readiness Gate

## Scope

Sprint 9 prepares the system for a future staging deployment without connecting to a real database or external SaaS by default.

Implemented locally:

- migration sequence and rollback coverage inspection
- dry-run mode guard for `validate-only`, `local`, and `staging`
- explicit database mutation gate with `SIRINX_ALLOW_DB_MUTATION`
- signed webhook smoke harness for LINE and Meta
- combined `npm run sprint9:gate`

Not implemented:

- no real Supabase migration execution
- no production deploy
- no external webhook call
- no LINE/Facebook processing
- no secret value output

## Env

```text
SIRINX_DB_DRY_RUN_MODE=validate-only
SIRINX_ALLOW_DB_MUTATION=false
```

`validate-only` is the safe default. `local` or `staging` modes are advisory unless `SIRINX_ALLOW_DB_MUTATION=true` is explicitly set in a controlled target.

## Commands

```bash
npm run migration:readiness
npm run webhook:smoke:signed
npm run sprint9:gate
```

## Migration Readiness Behavior

`npm run migration:readiness` verifies:

- migrations are sequential
- every migration after `001` has a rollback file
- migration validator still passes RLS and grant checks
- no destructive forward migration pattern is present
- database URL and SSL mode are redacted
- advisory commands are printed without values and not executed

## Signed Webhook Smoke Behavior

`npm run webhook:smoke:signed` runs the gateway in-process and verifies:

- `/health` reports the current Sprint 9 readiness boundary
- `/solar-calculator` remains public
- signed LINE webhook returns `verified_processing_disabled`
- repeated LINE webhook returns `replay_detected`
- invalid LINE signature returns `signature_invalid`
- signed Meta webhook returns `verified_processing_disabled`
- no external write is performed
- ephemeral smoke secrets are not printed

## Production Rule

Keep `SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED=false` until:

1. DB migrations have passed in a real local/staging target.
2. Rollback has been verified in the same class of target.
3. Cloudflare/admin boundary is configured.
4. LINE/Meta secrets are stored in runtime env without printing values.
5. Human approval explicitly authorizes production smoke.
