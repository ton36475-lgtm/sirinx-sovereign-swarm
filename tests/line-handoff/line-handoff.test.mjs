import { test } from "node:test";
import assert from "node:assert/strict";
import { createLineHandoffUrl } from "../../packages/line-handoff/src/createLineHandoffUrl.mjs";

test("creates LINE handoff URL with encoded lead context", () => {
  const url = createLineHandoffUrl({
    leadId: "lead_001",
    recommendedTier: "PRO",
    currentBill: 4000,
    targetSaving: 2000
  });
  const parsed = new URL(url);
  const text = parsed.searchParams.get("text");
  assert.equal(parsed.origin, "https://line.me");
  assert.match(text, /Lead ID: lead_001/);
  assert.match(text, /แพ็กเกจประเมินเบื้องต้น: PRO/);
});
