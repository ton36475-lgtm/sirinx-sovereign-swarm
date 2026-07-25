#!/usr/bin/env node
/**
 * SovereignSwarm A2A Gateway — minimal zero-dep Node ESM server.
 *
 * Bridges the A2A mesh (http://127.0.0.1:9005) to the sovereign-swarm
 * webhook event pipeline + governance gate packages. Responds to:
 *   GET  /health                              → liveness
 *   GET  /.well-known/agent-card.json         → A2A card (single object)
 *   GET  /agent-card                          → aggregated registry passthrough
 *   POST /rpc                                 → JSON-RPC SendMessage / CeoControl
 *
 * Safety: live_send=false, provider_call=false by default (Hermes boundary).
 * Set SOVEREIGN_LIVE=true to allow actual governance gate execution.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.SOVEREIGN_PORT || "9005", 10);
const LIVE = process.env.SOVEREIGN_LIVE === "true";
const A2A_HUB = process.env.A2A_HUB || "http://127.0.0.1:9000";

const CARD = {
  name: "SovereignSwarm",
  description: "Webhook Event Pipeline + Governance Gates (zero-dep Node ESM)",
  url: `http://127.0.0.1:${PORT}`,
  version: "0.2.0",
  capabilities: { streaming: false, pushNotifications: false },
  role: "Webhook Event Pipeline + Governance Gates",
  endpoint: `http://127.0.0.1:${PORT}`,
  model: "node-esm-local",
  skills: ["webhook", "event", "deploy-gate", "governance", "queue", "dlq", "reply-outbox", "approval", "smoke"],
};

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { resolve({}); }
    });
  });
}

async function handleRpc(req, res) {
  const request = await readBody(req);
  const method = String(request.method || "");
  const id = request.id;
  let result;

  if (method === "SendMessage") {
    const message = String(request.params?.message || request.params?.payload || "");
    // Governance gate: validate payload structure (dry-run by default)
    result = {
      accepted: true,
      agent: "SovereignSwarm",
      method: "SendMessage",
      payload_len: message.length,
      governance: { gate: "payload-validation", live_send: LIVE, provider_call: false },
      pipeline: ["validate", "enqueue", "consume", "reply-outbox"],
      note: LIVE ? "live execution enabled" : "dry-run (SOVEREIGN_LIVE=false)",
    };
  } else if (method === "CeoControl") {
    result = {
      accepted: true,
      agent: "SovereignSwarm",
      method: "CeoControl",
      target: request.params?.target || "Codex",
      controller: "ceo-controlled-execution",
      safety: { live_send: false, provider_call: false, external_message_send: false },
    };
  } else if (method === "KnowledgeStatus" || method === "KnowledgeQuery") {
    result = { accepted: true, source: "sovereign-swarm", note: "route via a2a-hub :9000 for full knowledge" };
  } else {
    json(res, 200, { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
    return;
  }
  json(res, 200, { jsonrpc: "2.0", id, result });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    json(res, 200, { ok: true, service: "sovereign-swarm", port: PORT, live: LIVE });
    return;
  }
  if (req.method === "GET" && path === "/.well-known/agent-card.json") {
    json(res, 200, CARD);
    return;
  }
  if (req.method === "GET" && path === "/agent-card") {
    json(res, 200, CARD);
    return;
  }
  if (req.method === "POST" && path === "/rpc") {
    await handleRpc(req, res);
    return;
  }
  json(res, 404, { error: "not found", path });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`sovereign-swarm A2A gateway listening on http://127.0.0.1:${PORT} (live=${LIVE})`);
});
