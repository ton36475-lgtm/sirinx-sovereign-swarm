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
