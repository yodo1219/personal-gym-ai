import { NextRequest, NextResponse } from "next/server";
import { getClients, saveMeal, getClientByLineUserId } from "@/lib/storage";
import { analyzeMultipleImages, calcNutritionTarget, evaluateNutrition } from "@/lib/vision";
import { buildImageFeedbackPrompt } from "@/lib/prompts";
import { checkDanger } from "@/lib/danger-check";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function pushMessage(to: string, text: string) {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
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
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
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
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function analyzeAndReply(lineUserId: string) {
  // pending中の画像を全部取得
  const { data: pendingImages } = await supabase
    .from("line_images")
    .select("*")
    .eq("line_user_id", lineUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!pendingImages || pendingImages.length === 0) return;

  // 顧客を特定
  let client = await getClientByLineUserId(lineUserId);
  if (!client) {
    const clients = await getClients();
    client = clients[0];
  }

  if (!client) {
    await pushMessage(
      lineUserId,
      "申し訳ありません。顧客情報が見つかりませんでした。トレーナーにご連絡ください。"
    );
    return;
  }

  // 全画像をダウンロード
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

  // まとめて解析
  const nutrition = await analyzeMultipleImages(images);
  const target = calcNutritionTarget(client);
  const evaluation = evaluateNutrition(nutrition, target);
  const dangerCheck = checkDanger(nutrition.rawText);

  let aiReply = "";
  if (dangerCheck.level !== "danger") {
    const prompt = buildImageFeedbackPrompt(client, nutrition, evaluation, target);
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1000,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "返信案をJSON形式で作成してください。" },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
    const parsed = JSON.parse(
      (aiResponse.choices[0].message.content ?? "{}")
        .replace(/```json|```/g, "")
        .trim()
    );
    aiReply = parsed.reply ?? "";
  }

  // 食事記録を保存
  const meal = {
    id: uuidv4(),
    clientId: client.id,
    mealDate: new Date().toISOString().split("T")[0],
    mealTime: "daily" as const,
    inputType: "image" as const,
    content: nutrition.rawText || "LINEから画像送信",
    imageFileName: `line_${lineUserId}_${Date.now()}.jpg`,
    nutrition,
    nutritionTarget: target,
    nutritionEval: evaluation,
    dangerLevel: dangerCheck.level,
    dangerReasons: dangerCheck.reasons,
    aiReply,
    status: dangerCheck.level === "danger" ? "pending" as const : "reviewed" as const,
    createdAt: new Date().toISOString(),
  };
  await saveMeal(meal);

  // 処理済みに更新
  await supabase
    .from("line_images")
    .update({ status: "done" })
    .eq("line_user_id", lineUserId)
    .eq("status", "pending");

  // 返信
  if (dangerCheck.level === "danger") {
    await pushMessage(
      lineUserId,
      "ありがとうございます！内容を確認してトレーナーよりご連絡いたします。"
    );
    return;
  }

  await pushMessage(lineUserId, aiReply);
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

      // テキストメッセージ
      if (event.message.type === "text") {
        const text = event.message.text.trim();

        // 「送信完了」「完了」「おわり」などで解析開始
        if (
          text.includes("送信完了") ||
          text.includes("完了") ||
          text.includes("おわり") ||
          text.includes("終わり") ||
          text.includes("以上")
        ) {
          await replyToLine(replyToken, "ありがとうございます！まとめて解析しています🔍\n少々お待ちください！");
          await analyzeAndReply(lineUserId);
        } else {
          await replyToLine(
            replyToken,
            "食事記録アプリのスクリーンショットを送ってください📸\n全部送り終わったら「完了」と送ってください！"
          );
        }
        continue;
      }

      // 画像メッセージ → 保存だけして待機
      if (event.message.type === "image") {
        // line_imagesテーブルに保存
        await supabase.from("line_images").insert({
          line_user_id: lineUserId,
          message_id: event.message.id,
          status: "pending",
        });

        // 何枚目か確認
        const { count } = await supabase
          .from("line_images")
          .select("*", { count: "exact" })
          .eq("line_user_id", lineUserId)
          .eq("status", "pending");

        await replyToLine(
          replyToken,
          `${count}枚受け取りました📸\n全部送り終わったら「完了」と送ってください！`
        );
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhookエラー:", error);
    return NextResponse.json({ status: "ok" });
  }
}
