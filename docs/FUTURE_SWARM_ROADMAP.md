# Future Swarm Roadmap

Sprint 1 must pass before these phases start.

1. Calculator and LINE handoff
2. Hermes owned-channel auto-reply with human approval
3. OPAL semi-dynamic estimate
4. Ghost Claw design draft
5. Draft proposal PDF
6. Advanced RAG
7. ML propensity scoring
8. OPAL Energy Intelligence
9. Red Team Agent

## Future RAG Sources

- AIKO panel datasheets
- Solis / Deye inverter datasheets
- GSL BESS datasheets
- PEA grid connection rules
- Sales playbook
- Objection handling
- Proposal templates

## Red Team Tests

- prompt injection
- spoofed webhook
- replay attack
- pricing hallucination
- rate-limit abuse
- DLQ failure
- PII leakage

## Current Progress

- Phase 1 reliability baseline is complete locally.
- Phase 2 local calculator proof is complete locally for context-only estimate data and LINE handoff URL generation.
- Phase 3 database persistence gate is prepared locally with Postgres adapter, RLS migration, rollback draft, and no-secret preflight.
- Phase 4 local human approval queue is complete for viewing and approving/rejecting Hermes drafts without external sends.
- Production LINE/Facebook/Supabase integration remains intentionally blocked until signature verification, secrets, consent, and DB gates are configured.
