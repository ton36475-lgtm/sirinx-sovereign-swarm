-- Sprint 8: backend-only webhook security audit trail.
-- This table never stores raw request bodies, raw signatures, or secret values.

create table if not exists webhook_security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('line', 'meta')),
  route text not null,
  method text not null,
  allowed boolean default false,
  status_code int not null,
  reason text not null,
  signature_valid boolean default false,
  replay_valid boolean default false,
  rate_limited boolean default false,
  idempotency_key_hash text,
  remote_ref text default 'unknown',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

comment on table webhook_security_audit_logs is
  'Backend-only social webhook security decisions. Never stores raw body, raw signature, or secret values.';

revoke all on table webhook_security_audit_logs from anon, authenticated;
grant select, insert, update, delete on table webhook_security_audit_logs to service_role;

alter table webhook_security_audit_logs enable row level security;
alter table webhook_security_audit_logs force row level security;

create index if not exists idx_webhook_security_audit_provider_created
  on webhook_security_audit_logs(provider, created_at desc);

create index if not exists idx_webhook_security_audit_reason
  on webhook_security_audit_logs(reason);

create index if not exists idx_webhook_security_audit_rate_limited
  on webhook_security_audit_logs(rate_limited);
