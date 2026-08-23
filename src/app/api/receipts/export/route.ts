import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/receipts/export?lineUserId=xxxx
// そのユーザーの記帳データ（収入・支出とも）を弥生会計インポート形式のCSVとして返す。
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
    .order("date", { ascending: true });

  if (error) {
    console.error("記帳データ取得エラー:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  const headers = [
    "区分",
    "取引日",
    "借方勘定科目",
    "借方補助科目",
    "貸方勘定科目",
    "貸方補助科目",
    "金額",
    "摘要",
    "税区分",
    "税率",
    "部門",
    "備考",
  ];

  const rows = (entries ?? []).map((e) => [
    e.entry_type === "income" ? "収入" : "支出",
    e.date ?? "",
    e.debit_account ?? "",
    e.sub_account ?? "",
    e.credit_account ?? "",
    "",
    String(e.debit_amount ?? 0),
    e.description ?? "",
    e.tax_category ?? "",
    e.tax_rate ?? "",
    "",
    e.store_name ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const bom = "\uFEFF";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="yayoi_export_${lineUserId}.csv"`,
    },
  });
}
