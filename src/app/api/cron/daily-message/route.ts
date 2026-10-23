import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/storage";

const MESSAGES = [
  "💧 今日はお水しっかり飲めていますか？\n水分補給は代謝アップと脂肪燃焼に欠かせません！目安は1日1.5〜2Lですよ！",
  "🥦 今日の食事に野菜は入っていますか？\n野菜に含まれる食物繊維が腸内環境を整えて、栄養の吸収をアップしてくれます！",
  "🌙 良い睡眠は取れていますか？\n睡眠中に成長ホルモンが分泌されて、筋肉の回復や脂肪燃焼が促進されます！7〜8時間を目標に！",
  "🍳 今日のたんぱく質は摂れていますか？\n毎食手のひら1枚分のたんぱく質を意識してみてください！筋肉維持に大切です��",
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

// 管理画面の「メッセージ送信時間」の選択肢（0〜9）と、実際の時刻（日本時間）の対応
const SEND_HOURS_JST = [9, 10, 11, 12, 13, 14, 15, 18, 20, 21];

// 送信時間の設定を使うかどうか。
//   false … 定期実行が「朝10時の1回だけ」の間は、これにする（送信時間の設定に関係なく、全員に朝10時に送る）
//   true  … 定期実行を1日に何回も動かせるようにしたら、これにする（設定した時刻の人にだけ送る）
const HONOR_SEND_HOUR = false;

function jstNow(now: Date) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { hour: jst.getUTCHours(), day: jst.getUTCDay() };
}

function shouldSend(c: any, hour: number, day: number): boolean {
  if (!c.lineUserId) return false;
  if (c.messageEnabled === false) return false;

  // 送信時間（選択肢の番号 → 日本時間の時刻）。未設定・不正な値は朝10時
  if (HONOR_SEND_HOUR) {
    const targetHour = SEND_HOURS_JST[Number(c.messageHour ?? 1)] ?? 10;
    if (targetHour !== hour) return false;
  }

  // 頻度
  const freq = c.messageFrequency ?? "daily";
  if (freq === "weekdays") return day >= 1 && day <= 5;
  if (freq === "three_times") return [1, 3, 5].includes(day);
  if (freq === "weekly") return day === 1;
  return true;
}

// GET /api/cron/daily-message
//   ?dryRun=1            送らずに、誰に送る予定かだけ返す
//   ?dryRun=1&hour=18    （テスト用）日本時間18時に誰に送るかを見る
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const p = req.nextUrl.searchParams;
    const dryRun = p.get("dryRun") === "1";
    const jst = jstNow(new Date());
    const hour = dryRun && p.get("hour") !== null ? Number(p.get("hour")) : jst.hour;

    const clients = await getClients();
    const targets = clients.filter((c: any) => shouldSend(c, hour, jst.day));

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        hour,
        honorSendHour: HONOR_SEND_HOUR,
        day: jst.day,
        targets: targets.map((c: any) => c.name || c.id),
      });
    }

    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

    let sentCount = 0;
    for (const client of targets) {
      await pushMessage((client as any).lineUserId, message);
      sentCount++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return NextResponse.json({ success: true, hour, honorSendHour: HONOR_SEND_HOUR, sentCount });
  } catch (error) {
    console.error("cron error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
