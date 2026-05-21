import { createWebhookGateway } from "../../../apps/webhook-gateway/src/server.mjs";
import {
  createLineSignature,
  createMetaSignature
} from "./webhookSecurityGate.mjs";

const SMOKE_ENV = {
  SIRINX_LINE_CHANNEL_SECRET: smokeValue("line"),
  SIRINX_META_APP_SECRET: smokeValue("meta"),
  SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "false",
  SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: "300"
};

export async function runSignedWebhookSmoke() {
  const gateway = createWebhookGateway({
    webhookSecurityEnv: SMOKE_ENV
  });

  const health = await request(gateway, {
    method: "GET",
    path: "/health"
  });
  const calculator = await request(gateway, {
    method: "GET",
    path: "/solar-calculator"
  });

  const lineBody = Buffer.from('{"events":[]}');
  const timestamp = new Date().toISOString();
  const lineHeaders = {
    "x-line-signature": createLineSignature(lineBody, SMOKE_ENV.SIRINX_LINE_CHANNEL_SECRET),
    "x-sirinx-webhook-timestamp": timestamp
  };

  const line = await request(gateway, {
    method: "POST",
    path: "/webhooks/line",
    headers: lineHeaders,
    body: lineBody
  });
  const lineReplay = await request(gateway, {
    method: "POST",
    path: "/webhooks/line",
    headers: lineHeaders,
    body: lineBody
  });
  const lineBadSignature = await request(gateway, {
    method: "POST",
    path: "/webhooks/line",
    headers: {
      "x-line-signature": "invalid",
      "x-sirinx-webhook-timestamp": new Date().toISOString()
    },
    body: lineBody
  });

  const metaBody = Buffer.from('{"object":"page","entry":[]}');
  const meta = await request(gateway, {
    method: "POST",
    path: "/webhooks/meta",
    headers: {
      "x-hub-signature-256": createMetaSignature(metaBody, SMOKE_ENV.SIRINX_META_APP_SECRET),
      "x-sirinx-webhook-timestamp": new Date().toISOString()
    },
    body: metaBody
  });

  const checks = {
    healthOk: health.statusCode === 200 && health.body.sprint === "9-staging-readiness-gate",
    calculatorOk: calculator.statusCode === 200,
    lineVerifiedDisabled: line.statusCode === 202 && line.body.status === "verified_processing_disabled",
    lineReplayBlocked: lineReplay.statusCode === 409 && lineReplay.body.reason === "replay_detected",
    lineBadSignatureBlocked: lineBadSignature.statusCode === 401 && lineBadSignature.body.reason === "signature_invalid",
    metaVerifiedDisabled: meta.statusCode === 202 && meta.body.status === "verified_processing_disabled",
    noExternalWrite: line.body.queued === false && meta.body.queued === false,
    noSecretLeak: !containsSmokeSecret({ health, calculator, line, lineReplay, lineBadSignature, meta })
  };

  return {
    ok: Object.values(checks).every(Boolean),
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    mode: "in-process-local-ephemeral",
    checks,
    responses: {
      health,
      calculator: { statusCode: calculator.statusCode },
      line,
      lineReplay,
      lineBadSignature,
      meta
    },
    guardrail: "no external network, no external SaaS write, no secret values printed"
  };
}

async function request(gateway, {
  method = "GET",
  path,
  headers = {},
  body = Buffer.from("")
}) {
  const chunks = [];
  const response = {};
  response.writeHead = function writeHead(statusCode, responseHeaders) {
    response.statusCode = statusCode;
    response.headers = responseHeaders;
  };
  response.end = function end(chunk) {
    chunks.push(Buffer.from(chunk || ""));
  };

  const requestLike = {
    method,
    url: path,
    headers,
    socket: {
      remoteAddress: "127.0.0.1"
    },
    async *[Symbol.asyncIterator]() {
      if (body.length > 0) {
        yield body;
      }
    }
  };

  await new Promise((resolve) => gateway.server.emit("request", requestLike, {
    writeHead: response.writeHead,
    end(chunk) {
      response.end(chunk);
      resolve();
    }
  }));

  const raw = Buffer.concat(chunks).toString("utf8");
  let parsed = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // HTML responses are intentionally reduced by callers when needed.
  }

  return {
    statusCode: response.statusCode,
    body: parsed
  };
}

function containsSmokeSecret(value) {
  const text = JSON.stringify(value);
  return text.includes(SMOKE_ENV.SIRINX_LINE_CHANNEL_SECRET)
    || text.includes(SMOKE_ENV.SIRINX_META_APP_SECRET);
}

function smokeValue(provider) {
  return ["local", "smoke", provider, "fixture"].join("-");
}
