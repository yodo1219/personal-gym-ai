import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clients = await getClients();
    const lineClients = clients.filter((c: any) => c.lineUserId);

    for (const client of lineClients) {
      // 直近7日の食事履歴を取得
      const { data: recentMeals } = await supabase
        .from("meals")
        .select("nutrition")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(14);

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

      if (recentFoods.length === 0) continue;

      // AIに食材パターンを分析させて新食材を提案
      const prompt = `あなたはパーソナルジムの食事指導トレーナーAIです。

【顧客情報】
名前: ${client.name}さん
目標: ${(client as any).goal === "fat_loss" ? "減量" : (client as any).goal === "muscle_gain" ? "筋肉増量" : "健康増進"}

【直近の食事内容】
${recentFoods.join("、")}

【指示】
直近の食事パターンを分析して、最近あまり食べていない栄養豊富な食材を1〜2個おすすめしてください。

以下の形式で返してください：

今週のおすすめ食材🌟

【おすすめ食材名】
なぜおすすめか：（この食材に含まれる栄養素と体への作用）
食べ方のヒント：（具体的な調理法・組み合わせ）
目標との関係：（${client.name}さんの目標に対してどう役立つか）

ぜひ今週試してみてください！💪

【ルール】
・「${client.name}さん」と名前を使って親身に話しかける
・「〜でございますね！」など丁寧だけど明るいトーン
・具体的な調理法・レシピを1つ提案する
・文末は「！」で終わる
・絵文字を2〜3個使う
・医療診断はしない`;

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 500,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "今週のおすすめ食材を教えてください！" },
        ],
        temperature: 0.8,
      });

      const suggestion = aiResponse.choices[0].message.content ?? "";
      await pushMessage((client as any).lineUserId, suggestion);

      // 連続送信を避けるため待つ
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("weekly suggestion error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
