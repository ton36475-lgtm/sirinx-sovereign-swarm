# DLQ Console

Future card fields:

- `original_event_id`
- `source`
- `failure_reason`
- `retry_count`
- `created_at`
- `replay_status`
- Replay action
- Mark ignored action
- View payload action

Sprint 1 exposes local dry-run replay through `POST /dlq/replay/:id`.
