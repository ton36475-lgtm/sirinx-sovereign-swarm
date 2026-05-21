-- Rollback draft for 002_lead_core_rls_policies.sql.
-- Do not run in production without explicit human approval.

alter table leads no force row level security;
alter table solar_estimates no force row level security;
alter table lead_events no force row level security;
alter table event_processing_log no force row level security;
alter table dead_letter_events no force row level security;
alter table agent_audit_logs no force row level security;

alter table leads disable row level security;
alter table solar_estimates disable row level security;
alter table lead_events disable row level security;
alter table event_processing_log disable row level security;
alter table dead_letter_events disable row level security;
alter table agent_audit_logs disable row level security;

revoke all on table leads from service_role;
revoke all on table solar_estimates from service_role;
revoke all on table lead_events from service_role;
revoke all on table event_processing_log from service_role;
revoke all on table dead_letter_events from service_role;
revoke all on table agent_audit_logs from service_role;
