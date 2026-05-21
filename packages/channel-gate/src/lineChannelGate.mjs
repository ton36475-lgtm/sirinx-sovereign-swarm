const DEFAULT_TOKEN_ENV = "SIRINX_LINE_CHANNEL_ACCESS_TOKEN";
const DEFAULT_ALLOWLIST_ENV = "SIRINX_LINE_ALLOWED_RECIPIENTS";
const DEFAULT_SEND_FLAG_ENV = "SIRINX_EXTERNAL_SENDS_ENABLED";

export function inspectLineChannelEnv(env = process.env) {
  const tokenPresent = hasNonEmpty(env[DEFAULT_TOKEN_ENV]);
  const sendFlag = String(env[DEFAULT_SEND_FLAG_ENV] || "").trim().toLowerCase();
  const externalSendsEnabled = sendFlag === "true";
  const recipients = parseRecipientAllowlist(env[DEFAULT_ALLOWLIST_ENV]);
  const invalidRecipientCount = recipients.filter((recipient) => !isValidLineRecipientRef(recipient)).length;
  const hasValidAllowlist = recipients.length > 0 && invalidRecipientCount === 0;
  const missing = [];

  if (!tokenPresent) {
    missing.push(DEFAULT_TOKEN_ENV);
  }
  if (!hasValidAllowlist) {
    missing.push(DEFAULT_ALLOWLIST_ENV);
  }
  if (!externalSendsEnabled) {
    missing.push(DEFAULT_SEND_FLAG_ENV);
  }

  return {
    channel: "line_oa",
    productionReady: tokenPresent && hasValidAllowlist && externalSendsEnabled,
    externalSendsEnabled,
    token: {
      envName: DEFAULT_TOKEN_ENV,
      present: tokenPresent,
      valuePrinted: false
    },
    allowlist: {
      envName: DEFAULT_ALLOWLIST_ENV,
      present: hasNonEmpty(env[DEFAULT_ALLOWLIST_ENV]),
      count: recipients.length,
      invalidCount: invalidRecipientCount,
      valuePrinted: false
    },
    missing,
    guardrail: "redacted-env-inspection-only"
  };
}

export function isRecipientAllowed(recipientRef, env = process.env) {
  if (!isValidLineRecipientRef(recipientRef)) {
    return false;
  }
  return parseRecipientAllowlist(env[DEFAULT_ALLOWLIST_ENV]).includes(recipientRef);
}

export function isValidLineRecipientRef(value) {
  if (typeof value !== "string") {
    return false;
  }
  return /^(line_user|line_group|line_room):[A-Za-z0-9_-]{8,128}$/.test(value.trim());
}

export function parseRecipientAllowlist(value) {
  if (!hasNonEmpty(value)) {
    return [];
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
