import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";

const LINE_SECRET_ENV = "SIRINX_LINE_CHANNEL_SECRET";
const META_SECRET_ENV = "SIRINX_META_APP_SECRET";
const PROCESSING_ENABLED_ENV = "SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED";
const REPLAY_WINDOW_ENV = "SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS";
const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

export function inspectWebhookSecurityEnv(env = process.env) {
  const lineSecretPresent = hasNonEmpty(env[LINE_SECRET_ENV]);
  const metaSecretPresent = hasNonEmpty(env[META_SECRET_ENV]);
  const processingEnabled = String(env[PROCESSING_ENABLED_ENV] || "").trim().toLowerCase() === "true";
  const replayWindowSeconds = parseReplayWindow(env[REPLAY_WINDOW_ENV]);
  const missing = [];

  if (!lineSecretPresent) {
    missing.push(LINE_SECRET_ENV);
  }
  if (!metaSecretPresent) {
    missing.push(META_SECRET_ENV);
  }
  if (!replayWindowSeconds.valid) {
    missing.push(REPLAY_WINDOW_ENV);
  }
  if (!processingEnabled) {
    missing.push(`${PROCESSING_ENABLED_ENV}=true`);
  }

  return {
    productionReady: lineSecretPresent && metaSecretPresent && replayWindowSeconds.valid && processingEnabled,
    signatureGateReady: lineSecretPresent && metaSecretPresent && replayWindowSeconds.valid,
    processing: {
      envName: PROCESSING_ENABLED_ENV,
      enabled: processingEnabled
    },
    line: {
      secretEnvName: LINE_SECRET_ENV,
      secretPresent: lineSecretPresent,
      secretValuePrinted: false
    },
    meta: {
      secretEnvName: META_SECRET_ENV,
      secretPresent: metaSecretPresent,
      secretValuePrinted: false
    },
    replayWindow: {
      envName: REPLAY_WINDOW_ENV,
      seconds: replayWindowSeconds.value,
      valid: replayWindowSeconds.valid
    },
    missing,
    guardrail: "webhook-security-redacted-env-inspection-only"
  };
}

export function createLineSignature(rawBody, channelSecret) {
  return createHmac("sha256", channelSecret)
    .update(toBuffer(rawBody))
    .digest("base64");
}

export function verifyLineSignature({ rawBody, signature, channelSecret }) {
  if (!hasNonEmpty(signature) || !hasNonEmpty(channelSecret)) {
    return false;
  }
  return constantTimeEquals(String(signature), createLineSignature(rawBody, channelSecret));
}

export function createMetaSignature(rawBody, appSecret) {
  const digest = createHmac("sha256", appSecret)
    .update(toBuffer(rawBody))
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyMetaSignature({ rawBody, signature, appSecret }) {
  if (!hasNonEmpty(signature) || !hasNonEmpty(appSecret)) {
    return false;
  }
  const value = String(signature).trim();
  if (!value.startsWith("sha256=")) {
    return false;
  }
  return constantTimeEquals(value, createMetaSignature(rawBody, appSecret));
}

export function verifyReplayWindow({
  timestamp,
  nowMs = Date.now(),
  windowSeconds = DEFAULT_REPLAY_WINDOW_SECONDS
}) {
  if (!hasNonEmpty(timestamp)) {
    return {
      ok: false,
      reason: "timestamp_missing"
    };
  }

  const timestampMs = parseTimestampMs(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return {
      ok: false,
      reason: "timestamp_invalid"
    };
  }

  const windowMs = Number(windowSeconds) * 1000;
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    return {
      ok: false,
      reason: "replay_window_invalid"
    };
  }

  const skewMs = Math.abs(Number(nowMs) - timestampMs);
  if (skewMs > windowMs) {
    return {
      ok: false,
      reason: timestampMs > Number(nowMs) ? "timestamp_from_future" : "timestamp_expired",
      skew_ms: skewMs
    };
  }

  return {
    ok: true,
    reason: "replay_window_valid",
    skew_ms: skewMs
  };
}

export function createWebhookReplayKey({
  provider,
  rawBody,
  signature,
  timestamp
}) {
  return createHash("sha256")
    .update(String(provider || "unknown"))
    .update("\n")
    .update(toBuffer(rawBody))
    .update("\n")
    .update(String(signature || ""))
    .update("\n")
    .update(String(timestamp || ""))
    .digest("hex");
}

export function createInMemoryRateLimiter({
  limit = 60,
  windowMs = 60_000
} = {}) {
  const buckets = new Map();

  return {
    check({ key, nowMs = Date.now() }) {
      const normalizedKey = String(key || "unknown");
      const current = buckets.get(normalizedKey);
      if (!current || Number(nowMs) >= current.resetAt) {
        const resetAt = Number(nowMs) + Number(windowMs);
        buckets.set(normalizedKey, {
          count: 1,
          resetAt
        });
        return {
          allowed: true,
          remaining: Math.max(0, Number(limit) - 1),
          reset_at: new Date(resetAt).toISOString()
        };
      }

      current.count += 1;
      const allowed = current.count <= Number(limit);
      return {
        allowed,
        remaining: Math.max(0, Number(limit) - current.count),
        reset_at: new Date(current.resetAt).toISOString()
      };
    }
  };
}

