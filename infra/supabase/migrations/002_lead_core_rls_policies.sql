-- SIRINX Lead Core RLS baseline.
-- Access model: public clients do not write directly to Lead Core.
-- Backend services write through server-side credentials only.

revoke all on table leads from anon, authenticated;
revoke all on table solar_estimates from anon, authenticated;
revoke all on table lead_events from anon, authenticated;
revoke all on table event_processing_log from anon, authenticated;
revoke all on table dead_letter_events from anon, authenticated;
revoke all on table agent_audit_logs from anon, authenticated;

grant select, insert, update, delete on table leads to service_role;
grant select, insert, update, delete on table solar_estimates to service_role;
grant select, insert, update, delete on table lead_events to service_role;
grant select, insert, update, delete on table event_processing_log to service_role;
grant select, insert, update, delete on table dead_letter_events to service_role;
grant select, insert, update, delete on table agent_audit_logs to service_role;

alter table leads enable row level security;
alter table solar_estimates enable row level security;
alter table lead_events enable row level security;
alter table event_processing_log enable row level security;
alter table dead_letter_events enable row level security;
alter table agent_audit_logs enable row level security;

alter table leads force row level security;
alter table solar_estimates force row level security;
alter table lead_events force row level security;
alter table event_processing_log force row level security;
alter table dead_letter_events force row level security;
alter table agent_audit_logs force row level security;

comment on table leads is 'SIRINX Lead Core source of truth. No direct anon/authenticated access; write through backend service boundary only.';
comment on table solar_estimates is 'OPAL estimate records. Draft estimates only; final quotation requires human approval.';
comment on table lead_events is 'Immutable-style event trail for lead system events.';
comment on table event_processing_log is 'Processing status log for idempotency, retries, and observability.';
comment on table dead_letter_events is 'Dead letter event store for replayable failed events.';
comment on table agent_audit_logs is 'Agent action audit trail with hashes instead of raw prompt/output payloads.';
