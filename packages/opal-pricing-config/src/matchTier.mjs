import { readFileSync } from "node:fs";

const CONFIG_URL = new URL("../opal.pricing.2026-mvp1.json", import.meta.url);

export function loadOpalPricingConfig() {
  return JSON.parse(readFileSync(CONFIG_URL, "utf8"));
}

export function getPackageByTier(tier, pricingConfig = loadOpalPricingConfig()) {
  return pricingConfig.packages.find((item) => item.tier === tier) || null;
}

export function matchTier(input, pricingConfig = loadOpalPricingConfig()) {
  const payload = input?.payload ? input.payload : input || {};
  const customerType = normalize(payload.customer_type);
  const usagePattern = normalize(payload.usage_pattern);
  const currentBill = numericOrNull(payload.current_bill);
  const province = normalize(payload.province);
  const phaseType = normalize(payload.phase_type);
  const missingSiteContext =
    !province || phaseType === "unknown" || !phaseType || currentBill === null;

  if (!customerType && currentBill === null && !usagePattern) {
    return result(null, pricingConfig, 0.2, true, "ข้อมูลยังไม่พอ ต้องขอค่าไฟ ประเภทอาคาร รูปแบบการใช้ไฟ และระบบไฟก่อนประเมิน");
  }

  if (["factory", "industrial", "sme"].includes(customerType)) {
    return result(
      "ENTERPRISE",
      pricingConfig,
      0.86,
      missingSiteContext,
      "ลูกค้าอยู่ในกลุ่มธุรกิจหรืออุตสาหกรรม จึงต้องเริ่มประเมินในกลุ่ม ENTERPRISE พร้อมตรวจระบบไฟและหน้างาน"
    );
  }

  if (currentBill !== null && currentBill >= 10000) {
    const enterpriseLike = ["factory", "industrial", "sme"].includes(customerType);
    return result(
      enterpriseLike ? "ENTERPRISE" : "PRO",
      pricingConfig,
      0.72,
      missingSiteContext,
      enterpriseLike
        ? "ค่าไฟสูงและเป็นลูกค้าธุรกิจ จึงเริ่มประเมินในกลุ่ม ENTERPRISE"
        : "ค่าไฟตั้งแต่ 10,000 บาทต่อเดือนขึ้นไป แต่ยังไม่ใช่กลุ่มโรงงาน จึงเริ่มประเมินในกลุ่ม PRO และขอข้อมูลเพิ่ม"
    );
  }

  if (
    usagePattern === "daytime_heavy" ||
    ["home_office", "shop", "office"].includes(customerType)
  ) {
    return result(
      "PRO",
      pricingConfig,
      0.78,
      missingSiteContext,
      "ลูกค้าเป็น home_office/shop/office หรือใช้ไฟกลางวันมาก จึงควรเริ่มประเมินในกลุ่ม PRO"
    );
  }

  if (currentBill !== null && currentBill <= 4000 && customerType === "home") {
    return result(
      "START",
      pricingConfig,
      0.68,
      true,
      "ค่าไฟไม่เกิน 4,000 บาทต่อเดือนและเป็นบ้านพักอาศัย จึงเริ่มประเมินในกลุ่ม START แต่ยังต้องตรวจรูปแบบการใช้ไฟจริง"
    );
  }

  return result(
    "START",
    pricingConfig,
    0.42,
    true,
    "ข้อมูลยังไม่ครบ จึงตั้งต้นที่ START เพื่อขอข้อมูลเพิ่มก่อนประเมินระดับระบบจริง"
  );
}

function result(recommendedTier, pricingConfig, confidence, requiresMoreInfo, reason) {
  return {
    recommended_tier: recommendedTier,
    opal_pricing_version: pricingConfig.opal_pricing_version,
    confidence,
    requires_more_info: requiresMoreInfo,
    reason
  };
}

function normalize(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
