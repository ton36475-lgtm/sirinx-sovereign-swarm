import { createHash, randomUUID } from "node:crypto";

export function createLeadCoreStore() {
  const state = {
    leads: [],
    solar_estimates: [],
    lead_events: [],
    event_processing_log: [],
    dead_letter_events: [],
    agent_audit_logs: []
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
    }
  };
}

export function hashObject(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
