import { NextRequest, NextResponse } from "next/server";
import { getClients, saveMeal, getClientByLineUserId, saveClient } from "@/lib/storage";
import { analyzeMultipleImages, calcNutritionTarget, evaluateNutrition } from "@/lib/vision";
import {
  buildImageFeedbackPrompt,
  buildFoodPhotoFeedbackPrompt,
  buildDetailedNutritionPrompt,
  buildNutrientTip,
  getOnboardingMessage,
  calcTarget,
} from "@/lib/prompts";
import { checkDanger } from "@/lib/danger-check";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import { Client } from "@/types";

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

async function getLineDisplayName(lineUserId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/profile/${lineUserId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
    const data = await res.json();
    return data.displayName ?? "";
  } catch {
    return "";
  }
}

// オンボーディング処理
async function handleOnboarding(
  lineUserId: string,
  replyToken: string,
  text: string
) {
  const { data: onboarding } = await supabase
    .from("line_onboarding")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();

  const step = onboarding?.step ?? "start";

  if (step === "start") {
    // 名前を保存してage stepへ
    await supabase.from("line_onboarding").upsert({
      line_user_id: lineUserId,
      step: "age",
      name: text,
    });
    await replyToLine(replyToken, getOnboardingMessage("age", text));
    return true;
  }

  if (step === "age") {
    await supabase.from("line_onboarding")
      .update({ step: "gender", age: text })
      .eq("line_user_id", lineUserId);
    await replyToLine(replyToken, getOnboardingMessage("gender", onboarding.name));
    return true;
  }

  if (step === "gender") {
    await supabase.from("line_onboarding")
      .update({ step: "height", gender: text })
      .eq("line_user_id", lineUserId);
    await replyToLine(replyToken, getOnboardingMessage("height", onboarding.name));
    return true;
  }

  if (step === "height") {
    await supabase.from("line_onboarding")
      .update({ step: "weight", height: text })
      .eq("line_user_id", lineUserId);
    await replyToLine(replyToken, getOnboardingMessage("weight", onboarding.name));
    return true;
  }

  if (step === "weight") {
    await supabase.from("line_onboarding")
      .update({ step: "goal", weight: text })
      .eq("line_user_id", lineUserId);
    await replyToLine(replyToken, getOnboardingMessage("goal", onboarding.name));
    return true;
  }

  if (step === "goal") {
    const goalMap: Record<string, string> = {
      "1": "fat_loss", "減量": "fat_loss", "体脂肪": "fat_loss",
      "2": "muscle_gain", "筋肉": "muscle_gain",
      "3": "maintain", "現状維持": "maintain", "健康": "health",
    };
    const goal = Object.entries(goalMap).find(([k]) => text.includes(k))?.[1] ?? "fat_loss";
    await supabase.from("line_onboarding")
      .update({ step: "medical_history", goal })
      .eq("line_user_id", lineUserId);
    await replyToLine(replyToken, getOnboardingMessage("medical_history", onboarding.name));
    return true;
  }

  if (step === "medical_history") {
    await supabase.from("line_onboarding")
      .update({ step: "allergies", medical_history: text })
      .eq("line_user_id", lineUserId);
    await replyToLine(replyToken, getOnboardingMessage("allergies", onboarding.name));
    return true;
  }

  if (step === "allergies") {
    await supabase.from("line_onboarding")
      .update({ step: "constitution", allergies: text })
      .eq("line_user_id", lineUserId);
    await replyToLine(replyToken, getOnboardingMessage("constitution", onboarding.name));
    return true;
  }

  if (step === "constitution") {
    await supabase.from("line_onboarding")
      .update({ step: "complete", constitution: text, completed: true })
      .eq("line_user_id", lineUserId);

    // 顧客をDBに登録
    const { data: ob } = await supabase
      .from("line_onboarding")
      .select("*")
      .eq("line_user_id", lineUserId)
      .single();

    const genderMap: Record<string, string> = {
      "男性": "male", "男": "male", "女性": "female", "女": "female",
    };

    const newClient: Client = {
      id: uuidv4(),
      name: ob.name ?? "未設定",
      age: parseInt(ob.age ?? "30"),
      gender: (genderMap[ob.gender ?? ""] ?? "other") as Client["gender"],
      height: parseFloat(ob.height ?? "160"),
      weight: parseFloat(ob.weight ?? "60"),
      goal: (ob.goal ?? "health") as Client["goal"],
      activityLevel: "moderate",
      allergies: ob.allergies ?? "",
      medicalHistory: ob.medical_history ?? "",
      dislikedFoods: "",
      dietaryPolicy: "",
      mentalTendency: "",
      bingeTendency: "",
      sleepStatus: "",
      lineUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveClient(newClient);

    await replyToLine(replyToken, getOnboardingMessage("complete", ob.name));
    return true;
  }

  return false;
}

async function analyzeAndReply(lineUserId: string) {
  const { data: pendingImages } = await supabase
    .from("line_images")
    .select("*")
    .eq("line_user_id", lineUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!pendingImages || pendingImages.length === 0) return;

  let client = await getClientByLineUserId(lineUserId);
  if (!client) {
    const clients = await getClients();
    client = clients[0];
  }

  if (!client) {
    await pushMessage(
      lineUserId,
      "顧客情報が見つかりませんでした。トレーナーにご連絡ください。"
    );
    return;
  }

  const lineDisplayName = await getLineDisplayName(lineUserId);
  const clientName = client.name || lineDisplayName || "お客様";

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

  const nutrition = await analyzeMultipleImages(images);
  const target = calcNutritionTarget(client);
  const evaluation = evaluateNutrition(nutrition, target);
  const dangerCheck = checkDanger(nutrition.rawText);

  let aiReply = "";
  if (dangerCheck.level !== "danger") {
    const prompt = nutrition.isFoodPhotoOnly
      ? buildFoodPhotoFeedbackPrompt(client, nutrition, target)
      : buildImageFeedbackPrompt(client, nutrition, evaluation, target);

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

    let replyText = (parsed.reply ?? "")
      .replace(/\{name\}/g, clientName)
      .replace(/顧客様/g, `${clientName}さん`);

    // 絵文字が含まれていない場合は追加
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(replyText);
    if (!hasEmoji) {
      replyText = replyText
        .replace("【出来ていること】", "【出来ていること】✨")
        .replace("【目的と目標を達成するために改善が必要なこと】", "【目的と目標を達成するために改善が必要なこと】💪");
    }

    // 毎回の栄養素ワンポイントを追加
    const nutrientTip = buildNutrientTip(nutrition, client);
    aiReply = replyText + "\n\n" + nutrientTip;
  }

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

  await supabase
    .from("line_images")
    .update({ status: "done" })
    .eq("line_user_id", lineUserId)
    .eq("status", "pending");

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

      if (event.message.type === "text") {
        const text = event.message.text.trim();

        // 詳細栄養素リクエスト
        if (
          text.includes("詳しく") ||
          text.includes("詳細") ||
          text.includes("栄養素") ||
          text.includes("もっと教えて")
        ) {
          let client = await getClientByLineUserId(lineUserId);
          if (!client) {
            const clients = await getClients();
            client = clients[0];
          }

          if (client) {
            // 最新の食事記録を取得
            const { data: latestMeal } = await supabase
              .from("meals")
              .select("*")
              .eq("client_id", client.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (latestMeal?.nutrition) {
              const target = calcTarget(client);
              const prompt = buildDetailedNutritionPrompt(
                client,
                latestMeal.nutrition,
                target
              );

              const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                max_tokens: 1500,
                messages: [
                  { role: "system", content: prompt },
                  { role: "user", content: "詳細な栄養素解説をお願いします。" },
                ],
                temperature: 0.7,
              });

              const detailReply = aiResponse.choices[0].message.content ?? "";
              await replyToLine(replyToken, detailReply);
              continue;
            }
          }

          await replyToLine(
            replyToken,
            "まずは食事記録のスクリーンショットを送ってください📸"
          );
          continue;
        }

        // 完了ワード
        if (
          text.includes("送信完了") ||
          text.includes("完了") ||
          text.includes("おわり") ||
          text.includes("終わり") ||
          text.includes("以上")
        ) {
          await replyToLine(
            replyToken,
            "ありがとうございます！まとめて解析しています🔍\n少々お待ちください！"
          );
          await analyzeAndReply(lineUserId);
          continue;
        }

        // 初回登録チェック
        const { data: onboarding } = await supabase
          .from("line_onboarding")
          .select("*")
          .eq("line_user_id", lineUserId)
          .single();

        // 未登録の場合はオンボーディング開始
        if (!onboarding) {
          await supabase.from("line_onboarding").insert({
            line_user_id: lineUserId,
            step: "start",
          });
          await replyToLine(replyToken, getOnboardingMessage("start"));
          continue;
        }

        // 登録未完了の場合はオンボーディング継続
        if (!onboarding.completed) {
          const handled = await handleOnboarding(lineUserId, replyToken, text);
          if (handled) continue;
        }

        // 登録済みの通常メッセージ
        await replyToLine(
          replyToken,
          "食事記録アプリのスクリーンショットまたは食事の写真を送ってください📸\n全部送り終わったら「完了」と送ってください！\n\n詳しい栄養素解説は「詳しく」と送ってください💡"
        );

      // 画像メッセージ
      if (event.message.type === "image") {
        // 未登録チェック
        const { data: onboarding } = await supabase
          .from("line_onboarding")
          .select("*")
          .eq("line_user_id", lineUserId)
          .single();

        if (!onboarding || !onboarding.completed) {
          // 未登録の場合はオンボーディングを開始
          await supabase.from("line_onboarding").upsert({
            line_user_id: lineUserId,
            step: "start",
          });
          await replyToLine(
            replyToken,
            getOnboardingMessage("start")
          );
          continue;
        }

        await supabase.from("line_images").insert({
          line_user_id: lineUserId,
          message_id: event.message.id,
          status: "pending",
        });

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
