import { NextRequest, NextResponse } from "next/server";
import { getOrCreateReceiptUser } from "@/lib/receipts/users";
import { supabase } from "@/lib/supabase";
import { analyzeReceiptImages } from "@/lib/receipts/analyzeReceiptImages";
import { ReceiptImageInput } from "@/lib/receipts/types";

// Web管理画面などから、LINEを介さず直接画像をアップロードして記帳するAPI。
// lineUserId をキーに receipt_users を取得/作成する点はWebhookと同じ。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lineUserId, memo } = body;

    const images: ReceiptImageInput[] = body.images
      ? body.images
      : [{ base64: body.base64Image, mimeType: body.mimeType ?? "image/jpeg" }];

    if (!lineUserId || images.length === 0 || !images[0]?.base64) {
      return NextResponse.json(
        { error: "lineUserId と画像は必須です" },
        { status: 400 }
      );
    }

    const receiptUser = await getOrCreateReceiptUser(lineUserId);
    if (!receiptUser) {
      return NextResponse.json(
        { error: "ユーザー情報の取得に失敗しました" },
        { status: 500 }
      );
    }

    const journalEntries = await analyzeReceiptImages(images, memo);

    const { data: inserted, error } = await supabase
      .from("receipts")
      .insert(
        journalEntries.map((entry) => ({
          receipt_user_id: receiptUser.id,
          debit_account: entry.debitAccount,
          debit_amount: entry.debitAmount,
          credit_account: entry.creditAccount,
          credit_amount: entry.creditAmount,
          date: entry.date,
          description: entry.description,
          store_name: entry.storeName,
          tax_category: entry.taxCategory,
          tax_rate: entry.taxRate,
          sub_account: entry.subAccount,
        }))
      )
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "記帳データの保存に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ journalEntries: inserted });
  } catch (e) {
    console.error("レシート解析エラー:", e);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }
}