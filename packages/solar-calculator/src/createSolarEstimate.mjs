import { createLeadIntentEventFromCalculator } from "./createLeadIntentEvent.mjs";
import { processWithRetries } from "../../../workers/queue-consumer/src/processLeadIntent.mjs";
import { createLineHandoffUrl } from "../../line-handoff/src/createLineHandoffUrl.mjs";

export async function createSolarEstimate(input, { gateway }) {
  const event = createLeadIntentEventFromCalculator(input);
  const accepted = await gateway.handleMockWebhook(event);

  if (accepted.statusCode === 400) {
    return {
      statusCode: 400,
      body: accepted.body
    };
  }

  if (accepted.body.status === "duplicate_ignored") {
    return {
      statusCode: 200,
      body: {
        status: "duplicate_ignored",
        event_id: accepted.body.event_id,
        idempotency_key: accepted.body.idempotency_key,
        note: "คำขอซ้ำถูกกันไว้เพื่อไม่สร้าง lead/event ซ้ำ"
      }
    };
  }

  const results = await gateway.queue.consume((message) =>
    processWithRetries(message, {
      store: gateway.store
    })
  );
  const result = results.at(-1);

  if (!result || result.status !== "processed") {
    return {
      statusCode: 202,
      body: {
        status: result?.status || "queued",
        event_id: event.event_id,
        dlq: result?.dead_letter_id || null
      }
    };
  }

  const estimate = gateway.store.state.solar_estimates.at(-1);
  const lead = gateway.store.state.leads.find((item) => item.id === result.lead_id);
  const lineHandoffUrl = createLineHandoffUrl({
    leadId: result.lead_id,
    recommendedTier: result.opal_match.recommended_tier,
    currentBill: lead?.current_bill,
    targetSaving: lead?.target_saving
  });

  return {
    statusCode: 200,
    body: {
      status: "estimate_created",
      event_id: event.event_id,
      lead_id: result.lead_id,
      recommended_tier: result.opal_match.recommended_tier,
      opal_pricing_version: result.opal_match.opal_pricing_version,
      confidence: result.opal_match.confidence,
      requires_more_info: result.opal_match.requires_more_info,
      reason: result.opal_match.reason,
      estimated_budget_min: estimate?.estimated_budget_min ?? null,
      estimated_budget_max: estimate?.estimated_budget_max ?? null,
      calculation_version: estimate?.calculation_version ?? "static-mvp1",
      draft_reply: result.hermes_draft.draft_reply,
      line_handoff_url: lineHandoffUrl,
      warnings: [
        "นี่เป็นผลประเมินเบื้องต้น ไม่ใช่ใบเสนอราคาฉบับจริง",
        "ราคาจริงต้องประเมินจากบิลค่าไฟ รูปหลังคา ระบบไฟ และหน้างาน",
        "ระบบไม่รับประกันผลประหยัดค่าไฟแน่นอนโดยไม่ตรวจข้อมูลจริง"
      ]
    }
  };
}
