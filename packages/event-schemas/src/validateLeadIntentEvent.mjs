import { randomUUID } from "node:crypto";

const allowed = {
  event_type: new Set(["lead.intent_detected"]),
  schema_version: new Set(["1.0"]),
  source: new Set([
    "website_calculator",
    "line_oa",
    "facebook_owned_page",
    "facebook_ads_comment",
    "manual_import",
    "test",
  ]),
  channel_level: new Set([
    "owned",
    "inbound_consent",
    "partner_authorized",
    "public_review_only",
  ]),
  customer_type: new Set([
    "home",
    "home_office",
    "shop",
    "office",
    "sme",
    "factory",
    "industrial",
    "unknown",
    null,
    undefined,
  ]),
  usage_pattern: new Set([
    "daytime_heavy",
    "mixed",
    "nighttime_heavy",
    "unknown",
    null,
    undefined,
  ]),
  phase_type: new Set(["single_phase", "three_phase", "unknown", null, undefined]),
  risk_level: new Set(["low", "medium", "high"]),
};

function assertObject(value, path, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function assertString(value, path, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function assertEnum(value, field, path, errors) {
  if (!allowed[field].has(value)) {
    errors.push(`${path} has invalid value ${String(value)}`);
  }
}

function assertNumberOrNull(value, path, errors) {
  if (value !== null && value !== undefined && typeof value !== "number") {
    errors.push(`${path} must be a number or null`);
  }
}

export function withTraceDefaults(event, now = new Date()) {
  const eventId = event.event_id || `evt_${randomUUID()}`;
  const trace = event.trace ?? {};
  return {
    ...event,
    event_id: eventId,
    trace: {
      request_id: trace.request_id || `req_${randomUUID()}`,
      idempotency_key: trace.idempotency_key || `dryrun_${eventId}`,
      received_at: trace.received_at || now.toISOString(),
    },
  };
}

export function validateLeadIntentDetectedEvent(rawEvent) {
  const event = withTraceDefaults(rawEvent);
  const errors = [];

  assertString(event.event_id, "event_id", errors);
  assertString(event.event_type, "event_type", errors);
  assertEnum(event.event_type, "event_type", "event_type", errors);
  assertEnum(event.schema_version, "schema_version", "schema_version", errors);
  assertEnum(event.source, "source", "source", errors);
  assertEnum(event.channel_level, "channel_level", "channel_level", errors);

  if (event.lead_id !== null && event.lead_id !== undefined && typeof event.lead_id !== "string") {
    errors.push("lead_id must be a string or null");
  }

  if (assertObject(event.payload, "payload", errors)) {
    if (event.payload.text !== null && event.payload.text !== undefined && typeof event.payload.text !== "string") {
      errors.push("payload.text must be a string or null");
    }
    assertNumberOrNull(event.payload.current_bill, "payload.current_bill", errors);
    assertNumberOrNull(event.payload.target_saving, "payload.target_saving", errors);
    assertEnum(event.payload.customer_type, "customer_type", "payload.customer_type", errors);
    assertEnum(event.payload.usage_pattern, "usage_pattern", "payload.usage_pattern", errors);
    assertEnum(event.payload.phase_type, "phase_type", "payload.phase_type", errors);
    if (
      event.payload.force_error !== null &&
      event.payload.force_error !== undefined &&
      typeof event.payload.force_error !== "boolean"
    ) {
      errors.push("payload.force_error must be a boolean or null");
    }
  }

  if (assertObject(event.risk, "risk", errors)) {
    if (typeof event.risk.pii_redacted !== "boolean") {
      errors.push("risk.pii_redacted must be boolean");
    }
    if (typeof event.risk.prompt_injection_detected !== "boolean") {
      errors.push("risk.prompt_injection_detected must be boolean");
    }
    assertEnum(event.risk.risk_level, "risk_level", "risk.risk_level", errors);
  }

  if (assertObject(event.trace, "trace", errors)) {
    assertString(event.trace.request_id, "trace.request_id", errors);
    assertString(event.trace.idempotency_key, "trace.idempotency_key", errors);
    assertString(event.trace.received_at, "trace.received_at", errors);
  }

  return {
    ok: errors.length === 0,
    event,
    errors,
  };
}
