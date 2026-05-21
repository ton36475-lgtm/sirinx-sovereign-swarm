-- Rollback draft for 004_reply_outbox_gated_send.sql.
-- Do not run in production without explicit human approval.

drop table if exists reply_outbox;
