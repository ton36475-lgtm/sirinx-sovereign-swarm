-- Rollback draft for 003_reply_draft_approval_queue.sql.
-- Do not run in production without explicit human approval.

drop table if exists reply_drafts;
