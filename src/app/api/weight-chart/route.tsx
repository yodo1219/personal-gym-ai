import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";
import {
  WEIGHT_WINDOW_DAYS,
  addDays,
  jstToday,
  verifyChartToken,
  type WeightPoint,
} from "@/lib/weight";
import { buildWeightChart, CHART_WIDTH, CHART_HEIGHT } from "@/lib/weightChart";

// GET /api/weight-chart?c=<clientId>&e=<期限>&s=<署名>
// LINEのサーバーが取りに来る体重グラフの画像（PNG）。
// 署名つきのURLだけ表示できる（URLを知らない人には見えない）。
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const clientId = p.get("c") ?? "";
  const exp = p.get("e") ?? "";
  const sig = p.get("s") ?? "";

  if (!verifyChartToken(clientId, exp, sig)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const since = addDays(jstToday(), -(WEIGHT_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from("weight_records")
    .select("weight, recorded_date")
    .eq("client_id", clientId)
    .gte("recorded_date", since)
    .order("recorded_date", { ascending: true });

  if (error) {
    console.error("体重グラフのデータ取得エラー:", error);
    return new NextResponse("error", { status: 500 });
  }

  const points: WeightPoint[] = (data ?? []).map((r) => ({
    date: String(r.recorded_date),
    weight: Number(r.weight),
  }));

  if (points.length < 2) {
    return new NextResponse("not enough data", { status: 404 });
  }

  return new ImageResponse(buildWeightChart(points), {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  });
}
