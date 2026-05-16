import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { getClients, saveMeal } from "@/lib/storage";
import { analyzeMultipleImages, calcNutritionTarget, evaluateNutrition } from "@/lib/vision";
import { buildImageFeedbackPrompt } from "@/lib/prompts";
import { checkDanger } from "@/lib/danger-check";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function validateSignature(body: string, signature: string): boolean {
  if (!signature) return false;
  const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
  if (!channelSecret) return true; // シークレット未設定時はスキップ
  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

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

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  if (!validateSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const events = body.events ?? [];

  // 検証リクエスト（eventsが空）はそのまま200を返す
  if (events.length === 0) {
    return NextResponse.json({ status: "ok" });
  }

  for (const event of events) {
    if (event.type !== "message") continue;

    const replyToken = event.replyToken;
    const lineUserId = event.source.userId;

    if (event.message.type === "text") {
      await replyToLine(
        replyToken,
        "食事記録アプリのスクリーンショットを送ってください📸\nカロミル・あすけんなどに対応しています！"
      );
      continue;
    }

    if (event.message.type === "image") {
      await replyToLine(
        replyToken,
        "スクリーンショットを受け取りました！\n解析中ですので少々お待ちください🔍"
      );

      try {
        const base64 = await downloadImage(event.message.id);
        const clients = getClients();
        const client =
          clients.find((c) => (c as any).lineUserId === lineUserId) ?? clients[0];

        if (!client) {
          await pushMessage(
            lineUserId,
            "申し訳ありません。顧客情報が見つかりませんでした。トレーナーにご連絡ください。"
          );
          continue;
        }

        const nutrition = await analyzeMultipleImages([
          { base64, mimeType: "image/jpeg" },
        ]);
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
          status: dangerCheck.level === "danger" ? "pending" as const : "reviewed" as const,
          createdAt: new Date().toISOString(),
        };
        saveMeal(meal);

        if (dangerCheck.level === "danger") {
          await pushMessage(
            lineUserId,
            "ありがとうございます！内容を確認してトレーナーよりご連絡いたします。"
          );
          continue;
        }

        await pushMessage(lineUserId, aiReply);
      } catch (error) {
        console.error("LINE処理エラー:", error);
        await pushMessage(
          lineUserId,
          "申し訳ありません。解析中にエラーが発生しました。再度お試しください。"
        );
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}
