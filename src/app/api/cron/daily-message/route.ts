import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/storage";

const MESSAGES = [
  "💧 今日はお水しっかり飲めていますか？\n水分補給は代謝アップと脂肪燃焼に欠かせません！目安は1日1.5〜2Lですよ！",
  "🥦 今日の食事に野菜は入っていますか？\n野菜に含まれる食物繊維が腸内環境を整えて、栄養の吸収をアップしてくれます！",
  "🌙 良い睡眠は取れていますか？\n睡眠中に成長ホルモンが分泌されて、筋肉の回復や脂肪燃焼が促進されます！7〜8時間を目標に！",
  "🍳 今日のたんぱく質は摂れていますか？\n毎食手のひら1枚分のたんぱく質を意識してみてください！筋肉維持に大切です💪",
  "🌿 今日の食事でオメガ3は摂れましたか？\nサーモン・サバ・アマニ油など良い脂質を意識すると体の炎症が抑えられますよ！",
  "☀️ 今日も一日お疲れ様です！\n食事の写真やスクリーンショットをいつでも送ってくださいね📸 一緒に目標に近づきましょう！",
  "🍌 今日は間食しましたか？\n間食するならバナナ・ナッツ・ゆで卵がおすすめです！血糖値の急上昇を防げますよ！",
  "🔥 今日の活動量はどうでしたか？\n軽いウォーキングでも脂肪燃焼に効果的です！食後30分の散歩を試してみてください！",
];

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

    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

    let sentCount = 0;
    for (const client of lineClients) {
      await pushMessage((client as any).lineUserId, message);
      sentCount++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return NextResponse.json({ 
      success: true, 
      sentCount,
      message: message.slice(0, 30) + "...",
    });
  } catch (error) {
    console.error("cron error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
