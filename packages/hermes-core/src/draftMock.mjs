import { detectPromptInjection } from "../../guardrails/src/promptInjection.mjs";
import { assertDraftPricingAllowed } from "../../guardrails/src/pricingGuardrail.mjs";
import { getPackageByTier, loadOpalPricingConfig } from "../../opal-pricing-config/src/matchTier.mjs";

export function createHermesDraft({
  event,
  opal_match,
  pricing_config = loadOpalPricingConfig()
}) {
  const text = event?.payload?.text || "";
  const injection = detectPromptInjection(text);

  if (injection.prompt_injection_detected) {
    return {
      intent_score: 0,
      recommended_tier: opal_match?.recommended_tier || null,
      draft_reply: "ข้อความนี้ต้องให้ทีมขายตรวจสอบก่อนตอบกลับ เนื่องจากมีสัญญาณเสี่ยงด้านคำสั่งแทรกหรือการขอให้ข้ามนโยบายครับ",
      requires_human_approval: true,
      risk_level: "high",
      used_opal_pricing_version: pricing_config.opal_pricing_version
    };
  }

  const tier = opal_match?.recommended_tier || null;
  if (!tier) {
    return {
      intent_score: 35,
      recommended_tier: null,
      draft_reply: "ขอข้อมูลเพิ่มนิดหนึ่งครับ เพื่อประเมินระบบโซลาร์ให้ใกล้เคียงจริง รบกวนส่งค่าไฟเฉลี่ยต่อเดือน ประเภทอาคาร รูปแบบการใช้ไฟกลางวัน/กลางคืน ระบบไฟ และจังหวัดก่อนครับ",
      requires_human_approval: true,
      risk_level: "medium",
      used_opal_pricing_version: pricing_config.opal_pricing_version
    };
  }

  const packageInfo = getPackageByTier(tier, pricing_config);
  if (!packageInfo) {
    throw new Error(`OPAL tier not found: ${tier}`);
  }

  const currentBill = event?.payload?.current_bill;
  const billText = typeof currentBill === "number" ? ` ถ้าค่าไฟประมาณ ${formatNumber(currentBill)} บาท/เดือน` : "";
  const draftReply =
    `จากข้อมูลเบื้องต้น${billText} ระบบที่เหมาะอาจอยู่ในกลุ่ม ${packageInfo.tier} ${formatNumber(packageInfo.price_thb)} บาท ` +
    `สำหรับ${packageInfo.positioning}ครับ ราคาจริงต้องประเมินจากบิลค่าไฟ รูปหลังคา ระบบไฟ และหน้างานก่อนครับ`;

  assertDraftPricingAllowed(draftReply, pricing_config, {
    allowedContextNumbers: typeof currentBill === "number" ? [currentBill] : []
  });

  return {
    intent_score: Math.round((opal_match.confidence || 0.5) * 100),
    recommended_tier: tier,
    draft_reply: draftReply,
    requires_human_approval: true,
    risk_level: event?.risk?.risk_level || "low",
    used_opal_pricing_version: pricing_config.opal_pricing_version
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("th-TH").format(value);
}
