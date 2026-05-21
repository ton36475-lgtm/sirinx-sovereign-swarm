-- Rollback Sprint 8 webhook security audit table.
-- Do not run in production without explicit human approval and audit export.

drop table if exists webhook_security_audit_logs;
