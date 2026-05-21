create table if not exists admin_access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  route text not null,
  method text not null,
  allowed boolean not null default false,
  status_code int not null,
  reason text not null,
  actor_ref text,
  auth_mode text not null default 'blocked',
  metadata jsonb,
  created_at timestamptz default now()
);

revoke all on table admin_access_audit_logs from anon, authenticated;
grant select, insert, update, delete on table admin_access_audit_logs to service_role;

alter table admin_access_audit_logs enable row level security;
alter table admin_access_audit_logs force row level security;

create index if not exists idx_admin_access_audit_route_created_at on admin_access_audit_logs(route, created_at desc);
create index if not exists idx_admin_access_audit_allowed on admin_access_audit_logs(allowed);

comment on table admin_access_audit_logs is 'Backend-only admin boundary audit log. Stores auth outcomes but never stores admin token values.';
