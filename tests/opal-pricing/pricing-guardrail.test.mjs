import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDraftPricing } from "../../packages/guardrails/src/pricingGuardrail.mjs";
import { loadOpalPricingConfig, matchTier } from "../../packages/opal-pricing-config/src/matchTier.mjs";

const pricingConfig = loadOpalPricingConfig();
const fixture = JSON.parse(readFileSync(new URL("../fixtures/evt_test_001.json", import.meta.url), "utf8"));

test("OPAL matcher returns PRO for home_office + daytime_heavy + current_bill 4000", () => {
  const result = matchTier(fixture, pricingConfig);
  assert.equal(result.recommended_tier, "PRO");
  assert.equal(result.opal_pricing_version, "2026-MVP1");
  assert.equal(result.requires_more_info, true);
});

test("Hermes draft may use START 125000", () => {
  const result = validateDraftPricing("เริ่มที่ START 125,000 บาท ต้องตรวจหน้างานก่อน", pricingConfig);
  assert.equal(result.ok, true);
});

test("Hermes draft may use PRO 315000", () => {
  const result = validateDraftPricing("กลุ่ม PRO 315,000 บาท ราคาจริงต้องประเมินหน้างาน", pricingConfig);
  assert.equal(result.ok, true);
});

test("Hermes draft may use ENTERPRISE 4990000", () => {
  const result = validateDraftPricing("กลุ่ม ENTERPRISE 4,990,000 บาท ต้องให้ทีมวิศวกรตรวจ", pricingConfig);
  assert.equal(result.ok, true);
});

test("Hermes draft with non-OPAL price 99999 fails", () => {
  const result = validateDraftPricing("ระบบนี้ราคา 99,999 บาท", pricingConfig);
  assert.equal(result.ok, false);
  assert.match(result.violations.join(","), /non_opal_price:99999/);
});

test("Hermes draft with ลด 50% fails", () => {
  const result = validateDraftPricing("วันนี้ลด 50% ให้ได้เลย", pricingConfig);
  assert.equal(result.ok, false);
  assert.match(result.violations.join(","), /discount_not_allowed/);
});

test("Hermes draft with ฟรี fails unless context is ประเมินฟรี", () => {
  const unsafe = validateDraftPricing("ติดตั้งฟรีได้เลย", pricingConfig);
  const safe = validateDraftPricing("ประเมินฟรีก่อนออกใบเสนอราคาจริง", pricingConfig);
  assert.equal(unsafe.ok, false);
  assert.match(unsafe.violations.join(","), /free_claim_not_allowed/);
  assert.equal(safe.ok, true);
});

test("Hermes draft with guaranteed bill reduction fails", () => {
  const result = validateDraftPricing("รับประกันว่าลดค่าไฟได้แน่นอน", pricingConfig);
  assert.equal(result.ok, false);
  assert.match(result.violations.join(","), /guaranteed_savings_not_allowed/);
});
