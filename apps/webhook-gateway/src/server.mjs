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
import { simulateSendDisabledWorker } from "../../../workers/reply-send-worker/src/sendDisabledWorker.mjs";

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

  async function listReplyDrafts(status = "pending") {
    const drafts = store.listReplyDrafts
      ? await store.listReplyDrafts({ status: status === "all" ? null : status })
      : [];
    return {
      statusCode: 200,
      body: {
        status: "ok",
        drafts
      }
    };
  }

  async function reviewReplyDraft(replyDraftId, reviewStatus, payload = {}) {
    const reviewedBy = payload.reviewed_by || "local-operator";
    const reviewNote = payload.review_note || null;
    const draft = await store.updateReplyDraftStatus({
      replyDraftId,
      status: reviewStatus,
      reviewedBy,
      reviewNote
    });
    await store.saveAgentAuditLog({
      agent_name: "HumanApproval",
      action_type: reviewStatus === "approved" ? "reply.approved" : "reply.rejected",
      lead_id: draft.lead_id,
      event_id: draft.event_id,
      model_used: "human-operator",
      prompt_version: "sprint4-human-approval",
      input: { replyDraftId, reviewStatus, reviewNote },
      output: draft,
      approval_required: false,
      approved_by: reviewedBy,
      metadata: {
        external_send_performed: false
      }
    });
    return {
      statusCode: 200,
      body: {
        status: reviewStatus,
        draft,
        external_send_performed: false
      }
    };
  }

  async function queueApprovedReplyDraft(replyDraftId, payload = {}) {
    const queuedBy = payload.queued_by || payload.reviewed_by || "local-operator";
    const channel = payload.channel || "line_oa";
    const recipientRef = payload.recipient_ref || null;
    const outbox = await store.createReplyOutboxFromApprovedDraft({
      replyDraftId,
      channel,
      queuedBy,
      recipientRef
    });
    await store.saveAgentAuditLog({
      agent_name: "ReplyOutbox",
      action_type: "reply.outbox_queued",
      lead_id: outbox.lead_id,
      event_id: outbox.event_id,
      model_used: "human-operator",
      prompt_version: "sprint5-gated-outbox",
      input: { replyDraftId, channel, recipient_ref_present: Boolean(recipientRef) },
      output: outbox,
      approval_required: true,
      approved_by: queuedBy,
      metadata: {
        external_send_allowed: false,
        external_send_performed: false
      }
    });
    return {
      statusCode: 200,
      body: {
        status: "queued",
        outbox,
        external_send_allowed: false,
        external_send_performed: false
      }
    };
  }

  async function simulateReplyOutboxSend(outboxId, payload = {}) {
    const simulatedBy = payload.simulated_by || "local-operator";
    const outboxItem = store.getReplyOutboxById
      ? await store.getReplyOutboxById(outboxId)
      : null;
    if (!outboxItem) {
      throw new Error(`Reply outbox item not found: ${outboxId}`);
    }

    const simulation = simulateSendDisabledWorker(outboxItem, {
      env: process.env
    });
    const blockedReason = simulation.blockedReasons.join(",");
    const outbox = await store.markReplyOutboxBlocked({
      outboxId,
      blockedBy: simulatedBy,
      blockedReason
    });
    await store.saveAgentAuditLog({
      agent_name: "ReplySendWorker",
      action_type: "reply.send_blocked",
      lead_id: outbox.lead_id,
      event_id: outbox.event_id,
      model_used: "send-disabled-local-simulator",
      prompt_version: "sprint6-channel-gate",
      input: {
        outboxId,
        channel: outbox.channel,
        recipient_ref_present: Boolean(outbox.recipient_ref)
      },
      output: simulation,
      approval_required: true,
      approved_by: simulatedBy,
      metadata: {
        external_send_performed: false,
        blocked_reasons: simulation.blockedReasons,
        line_env_production_ready: simulation.lineEnv.productionReady
      }
    });

    return {
      statusCode: 200,
      body: {
        status: "blocked",
        outbox,
        simulation,
        external_send_performed: false
      }
    };
  }

  async function listReplyOutbox(status = "queued") {
    const items = store.listReplyOutbox
      ? await store.listReplyOutbox({ status: status === "all" ? null : status })
      : [];
    return {
      statusCode: 200,
      body: {
        status: "ok",
        items
      }
    };
  }

  async function cancelReplyOutbox(outboxId, payload = {}) {
    const cancelledBy = payload.cancelled_by || "local-operator";
    const cancelReason = payload.cancel_reason || null;
    const outbox = await store.cancelReplyOutbox({
      outboxId,
      cancelledBy,
      cancelReason
    });
    await store.saveAgentAuditLog({
      agent_name: "ReplyOutbox",
      action_type: "reply.outbox_cancelled",
      lead_id: outbox.lead_id,
      event_id: outbox.event_id,
      model_used: "human-operator",
      prompt_version: "sprint5-gated-outbox",
      input: { outboxId, cancelReason },
      output: outbox,
      approval_required: true,
      approved_by: cancelledBy,
      metadata: {
        external_send_performed: false
      }
    });
    return {
      statusCode: 200,
      body: {
        status: "cancelled",
        outbox,
        external_send_performed: false
      }
    };
  }

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

      if (request.method === "GET" && requestUrl.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "webhook-gateway",
          sprint: "6-channel-gate-simulator"
        });
      }

      if (request.method === "GET" && requestUrl.pathname === "/solar-calculator") {
        return sendStatic(response, "solar-calculator/index.html", "text/html; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/admin/reply-queue") {
        return sendStatic(response, "admin-reply-queue/index.html", "text/html; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/admin/outbox") {
        return sendStatic(response, "admin-outbox/index.html", "text/html; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/solar-calculator.css") {
        return sendStatic(response, "solar-calculator/solar-calculator.css", "text/css; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/solar-calculator.js") {
        return sendStatic(response, "solar-calculator/solar-calculator.js", "text/javascript; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/admin-reply-queue.css") {
        return sendStatic(response, "admin-reply-queue/admin-reply-queue.css", "text/css; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/admin-reply-queue.js") {
        return sendStatic(response, "admin-reply-queue/admin-reply-queue.js", "text/javascript; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/admin-outbox.css") {
        return sendStatic(response, "admin-outbox/admin-outbox.css", "text/css; charset=utf-8");
      }

      if (request.method === "GET" && requestUrl.pathname === "/static/admin-outbox.js") {
        return sendStatic(response, "admin-outbox/admin-outbox.js", "text/javascript; charset=utf-8");
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/solar-estimate") {
        const payload = await readJsonBody(request);
        const result = await handleSolarEstimate(payload);
        return sendJson(response, result.statusCode, result.body);
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/admin/reply-drafts") {
        const result = await listReplyDrafts(requestUrl.searchParams.get("status") || "pending");
        return sendJson(response, result.statusCode, result.body);
      }

      const replyReviewMatch = requestUrl.pathname.match(/^\/api\/admin\/reply-drafts\/([^/]+)\/(approve|reject)$/);
      if (request.method === "POST" && replyReviewMatch) {
        const payload = await readJsonBody(request);
        const reviewStatus = replyReviewMatch[2] === "approve" ? "approved" : "rejected";
        const result = await reviewReplyDraft(decodeURIComponent(replyReviewMatch[1]), reviewStatus, payload);
        return sendJson(response, result.statusCode, result.body);
      }

      const queueSendMatch = requestUrl.pathname.match(/^\/api\/admin\/reply-drafts\/([^/]+)\/queue-send$/);
      if (request.method === "POST" && queueSendMatch) {
        const payload = await readJsonBody(request);
        const result = await queueApprovedReplyDraft(decodeURIComponent(queueSendMatch[1]), payload);
        return sendJson(response, result.statusCode, result.body);
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/admin/reply-outbox") {
        const result = await listReplyOutbox(requestUrl.searchParams.get("status") || "queued");
        return sendJson(response, result.statusCode, result.body);
      }

      const outboxCancelMatch = requestUrl.pathname.match(/^\/api\/admin\/reply-outbox\/([^/]+)\/cancel$/);
      if (request.method === "POST" && outboxCancelMatch) {
        const payload = await readJsonBody(request);
        const result = await cancelReplyOutbox(decodeURIComponent(outboxCancelMatch[1]), payload);
        return sendJson(response, result.statusCode, result.body);
      }

      const outboxSimulateSendMatch = requestUrl.pathname.match(/^\/api\/admin\/reply-outbox\/([^/]+)\/simulate-send$/);
      if (request.method === "POST" && outboxSimulateSendMatch) {
        const payload = await readJsonBody(request);
        const result = await simulateReplyOutboxSend(decodeURIComponent(outboxSimulateSendMatch[1]), payload);
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
    handleSolarEstimate,
    listReplyDrafts,
    reviewReplyDraft,
    queueApprovedReplyDraft,
    listReplyOutbox,
    cancelReplyOutbox,
    simulateReplyOutboxSend
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
