import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createLeadCoreStore } from "../../../packages/audit-core/src/leadCoreStore.mjs";
import {
  validateLeadIntentDetectedEvent,
  withTraceDefaults
} from "../../../packages/event-schemas/src/leadIntentDetected.mjs";
import { InMemoryEventQueue } from "../../../workers/queue-consumer/src/inMemoryQueue.mjs";
import { replayDeadLetter } from "../../../workers/queue-consumer/src/processLeadIntent.mjs";
import { createSolarEstimate } from "../../../packages/solar-calculator/src/createSolarEstimate.mjs";

const STATIC_ROOT = new URL("../../www/static/", import.meta.url);

export function createWebhookGateway({
  queue = new InMemoryEventQueue(),
  store = createLeadCoreStore(),
  idempotency = new Set()
} = {}) {
  async function handleMockWebhook(payload) {
    const event = withTraceDefaults(payload);
    const validation = validateLeadIntentDetectedEvent(event);
    if (!validation.ok) {
      return {
        statusCode: 400,
        body: {
          status: "invalid_event",
          errors: validation.errors
        }
      };
    }

    const idempotencyKey = event.trace.idempotency_key;
    if (idempotency.has(idempotencyKey)) {
      return {
        statusCode: 200,
        body: {
          status: "duplicate_ignored",
          event_id: event.event_id,
          idempotency_key: idempotencyKey
        }
      };
    }

    idempotency.add(idempotencyKey);
    store.saveProcessingLog({
      event_id: event.event_id,
      source: event.source,
      status: "received",
      idempotency_key: idempotencyKey
    });
    await queue.enqueue(event);

    return {
      statusCode: 202,
      body: {
        status: "accepted",
        event_id: event.event_id,
        request_id: event.trace.request_id,
        queued: true
      }
    };
  }

  async function handleDlqReplay(deadLetterId, payload = {}) {
    const result = await replayDeadLetter(deadLetterId, {
      store,
      replayedBy: payload.replayed_by || "operator",
      patchPayload: payload.patch_payload || { force_error: false }
    });
    return {
      statusCode: 200,
      body: result
    };
  }

  async function handleSolarEstimate(payload = {}) {
    return createSolarEstimate(payload, {
      gateway: {
        queue,
        store,
        idempotency,
        handleMockWebhook
      }
    });
  }

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

      if (request.method === "GET" && requestUrl.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "webhook-gateway",
          sprint: "2-local-proof"
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/solar-calculator") {
        return sendStatic(response, "solar-calculator/index.html", "text/html; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/solar-calculator.css") {
        return sendStatic(response, "solar-calculator/solar-calculator.css", "text/css; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/solar-calculator.js") {
        return sendStatic(response, "solar-calculator/solar-calculator.js", "text/javascript; charset=utf-8");
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/solar-estimate") {
        const payload = await readJsonBody(request);
        const result = await handleSolarEstimate(payload);
        return sendJson(response, result.statusCode, result.body);
      }

      if (request.method === "POST" && requestUrl.pathname === "/webhooks/mock") {
        const payload = await readJsonBody(request);
        const result = await handleMockWebhook(payload);
        return sendJson(response, result.statusCode, result.body);
      }

      if (request.method === "POST" && ["/webhooks/line", "/webhooks/meta"].includes(requestUrl.pathname)) {
        return sendJson(response, 501, {
          status: "not_enabled_in_sprint_1",
          reason: "Production social webhook integration is blocked until signature verification and platform credentials are explicitly configured."
        });
      }

      const replayMatch = requestUrl.pathname.match(/^\/dlq\/replay\/([^/]+)$/);
      if (request.method === "POST" && replayMatch) {
        const payload = await readJsonBody(request);
        const result = await handleDlqReplay(decodeURIComponent(replayMatch[1]), payload);
        return sendJson(response, result.statusCode, result.body);
      }

      return sendJson(response, 404, {
        status: "not_found"
      });
    } catch (error) {
      return sendJson(response, 500, {
        status: "error",
        message: error.message
      });
    }
  });

  return {
    server,
    queue,
    store,
    idempotency,
    handleMockWebhook,
    handleDlqReplay,
    handleSolarEstimate
  };
}

export function startWebhookGateway({ port = 8787 } = {}) {
  const gateway = createWebhookGateway();
  gateway.server.listen(port);
  return gateway;
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

async function sendStatic(response, fileName, contentType) {
  const fileUrl = new URL(fileName, STATIC_ROOT);
  const body = await readFile(fileUrl);
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(body);
}
