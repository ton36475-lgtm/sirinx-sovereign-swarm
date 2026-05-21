import { randomUUID } from "node:crypto";
import { hashObject } from "../../audit-core/src/leadCoreStore.mjs";

export function createPostgresLeadCoreAdapter({ query, now = () => new Date() }) {
  if (typeof query !== "function") {
    throw new Error("createPostgresLeadCoreAdapter requires an injected query(sql, values) function");
  }

  return {
    async createLeadFromEvent(event) {
      const payload = event.payload || {};
      const row = await one(query, `
        insert into leads (
          id,
          province,
          customer_type,
          current_bill,
          target_saving,
          usage_pattern,
          phase_type,
          lead_score,
          lead_stage,
          source_page,
          consent_status,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 0, 'NEW_ESTIMATE', $8, 'unknown', $9, $9)
        returning *
      `, [
        event.lead_id || randomUUID(),
        payload.province || null,
        payload.customer_type || null,
        payload.current_bill ?? null,
        payload.target_saving ?? null,
        payload.usage_pattern || null,
        payload.phase_type || null,
        event.source || null,
        now().toISOString()
      ]);
      return row;
    },

    async saveLeadEvent({ lead_id, event }) {
      return one(query, `
        insert into lead_events (id, lead_id, event_id, event_type, event_payload, created_at)
        values ($1, $2, $3, $4, $5::jsonb, $6)
        on conflict (event_id) do nothing
        returning *
      `, [
        randomUUID(),
        lead_id,
        event.event_id,
        event.event_type,
        JSON.stringify(event),
        now().toISOString()
      ]);
    },

    async saveSolarEstimate({ lead_id, opalMatch, packageInfo }) {
      return one(query, `
        insert into solar_estimates (
          id,
          lead_id,
          opal_pricing_version,
          recommended_tier,
          recommended_kw_range,
          estimated_budget_min,
          estimated_budget_max,
          estimated_monthly_saving,
          estimated_payback_range,
          roof_area_note,
          calculation_version,
          confidence,
          requires_more_info,
          created_at
        )
        values ($1, $2, $3, $4, null, $5, $6, null, null, $7, 'static-mvp1', $8, $9, $10)
        returning *
      `, [
        randomUUID(),
        lead_id,
        opalMatch.opal_pricing_version,
        opalMatch.recommended_tier,
        packageInfo ? packageInfo.price_thb : null,
        packageInfo ? packageInfo.price_thb : null,
        "ต้องประเมินจากรูปหลังคาและหน้างาน",
        opalMatch.confidence,
        opalMatch.requires_more_info,
        now().toISOString()
      ]);
    },

    async saveReplyDraft({ lead_id, event_id, hermesDraft }) {
      return one(query, `
        insert into reply_drafts (
          id,
          lead_id,
          event_id,
          draft_reply,
          intent_score,
          recommended_tier,
          risk_level,
          status,
          approval_required,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'pending', true, $8, $8)
        returning *
      `, [
        randomUUID(),
        lead_id,
        event_id,
        hermesDraft.draft_reply,
        hermesDraft.intent_score,
        hermesDraft.recommended_tier,
        hermesDraft.risk_level,
        now().toISOString()
      ]);
    },

    async listReplyDrafts({ status = null } = {}) {
      const sql = status
        ? `
          select reply_drafts.*
          from reply_drafts
          where status = $1
          order by created_at desc
        `
        : `
          select reply_drafts.*
          from reply_drafts
          order by created_at desc
        `;
      const values = status ? [status] : [];
      const result = await query(normalizeSql(sql), values);
      return result?.rows || [];
    },

    async updateReplyDraftStatus({ replyDraftId, status, reviewedBy, reviewNote = null }) {
      if (!["approved", "rejected"].includes(status)) {
        throw new Error("reply draft status must be approved or rejected");
      }
      const reviewerColumn = status === "approved" ? "approved_by" : "rejected_by";
      return one(query, `
        update reply_drafts
        set status = $2,
            ${reviewerColumn} = $3,
            review_note = $4,
            updated_at = $5
        where id = $1
        returning *
      `, [
        replyDraftId,
        status,
        reviewedBy,
        reviewNote,
        now().toISOString()
      ]);
    },

    async createReplyOutboxFromApprovedDraft({
      replyDraftId,
      channel = "line_oa",
      queuedBy = "local-operator",
      recipientRef = null
    }) {
      return one(query, `
        insert into reply_outbox (
          id,
          reply_draft_id,
          lead_id,
          event_id,
          channel,
          recipient_ref,
          message_text,
          status,
          external_send_allowed,
          external_send_performed,
          queued_by,
          created_at,
          updated_at
        )
        select $1,
               reply_drafts.id,
               reply_drafts.lead_id,
               reply_drafts.event_id,
               $2,
               $3,
               reply_drafts.draft_reply,
               'queued',
               false,
               false,
               $5,
               $4,
               $4
        from reply_drafts
        where reply_drafts.id = $6
          and reply_drafts.status = 'approved'
        on conflict (reply_draft_id) do update
          set updated_at = excluded.updated_at
        returning *
      `, [
        randomUUID(),
        channel,
        recipientRef,
        now().toISOString(),
        queuedBy,
        replyDraftId
      ]);
    },

    async getReplyOutboxById(outboxId) {
      return one(query, `
        select *
        from reply_outbox
        where id = $1
        limit 1
      `, [
        outboxId
      ]);
    },

    async listReplyOutbox({ status = null } = {}) {
      const sql = status
        ? `
          select reply_outbox.*
          from reply_outbox
          where status = $1
          order by created_at desc
        `
        : `
          select reply_outbox.*
          from reply_outbox
          order by created_at desc
        `;
      const values = status ? [status] : [];
      const result = await query(normalizeSql(sql), values);
      return result?.rows || [];
    },

    async cancelReplyOutbox({ outboxId, cancelledBy, cancelReason = null }) {
      return one(query, `
        update reply_outbox
        set status = 'cancelled',
            cancelled_by = $2,
            cancel_reason = $3,
            updated_at = $4
        where id = $1
        returning *
      `, [
        outboxId,
        cancelledBy,
        cancelReason,
        now().toISOString()
      ]);
    },

    async markReplyOutboxBlocked({ outboxId, blockedBy, blockedReason }) {
      return one(query, `
        update reply_outbox
        set status = 'blocked',
            blocked_by = $2,
            last_error = $3,
            updated_at = $4
        where id = $1
        returning *
      `, [
        outboxId,
        blockedBy,
        blockedReason,
        now().toISOString()
      ]);
    },

    async saveProcessingLog({
      event_id,
      source,
      status,
      attempt_count = 0,
      last_error = null,
      idempotency_key = null,
      processed_at = null
    }) {
      return one(query, `
        insert into event_processing_log (
          id,
          event_id,
          source,
          status,
          attempt_count,
          last_error,
          idempotency_key,
          processed_at,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning *
      `, [
        randomUUID(),
        event_id,
        source,
        status,
        attempt_count,
        last_error,
        idempotency_key,
        processed_at,
        now().toISOString()
      ]);
    },

    async createDeadLetter({ message, failureReason, retryCount }) {
      return one(query, `
        insert into dead_letter_events (
          id,
          original_event_id,
          source,
          payload,
          failure_reason,
          retry_count,
          replay_status,
          created_at
        )
        values ($1, $2, $3, $4::jsonb, $5, $6, 'pending', $7)
        returning *
      `, [
        randomUUID(),
        message.event_id,
        message.source,
        JSON.stringify(message),
        failureReason,
        retryCount,
        now().toISOString()
      ]);
    },

    async getDeadLetterById(deadLetterId) {
      return one(query, `
        select *
        from dead_letter_events
        where id = $1
        limit 1
      `, [
        deadLetterId
      ]);
    },

    async markDeadLetterReplayed({ deadLetterId, replayedBy }) {
      return one(query, `
        update dead_letter_events
        set replay_status = 'replayed',
            replayed_by = $2,
            replayed_at = $3
        where id = $1
        returning *
      `, [
        deadLetterId,
        replayedBy,
        now().toISOString()
      ]);
    },

    async saveAgentAuditLog({
      agent_name,
      action_type,
      lead_id = null,
      event_id = null,
      model_used = "mock",
      prompt_version = "sprint3",
      input = null,
      output = null,
      approval_required = true,
      approved_by = null,
      metadata = {}
    }) {
      return one(query, `
        insert into agent_audit_logs (
          id,
          agent_name,
          action_type,
          lead_id,
          event_id,
          model_used,
          prompt_version,
          input_hash,
          output_hash,
          approval_required,
          approved_by,
          metadata,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
        returning *
      `, [
        randomUUID(),
        agent_name,
        action_type,
        lead_id,
        event_id,
        model_used,
        prompt_version,
        input ? hashObject(input) : null,
        output ? hashObject(output) : null,
        approval_required,
        approved_by,
        JSON.stringify(metadata),
        now().toISOString()
      ]);
    },

    async saveAdminAccessAuditLog({
      route,
      method,
      allowed,
      status_code,
      reason,
      actor_ref = "unknown",
      auth_mode = "blocked",
      metadata = {}
    }) {
      return one(query, `
        insert into admin_access_audit_logs (
          id,
          route,
          method,
          allowed,
          status_code,
          reason,
          actor_ref,
          auth_mode,
          metadata,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        returning *
      `, [
        randomUUID(),
        route,
        method,
        allowed,
        status_code,
        reason,
        actor_ref,
        auth_mode,
        JSON.stringify(metadata),
        now().toISOString()
      ]);
    },

    async saveWebhookSecurityAuditLog({
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
      return one(query, `
        insert into webhook_security_audit_logs (
          id,
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
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
        returning *
      `, [
        randomUUID(),
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
        JSON.stringify(metadata),
        now().toISOString()
      ]);
    }
  };
}

async function one(query, sql, values) {
  assertParameterized(sql, values);
  const result = await query(normalizeSql(sql), values);
  return result?.rows?.[0] || null;
}

export function assertParameterized(sql, values) {
  if (!Array.isArray(values)) {
    throw new Error("SQL values must be an array");
  }
  if (/\$\{\s*[^}]+\s*\}/.test(sql)) {
    throw new Error("SQL interpolation is not allowed");
  }
  if (/\bvalues\s*\([^)]*['"][^)]*\)/i.test(sql) && values.length === 0) {
    throw new Error("SQL literals in values clause require parameter review");
  }
}

function normalizeSql(sql) {
  return sql.trim().replace(/\s+/g, " ");
}
