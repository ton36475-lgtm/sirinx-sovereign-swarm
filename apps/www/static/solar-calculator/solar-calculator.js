const form = document.querySelector("#estimate-form");
const result = document.querySelector("#result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.innerHTML = '<p class="empty-state">กำลังประเมิน...</p>';

  const formData = new FormData(form);
  const payload = {
    current_bill: formData.get("current_bill"),
    target_saving: formData.get("target_saving"),
    customer_type: formData.get("customer_type"),
    usage_pattern: formData.get("usage_pattern"),
    phase_type: formData.get("phase_type"),
    province: formData.get("province")
  };

  try {
    const response = await fetch("/api/solar-estimate", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.status || "estimate failed");
    }
    renderResult(data);
  } catch (error) {
    result.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
});

function renderResult(data) {
  if (data.status === "duplicate_ignored") {
    result.innerHTML = `
      <p class="result-kicker">Duplicate blocked</p>
      <h2 class="tier">กันข้อมูลซ้ำ</h2>
      <p class="result-copy">${escapeHtml(data.note)}</p>
    `;
    return;
  }

  const budget = formatBudget(data.estimated_budget_min, data.estimated_budget_max);
  const warnings = (data.warnings || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  result.innerHTML = `
    <p class="result-kicker">${escapeHtml(data.opal_pricing_version || "OPAL")}</p>
    <h2 class="tier">${escapeHtml(data.recommended_tier || "ต้องขอข้อมูลเพิ่ม")}</h2>
    <p class="budget">${budget}</p>
    <p class="result-copy">${escapeHtml(data.draft_reply || "")}</p>
    <ul class="warning-list">${warnings}</ul>
    <a class="line-link" href="${escapeAttribute(data.line_handoff_url || "#")}" target="_blank" rel="noreferrer">ส่งข้อมูลต่อใน LINE</a>
  `;
}

function formatBudget(min, max) {
  if (typeof min !== "number" || typeof max !== "number") {
    return "ต้องประเมินเพิ่ม";
  }
  if (min === max) {
    return `${new Intl.NumberFormat("th-TH").format(min)} บาท`;
  }
  return `${new Intl.NumberFormat("th-TH").format(min)}-${new Intl.NumberFormat("th-TH").format(max)} บาท`;
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
