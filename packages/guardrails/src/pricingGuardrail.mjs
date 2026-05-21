export function validateDraftPricing(draftReply, pricingConfig, options = {}) {
  const text = typeof draftReply === "string" ? draftReply : "";
  const allowedPackagePrices = new Set(
    pricingConfig.packages.map((item) => Number(item.price_thb))
  );
  const allowedContextNumbers = new Set(
    (options.allowedContextNumbers || [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  );
  const violations = [];

  for (const value of extractNumbers(text)) {
    const isPriceLike = value >= 10000;
    if (isPriceLike && !allowedPackagePrices.has(value) && !allowedContextNumbers.has(value)) {
      violations.push(`non_opal_price:${value}`);
    }
  }

  if (/ลด\s*\d+\s*%/i.test(text) || /ส่วนลด/i.test(text) || /discount/i.test(text)) {
    violations.push("discount_not_allowed");
  }

  if (/ฟรี/i.test(text) && !/ประเมินฟรี/i.test(text)) {
    violations.push("free_claim_not_allowed");
  }

  if (/ลดค่าไฟได้แน่นอน/i.test(text) || /รับประกัน.*ลดค่าไฟ/i.test(text)) {
    violations.push("guaranteed_savings_not_allowed");
  }

  return {
    ok: violations.length === 0,
    violations
  };
}

export function assertDraftPricingAllowed(draftReply, pricingConfig, options = {}) {
  const result = validateDraftPricing(draftReply, pricingConfig, options);
  if (!result.ok) {
    throw new Error(`Draft pricing guardrail failed: ${result.violations.join(", ")}`);
  }
  return true;
}

function extractNumbers(text) {
  const matches = text.match(/\d[\d,]*/g) || [];
  return matches
    .map((match) => Number(match.replaceAll(",", "")))
    .filter((value) => Number.isFinite(value));
}
