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

## Production Blockers

1. Confirm actual hosting topology.
2. Configure private database env without printing values.
3. Run DB migration dry-run in a staging or local Supabase database.
4. Verify rollback in staging/local DB.
5. Add authentication for `/admin/*`.
6. Put admin behind Cloudflare Access or equivalent.
7. Implement production webhook signature verification for LINE and Meta.
8. Add rate limiting and replay protection for real webhooks.
9. Configure LINE OA recipient/token and message send gate.
10. Add a send worker that can only send approved outbox items.
11. Add production smoke tests that prove `external_send_performed` only changes after real send response.
12. Add proposal PDF as draft-only output after approval.
13. Add Ghost Claw only as design draft with engineer review.

## Current Safe Next Move

Build Sprint 7 as authenticated operator boundary:

- add admin session/auth guard abstraction
- keep `/admin/*` local-only until Cloudflare Access topology is confirmed
- add tests that unauthenticated admin API calls fail closed
- keep all production LINE/Facebook/webhook work disabled
