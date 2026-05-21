import { randomUUID } from "node:crypto";

export const EVENT_TYPE = "lead.intent_detected";

const SOURCE_VALUES = new Set([
  "website_calculator",
  "line_oa",
  "facebook_owned_page",
  "facebook_ads_comment",
  "manual_import",
  "test"
]);

const CHANNEL_LEVEL_VALUES = new Set([
  "owned",
  "inbound_consent",
  "partner_authorized",
  "public_review_only"
]);

const CUSTOMER_TYPE_VALUES = new Set([
  "home",
  "home_office",
  "shop",
  "office",
  "sme",
  "factory",
  "industrial",
  "unknown",
  null,
  undefined
]);

const USAGE_PATTERN_VALUES = new Set([
  "daytime_heavy",
  "mixed",
  "nighttime_heavy",
  "unknown",
  null,
  undefined
]);

const PHASE_TYPE_VALUES = new Set([
  "single_phase",
  "three_phase",
  "unknown",
  null,
  undefined
]);

const RISK_LEVEL_VALUES = new Set(["low", "medium", "high"]);

export function createRequestId() {
  return `req_${randomUUID()}`;
}

export function createIdempotencyKey(event) {
  const eventId = event?.event_id || randomUUID();
  const source = event?.source || "unknown";
  return `${source}_${eventId}`;
}

export function withTraceDefaults(event, now = new Date()) {
  const normalized = structuredClone(event);
  normalized.trace = normalized.trace || {};
  normalized.trace.request_id = normalized.trace.request_id || createRequestId();
  normalized.trace.idempotency_key =
    normalized.trace.idempotency_key || createIdempotencyKey(normalized);
  normalized.trace.received_at =
    normalized.trace.received_at || now.toISOString();
  return normalized;
}

export function validateLeadIntentDetectedEvent(event) {
  const errors = [];

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return { ok: false, errors: ["event must be an object"] };
  }

  requiredString(event, "event_id", errors);
  if (event.event_type !== EVENT_TYPE) {
    errors.push("event_type must be lead.intent_detected");
  }
  if (event.schema_version !== "1.0") {
    errors.push("schema_version must be 1.0");
  }
  if (!SOURCE_VALUES.has(event.source)) {
    errors.push("source is not allowed");
  }
  if (!CHANNEL_LEVEL_VALUES.has(event.channel_level)) {
    errors.push("channel_level is not allowed");
  }

  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    errors.push("payload must be an object");
  } else {
    optionalNullableString(event.payload, "text", errors);
    optionalNullableNumber(event.payload, "current_bill", errors);
    optionalNullableNumber(event.payload, "target_saving", errors);
    if (!CUSTOMER_TYPE_VALUES.has(event.payload.customer_type)) {
      errors.push("payload.customer_type is not allowed");
    }
    optionalNullableString(event.payload, "province", errors);
    if (!USAGE_PATTERN_VALUES.has(event.payload.usage_pattern)) {
      errors.push("payload.usage_pattern is not allowed");
    }
    if (!PHASE_TYPE_VALUES.has(event.payload.phase_type)) {
      errors.push("payload.phase_type is not allowed");
    }
    if (
      event.payload.force_error !== undefined &&
      event.payload.force_error !== null &&
      typeof event.payload.force_error !== "boolean"
    ) {
      errors.push("payload.force_error must be boolean or null");
    }
  }

  if (!event.risk || typeof event.risk !== "object" || Array.isArray(event.risk)) {
    errors.push("risk must be an object");
  } else {
    if (typeof event.risk.pii_redacted !== "boolean") {
      errors.push("risk.pii_redacted must be boolean");
    }
    if (typeof event.risk.prompt_injection_detected !== "boolean") {
      errors.push("risk.prompt_injection_detected must be boolean");
    }
    if (!RISK_LEVEL_VALUES.has(event.risk.risk_level)) {
      errors.push("risk.risk_level is not allowed");
    }
  }

  if (!event.trace || typeof event.trace !== "object" || Array.isArray(event.trace)) {
    errors.push("trace must be an object");
  } else {
    requiredString(event.trace, "request_id", errors);
    requiredString(event.trace, "idempotency_key", errors);
    requiredString(event.trace, "received_at", errors);
  }

  return errors.length === 0 ? { ok: true, value: event } : { ok: false, errors };
}

export function assertValidLeadIntentDetectedEvent(event) {
  const result = validateLeadIntentDetectedEvent(event);
  if (!result.ok) {
    throw new Error(`Invalid LeadIntentDetectedEvent: ${result.errors.join("; ")}`);
  }
  return result.value;
}

function requiredString(object, field, errors) {
  if (typeof object[field] !== "string" || object[field].trim() === "") {
    errors.push(`${field} must be a non-empty string`);
  }
}

function optionalNullableString(object, field, errors) {
  if (
    object[field] !== undefined &&
    object[field] !== null &&
    typeof object[field] !== "string"
  ) {
    errors.push(`${field} must be string or null`);
  }
}

function optionalNullableNumber(object, field, errors) {
  if (
    object[field] !== undefined &&
    object[field] !== null &&
    typeof object[field] !== "number"
  ) {
    errors.push(`${field} must be number or null`);
  }
}
