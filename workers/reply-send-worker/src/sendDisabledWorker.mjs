import {
  inspectLineChannelEnv,
  isRecipientAllowed,
  isValidLineRecipientRef
} from "../../../packages/channel-gate/src/lineChannelGate.mjs";

export function evaluateReplyOutboxForSend(outboxItem, { env = process.env } = {}) {
  const lineEnv = inspectLineChannelEnv(env);
  const blockedReasons = [];

  if (!outboxItem) {
    blockedReasons.push("outbox_item_missing");
  } else {
    if (outboxItem.status !== "queued") {
      blockedReasons.push("outbox_status_not_queued");
    }
    if (outboxItem.channel !== "line_oa") {
      blockedReasons.push("unsupported_channel");
    }
    if (outboxItem.external_send_allowed !== true) {
      blockedReasons.push("external_send_not_allowed");
    }
    if (outboxItem.external_send_performed === true) {
      blockedReasons.push("external_send_already_performed");
    }
    if (!isValidLineRecipientRef(outboxItem.recipient_ref)) {
      blockedReasons.push("recipient_ref_missing_or_invalid");
    } else if (!isRecipientAllowed(outboxItem.recipient_ref, env)) {
      blockedReasons.push("recipient_not_allowlisted");
    }
  }

  if (!lineEnv.productionReady) {
    blockedReasons.push("line_env_not_production_ready");
  }

  return {
    readyForProductionWorker: blockedReasons.length === 0,
    blockedReasons,
    lineEnv,
    external_send_performed: false
  };
}

export function simulateSendDisabledWorker(outboxItem, { env = process.env } = {}) {
  const evaluation = evaluateReplyOutboxForSend(outboxItem, { env });
  return {
    status: "blocked_send_disabled",
    outbox_id: outboxItem?.id || null,
    worker: "send-disabled-local-simulator",
    readyForProductionWorker: evaluation.readyForProductionWorker,
    blockedReasons: [
      ...evaluation.blockedReasons,
      "send_disabled_worker_no_external_writes"
    ],
    lineEnv: evaluation.lineEnv,
    external_send_performed: false
  };
}
