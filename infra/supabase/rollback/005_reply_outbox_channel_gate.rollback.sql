-- Rollback draft for 005_reply_outbox_channel_gate.sql.
-- Do not run in production without explicit human approval.

alter table reply_outbox
  drop constraint if exists reply_outbox_status_check;

alter table reply_outbox
  add constraint reply_outbox_status_check
  check (status in ('queued', 'cancelled', 'sent', 'failed'));

drop index if exists idx_reply_outbox_external_send_allowed;

alter table reply_outbox
  drop column if exists blocked_by;
