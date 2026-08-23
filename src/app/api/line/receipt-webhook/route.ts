import { NextRequest, NextResponse } from "next/server";
import { getOrCreateReceiptUser } from "@/lib/receipts/users";
import { analyzeReceiptImages } from "@/lib/receipts/analyzeReceiptImages";
import { supabase } from "@/lib/supabase";

const RECEIPT_LINE_CHANNEL_ACCESS_TOKEN =
  process.env.RECEIPT_LINE_CHANNEL_ACCESS_TOKEN!;

async function pushMessage(to: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RECEIPT_LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }],
    }),
  });
}

async function replyToLine(replyToken: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RECEIPT_LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });
}

async function downloadImage(messageId: string): Promise<string> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${RECEIPT_LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function getLineDisplayName(lineUserId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${RECEIPT_LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    const data = await res.json();
    return data.displayName ?? "";
  } catch {
    return "";
  }
}

/**
 * 溜まっている「pending」状態のレシート画像をまとめて解析し、
 * receipts テーブルに記帳、結果をLINEに返信する。
 */
async function analyzeAndReply(lineUserId: string) {
  const { data: pendingImages } = await supabase
    .from("receipt_line_images")
    .select("*")
    .eq("line_user_id", lineUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!pendingImages || pendingImages.length === 0) return;

  const displayName = await getLineDisplayName(lineUserId);
  const receiptUser = await getOrCreateReceiptUser(lineUserId, displayName);

  if (!receiptUser) {
    await pushMessage(lineUserId, "アカウント情報の取得に失敗しました。もう一度お試しください。");
    return;
  }

  const images: { base64: string; mimeType: string }[] = [];
  for (const img of pendingImages) {
    try {
      const base64 = await downloadImage(img.message_id);
      images.push({ base64, mimeType: "image/jpeg" });
    } catch (e) {
      console.error("画像ダウンロードエラー:", e);
    }
  }

  if (images.length === 0) return;

  try {
    const journalEntries = await analyzeReceiptImages(images);

    // receipt_user_id で receipts テーブルに記帳
    const { error } = await supabase.from("receipts").insert(
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
    );

    if (error) throw error;

    await supabase
      .from("receipt_line_images")
      .update({ status: "done" })
      .eq("line_user_id", lineUserId)
      .eq("status", "pending");

    const summary = journalEntries
      .map((e) => `・${e.storeName || "店名不明"} ${e.debitAmount}円（${e.debitAccount}）`)
      .join("\n");

    await pushMessage(
      lineUserId,
      `${journalEntries.length}件記帳しました📝\n\n${summary}\n\n記帳データはCSVでいつでもダウンロードできます。`
    );
  } catch (e) {
    console.error("レシート解析エラー:", e);
    await pushMessage(
      lineUserId,
      "申し訳ありません、解析に失敗しました。画像を撮り直してもう一度送ってください。"
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const events = body.events ?? [];

    if (events.length === 0) {
      return NextResponse.json({ status: "ok" });
    }

    for (const event of events) {
      if (event.type !== "message") continue;

      const replyToken = event.replyToken;
      const lineUserId = event.source.userId;

      if (event.message.type === "text") {
        const text = event.message.text.trim();

        if (
          text.includes("送信完了") ||
          text.includes("完了") ||
          text.includes("おわり") ||
          text.includes("終わり") ||
          text.includes("以上")
        ) {
          await replyToLine(
            replyToken,
            "ありがとうございます！まとめて記帳しています🧾\n少々お待ちください！"
          );
          await analyzeAndReply(lineUserId);
          continue;
        }

        if (
          text.includes("自分のID") ||
          text.includes("マイID") ||
          text.includes("ID教えて")
        ) {
          await replyToLine(
            replyToken,
            `あなたのLINEユーザーIDは：\n${lineUserId}`
          );
          continue;
        }

        await replyToLine(
          replyToken,
          "レシートの写真を送ってください🧾\n全部送り終わったら「完了」と送ってください！"
        );
        continue;
      }

      if (event.message.type === "image") {
        // 初回メッセージの場合、先にアカウントを作っておく
        await getOrCreateReceiptUser(lineUserId);

        await supabase.from("receipt_line_images").insert({
          line_user_id: lineUserId,
          message_id: event.message.id,
          status: "pending",
        });

        const { count } = await supabase
          .from("receipt_line_images")
          .select("*", { count: "exact" })
          .eq("line_user_id", lineUserId)
          .eq("status", "pending");

        await replyToLine(
          replyToken,
          `${count}枚受け取りました🧾\n全部送り終わったら「完了」と送ってください！`
        );
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("経理LINE Webhookエラー:", error);
    return NextResponse.json({ status: "ok" });
  }
}