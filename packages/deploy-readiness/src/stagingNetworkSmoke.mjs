import {
  createLineSignature,
  createMetaSignature
} from "../../webhook-security/src/webhookSecurityGate.mjs";

const REQUIRED_ENABLED_ENV = [
  "SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED",
  "SIRINX_STAGING_ORIGIN",
  "SIRINX_LINE_CHANNEL_SECRET",
  "SIRINX_META_APP_SECRET"
];

export function buildStagingNetworkSmokePlan({ env = process.env } = {}) {
  const enabled = String(env.SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED || "")
    .trim()
    .toLowerCase() === "true";
  const origin = validateStagingOrigin(env.SIRINX_STAGING_ORIGIN);
  const lineSecretPresent = hasNonEmpty(env.SIRINX_LINE_CHANNEL_SECRET);
  const metaSecretPresent = hasNonEmpty(env.SIRINX_META_APP_SECRET);
  const missing = [];

  if (!enabled) {
    missing.push("SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED=true");
  }
  if (!origin.ok) {
    missing.push(`SIRINX_STAGING_ORIGIN:${origin.reason}`);
  }
  if (!lineSecretPresent) {
    missing.push("SIRINX_LINE_CHANNEL_SECRET");
  }
  if (!metaSecretPresent) {
    missing.push("SIRINX_META_APP_SECRET");
  }

  return {
    enabled,
    ready: enabled && origin.ok && lineSecretPresent && metaSecretPresent,
    origin: {
      present: hasNonEmpty(env.SIRINX_STAGING_ORIGIN),
      valid: origin.ok,
      valuePrinted: false
    },
    secrets: {
      lineChannelSecretPresent: lineSecretPresent,
      metaAppSecretPresent: metaSecretPresent,
      valuesPrinted: false
    },
    requiredEnv: REQUIRED_ENABLED_ENV,
    missing,
    plannedRequests: [
      "GET /health",
      "GET /solar-calculator",
      "POST /webhooks/line signed",
      "POST /webhooks/line replay",
      "POST /webhooks/line bad-signature",
      "POST /webhooks/meta signed"
    ],
    networkCallsPerformed: false,
    note: "Network smoke is disabled by default and only runs when all required env is present."
  };
}

export async function runStagingNetworkSmoke({
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const plan = buildStagingNetworkSmokePlan({ env });
  if (!plan.ready) {
    return {
      ok: true,
      status: "skipped",
      plan,
      checks: {},
      responses: {},
      guardrail: "no network call performed; missing explicit staging smoke approval or runtime env"
    };
  }

  const origin = String(env.SIRINX_STAGING_ORIGIN).trim().replace(/\/+$/, "");
  const health = await requestJson(fetchImpl, `${origin}/health`);
  const calculator = await requestStatus(fetchImpl, `${origin}/solar-calculator`);

  const lineBody = Buffer.from('{"events":[]}');
  const timestamp = new Date().toISOString();
  const lineHeaders = {
    "content-type": "application/json",
    "x-line-signature": createLineSignature(lineBody, env.SIRINX_LINE_CHANNEL_SECRET),
    "x-sirinx-webhook-timestamp": timestamp
  };
  const line = await requestJson(fetchImpl, `${origin}/webhooks/line`, {
    method: "POST",
    headers: lineHeaders,
    body: lineBody
  });
  const lineReplay = await requestJson(fetchImpl, `${origin}/webhooks/line`, {
    method: "POST",
    headers: lineHeaders,
    body: lineBody
  });
  const lineBadSignature = await requestJson(fetchImpl, `${origin}/webhooks/line`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": "invalid",
      "x-sirinx-webhook-timestamp": new Date().toISOString()
    },
    body: lineBody
  });

  const metaBody = Buffer.from('{"object":"page","entry":[]}');
  const meta = await requestJson(fetchImpl, `${origin}/webhooks/meta`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": createMetaSignature(metaBody, env.SIRINX_META_APP_SECRET),
      "x-sirinx-webhook-timestamp": new Date().toISOString()
    },
    body: metaBody
  });

  const checks = {
    healthOk: health.statusCode === 200 && health.body?.service === "webhook-gateway",
    calculatorOk: calculator.statusCode === 200,
    lineVerifiedDisabled: line.statusCode === 202 && line.body?.status === "verified_processing_disabled",
    lineReplayBlocked: lineReplay.statusCode === 409 && lineReplay.body?.reason === "replay_detected",
    lineBadSignatureBlocked: lineBadSignature.statusCode === 401 && lineBadSignature.body?.reason === "signature_invalid",
    metaVerifiedDisabled: meta.statusCode === 202 && meta.body?.status === "verified_processing_disabled",
    noExternalWrite: line.body?.queued === false && meta.body?.queued === false,
    noSecretLeak: !containsAnySecret({
      payload: { health, calculator, line, lineReplay, lineBadSignature, meta },
      env
    })
  };
  const ok = Object.values(checks).every(Boolean);

  return {
    ok,
    status: ok ? "passed" : "failed",
    plan: {
      ...plan,
      networkCallsPerformed: true
    },
    checks,
    responses: {
      health,
      calculator,
      line,
      lineReplay,
      lineBadSignature,
      meta
    },
    guardrail: "staging network smoke only; no external SaaS write expected; no secret values printed"
  };
}

function validateStagingOrigin(value) {
  if (!hasNonEmpty(value)) {
    return {
      ok: false,
      reason: "missing"
    };
  }
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return {
      ok: false,
      reason: "invalid_url"
    };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "must_be_https"
    };
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    return {
      ok: false,
      reason: "must_be_origin_only_without_credentials"
    };
  }
  return {
    ok: true,
    reason: "valid"
  };
}

async function requestStatus(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, init);
  return {
    statusCode: response.status
  };
}

async function requestJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON responses stay reduced by callers when needed.
  }
  return {
    statusCode: response.status,
    body
  };
}

function containsAnySecret({ payload, env }) {
  const serialized = JSON.stringify(payload);
  return [
    env.SIRINX_LINE_CHANNEL_SECRET,
    env.SIRINX_META_APP_SECRET
  ]
    .filter(hasNonEmpty)
    .some((value) => serialized.includes(value));
}

function hasNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
