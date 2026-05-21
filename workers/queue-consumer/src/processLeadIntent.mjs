import { assertValidLeadIntentDetectedEvent } from "../../../packages/event-schemas/src/leadIntentDetected.mjs";
import {
  getPackageByTier,
  loadOpalPricingConfig,
  matchTier
} from "../../../packages/opal-pricing-config/src/matchTier.mjs";
import { createHermesDraft } from "../../../packages/hermes-core/src/draftMock.mjs";

export async function processLeadIntent(message, { store, pricingConfig = loadOpalPricingConfig() }) {
  const event = assertValidLeadIntentDetectedEvent(message);

  if (event.payload?.force_error) {
    throw new Error("Forced processing error");
  }

  const opalMatch = matchTier(event, pricingConfig);
  const packageInfo = opalMatch.recommended_tier
    ? getPackageByTier(opalMatch.recommended_tier, pricingConfig)
    : null;
  const hermesDraft = createHermesDraft({
    event,
    opal_match: opalMatch,
    pricing_config: pricingConfig
  });
  const lead = await store.createLeadFromEvent(event);
  await store.saveLeadEvent({ lead_id: lead.id, event });
  await store.saveSolarEstimate({ lead_id: lead.id, opalMatch, packageInfo });
  const replyDraft = store.saveReplyDraft
    ? await store.saveReplyDraft({ lead_id: lead.id, event_id: event.event_id, hermesDraft })
    : null;
  await store.saveAgentAuditLog({
    agent_name: "Hermes",
    action_type: "reply.draft_created",
    lead_id: lead.id,
    event_id: event.event_id,
    model_used: "hermes-draft-mock",
    prompt_version: "hermes-sprint1-static-opal",
    input: { event, opalMatch },
    output: hermesDraft,
    approval_required: true,
    metadata: {
      opal_pricing_version: opalMatch.opal_pricing_version,
      recommended_tier: opalMatch.recommended_tier
    }
  });
  await store.saveProcessingLog({
    event_id: event.event_id,
    source: event.source,
    status: "processed",
    attempt_count: 1,
    idempotency_key: event.trace.idempotency_key,
    processed_at: new Date().toISOString()
  });

  return {
    status: "processed",
    lead_id: lead.id,
    opal_match: opalMatch,
    hermes_draft: hermesDraft,
    reply_draft_id: replyDraft?.id || null
  };
}

export async function processWithRetries(
  message,
  {
    store,
    pricingConfig = loadOpalPricingConfig(),
    maxRetries = 3
  }
) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await processLeadIntent(message, { store, pricingConfig });
    } catch (error) {
      lastError = error;
      await store.saveProcessingLog({
        event_id: message.event_id,
        source: message.source,
        status: "failed",
        attempt_count: attempt,
        last_error: error.message,
        idempotency_key: message.trace?.idempotency_key || null
      });
    }
  }

  const deadLetter = await store.createDeadLetter({
    message,
    failureReason: lastError?.message || "unknown",
    retryCount: maxRetries
  });
  await store.saveAgentAuditLog({
    agent_name: "DLQ",
    action_type: "dlq.event_created",
    event_id: message.event_id,
    input: message,
    output: deadLetter,
    approval_required: true,
    metadata: {
      retry_count: maxRetries,
      failure_reason: deadLetter.failure_reason
    }
  });

  return {
    status: "dead_lettered",
    dead_letter_id: deadLetter.id,
    retry_count: maxRetries,
    failure_reason: deadLetter.failure_reason
  };
}

export async function replayDeadLetter(
  deadLetterId,
  {
    store,
    replayedBy = "operator",
    pricingConfig = loadOpalPricingConfig(),
    patchPayload = { force_error: false }
  }
) {
  const deadLetter = store.getDeadLetterById
    ? await store.getDeadLetterById(deadLetterId)
    : store.state.dead_letter_events.find((item) => item.id === deadLetterId);
  if (!deadLetter) {
    throw new Error(`Dead letter not found: ${deadLetterId}`);
  }

  const replayMessage = structuredClone(deadLetter.payload);
  replayMessage.payload = {
    ...(replayMessage.payload || {}),
    ...patchPayload
  };

  const result = await processWithRetries(replayMessage, {
    store,
    pricingConfig
  });

  const replayed = await store.markDeadLetterReplayed({ deadLetterId, replayedBy });
  await store.saveAgentAuditLog({
    agent_name: "DLQ",
    action_type: "dlq.event_replayed",
    event_id: deadLetter.original_event_id,
    input: deadLetter,
    output: { replayed, result },
    approval_required: true,
    approved_by: replayedBy,
    metadata: {
      replay_status: replayed.replay_status
    }
  });

  return {
    status: "replayed",
    dead_letter_id: deadLetterId,
    processing_result: result
  };
}
