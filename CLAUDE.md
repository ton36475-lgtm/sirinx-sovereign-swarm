# CLAUDE.md

Guidance for Claude Code (and other AI coding assistants) working in this repository.

## What this project is

**SIRINX Sovereign Agentic Swarm v2.1** — a local-first, event-driven backend pipeline for a
Thai B2B/B2C solar-energy sales operation. Despite the "swarm" name, this is **not** a
multi-LLM-agent orchestration framework (contrast with the sibling `sirinx-app`/`sirinx-os`
repos on this machine, which have persona-based "47 Ronin" agents). Here, "agents" mostly
means **named audit-log actors** (`Hermes`, `HumanApproval`, `ReplyOutbox`, `ReplySendWorker`)
inside a conventional webhook → queue → worker → store pipeline, plus a small JSON-RPC "A2A"
gateway (`servers/a2a-gateway.mjs`) that exposes this pipeline to an external agent-to-agent
mesh (`http://127.0.0.1:9000`) as one node among others.

The core flow (see `docs/WORKFLOW_PIPELINE_MAP.md` for the full mermaid diagrams):

```
Website calculator -> POST /api/solar-estimate -> lead.intent_detected event
  -> schema validation + idempotency -> in-memory queue -> consumer w/ retries
  -> OPAL static pricing tier match -> Hermes reply draft (mock LLM) -> Lead Core store
  -> agent audit log -> human approval queue -> gated reply outbox -> send-disabled worker
```

The project is built in **numbered "sprints"**, each one adding a gate (test suite +
preflight script) that must pass before the next sprint's work is trusted. As of this
writing the repo is at **Sprint 12** (`runtime-env-contract`). Read `README.md` and
`docs/MASTER_BLUEPRINT_v2_1.md` first for the mission and explicit non-goals.

**Central, non-negotiable rule baked into the whole codebase:** production external
side effects are deliberately disabled everywhere. No live LINE/Meta sends, no dynamic
pricing, no scraping, no PDF proposals, no public inbound route to "Bueng Phra Node", no
secrets ever logged/printed. Every worker/gate that touches something sensitive returns
`external_send_performed: false` / `queued: false` / `secret_value_printed: false` style
fields and asserts them in tests. When adding code, preserve this pattern — do not wire up
a real external call without an explicit, separately-approved change.

## Directory structure

```
apps/
  webhook-gateway/       Zero-dependency Node http server — the one real "app" (src/server.mjs, src/index.mjs)
  www/                   Static site + Next-style route folders served by Cloudflare Pages (apps/www/static is served by webhook-gateway too)
  admin/                 README-only docs for DLQ/Hermes/leads admin views (no code yet)
  proposal-renderer/     README-only placeholder (out of scope per blueprint)
functions/
  api/[[path]].js        Cloudflare Pages Function: proxies /api/* to SIRINX_API_ORIGIN with origin validation
packages/                One package per concern, each with its own src/ — imported via relative paths (no workspace/monorepo tooling, no package.json per package)
  event-schemas/         JSON Schema + validator for lead.intent_detected, event-registry.json (canonical event type list)
  opal-pricing-config/   Static OPAL pricing tiers (opal.pricing.2026-mvp1.json) + tier matcher
  hermes-core/           Hermes reply-draft mock generator
  lead-core / audit-core Lead Core store (leadCoreStore.mjs) + audit log persistence
  admin-auth/            Admin route auth gate (adminAuthGate.mjs)
  webhook-security/      Signature verification, replay window, rate limiting for /webhooks/line|meta
  channel-gate/          LINE/Meta channel enablement gate
  guardrails/            Prompt-injection + pricing-hallucination guardrails
  line-handoff/          LINE handoff URL construction
  solar-calculator/      createSolarEstimate.mjs — turns calculator input into a lead.intent_detected event
  migration-readiness/   Checks Supabase migrations are ready without applying them
  deploy-readiness/      Deploy readiness gate logic
  runtime-env-contract/  Validates required runtime env vars are present/consistent (no values printed)
  workflow-pipeline/     Backing logic for the workflow-pipeline-report script
workers/
  queue-consumer/        InMemoryEventQueue + processLeadIntent (retry + DLQ logic)
  dlq-replay-worker/      Dead-letter replay logic
  reply-send-worker/      sendDisabledWorker.mjs — always blocks actual sends, records why
servers/
  a2a-gateway.mjs         Standalone zero-dep JSON-RPC/A2A bridge server on :9005 (SendMessage/CeoControl/health/agent-card)
scripts/                  All the "*:gate" / "*:preflight" CLI scripts invoked from package.json
infra/
  supabase/migrations/    Numbered SQL migrations 001-007 (+ matching rollback/ scripts) — not auto-applied
  docker/bueng-phra-node/ Draft compose file only, no public inbound route (see guardrails)
n8n/                      Dry-run workflow blueprint JSON + credentials.example.md (n8n is explicitly NOT the security boundary — webhook-gateway is)
tests/                    node:test suites, one folder per sprint/concern (opal-pricing, prompt-injection, queue-dlq, line-handoff, lead-flow-e2e, solar-calculator, db-gate, admin-auth, admin-reply-queue, admin-outbox, channel-gate, webhook-security, migration-readiness, workflow-pipeline, deploy-readiness, runtime-env-contract, fixtures/, helpers/harness.mjs)
docs/                     One markdown doc per sprint (SPRINTn_*.md) plus MASTER_BLUEPRINT_v2_1.md, WORKFLOW_PIPELINE_MAP.md, SECURITY_GUARDRAILS.md, OPAL_PRICING_POLICY.md, HERMES_OPERATING_DOCTRINE.md, BUENG_PHRA_NODE.md, EVENT_SCHEMA_REGISTRY.md, FUTURE_SWARM_ROADMAP.md, runbooks
```

