import fs from "node:fs";
import path from "node:path";
import { createLeadCoreStore } from "../../packages/audit-core/src/leadCoreStore.mjs";
import { createWebhookGateway } from "../../apps/webhook-gateway/src/server.mjs";
import { InMemoryEventQueue } from "../../workers/queue-consumer/src/inMemoryQueue.mjs";
import { processWithRetries } from "../../workers/queue-consumer/src/processLeadIntent.mjs";

export function readFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "..", "fixtures", name), "utf8")
  );
}

export function createSprint1Harness() {
  const store = createLeadCoreStore();
  const queue = new InMemoryEventQueue();
  const gateway = createWebhookGateway({ queue, store });

  return {
    store,
    queue,
    gateway,
    async drainQueue() {
      return queue.consume(message => processWithRetries(message, { store }));
    },
  };
}
