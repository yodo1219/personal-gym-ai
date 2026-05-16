import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { getClients } from "@/lib/storage";
import { analyzeMultipleImages, calcNutritionTarget, evaluateNutrition } from "@/lib/vision";
import { buildImageFeedbackPrompt } from "@/lib/prompts";
import { checkDanger } from "@/lib/danger-check";
import { saveMeal } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// LINE署名検証
function validateSignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET!;
  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// LINEにメッセージ送信
async function replyToLine(replyToken: string, message: string) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: message }],
    }),
  });
}

// LINE画像をダウンロードしてBase64に変換
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

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  // 署名検証
  if (!validateSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const events = body.events ?? [];

  for (const event of events) {
    // 画像メッセージのみ処理
    if (event.type !== "message") continue;

    const replyToken = event.replyToken;
    const lineUserId = event.source.userId;

    // テキストメッセージの場合
    if (event.message.type === "text") {
      await replyToLine(
        replyToken,
        "食事記録アプリのスクリーンショットを送ってください📸\nカロミル・あすけんなどに対応しています！"
      );
      continue;
    }

    // 画像メッセージの場合
    if (event.message.type === "image") {
      // 受信確認メッセージ
      await replyToLine(
        replyToken,
        "スクリーンショットを受け取りました！\n解析中ですので少々お待ちください🔍"
      );

      try {
        // 画像をダウンロード
        const base64 = await downloadImage(event.message.id);

        // 顧客を特定（LINEユーザーIDで検索、なければ最初の顧客）
        const clients = getClients();
        const client = clients.find((c) => (c as any).lineUserId === lineUserId)
          ?? clients[0];

        if (!client) {
          // 顧客が見つからない場合
          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              to: lineUserId,
              messages: [{
                type: "text",
                text: "申し訳ありません。顧客情報が見つかりませんでした。トレーナーにご連絡ください。",
              }],
            }),
          });
          continue;
        }

        // 画像解析
        const nutrition = await analyzeMultipleImages([
          { base64, mimeType: "image/jpeg" },
        ]);
        const target = calcNutritionTarget(client);
        const evaluation = evaluateNutrition(nutrition, target);
        const dangerCheck = checkDanger(nutrition.rawText);

        // AI返信生成
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
            (aiResponse.choices[0].message.content ?? "{}").replace(/```json|```/g, "").trim()
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
          imageFileName: `line_${event.message.id}.jpg`,
          nutrition,
          nutritionTarget: target,
          nutritionEval: evaluation,
          dangerLevel: dangerCheck.level,
          dangerReasons: dangerCheck.reasons,
          aiReply,
          lineUserId,
          status: dangerCheck.level === "danger" ? "pending" as const : "reviewed" as const,
          createdAt: new Date().toISOString(),
        };
        saveMeal(meal);

        // 危険検知の場合はトレーナーに通知のみ
        if (dangerCheck.level === "danger") {
          await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              to: lineUserId,
              messages: [{
                type: "text",
                text: "ありがとうございます！内容を確認してトレーナーよりご連絡いたします。",
              }],
            }),
          });
          continue;
        }

        // AI返信をLINEに送信
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: lineUserId,
            messages: [{ type: "text", text: aiReply }],
          }),
        });

      } catch (error) {
        console.error("LINE処理エラー:", error);
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}
