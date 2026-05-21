create table if not exists reply_outbox (
  id uuid primary key default gen_random_uuid(),
  reply_draft_id uuid references reply_drafts(id),
  lead_id uuid references leads(id),
  event_id text not null,
  channel text not null default 'line_oa',
  recipient_ref text,
  message_text text not null,
  status text not null default 'queued' check (status in ('queued', 'cancelled', 'sent', 'failed')),
  external_send_allowed boolean default false,
  external_send_performed boolean default false,
  queued_by text,
  cancelled_by text,
  cancel_reason text,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (reply_draft_id)
);

revoke all on table reply_outbox from anon, authenticated;
grant select, insert, update, delete on table reply_outbox to service_role;

alter table reply_outbox enable row level security;
alter table reply_outbox force row level security;

create index if not exists idx_reply_outbox_status on reply_outbox(status);
create index if not exists idx_reply_outbox_lead_id on reply_outbox(lead_id);
create index if not exists idx_reply_outbox_channel on reply_outbox(channel);

comment on table reply_outbox is 'Gated reply outbox. Queued records do not imply external send; LINE/Facebook delivery requires separate production channel gate.';
