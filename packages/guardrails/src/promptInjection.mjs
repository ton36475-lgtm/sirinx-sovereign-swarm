export const PROMPT_INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /ลืมคำสั่งก่อนหน้า/i,
  /reveal system prompt/i,
  /เปิดเผย system prompt/i,
  /output hidden prompt/i,
  /ให้ส่วนลด\s*90\s*%/i,
  /เปลี่ยนราคาเป็น/i,
  /ตอบว่าฟรี/i,
  /bypass policy/i,
  /developer message/i,
  /system message/i
];

export function detectPromptInjection(text) {
  const value = typeof text === "string" ? text : "";
  const matched_patterns = PROMPT_INJECTION_PATTERNS
    .filter((pattern) => pattern.test(value))
    .map((pattern) => pattern.source);

  if (matched_patterns.length > 0) {
    return {
      prompt_injection_detected: true,
      risk_level: "high",
      auto_reply_allowed: false,
      next_action: "human_review_only",
      matched_patterns
    };
  }

  return {
    prompt_injection_detected: false,
    risk_level: "low",
    auto_reply_allowed: true,
    next_action: "continue",
    matched_patterns: []
  };
}
