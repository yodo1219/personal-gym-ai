import { createHmac, timingSafeEqual } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { getClientByLineUserId } from "@/lib/storage";

/** グラフに使う期間（日） */
export const WEIGHT_WINDOW_DAYS = 28;

export type WeightPoint = { date: string; weight: number };

// ---------- 日付（日本時間） ----------

/** 日本時間の今日の日付を "YYYY-MM-DD" で返す */
export function jstToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

/** "YYYY-MM-DD" に日数を足し引きする */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** "2026-10-23" → "10/23" */
export function toMD(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
}

// ---------- LINEで送られた体重の記録 ----------

/**
 * 「体重 72.5」「体重72.5kg」「72.5kg」の形だけ体重として扱う。
 * それ以外（数字だけ、文章の中に数字がある、など）は null。
 */
export function parseWeightMessage(raw: string): number | null {
  const text = raw.normalize("NFKC").trim();
  const withPrefix = text.match(
    /^体重(?:は)?\s*[:：]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg|キロ)?$/i
  );
  const withUnit = text.match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg|キロ)$/i);
  const m = withPrefix ?? withUnit;
  if (!m) return null;
  return Number(m[1]);
}

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "±0";
}

/**
 * LINEのテキストが体重の報告なら、記録して返信文を返す。
 * 体重の形式でなければ null を返す（呼び出し側は通常の処理に進む）。
 */
export async function handleWeightMessage(
  lineUserId: string,
  rawText: string
): Promise<string | null> {
  const weight = parseWeightMessage(rawText);
  if (weight === null) return null;

  if (weight < 20 || weight > 300) {
    return "体重の数字をもう一度確認して送ってください（例：体重 72.5）";
  }

  const client = await getClientByLineUserId(lineUserId);
  if (!client) {
    return "まだ登録が済んでいないようです。「自分のID」と送って、表示されたIDをトレーナーに伝えてください。";
  }

  const today = jstToday();

  try {
    // 前回の記録（今日より前で一番新しいもの）
    const { data: prevRows, error: prevError } = await supabase
      .from("weight_records")
      .select("weight, recorded_date")
      .eq("client_id", client.id)
      .lt("recorded_date", today)
      .order("recorded_date", { ascending: false })
      .limit(1);
    if (prevError) throw prevError;

    // 今日の記録がすでにあれば更新、なければ追加
    const { data: sameDay, error: sameError } = await supabase
      .from("weight_records")
      .select("id")
      .eq("client_id", client.id)
      .eq("recorded_date", today)
      .limit(1);
    if (sameError) throw sameError;

    const updated = !!sameDay && sameDay.length > 0;
    if (updated) {
      const { error } = await supabase
        .from("weight_records")
        .update({ weight })
        .eq("id", sameDay![0].id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("weight_records").insert({
        client_id: client.id,
        weight,
        recorded_date: today,
      });
      if (error) throw error;
    }

    let reply = updated
      ? `今日の体重を ${weight}kg に更新しました📝`
      : `体重 ${weight}kg を記録しました📝`;

    const prev = prevRows && prevRows.length > 0 ? prevRows[0] : null;
    if (prev) {
      const diff = Math.round((weight - Number(prev.weight)) * 10) / 10;
      reply += `\n前回（${toMD(String(prev.recorded_date))}）から ${signed(diff)}kg`;
    }
    return reply;
  } catch (e) {
    console.error("体重の記録エラー:", e);
    return "記録に失敗しました。少し時間をおいて、もう一度送ってください。";
  }
}

// ---------- 週次レポートの集計 ----------

export type WeekSummary = {
  latest: WeightPoint;
  base: WeightPoint;
  /** 7日以上前の記録と比べられたら "前週比"、なければ "期間の変化" */
  label: "前週比" | "期間の変化";
  diff: number;
};

/** 日付の古い順に並んだ記録から、最新の体重と変化量を出す。日付が2種類未満なら null */
export function summarizeWeek(points: WeightPoint[]): WeekSummary | null {
  if (new Set(points.map((p) => p.date)).size < 2) return null;

  const latest = points[points.length - 1];
  const weekAgo = addDays(latest.date, -7);
  const olderOrEqual = points.filter((p) => p.date <= weekAgo);

  if (olderOrEqual.length > 0) {
    const base = olderOrEqual[olderOrEqual.length - 1];
    return {
      latest,
      base,
      label: "前週比",
      diff: Math.round((latest.weight - base.weight) * 10) / 10,
    };
  }
  const base = points[0];
  return {
    latest,
    base,
    label: "期間の変化",
    diff: Math.round((latest.weight - base.weight) * 10) / 10,
  };
}

// ---------- グラフ画像のURL署名 ----------

function chartSecret(): string {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error("CRON_SECRET が設定されていません");
  return `weight-chart:${s}`;
}

export function signChartToken(clientId: string, expiresAtSec: number): string {
  return createHmac("sha256", chartSecret())
    .update(`${clientId}.${expiresAtSec}`)
    .digest("base64url");
}

export function verifyChartToken(clientId: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!clientId || !sig || !Number.isFinite(expNum)) return false;
  if (expNum < Math.floor(Date.now() / 1000)) return false;

  let expected: string;
  try {
    expected = signChartToken(clientId, expNum);
  } catch {
    return false;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
