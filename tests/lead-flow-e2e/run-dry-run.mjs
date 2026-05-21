import { createSprint1Harness, readFixture } from "../helpers/harness.mjs";

const harness = createSprint1Harness();
const event = readFixture("evt_test_001.json");
const accepted = await harness.gateway.handleMockWebhook(event);
const results = await harness.drainQueue();

console.log(JSON.stringify({
  accepted: accepted.body,
  result: {
    status: results[0]?.status,
    recommended_tier: results[0]?.opal_match?.recommended_tier,
    draft_reply: results[0]?.hermes_draft?.draft_reply,
  },
  counts: {
    leads: harness.store.state.leads.length,
    lead_events: harness.store.state.lead_events.length,
    solar_estimates: harness.store.state.solar_estimates.length,
    agent_audit_logs: harness.store.state.agent_audit_logs.length,
    dead_letter_events: harness.store.state.dead_letter_events.length,
  },
}, null, 2));
