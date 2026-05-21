const outbox = document.querySelector("#outbox");
const refreshButton = document.querySelector("#refresh");

refreshButton.addEventListener("click", loadOutbox);
outbox.addEventListener("click", async (event) => {
  const id = event.target?.dataset?.id;
  const action = event.target?.dataset?.action;
  if (!id) {
    return;
  }
  if (action === "simulate-send") {
    await simulateSend(id);
  } else {
    await cancelOutbox(id);
  }
  await loadOutbox();
});

await loadOutbox();

async function loadOutbox() {
  const response = await fetch("/api/admin/reply-outbox?status=all");
  const data = await response.json();
  const items = data.items || [];

  if (items.length === 0) {
    outbox.innerHTML = '<p class="empty">No outbox items. Approve a draft and queue it for gated send.</p>';
    return;
  }

  outbox.innerHTML = items.map(renderItem).join("");
}

async function cancelOutbox(id) {
  const response = await fetch(`/api/admin/reply-outbox/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      cancelled_by: "local-operator",
      cancel_reason: "cancelled from local outbox"
    })
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || data.status || "cancel failed");
  }
}

async function simulateSend(id) {
  const response = await fetch(`/api/admin/reply-outbox/${encodeURIComponent(id)}/simulate-send`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      simulated_by: "local-operator"
    })
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || data.status || "simulate send failed");
  }
}

function renderItem(item) {
  return `
    <article class="outbox-card">
      <div class="outbox-head">
        <span>${escapeHtml(item.id)}</span>
        <span class="status">${escapeHtml(item.status)}</span>
      </div>
      <p class="message">${escapeHtml(item.message_text)}</p>
      <div class="outbox-meta">
        <span>channel: ${escapeHtml(item.channel)}</span>
        <span>allowed: ${escapeHtml(item.external_send_allowed)}</span>
        <span>sent: ${escapeHtml(item.external_send_performed)}</span>
        <span>recipient: ${item.recipient_ref ? "present" : "missing"}</span>
      </div>
      ${item.last_error ? `<p class="error">${escapeHtml(item.last_error)}</p>` : ""}
      ${item.status === "queued" ? `
        <div class="actions">
          <button class="simulate" data-action="simulate-send" data-id="${escapeAttribute(item.id)}" type="button">Run channel gate</button>
          <button class="cancel" data-action="cancel" data-id="${escapeAttribute(item.id)}" type="button">Cancel outbox item</button>
        </div>
      ` : ""}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
