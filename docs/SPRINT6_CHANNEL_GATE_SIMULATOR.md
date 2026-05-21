# Sprint 6 Channel Gate Simulator

## Objective

Sprint 6 adds a fail-closed channel gate between `reply_outbox` and any future LINE or external delivery worker.

This is still local-only. It does not send LINE, Facebook, email, or any external message.

## Implemented

- Redacted LINE env inspection in `packages/channel-gate`.
- Recipient allowlist shape validation.
- Send-disabled local worker in `workers/reply-send-worker`.
- `POST /api/admin/reply-outbox/:id/simulate-send`.
- Outbox `blocked` status for failed channel-gate simulations.
- Audit action `reply.send_blocked`.
- Supabase migration `005_reply_outbox_channel_gate.sql` and rollback draft.

## Required Env Names

The channel gate checks only presence and shape. It does not print values.

- `SIRINX_LINE_CHANNEL_ACCESS_TOKEN`
- `SIRINX_LINE_ALLOWED_RECIPIENTS`
- `SIRINX_EXTERNAL_SENDS_ENABLED`

Recipient refs must use one of these forms:

```text
line_user:<id>
line_group:<id>
line_room:<id>
```

`SIRINX_EXTERNAL_SENDS_ENABLED=true` is required before a production send worker can be considered ready. The local Sprint 6 worker still refuses all external writes even when env is present.

## Local Behavior

1. Operator approves a Hermes draft.
2. Operator queues it to Reply Outbox.
3. Operator runs Channel Gate.
4. Local send-disabled worker evaluates preconditions.
5. Worker marks the outbox item `blocked`.
6. Worker writes audit log `reply.send_blocked`.
7. `external_send_performed` remains `false`.

## Guardrails

- A pending draft cannot be queued.
- A non-queued outbox item cannot be sent.
- Missing or invalid `recipient_ref` blocks send.
- Missing token or allowlist blocks production readiness.
- The local worker always blocks with `send_disabled_worker_no_external_writes`.
- Secret values and recipient allowlist contents are never returned by the env inspector.

## Verification

```bash
npm run sprint6:gate
npm run channel:preflight
```

Expected:

- all tests pass
- `db:preflight` stays blocked until real DB env is configured
- `channel:preflight` stays blocked until LINE env and explicit send flag are configured
- migration guardrails include `005_reply_outbox_channel_gate.sql`
- no external network send is attempted
