# DLQ Replay Runbook

Fixture:

`tests/fixtures/evt_fail_001.json`

Expected:

- event is accepted
- processor retries 3 times
- event enters `dead_letter_events`
- replay endpoint can reprocess with corrected payload
- replay action writes `dlq.event_replayed` audit record

Local replay endpoint:

```text
POST /dlq/replay/:deadLetterId
```

Payload:

```json
{
  "replayed_by": "operator",
  "patch_payload": {
    "force_error": false
  }
}
```
