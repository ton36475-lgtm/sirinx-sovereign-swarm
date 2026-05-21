import { createHash, randomUUID } from "node:crypto";
import { detectPromptInjection } from "../../guardrails/src/promptInjection.mjs";

const CUSTOMER_TYPES = new Set([
  "home",
  "home_office",
  "shop",
  "office",
  "sme",
  "factory",
  "industrial",
  "unknown"
]);

const USAGE_PATTERNS = new Set([
  "daytime_heavy",
  "mixed",
  "nighttime_heavy",
  "unknown"
]);

const PHASE_TYPES = new Set([
  "single_phase",
  "three_phase",
  "unknown"
]);

export function createLeadIntentEventFromCalculator(input, now = new Date()) {
  const normalized = normalizeCalculatorInput(input);
  const question = buildQuestion(normalized);
  const injection = detectPromptInjection(question);
  const requestFingerprint = createFingerprint({
    source: "website_calculator",
    ...normalized
  });
  const eventId = `evt_calc_${requestFingerprint.slice(0, 16)}`;

  return {
    event_id: eventId,
    event_type: "lead.intent_detected",
    schema_version: "1.0",
    source: "website_calculator",
    channel_level: "owned",
    lead_id: null,
    payload: {
      text: question,
      current_bill: normalized.current_bill,
      target_saving: normalized.target_saving,
      customer_type: normalized.customer_type,
      province: normalized.province,
      usage_pattern: normalized.usage_pattern,
      phase_type: normalized.phase_type
    },
    risk: {
      pii_redacted: true,
      prompt_injection_detected: injection.prompt_injection_detected,
      risk_level: injection.risk_level
    },
    trace: {
      request_id: `req_calc_${randomUUID()}`,
      idempotency_key: `calculator_${requestFingerprint}`,
      received_at: now.toISOString()
    }
  };
}

export function normalizeCalculatorInput(input) {
  const currentBill = numberOrNull(input?.current_bill);
  const targetSaving = numberOrNull(input?.target_saving);
  const customerType = enumOrDefault(input?.customer_type, CUSTOMER_TYPES, "unknown");
  const usagePattern = enumOrDefault(input?.usage_pattern, USAGE_PATTERNS, "unknown");
  const phaseType = enumOrDefault(input?.phase_type, PHASE_TYPES, "unknown");
  const province = typeof input?.province === "string" && input.province.trim()
    ? input.province.trim().toLowerCase()
    : null;

  if (currentBill !== null && currentBill < 0) {
    throw new Error("current_bill must be zero or greater");
  }
  if (targetSaving !== null && targetSaving < 0) {
    throw new Error("target_saving must be zero or greater");
  }

  return {
    current_bill: currentBill,
    target_saving: targetSaving,
    customer_type: customerType,
    province,
    usage_pattern: usagePattern,
    phase_type: phaseType
  };
}

function buildQuestion(input) {
  const parts = [];
  if (input.current_bill !== null) {
    parts.push(`ค่าไฟ ${input.current_bill}`);
  }
  if (input.target_saving !== null) {
    parts.push(`อยากลดค่าไฟ ${input.target_saving}`);
  }
  parts.push(`ประเภท ${input.customer_type}`);
  parts.push(`ใช้ไฟ ${input.usage_pattern}`);
  parts.push(`ระบบไฟ ${input.phase_type}`);
  if (input.province) {
    parts.push(`จังหวัด ${input.province}`);
  }
  return `${parts.join(" ")} ติดโซลาร์ควรเริ่มประเมินกลุ่มไหน`;
}

function createFingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function enumOrDefault(value, allowed, fallback) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}
