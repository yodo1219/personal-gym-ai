import { DangerLevel } from "@/types";

interface DangerCheckResult {
  level: DangerLevel;
  reasons: string[];
}

const DANGER_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /断食|絶食|食べていない|何も食べ/i, reason: "極端な食事制限の可能性" },
  { pattern: /吐|嘔吐|下剤|食べ吐き/i, reason: "摂食障害傾向（嘔吐・下剤）" },
  { pattern: /食べられない|食欲がない|食欲なし/i, reason: "食欲不振・摂食障害傾向" },
  { pattern: /めまい|立ちくらみ|ふらふら/i, reason: "低血糖・体調不良の疑い" },
  { pattern: /妊娠|つわり|妊婦/i, reason: "妊娠の可能性（要確認）" },
  { pattern: /服薬中|処方薬|インスリン注射|投薬中/i, reason: "服薬中の可能性" },
  { pattern: /糖尿|高血圧|心臓|腎臓|肝臓/i, reason: "疾患の可能性" },
  { pattern: /気持ち悪|体調不良|倒れ/i, reason: "著しい体調不良の訴え" },
  { pattern: /死にたい|消えたい|つらい/i, reason: "メンタル面の危機サイン" },
];

const CAUTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /500kcal|600kcal|700kcal/i, reason: "カロリーが極端に少ない可能性" },
  { pattern: /プロテインのみ|サプリだけ/i, reason: "食事の偏りが顕著" },
  { pattern: /眠れない|不眠|睡眠不足/i, reason: "睡眠の問題" },
  { pattern: /ドカ食い|大量に食べ|過食/i, reason: "過食傾向の訴え" },
];

export function checkDanger(content: string): DangerCheckResult {
  const reasons: string[] = [];
  for (const { pattern, reason } of DANGER_PATTERNS) {
    if (pattern.test(content)) reasons.push(reason);
  }
  if (reasons.length > 0) return { level: "danger", reasons };

  for (const { pattern, reason } of CAUTION_PATTERNS) {
    if (pattern.test(content)) reasons.push(reason);
  }
  if (reasons.length > 0) return { level: "caution", reasons };

  return { level: "safe", reasons: [] };
}