There is no `.github/` directory (no CI workflows checked in) and no lockfile — the repo
intentionally has **zero external npm dependencies**; everything is written against Node
built-ins (`node:http`, `node:test`, `node:fs`, etc.) so `npm test` and the gate scripts run
with no `npm install` step.

## Setup / dev / build / test / lint commands

There is no separate lint or build step and no bundler — this is plain ESM Node.js.
Requires **Node >= 20** (`package.json` `engines`); verified working on Node v22 in this
environment.

```bash
npm test                     # runs `node --test` over the whole tree (currently 93 passing tests, no deps to install)
node apps/webhook-gateway/src/index.mjs   # starts the webhook gateway on :8787 (PORT env overrides)
node servers/a2a-gateway.mjs               # starts the A2A gateway on :9005 (SOVEREIGN_PORT/SOVEREIGN_LIVE/A2A_HUB env)
```

Then open, while the gateway is running:
```
http://127.0.0.1:8787/solar-calculator
http://127.0.0.1:8787/admin/reply-queue
http://127.0.0.1:8787/admin/outbox
```

**Sprint gates** — each is cumulative (sprintN:gate runs sprint N's tests + all prior
preflight scripts). Prefer running the highest-numbered gate (`sprint12:gate`) to validate
a change touches nothing earlier gates depend on:

```bash
npm run sprint1:gate ... npm run sprint12:gate   # cumulative test + preflight bundles, see package.json for exact composition
```

**Individual preflight/readiness scripts** (each is `node scripts/<name>.mjs`, read-only,
never prints secret values, safe to run anytime):

```bash
npm run db:preflight
npm run channel:preflight
npm run admin-auth:preflight
npm run webhook-security:preflight
npm run migration:readiness
npm run webhook:smoke:signed
npm run workflow:pipeline        # prints the full JSON pipeline status report (implemented stages, blockers, readiness)
npm run deploy:readiness
npm run runtime-env:contract
npm run staging:smoke
```

When you add a new concern/package, the established convention is: write the package
under `packages/<name>/src/`, add a `scripts/<name>-preflight.mjs` or `*-gate.mjs` if it's a
go/no-go check, add tests under `tests/<name>/`, wire a new `npm run <name>:preflight`
script, fold it into the next `sprintN:gate` composite, and add `docs/SPRINTN_<NAME>.md`
documenting it. Follow this pattern rather than inventing a new structure.

## Key conventions and architecture patterns actually observed

