# Bueng Phra Node

Bueng Phra Node is a private edge intelligence node.

## Sprint 1 Status

Not implemented and not exposed.

## Required Future Boundary

- outbound-only
- no public inbound ports
- Cloudflare Tunnel for private access
- Cloudflare Access for internal dashboard
- local radar worker
- PII redactor
- prompt injection filter
- local scoring
- local retry queue

## Prohibited

- Do not open ports `3000`, `5678`, `5432`, or `8000` on the router.
- Do not send LINE or Facebook webhooks directly to this node.
- Do not store all secrets on this node.
