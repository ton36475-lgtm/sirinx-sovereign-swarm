import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLeadIntentEventFromCalculator,
  normalizeCalculatorInput
} from "../../packages/solar-calculator/src/createLeadIntentEvent.mjs";

test("calculator input is normalized into lead.intent_detected event without PII", () => {
  const event = createLeadIntentEventFromCalculator({
    current_bill: "4000",
    target_saving: "",
    customer_type: "home_office",
    usage_pattern: "daytime_heavy",
    phase_type: "unknown",
    province: "Phitsanulok"
  }, new Date("2026-05-22T00:00:00+07:00"));

  assert.equal(event.event_type, "lead.intent_detected");
  assert.equal(event.payload.current_bill, 4000);
  assert.equal(event.payload.target_saving, null);
  assert.equal(event.payload.province, "phitsanulok");
  assert.equal(event.risk.pii_redacted, true);
  assert.match(event.trace.idempotency_key, /^calculator_/);
});

test("negative bill input is rejected", () => {
  assert.throws(() => normalizeCalculatorInput({ current_bill: -1 }), /current_bill/);
});
