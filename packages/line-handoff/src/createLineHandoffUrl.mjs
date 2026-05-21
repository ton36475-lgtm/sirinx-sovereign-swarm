export function createLineHandoffUrl({
  leadId,
  recommendedTier,
  currentBill,
  targetSaving,
  baseUrl = "https://line.me/R/ti/p/@sirinx"
}) {
  const message = [
    "สวัสดีครับ ผมต้องการประเมินติดตั้งโซลาร์กับ SIRINX",
    `Lead ID: ${leadId}`,
    `ค่าไฟปัจจุบัน: ${formatValue(currentBill)}`,
    `เป้าหมายลดค่าไฟ: ${formatValue(targetSaving)}`,
    `แพ็กเกจประเมินเบื้องต้น: ${recommendedTier || "ต้องประเมินเพิ่ม"}`
  ].join("\n");

  const url = new URL(baseUrl);
  url.searchParams.set("text", message);
  return url.toString();
}

function formatValue(value) {
  return value === undefined || value === null ? "-" : String(value);
}