- **Pure ESM, zero dependencies.** `"type": "module"` in `package.json`; all cross-file
  imports use explicit relative paths with `.mjs` extensions (no path aliases, no bundler
  resolution) — e.g. `apps/webhook-gateway/src/server.mjs` imports
  `../../../packages/audit-core/src/leadCoreStore.mjs` directly.
- **Factory functions, not classes.** Modules export `createX(...)` factories
  (`createWebhookGateway`, `createLeadCoreStore`, `createInMemoryRateLimiter`) that take an
  options object with sane defaults and return an object of methods/state. Dependency
  injection is done by passing overrides into these factories (visible throughout
  `apps/webhook-gateway/src/server.mjs`), which is also how tests substitute in-memory
  fakes for stores/queues/env.
- **Everything is an audited, gated action.** Any mutating operation
  (`reviewReplyDraft`, `queueApprovedReplyDraft`, `cancelReplyOutbox`,
  `simulateReplyOutboxSend`, admin/webhook security decisions) writes a
  `store.saveAgentAuditLog(...)` or `store.save*AuditLog(...)` record with an explicit
  `agent_name`, `action_type`, `approval_required`, `approved_by`, and a `metadata` object
  that spells out `external_send_performed: false` (or similar) so intent is always
  provable from data, not just code review.
- **Guardrail-first design.** Every risky boundary (webhook security, admin auth, pricing,
  prompt injection) is implemented as a small pure "evaluate/authorize" function
  (`evaluateSocialWebhookRequest`, `authorizeAdminRequest`) that returns a decision object
  (`{ allowed, statusCode, reason, ... }|{...}`), which the HTTP layer then translates into
  a response and an audit log write. New security logic should follow this
  evaluate-then-record pattern rather than checking conditions inline in route handlers.
- **Static routing via manual `URL`/regex matching** in `server.mjs` — no router library.
  Path params come from `pathname.match(/^\/api\/admin\/reply-drafts\/([^/]+)\/(approve|reject)$/)`
  style regexes.
- **Event schema is the contract.** `packages/event-schemas/event-registry.json` is the
  canonical list of event types (`lead.intent_detected`, `reply.approved`, `dlq.event_replayed`,
  etc.); `packages/event-schemas/src/leadIntentDetected.mjs` provides
  `validateLeadIntentDetectedEvent` + `withTraceDefaults` (adds `trace.request_id` /
  `trace.idempotency_key`). New event types should get their own schema module following
  this file's shape and be added to the registry.
- **Idempotency + retry/DLQ** live in `workers/queue-consumer/src/inMemoryQueue.mjs` and
  `processLeadIntent.mjs`. Retries exhaust to a dead-letter store; `replayDeadLetter` is the
  only way back in, and it's exposed over HTTP as `POST /dlq/replay/:deadLetterId`.
- **Static pricing only.** `packages/opal-pricing-config/opal.pricing.2026-mvp1.json`
  encodes `guardrails.ai_may_not_create_new_price` / `ai_may_not_offer_discount` /
  `ai_may_not_guarantee_savings` / `final_quote_requires_human_review` as data, and
  `packages/guardrails/src` + `tests/opal-pricing/pricing-guardrail.test.mjs` enforce it.
  Do not add code that computes a price dynamically.
- **Supabase/Postgres is prepared but not wired live.** `infra/supabase/migrations/001..007`
  are numbered, additive, each has a matching file in `infra/supabase/rollback/`, and are
  *not* run automatically — `npm run db:preflight` / `migration:readiness` only check
  readiness. `SIRINX_ALLOW_DB_MUTATION=false` gates actual writes.
- **Cloudflare Pages deployment shape**: `wrangler.jsonc` builds from `apps/www/static`,
  and `functions/api/[[path]].js` is a Pages Function that reverse-proxies `/api/*` to
  `SIRINX_API_ORIGIN` (must be https unless `SIRINX_ALLOW_LOCAL_API_ORIGIN=true` for a
  localhost origin), stripping hop-by-hop headers. This is the intended prod topology; the
  Node `webhook-gateway` server is the local/dev equivalent serving the same static assets
  and API directly.
