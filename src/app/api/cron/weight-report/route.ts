import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import {
  WEIGHT_WINDOW_DAYS,
  addDays,
  jstToday,
  signChartToken,
  summarizeWeek,
  toMD,
  type WeightPoint,
} from "@/lib/weight";

export const maxDuration = 60;

const BASE_URL = process.env.APP_BASE_URL ?? "https://personal-gym-ai.vercel.app";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function pushWeightReport(params: {
  lineUserId: string;
  name: string;
  imageUrl: string;
  latestWeight: number;
  latestDate: string;
  label: string;
  diffText: string;
}) {
  const { lineUserId, name, imageUrl, latestWeight, latestDate, label, diffText } = params;
  const greeting = name ? `${name}さん、` : "";

  // 画像と文章を1つのメッセージ（Flex）にまとめて、送信数を1通に抑える
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [
        {
          type: "flex",
          altText: `${greeting}今週の体重レポートです`,
          contents: {
            type: "bubble",
            hero: {
              type: "image",
              url: imageUrl,
              size: "full",
              aspectRatio: "16:9",
              aspectMode: "fit",
              backgroundColor: "#ffffff",
            },
            body: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                { type: "text", text: `📊 ${greeting}今週の体重レポート`, weight: "bold", size: "md", wrap: true },
                { type: "text", text: `最新：${latestWeight}kg（${toMD(latestDate)}）`, size: "sm", color: "#555555" },
                { type: "text", text: `${label}：${diffText}`, size: "sm", color: "#555555" },
              ],
            },
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push失敗 (${res.status}): ${body}`);
  }
}

// GET /api/cron/weight-report
//   ?dryRun=1   送らずに、誰に送る予定かだけ返す
//   ?to=<LINEユーザーID>  その人だけに送る（テスト用）
//   ?force=1    「今週の記録があること」の条件を無視する（テスト用）
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET が未設定です" }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({ error: "LINE_CHANNEL_ACCESS_TOKEN が未設定です" }, { status: 500 });
  }

  const p = req.nextUrl.searchParams;
  const dryRun = p.get("dryRun") === "1";
  const force = p.get("force") === "1";
  const only = p.get("to");

  const today = jstToday();
  const since = addDays(today, -(WEIGHT_WINDOW_DAYS - 1));
  const recentFrom = addDays(today, -6); // 直近7日

  const clients = await getClients();
  const targets = clients.filter((c) => {
    if (!c.lineUserId) return false;
    if ((c as any).messageEnabled === false) return false; // 自動メッセージをオフにしている人には送らない
    if (only && c.lineUserId !== only) return false;
    return true;
  });

  const sent: string[] = [];
  const skipped: { client: string; reason: string }[] = [];
  const failed: { client: string; error: string }[] = [];

  for (const c of targets) {
    const label = c.name || c.id;
    try {
      const { data, error } = await supabase
        .from("weight_records")
        .select("weight, recorded_date")
        .eq("client_id", c.id)
        .gte("recorded_date", since)
        .order("recorded_date", { ascending: true });
      if (error) throw error;

      const points: WeightPoint[] = (data ?? []).map((r) => ({
        date: String(r.recorded_date),
        weight: Number(r.weight),
      }));

      const summary = summarizeWeek(points);
      if (!summary) {
        skipped.push({ client: label, reason: "記録が2日分未満" });
        continue;
      }
      if (!force && summary.latest.date < recentFrom) {
        skipped.push({ client: label, reason: "直近7日に記録なし" });
        continue;
      }

      if (dryRun) {
        sent.push(label);
        continue;
      }

      const exp = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
      const sig = signChartToken(c.id, exp);
      const imageUrl = `${BASE_URL}/api/weight-chart?c=${encodeURIComponent(c.id)}&e=${exp}&s=${sig}`;

      const diffText =
        summary.diff > 0 ? `+${summary.diff}kg` : summary.diff < 0 ? `${summary.diff}kg` : "±0kg";

      await pushWeightReport({
        lineUserId: c.lineUserId!,
        name: c.name,
        imageUrl,
        latestWeight: summary.latest.weight,
        latestDate: summary.latest.date,
        label: summary.label,
        diffText,
      });
      sent.push(label);
    } catch (e) {
      console.error("週次体重レポートの送信エラー:", label, e);
      failed.push({ client: label, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ dryRun, today, sent, skipped, failed });
}
