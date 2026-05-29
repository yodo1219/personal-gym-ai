import { NextRequest, NextResponse } from "next/server";
import { analyzeMultipleImages, calcNutritionTarget, evaluateNutrition } from "@/lib/vision";
import { checkDanger } from "@/lib/danger-check";
import { getClient } from "@/lib/storage";
import { buildImageFeedbackPrompt } from "@/lib/prompts";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId, fileName } = body;

    const images: { base64: string; mimeType: string }[] = body.images
      ? body.images
      : [{ base64: body.base64Image, mimeType: body.mimeType ?? "image/jpeg" }];

    if (!clientId || images.length === 0) {
      return NextResponse.json({ error: "clientId と画像は必須です" }, { status: 400 });
    }

    const client = await getClient(clientId);
    if (!client) {
      return NextResponse.json({ error: "顧客が見つかりません" }, { status: 404 });
    }

    const nutrition = await analyzeMultipleImages(images);
    const target = calcNutritionTarget(client);
    // 直近の食事履歴を取得
const { data: recentMeals } = await supabase
.from("meals")
.select("nutrition")
.eq("client_id", client.id)
.order("created_at", { ascending: false })
.limit(7);

const recentFoods = (recentMeals ?? []).flatMap((m: any) => {
const n = m.nutrition;
if (!n) return [];
return [
  ...(n.meals?.breakfast ?? []),
  ...(n.meals?.lunch ?? []),
  ...(n.meals?.dinner ?? []),
  ...(n.meals?.snack ?? []),
];
});

const evaluation = evaluateNutrition(nutrition, target, recentFoods);
    const dangerCheck = checkDanger(nutrition.rawText);

    if (dangerCheck.level === "danger") {
      return NextResponse.json({
        nutrition, target, evaluation,
        dangerLevel: "danger", dangerReasons: dangerCheck.reasons,
        aiReply: "", goodPoints: [], improvements: [], nextAction: "",
      });
    }

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

    return NextResponse.json({
      nutrition, target, evaluation,
      dangerLevel: dangerCheck.level,
      dangerReasons: dangerCheck.reasons,
      aiReply: parsed.reply ?? "",
      goodPoints: parsed.goodPoints ?? [],
      improvements: parsed.improvements ?? [],
      nextAction: parsed.nextAction ?? "",
      fileName,
    });
  } catch (error) {
    console.error("画像解析エラー:", error);
    return NextResponse.json({ error: "画像解析に失敗しました" }, { status: 500 });
  }
}