- **The A2A gateway (`servers/a2a-gateway.mjs`) is a separate, independently-run process**
  (port 9005, not started by any npm script) that exposes this repo's pipeline to an
  external multi-agent mesh via JSON-RPC (`SendMessage`, `CeoControl`,
  `KnowledgeStatus`/`KnowledgeQuery`) and an agent card at
  `/.well-known/agent-card.json`. It defaults to `live_send=false`/`provider_call=false`;
  `SOVEREIGN_LIVE=true` is required to allow it to actually invoke the governance gates for
  real. This is the newest addition (latest commit) and has no test coverage yet.
- **Tests use `node:test` directly** (no Jest/Vitest/Mocha). Run a single suite with e.g.
  `node --test tests/opal-pricing/*.test.mjs`. Shared helpers live in `tests/helpers/harness.mjs`
  and fixtures in `tests/fixtures/`.

## Environment variables (see `.env.example` — do not print real values)

```
SIRINX_DATABASE_URL                        Postgres connection string (Supabase) — unset locally by default
SIRINX_DB_SSL_MODE                         require | verify-full
SIRINX_LINE_CHANNEL_ACCESS_TOKEN           LINE OA token — required for real sends, currently unused (sends disabled)
SIRINX_LINE_ALLOWED_RECIPIENTS             allow-list for LINE recipients
SIRINX_EXTERNAL_SENDS_ENABLED              master kill-switch for any external send (default false)
SIRINX_ADMIN_API_TOKEN                     bearer token for /admin and /api/admin/* routes
SIRINX_ADMIN_LOCAL_DEV_BYPASS              allows bypassing admin auth for local dev (default false)
SIRINX_LINE_CHANNEL_SECRET                 LINE webhook signature secret
SIRINX_META_APP_SECRET                     Meta webhook signature secret
SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED   gate for actually processing LINE/Meta webhooks (default false)
SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS       replay-attack window, default 300
SIRINX_DB_DRY_RUN_MODE                     validate-only by default
SIRINX_ALLOW_DB_MUTATION                   default false
SIRINX_API_HOSTING_STRATEGY                node-backend-origin (matches wrangler.jsonc)
SIRINX_API_ORIGIN                          origin the Pages Function proxies /api/* to
SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED        gate for staging-network-smoke script actually hitting the network
SIRINX_STAGING_ORIGIN                      staging origin for smoke tests
SIRINX_ALLOW_LOCAL_API_ORIGIN              (functions/api only) allow localhost as SIRINX_API_ORIGIN
SOVEREIGN_PORT / SOVEREIGN_LIVE / A2A_HUB  a2a-gateway.mjs only — not in .env.example, set at process launch
```

Never populate `.env` with real secrets in commits, and never add code that logs an env
value directly — every existing gate/audit path explicitly asserts values are *not*
printed; match that standard in new code.

## Repo-specific gotchas

- **Do not confuse this repo with the sibling repos on this machine** (`sirinx-app`,
  `sirinx-os`, etc.). Those use a completely different "47 Ronin" persona-agent
  architecture; this repo's "swarm"/"agent" vocabulary refers to audit-log actor names and
  gate/pipeline stages, not LLM personas.
- **Sprint gates are cumulative and cheap** — always safe to run `npm test` or the highest
  `sprintN:gate`; there's no build step to forget and no install step (`npm install` is a
  no-op — verify with `npm test` directly if unsure).
- **Everything defaults to "disabled"/"blocked".** If you're implementing a feature and it
  feels like nothing happens end-to-end (no real HTTP call goes out, no DB row is truly
  written), check whether an env flag (`*_ENABLED`, `SIRINX_ALLOW_*`) is intentionally false
  before assuming something is broken — that is almost certainly the guardrail working as
  designed, per `docs/SECURITY_GUARDRAILS.md`.
- **`servers/a2a-gateway.mjs` is not referenced by `package.json` scripts** and has no
  tests — treat it as experimental/newest surface area if you touch it, and consider adding
  a `tests/a2a-gateway/` suite and an npm script if you extend it.
- **Docs are sprint-numbered and can drift from code** — cross-check `docs/SPRINTn_*.md`
  against the actual `packages/`/`tests/` before trusting a doc's claim about what's
  "complete."
- **No `.github/workflows`** — there is no CI configured in this repo; gating discipline is
  enforced purely by convention (sprint gate scripts) and code review, so running the
  relevant gate locally before considering work done is the substitute for CI.
