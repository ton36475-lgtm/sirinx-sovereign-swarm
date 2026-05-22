const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export async function onRequest(context) {
  const origin = context.env?.SIRINX_API_ORIGIN;
  const localOriginAllowed = String(context.env?.SIRINX_ALLOW_LOCAL_API_ORIGIN || "")
    .trim()
    .toLowerCase() === "true";
  const originDecision = validateApiOrigin(origin, {
    localOriginAllowed
  });

  if (!originDecision.ok) {
    return jsonResponse({
      status: "api_origin_not_ready",
      reason: originDecision.reason,
      secret_value_printed: false
    }, 503);
  }

  const requestUrl = new URL(context.request.url);
  const targetUrl = buildApiProxyTargetUrl({
    apiOrigin: origin,
    requestPathname: requestUrl.pathname,
    requestSearch: requestUrl.search
  });
  if (!targetUrl.ok) {
    return jsonResponse({
      status: "api_proxy_target_invalid",
      reason: targetUrl.reason,
      secret_value_printed: false
    }, 400);
  }

  const proxiedRequest = new Request(targetUrl.url, {
    method: context.request.method,
    headers: buildProxyHeaders(context.request.headers),
    body: shouldForwardBody(context.request.method) ? context.request.body : undefined,
    redirect: "manual"
  });
  return fetch(proxiedRequest);
}

export function validateApiOrigin(value, { localOriginAllowed = false } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: false,
      reason: "missing_api_origin"
    };
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return {
      ok: false,
      reason: "invalid_api_origin_url"
    };
  }

  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localOriginAllowed && localHost)) {
    return {
      ok: false,
      reason: "api_origin_must_be_https"
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: "api_origin_must_not_include_credentials"
    };
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    return {
      ok: false,
      reason: "api_origin_must_be_origin_only"
    };
  }

  return {
    ok: true,
    reason: "api_origin_valid"
  };
}

export function buildApiProxyTargetUrl({
  apiOrigin,
  requestPathname,
  requestSearch = ""
}) {
  const originDecision = validateApiOrigin(apiOrigin, {
    localOriginAllowed: true
  });
  if (!originDecision.ok) {
    return originDecision;
  }
  const safePathname = String(requestPathname || "/");
  if (!safePathname.startsWith("/api/")) {
    return {
      ok: false,
      reason: "proxy_route_must_stay_under_api"
    };
  }

  const url = new URL(apiOrigin);
  url.pathname = safePathname;
  url.search = String(requestSearch || "");
  return {
    ok: true,
    reason: "proxy_target_valid",
    url: url.toString()
  };
}

export function buildProxyHeaders(inputHeaders) {
  const headers = new Headers(inputHeaders);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.set("x-sirinx-proxy", "cloudflare-pages");
  return headers;
}

function shouldForwardBody(method) {
  return !["GET", "HEAD"].includes(String(method || "GET").toUpperCase());
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
