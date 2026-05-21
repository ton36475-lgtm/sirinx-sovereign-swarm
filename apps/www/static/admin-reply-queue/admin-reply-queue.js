const queue = document.querySelector("#queue");
const refreshButton = document.querySelector("#refresh");
const pendingCount = document.querySelector("#pending-count");
const approvedCount = document.querySelector("#approved-count");
const rejectedCount = document.querySelector("#rejected-count");

refreshButton.addEventListener("click", loadQueue);
queue.addEventListener("click", async (event) => {
  const action = event.target?.dataset?.action;
  const id = event.target?.dataset?.id;
  if (!action || !id) {
    return;
  }
  await reviewDraft(id, action);
  await loadQueue();
});

await loadQueue();

async function loadQueue() {
  const [pending, approved, rejected] = await Promise.all([
    fetchDrafts("pending"),
    fetchDrafts("approved"),
    fetchDrafts("rejected")
  ]);
  pendingCount.textContent = String(pending.length);
  approvedCount.textContent = String(approved.length);
  rejectedCount.textContent = String(rejected.length);

  if (pending.length === 0) {
    queue.innerHTML = '<p class="empty">No pending drafts. Create a test lead from the calculator.</p>';
    return;
  }

  queue.innerHTML = pending.map(renderDraft).join("");
}

async function fetchDrafts(status) {
  const response = await fetch(`/api/admin/reply-drafts?status=${encodeURIComponent(status)}`);
  const data = await response.json();
  return data.drafts || [];
}

async function reviewDraft(id, action) {
  const response = await fetch(`/api/admin/reply-drafts/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      reviewed_by: "local-operator",
      review_note: `${action} from local console`
    })
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || data.status || "review failed");
  }
}

function renderDraft(draft) {
  const lead = draft.lead || {};
  const estimate = draft.estimate || {};
  return `
    <article class="draft-card">
      <div class="draft-head">
        <span>${escapeHtml(draft.id)}</span>
        <span class="tier">${escapeHtml(draft.recommended_tier || "NO TIER")}</span>
      </div>
      <p class="draft-copy">${escapeHtml(draft.draft_reply)}</p>
      <div class="lead-grid">
        <span>ค่าไฟ: ${escapeHtml(lead.current_bill ?? "-")}</span>
        <span>เป้าหมาย: ${escapeHtml(lead.target_saving ?? "-")}</span>
        <span>อาคาร: ${escapeHtml(lead.customer_type ?? "-")}</span>
        <span>งบประเมิน: ${escapeHtml(estimate.estimated_budget_min ?? "-")}</span>
      </div>
      <div class="actions">
        <button class="approve" data-action="approve" data-id="${escapeAttribute(draft.id)}" type="button">Approve draft</button>
        <button class="reject" data-action="reject" data-id="${escapeAttribute(draft.id)}" type="button">Reject draft</button>
      </div>
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
