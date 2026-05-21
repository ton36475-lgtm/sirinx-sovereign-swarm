-- Rollback draft for 006_admin_access_audit.sql.
-- Do not run in production without explicit human approval.

drop table if exists admin_access_audit_logs;