export function evaluateSocialWebhookRequest({
  provider,
  rawBody,
  headers,
  env = process.env,
  nowMs = Date.now(),
  replayStore = new Set(),
  rateLimiter = null,
  remoteAddress = null
}) {
  const normalizedProvider = String(provider || "").toLowerCase();
  if (!["line", "meta"].includes(normalizedProvider)) {
    return deny({
      statusCode: 400,
      reason: "provider_not_supported"
    });
  }

  const envState = inspectWebhookSecurityEnv(env);
  const rateLimitKey = `${normalizedProvider}:${remoteAddress ? "remote-present" : "remote-unknown"}`;
  const rateLimit = rateLimiter
    ? rateLimiter.check({ key: rateLimitKey, nowMs })
    : { allowed: true, remaining: null, reset_at: null };
  if (!rateLimit.allowed) {
    return deny({
      statusCode: 429,
      reason: "rate_limited",
      rateLimit,
      envState
    });
  }

  const signatureHeaderName = normalizedProvider === "line"
    ? "x-line-signature"
    : "x-hub-signature-256";
  const signature = getHeader(headers, signatureHeaderName);
  if (!hasNonEmpty(signature)) {
    return deny({
      statusCode: 401,
      reason: "signature_missing",
      rateLimit,
      envState
    });
  }

  const secret = normalizedProvider === "line"
    ? env[LINE_SECRET_ENV]
    : env[META_SECRET_ENV];
  if (!hasNonEmpty(secret)) {
    return deny({
      statusCode: 503,
      reason: "webhook_secret_not_configured",
      signaturePresent: true,
      rateLimit,
      envState
    });
  }

  const signatureValid = normalizedProvider === "line"
    ? verifyLineSignature({ rawBody, signature, channelSecret: secret })
    : verifyMetaSignature({ rawBody, signature, appSecret: secret });
  if (!signatureValid) {
    return deny({
      statusCode: 401,
      reason: "signature_invalid",
      signaturePresent: true,
      rateLimit,
      envState
    });
  }

  const timestamp = getHeader(headers, "x-sirinx-webhook-timestamp");
  const replayWindow = verifyReplayWindow({
    timestamp,
    nowMs,
    windowSeconds: envState.replayWindow.seconds
  });
  if (!replayWindow.ok) {
    return deny({
      statusCode: 400,
      reason: replayWindow.reason,
      signaturePresent: true,
      signatureValid: true,
      rateLimit,
      envState,
      replayWindow
    });
  }

  const replayKey = createWebhookReplayKey({
    provider: normalizedProvider,
    rawBody,
    signature,
    timestamp
  });
  if (replayStore.has(replayKey)) {
    return deny({
      statusCode: 409,
      reason: "replay_detected",
      signaturePresent: true,
      signatureValid: true,
      replayValid: true,
      replayKeyHash: replayKey,
      rateLimit,
      envState,
      replayWindow
    });
  }
  replayStore.add(replayKey);

  if (!envState.processing.enabled) {
    return allow({
      statusCode: 202,
      reason: "verified_processing_disabled",
      processingEnabled: false,
      replayKeyHash: replayKey,
      rateLimit,
      envState,
      replayWindow
    });
  }

  return allow({
    statusCode: 202,
    reason: "verified_processing_enabled_not_wired",
    processingEnabled: true,
    replayKeyHash: replayKey,
    rateLimit,
    envState,
    replayWindow
  });
}

function allow({
  statusCode,
  reason,
  processingEnabled,
  replayKeyHash,
  rateLimit,
  envState,
  replayWindow
}) {
  return {
    allowed: true,
    statusCode,
    reason,
    signature_present: true,
    signature_valid: true,
    replay_valid: true,
    replay_key_hash: replayKeyHash,
    rate_limit: rateLimit,
    processing_enabled: processingEnabled,
    production_ready: envState.productionReady,
    secret_value_printed: false,
    raw_body_stored: false,
    signature_value_stored: false,
    replay_window: replayWindow
  };
}

function deny({
  statusCode,
  reason,
  signaturePresent = false,
  signatureValid = false,
  replayValid = false,
  replayKeyHash = null,
  rateLimit = null,
  envState = inspectWebhookSecurityEnv({}),
  replayWindow = null
}) {
  return {
    allowed: false,
    statusCode,
    reason,
    signature_present: signaturePresent,
    signature_valid: signatureValid,
    replay_valid: replayValid,
    replay_key_hash: replayKeyHash,
    rate_limit: rateLimit,
    processing_enabled: envState.processing.enabled,
    production_ready: envState.productionReady,
    secret_value_printed: false,
    raw_body_stored: false,
    signature_value_stored: false,
    replay_window: replayWindow
  };
}

function getHeader(headers, name) {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  return headers[name] || headers[name.toLowerCase()] || null;
}

function parseReplayWindow(value) {
  if (!hasNonEmpty(value)) {
    return {
      value: DEFAULT_REPLAY_WINDOW_SECONDS,
      valid: true
    };
  }
  const parsed = Number(value);
  return {
    value: parsed,
    valid: Number.isInteger(parsed) && parsed > 0 && parsed <= 3600
  };
}

function parseTimestampMs(value) {
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return text.length <= 10 ? numeric * 1000 : numeric;
  }
  return Date.parse(text);
}

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function toBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value || ""), "utf8");
}

function hasNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
