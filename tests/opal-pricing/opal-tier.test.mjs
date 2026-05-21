import assert from "node:assert/strict";
import test from "node:test";
import { matchTier } from "../../packages/opal-pricing-config/src/matchTier.mjs";

test("OPAL returns PRO for home_office + daytime_heavy + current bill 4000", () => {
  const result = matchTier({
    customer_type: "home_office",
    usage_pattern: "daytime_heavy",
    current_bill: 4000,
  });

  assert.equal(result.recommended_tier, "PRO");
  assert.equal(result.opal_pricing_version, "2026-MVP1");
  assert.equal(result.requires_more_info, true);
});

test("OPAL returns null when data is not enough", () => {
  const result = matchTier({});

  assert.equal(result.recommended_tier, null);
  assert.equal(result.requires_more_info, true);
});
