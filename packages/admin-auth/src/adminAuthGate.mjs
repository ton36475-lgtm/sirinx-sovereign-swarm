import { timingSafeEqual } from "node:crypto";

const ADMIN_TOKEN_ENV = "SIRINX_ADMIN_API_TOKEN";
const LOCAL_BYPASS_ENV = "SIRINX_ADMIN_LOCAL_DEV_BYPASS";
const TOKEN_HEADER = "x-sirinx-admin-token";
const ACTOR_HEADER = "x-sirinx-admin-actor";

export function inspectAdminAuthEnv(env = process.env) {
  const tokenPresent = hasNonEmpty(env[ADMIN_TOKEN_ENV]);
  const localDevBypassEnabled = String(env[LOCAL_BYPASS_ENV] || "").trim().toLowerCase() === "true";
  const missing = [];

  if (!tokenPresent) {
    missing.push(ADMIN_TOKEN_ENV);
  }
  if (localDevBypassEnabled) {
    missing.push("disable_local_dev_bypass_for_production");
  }

  return {
    productionReady: tokenPresent && !localDevBypassEnabled,
    token: {
      envName: ADMIN_TOKEN_ENV,
      present: tokenPresent,
      valuePrinted: false
    },
    localDevBypass: {
      envName: LOCAL_BYPASS_ENV,
      enabled: localDevBypassEnabled
    },
    missing,
    guardrail: "admin-auth-redacted-env-inspection-only"
  };
}

export function authorizeAdminRequest({
  headers,
  env = process.env,
  remoteAddress = null
}) {
  const authEnv = inspectAdminAuthEnv(env);
  const actorRef = normalizeActor(getHeader(headers, ACTOR_HEADER));

  if (authEnv.localDevBypass.enabled && isLoopback(remoteAddress)) {
    return allow({
      mode: "local-dev-bypass",
      actorRef,
      authEnv
    });
  }

  if (!authEnv.token.present) {
    return deny({
      statusCode: 401,
      reason: "admin_token_not_configured",
      actorRef,
      authEnv
    });
  }

  const providedToken = getHeader(headers, TOKEN_HEADER);
  if (!hasNonEmpty(providedToken)) {
    return deny({
      statusCode: 401,
      reason: "admin_token_missing",
      actorRef,
      authEnv
    });
  }

  if (!constantTimeEquals(String(providedToken), String(env[ADMIN_TOKEN_ENV]))) {
    return deny({
      statusCode: 403,
      reason: "admin_token_invalid",
      actorRef,
      authEnv
    });
  }

  return allow({
    mode: "token",
    actorRef,
    authEnv
  });
}

export function adminAuthFailureBody(decision) {
  return {
    status: "admin_auth_required",
    reason: decision.reason,
    auth: {
      token_present: decision.authEnv.token.present,
      token_value_printed: false,
      local_dev_bypass_enabled: decision.authEnv.localDevBypass.enabled
    }
  };
}

function allow({ mode, actorRef, authEnv }) {
  return {
    allowed: true,
    statusCode: 200,
    reason: "allowed",
    mode,
    actorRef,
    authEnv
  };
}

function deny({ statusCode, reason, actorRef, authEnv }) {
  return {
    allowed: false,
    statusCode,
    reason,
    mode: "blocked",
    actorRef,
    authEnv
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

function normalizeActor(value) {
  if (!hasNonEmpty(value)) {
    return "unknown";
  }
  return String(value).trim().slice(0, 96);
}

function isLoopback(remoteAddress) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost", null].includes(remoteAddress);
}

function constantTimeEquals(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function hasNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
