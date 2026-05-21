# Sprint 4 Human Approval Queue

## Scope

Sprint 4 adds a local approval console for Hermes reply drafts.

Implemented:

- `reply_drafts` store/table model
- pending/approved/rejected status
- backend-only admin APIs
- local admin console
- audit log for approve/reject actions
- no external send behavior

## Routes

```text
GET  /admin/reply-queue
GET  /api/admin/reply-drafts?status=pending
POST /api/admin/reply-drafts/:id/approve
POST /api/admin/reply-drafts/:id/reject
```

## Approval Boundary

Approval means:

- a human reviewed the Hermes draft
- the draft status changed to `approved`
- an audit record was written

Approval does not mean:

- message sent to LINE
- message sent to Facebook
- final proposal issued
- price confirmed

The response includes `external_send_performed: false`.

## Local Flow

1. Open `/solar-calculator`
2. Create a test estimate
3. Open `/admin/reply-queue`
4. Review the generated Hermes draft
5. Approve or reject
6. Verify audit entry exists

## Production Blockers

Before real team use:

- add authentication for `/admin/*`
- restrict admin APIs behind Cloudflare Access or backend auth
- connect persistent Postgres adapter after DB preflight
- define who can approve/reject
- add reply-sent outbox only after platform signature and recipient rules are complete
