import { NextResponse } from "next/server";
import { initSheetHeaders } from "@/lib/sheets";

export async function POST() {
  try {
    await initSheetHeaders();
    return NextResponse.json({ success: true, message: "ヘッダーを初期化しました" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sheets初期化に失敗しました" }, { status: 500 });
  }
}
