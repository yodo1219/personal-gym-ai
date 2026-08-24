import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/receipts/list?lineUserId=xxxx
// ダッシュボード表示用に、そのユーザーの記帳データを全件JSONで返す。
export async function GET(req: NextRequest) {
  const lineUserId = req.nextUrl.searchParams.get("lineUserId");

  if (!lineUserId) {
    return NextResponse.json({ error: "lineUserId は必須です" }, { status: 400 });
  }

  const { data: receiptUser } = await supabase
    .from("receipt_users")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (!receiptUser) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
  }

  const { data: entries, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("receipt_user_id", receiptUser.id)
    .order("date", { ascending: false });

  if (error) {
    console.error("記帳データ取得エラー:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ entries: entries ?? [] });
}
