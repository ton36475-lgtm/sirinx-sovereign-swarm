# Work Review And Pending Backlog

## Completed Local Baseline

| Sprint | Result |
| --- | --- |
| Sprint 1 | Mock webhook gateway, event schema, idempotency, queue, retry, DLQ, OPAL static pricing, Hermes draft, audit trail |
| Sprint 2 | Local calculator, `POST /api/solar-estimate`, LINE handoff URL, duplicate guard |
| Sprint 3 | Postgres adapter contract, DB env preflight, migration validator, RLS migration and rollback |
| Sprint 4 | Human approval queue, approve/reject APIs, admin console, reply draft migration |
| Sprint 5 | Gated reply outbox, queue/cancel APIs, admin outbox console, outbox migration |
| Sprint 6 | Channel gate simulator, redacted LINE env inspection, send-disabled worker, blocked outbox audit |
| Sprint 7 | Admin auth boundary, token gate, explicit local-dev bypass, admin access audit |
| Sprint 8 | LINE/Meta webhook signature gate, replay window, rate limiter abstraction, webhook security audit |
| Sprint 9 | Migration readiness gate, rollback coverage inspection, signed LINE/Meta webhook smoke harness |
| Debug Pipeline | Read-only workflow pipeline report, stage/flow map, redacted readiness state, production blocker visibility |
| Sprint 10 | Cloudflare Pages config, `/api/*` Pages proxy to Node backend origin, deploy readiness gate |

## Production Blockers

1. Confirm actual hosting topology.
2. Configure private database env without printing values.
3. Run DB migration dry-run in a real staging or local Supabase database.
4. Verify rollback in the same staging/local DB class.
5. Put admin behind Cloudflare Access or equivalent.
6. Configure private admin token/runtime env without printing values.
7. Configure production LINE/Meta webhook secrets without printing values.
8. Run signed webhook smoke tests against staging origin before enabling production processing.
9. Configure LINE OA recipient/token and message send gate.
10. Add a send worker that can only send approved outbox items.
11. Add production smoke tests that prove `external_send_performed` only changes after real send response.
12. Add proposal PDF as draft-only output after approval.
13. Add Ghost Claw only as design draft with engineer review.

## Current Safe Next Move

Run the Sprint 10 controlled staging/deploy readiness sequence:

- run `npm run workflow:pipeline` before every deploy discussion to confirm no safety boundary regressed
- run `npm run deploy:readiness` to confirm Cloudflare Pages config and Node backend origin proxy boundaries
- configure a local or staging DB target without printing credentials
- run `npm run migration:readiness` with `SIRINX_DB_DRY_RUN_MODE=local` or `staging`
- only then run actual DB migration dry-run in that target
- add a network smoke mode for signed webhooks against staging origin
- keep all production processing disabled until human approval
