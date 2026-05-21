import { createHash, randomUUID } from "node:crypto";

export function createLeadCoreStore() {
  const state = {
    leads: [],
    solar_estimates: [],
    lead_events: [],
    event_processing_log: [],
    dead_letter_events: [],
    agent_audit_logs: [],
    admin_access_audit_logs: [],
    webhook_security_audit_logs: [],
    reply_drafts: [],
    reply_outbox: []
  };

  return {
    state,
    createLeadFromEvent(event) {
      const payload = event.payload || {};
      const lead = {
        id: event.lead_id || randomUUID(),
        name: null,
        phone: null,
        line_user_id: null,
        province: payload.province || null,
        customer_type: payload.customer_type || null,
        current_bill: payload.current_bill ?? null,
        target_saving: payload.target_saving ?? null,
        usage_pattern: payload.usage_pattern || null,
        phase_type: payload.phase_type || null,
        lead_score: 0,
        lead_stage: "NEW_ESTIMATE",
        source_page: event.source || null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        consent_status: "unknown",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.leads.push(lead);
      return lead;
    },
    saveLeadEvent({ lead_id, event }) {
      const row = {
        id: randomUUID(),
        lead_id,
        event_id: event.event_id,
        event_type: event.event_type,
        event_payload: structuredClone(event),
        created_at: new Date().toISOString()
      };
      state.lead_events.push(row);
      return row;
    },
    saveSolarEstimate({ lead_id, opalMatch, packageInfo }) {
      const row = {
        id: randomUUID(),
        lead_id,
        opal_pricing_version: opalMatch.opal_pricing_version,
        recommended_tier: opalMatch.recommended_tier,
        recommended_kw_range: null,
        estimated_budget_min: packageInfo ? packageInfo.price_thb : null,
        estimated_budget_max: packageInfo ? packageInfo.price_thb : null,
        estimated_monthly_saving: null,
        estimated_payback_range: null,
        roof_area_note: "ต้องประเมินจากรูปหลังคาและหน้างาน",
        calculation_version: "static-mvp1",
        confidence: opalMatch.confidence,
        requires_more_info: opalMatch.requires_more_info,
        created_at: new Date().toISOString()
      };
      state.solar_estimates.push(row);
      return row;
    },
    saveReplyDraft({ lead_id, event_id, hermesDraft }) {
      const row = {
        id: randomUUID(),
        lead_id,
        event_id,
        draft_reply: hermesDraft.draft_reply,
        intent_score: hermesDraft.intent_score,
        recommended_tier: hermesDraft.recommended_tier,
        risk_level: hermesDraft.risk_level,
        status: "pending",
        approval_required: true,
        approved_by: null,
        rejected_by: null,
        review_note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.reply_drafts.push(row);
      return row;
    },
    listReplyDrafts({ status = null } = {}) {
      return state.reply_drafts
        .filter((row) => !status || row.status === status)
        .map((row) => ({
          ...row,
          lead: state.leads.find((lead) => lead.id === row.lead_id) || null,
          estimate: state.solar_estimates.find((estimate) => estimate.lead_id === row.lead_id) || null
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    updateReplyDraftStatus({ replyDraftId, status, reviewedBy, reviewNote = null }) {
      if (!["approved", "rejected"].includes(status)) {
        throw new Error("reply draft status must be approved or rejected");
      }
      const row = state.reply_drafts.find((item) => item.id === replyDraftId);
      if (!row) {
        throw new Error(`Reply draft not found: ${replyDraftId}`);
      }
      row.status = status;
      row.review_note = reviewNote;
      row.updated_at = new Date().toISOString();
      if (status === "approved") {
        row.approved_by = reviewedBy;
        row.rejected_by = null;
      } else {
        row.rejected_by = reviewedBy;
        row.approved_by = null;
      }
      return row;
    },
    createReplyOutboxFromApprovedDraft({
      replyDraftId,
      channel = "line_oa",
      queuedBy = "local-operator",
      recipientRef = null
    }) {
      const draft = state.reply_drafts.find((item) => item.id === replyDraftId);
      if (!draft) {
        throw new Error(`Reply draft not found: ${replyDraftId}`);
      }
      if (draft.status !== "approved") {
        throw new Error("reply draft must be approved before queueing outbox");
      }
      const existing = state.reply_outbox.find((item) => item.reply_draft_id === replyDraftId);
      if (existing) {
        return existing;
      }
      const row = {
        id: randomUUID(),
        reply_draft_id: draft.id,
        lead_id: draft.lead_id,
        event_id: draft.event_id,
        channel,
        recipient_ref: recipientRef,
        message_text: draft.draft_reply,
        status: "queued",
        external_send_allowed: false,
        external_send_performed: false,
        queued_by: queuedBy,
        blocked_by: null,
        cancelled_by: null,
        cancel_reason: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.reply_outbox.push(row);
      return row;
    },
    getReplyOutboxById(outboxId) {
      return state.reply_outbox.find((item) => item.id === outboxId) || null;
    },
    listReplyOutbox({ status = null } = {}) {
      return state.reply_outbox
        .filter((row) => !status || row.status === status)
        .map((row) => ({
          ...row,
          draft: state.reply_drafts.find((draft) => draft.id === row.reply_draft_id) || null,
          lead: state.leads.find((lead) => lead.id === row.lead_id) || null
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    cancelReplyOutbox({ outboxId, cancelledBy, cancelReason = null }) {
      const row = state.reply_outbox.find((item) => item.id === outboxId);
      if (!row) {
        throw new Error(`Reply outbox item not found: ${outboxId}`);
      }
      row.status = "cancelled";
      row.cancelled_by = cancelledBy;
      row.cancel_reason = cancelReason;
      row.updated_at = new Date().toISOString();
      return row;
    },
    markReplyOutboxBlocked({ outboxId, blockedBy, blockedReason }) {
      const row = state.reply_outbox.find((item) => item.id === outboxId);
      if (!row) {
        throw new Error(`Reply outbox item not found: ${outboxId}`);
      }
      row.status = "blocked";
      row.last_error = blockedReason;
      row.cancelled_by = null;
      row.cancel_reason = null;
      row.updated_at = new Date().toISOString();
      row.blocked_by = blockedBy;
      return row;
    },
    saveProcessingLog({
      event_id,
      source,
      status,
      attempt_count = 0,
      last_error = null,
      idempotency_key = null,
      processed_at = null
    }) {
      const row = {
        id: randomUUID(),
        event_id,
        source,
        status,
        attempt_count,
        last_error,
        idempotency_key,
        processed_at,
        created_at: new Date().toISOString()
      };
      state.event_processing_log.push(row);
      return row;
    },
    createDeadLetter({ message, failureReason, retryCount }) {
      const row = {
        id: randomUUID(),
        original_event_id: message.event_id,
        source: message.source,
        payload: structuredClone(message),
        failure_reason: failureReason,
        retry_count: retryCount,
        replay_status: "pending",
        replayed_by: null,
        replayed_at: null,
        created_at: new Date().toISOString()
      };
      state.dead_letter_events.push(row);
      return row;
    },
    getDeadLetterById(deadLetterId) {
      return state.dead_letter_events.find((item) => item.id === deadLetterId) || null;
    },
    markDeadLetterReplayed({ deadLetterId, replayedBy }) {
      const row = state.dead_letter_events.find((item) => item.id === deadLetterId);
      if (!row) {
        throw new Error(`Dead letter not found: ${deadLetterId}`);
      }
      row.replay_status = "replayed";
      row.replayed_by = replayedBy;
      row.replayed_at = new Date().toISOString();
      return row;
    },
    saveAgentAuditLog({
      agent_name,
      action_type,
      lead_id = null,
      event_id = null,
      model_used = "mock",
      prompt_version = "sprint1",
      input = null,
      output = null,
      approval_required = true,
      approved_by = null,
      metadata = {}
    }) {
      const row = {
        id: randomUUID(),
        agent_name,
        action_type,
        lead_id,
        event_id,
        model_used,
        prompt_version,
        input_hash: input ? hashObject(input) : null,
        output_hash: output ? hashObject(output) : null,
        approval_required,
        approved_by,
        metadata,
        created_at: new Date().toISOString()
      };
      state.agent_audit_logs.push(row);
      return row;
    },
    saveAdminAccessAuditLog({
      route,
      method,
      allowed,
      status_code,
      reason,
      actor_ref = "unknown",
      auth_mode = "blocked",
      metadata = {}
    }) {
      const row = {
        id: randomUUID(),
        route,
        method,
        allowed,
        status_code,
        reason,
        actor_ref,
        auth_mode,
        metadata,
        created_at: new Date().toISOString()
      };
      state.admin_access_audit_logs.push(row);
      return row;
    },
    saveWebhookSecurityAuditLog({
      provider,
      route,
      method,
      allowed,
      status_code,
      reason,
      signature_valid = false,
      replay_valid = false,
      rate_limited = false,
      idempotency_key_hash = null,
      remote_ref = "unknown",
      metadata = {}
    }) {
      const row = {
        id: randomUUID(),
        provider,
        route,
        method,
        allowed,
        status_code,
        reason,
        signature_valid,
        replay_valid,
        rate_limited,
        idempotency_key_hash,
        remote_ref,
        metadata,
        created_at: new Date().toISOString()
      };
      state.webhook_security_audit_logs.push(row);
      return row;
    }
  };
}

export function hashObject(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
