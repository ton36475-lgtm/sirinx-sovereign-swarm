# SIRINX Sovereign Agentic Swarm v2.1

## Mission

Build an event-driven solar sales operating system that accepts consent-based inbound leads, matches static OPAL pricing tiers, creates Hermes reply drafts for human approval, stores every event in Lead Core, and preserves failed events in DLQ.

## Sprint 1 Scope

- Webhook Gateway mock endpoint
- Schema validation
- Idempotency
- In-memory queue abstraction
- Queue consumer
- Retry and DLQ
- DLQ replay endpoint
- OPAL static pricing config
- OPAL tier matcher
- Hermes draft mock
- Prompt injection guardrail
- Pricing hallucination guardrail
- Lead Core minimal SQL migration
- Dry-run n8n workflow blueprint

## Explicitly Out Of Scope

- Production LINE and Meta webhook connection
- Third-party scraping
- Public-channel auto-commenting
- Dynamic pricing
- Ghost Claw design agent
- Proposal PDF
- Public inbound route to Bueng Phra Node

## Principle

Reliability first, traceability second, pricing guardrail third, security boundary before production integration.
