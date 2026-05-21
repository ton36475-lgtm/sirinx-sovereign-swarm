create table if not exists reply_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  event_id text not null,
  draft_reply text not null,
  intent_score int,
  recommended_tier text,
  risk_level text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approval_required boolean default true,
  approved_by text,
  rejected_by text,
  review_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

revoke all on table reply_drafts from anon, authenticated;
grant select, insert, update, delete on table reply_drafts to service_role;

alter table reply_drafts enable row level security;
alter table reply_drafts force row level security;

create index if not exists idx_reply_drafts_status on reply_drafts(status);
create index if not exists idx_reply_drafts_lead_id on reply_drafts(lead_id);
create index if not exists idx_reply_drafts_event_id on reply_drafts(event_id);

comment on table reply_drafts is 'Human approval queue for Hermes reply drafts. Approval does not send external messages.';
