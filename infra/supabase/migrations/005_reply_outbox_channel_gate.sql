alter table reply_outbox
  drop constraint if exists reply_outbox_status_check;

alter table reply_outbox
  add constraint reply_outbox_status_check
  check (status in ('queued', 'blocked', 'cancelled', 'sent', 'failed'));

alter table reply_outbox
  add column if not exists blocked_by text;

create index if not exists idx_reply_outbox_external_send_allowed on reply_outbox(external_send_allowed);

comment on column reply_outbox.blocked_by is 'Operator or local worker that blocked a send attempt before any external delivery.';
comment on constraint reply_outbox_status_check on reply_outbox is 'Reply outbox status includes blocked for fail-closed channel gate simulations.';
