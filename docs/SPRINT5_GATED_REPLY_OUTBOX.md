# Sprint 5 Gated Reply Outbox

## Scope

Sprint 5 adds a local outbox after human approval.

Implemented:

- queue approved Hermes drafts into `reply_outbox`
- list local outbox items
- cancel local outbox items
- audit outbox queue/cancel actions
- local admin page at `/admin/outbox`
- database migration and rollback draft

## Routes

```text
GET  /admin/outbox
GET  /api/admin/reply-outbox?status=all
POST /api/admin/reply-drafts/:id/queue-send
POST /api/admin/reply-outbox/:id/cancel
```

## Boundary

Queueing outbox means:

- draft has already been approved
- message is staged for a future channel gate
- audit log is written

Queueing outbox does not mean:

- LINE message sent
- Facebook message sent
- customer contacted
- production channel configured

Every Sprint 5 response must keep:

```json
{
  "external_send_allowed": false,
  "external_send_performed": false
}
```

## Old Work Review

Done locally:

- Sprint 1 Event Pipeline + DLQ + OPAL + Hermes mock
- Sprint 2 Calculator + LINE handoff URL
- Sprint 3 DB persistence gate + RLS baseline
- Sprint 4 Human approval queue
- Sprint 5 Gated outbox

Still blocked before production:

- real Supabase target and private env
- DB migration dry-run and rollback in staging/local DB
- admin authentication and Cloudflare Access
- LINE OA recipient/token setup
- Meta webhook app secret and signature verification
- rate limiting and replay protection for real platform webhooks
- real notification send worker
- proposal PDF after human approval
- Ghost Claw draft only after engineering review workflow exists

## Production Promotion Gate

Do not promote until:

- `npm run sprint5:gate` passes
- `npm run db:preflight` reports `productionReady=true`
- admin auth is enforced
- channel recipients are explicitly configured
- platform signature verification tests pass
- human operator approves a production smoke test
