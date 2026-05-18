import { Client, NutritionData, NutritionEvaluation, NutritionTarget } from "@/types";

export function calcTarget(client: Client): NutritionTarget {
  const bmr =
    client.gender === "male"
      ? 13.397 * client.weight + 4.799 * client.height - 5.677 * client.age + 88.362
      : 9.247 * client.weight + 3.098 * client.height - 4.330 * client.age + 447.593;

  const multipliers: Record<Client["activityLevel"], number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  };
  const tdee = bmr * multipliers[client.activityLevel];
  const adj: Record<Client["goal"], number> = {
    fat_loss: -300, muscle_gain: +250, maintain: 0, health: 0,
  };
  const cal = Math.round(tdee + adj[client.goal]);
  return {
    calories: cal,
    protein: Math.round((cal * 0.25) / 4),
    fat: Math.round((cal * 0.20) / 9),
    carbs: Math.round((cal * 0.55) / 4),
  };
}

function goalLabel(g: Client["goal"]) {
  return { fat_loss: "減量", muscle_gain: "筋肉増量", maintain: "現状維持", health: "健康増進" }[g];
}
function activityLabel(l: Client["activityLevel"]) {
  return {
    sedentary: "ほぼ運動なし", light: "軽い運動", moderate: "中程度",
    active: "活発", very_active: "非常に活発",
  }[l];
}
function statusLabel(s: string) {
  return { low: "少なめ", ok: "良好", high: "多め", unknown: "不明" }[s] ?? "不明";
}

function buildClientContext(client: Client, target: NutritionTarget): string {
  return `名前: ${client.name}さん / 年齢: ${client.age}歳 / 性別: ${client.gender === "male" ? "男性" : "女性"}
身長: ${client.height}cm / 体重: ${client.weight}kg${client.bodyFat ? ` / 体脂肪率: ${client.bodyFat}%` : ""}
目標: ${goalLabel(client.goal)} / 活動量: ${activityLabel(client.activityLevel)}
目標カロリー: ${target.calories}kcal / P: ${target.protein}g / F: ${target.fat}g / C: ${target.carbs}g
アレルギー: ${client.allergies || "なし"} / 苦手: ${client.dislikedFoods || "なし"}
既往歴: ${client.medicalHistory || "なし"}
食事指導方針: ${client.dietaryPolicy || "標準（脂質制限ベース）"}
メンタル傾向: ${client.mentalTendency || "特記なし"} / 過食傾向: ${client.bingeTendency || "特記なし"}`;
}

const DIET_POLICY = `・脂質制限ベース（極端な糖質制限は推奨しない）
・たんぱく質は体重×1.5〜2g/日を目安に確保
・炭水化物は活動量に応じて確保（ご飯・パン・麺を極端に避けない）
・継続可能性を最優先
・JATI・NSCA・厚生労働省・日本スポーツ協会の栄養指導に準拠`;

const REPLY_JSON_SCHEMA = `{
  "reply": "返信本文",
  "goodPoints": ["良い点1", "良い点2"],
  "improvements": ["改善点1"],
  "nextAction": "次の食事でのアクション"
}`;

const TRAINER_STYLE = `
【返信文体の参考例】
---
【出来ていること】
もやしなどはとてもカロリーも低く、噛み応えもございますので積極的に活用していきましょう！

【目的と目標を達成するために改善が必要なこと】
プロテインドリンクとは別にもし可能であれば固形物でのタンパク質摂取もチャレンジしていきたいです！
1日の中での消費カロリーについてなのですが食事を消化して吸収していくのにもカロリーが使用されます！
こちらが固形物の食べ物がよりカロリーが消費されやすいです！
ただプロテインがダメというわけではございませんのでできる範囲で少しづつチャレンジしてみましょう！
---

【文体のルール】
・「〜でございますね！」「〜ましょう！」など丁寧だけど明るいトーン
・必ず【出来ていること】を先に書く
・【目的と目標を達成するために改善が必要なこと】は1〜2個に絞る
・具体的な食品名を挙げて説明する
・「〜はダメ」ではなく「〜というわけではございません」など否定しない
・理由を丁寧にわかりやすく説明する
・改善提案は「〜しましょう！」「〜チャレンジしてみましょう！」など前向きに締める
・絵文字は使わない
・医療診断はしない`;

export function buildSystemPrompt(client: Client): string {
  const target = calcTarget(client);
  return `あなたはパーソナルジムの食事指導トレーナーAIです。
以下の顧客情報と指導方針をもとに、トレーナーらしい温かい返信案をJSON形式で返してください。

【顧客情報】
${buildClientContext(client, target)}

【食事指導方針】
${DIET_POLICY}

${TRAINER_STYLE}

【出力JSON形式】
必ずこのJSON形式のみで返してください：
${REPLY_JSON_SCHEMA}

replyの中身は以下の構成にしてください：
【出来ていること】
（良かった点を具体的に）

【目的と目標を達成するために改善が必要なこと】
（改善点を1〜2個、理由とともに優しく）`;
}

export function buildImageFeedbackPrompt(
  client: Client,
  nutrition: NutritionData,
  evaluation: NutritionEvaluation,
  target: NutritionTarget
): string {
  const allFoods = [
    ...nutrition.meals.breakfast.map((f) => `朝：${f}`),
    ...nutrition.meals.lunch.map((f) => `昼：${f}`),
    ...nutrition.meals.dinner.map((f) => `夜：${f}`),
    ...nutrition.meals.snack.map((f) => `間食：${f}`),
  ];
  const fmt = (v: number | null, u: string) => v !== null ? `${v}${u}` : "不明";
  const diff = (v: number | null, t: number) =>
    v !== null ? `（目標比${v > t ? "+" : ""}${v - t}）` : "";

  const nutritionSummary = `記録日: ${nutrition.recordDate ?? "不明"} / アプリ: ${nutrition.appName ?? "不明"}
総カロリー: ${fmt(nutrition.totalCalories, "kcal")}${diff(nutrition.totalCalories, target.calories)} → ${statusLabel(evaluation.calorieStatus)}
たんぱく質: ${fmt(nutrition.protein, "g")}${diff(nutrition.protein, target.protein)} → ${statusLabel(evaluation.proteinStatus)}
脂質:       ${fmt(nutrition.fat, "g")}${diff(nutrition.fat, target.fat)} → ${statusLabel(evaluation.fatStatus)}
炭水化物:   ${fmt(nutrition.carbs, "g")}${diff(nutrition.carbs, target.carbs)} → ${statusLabel(evaluation.carbStatus)}
食物繊維:   ${fmt(nutrition.fiber, "g")} → ${statusLabel(evaluation.fiberStatus)}
食塩相当量: ${fmt(nutrition.salt, "g")} → ${statusLabel(evaluation.saltStatus)}
脂質が多い原因食品: ${evaluation.highFatFoods.length > 0 ? evaluation.highFatFoods.join("、") : "特定できず"}
たんぱく質不足時の提案: ${evaluation.lowProteinSuggestions.length > 0 ? evaluation.lowProteinSuggestions.join("、") : "不要"}
食事内容:
${allFoods.length > 0 ? allFoods.join("\n") : "（食品情報なし）"}`;

  return `あなたはパーソナルジムの食事指導トレーナーAIです。
お客様が食事記録アプリのスクリーンショットを送ってくれました。
解析済みの栄養データをもとに、トレーナーらしい温かい返信案をJSON形式で返してください。

【顧客情報】
${buildClientContext(client, target)}

【解析済み栄養データ】
${nutritionSummary}

【食事指導方針】
${DIET_POLICY}

${TRAINER_STYLE}

【画像返信追加ルール】
・最初に「スクリーンショットありがとうございます！」から始める
・数値が読み取れた場合は具体的な数字を使って褒める
・脂質が多い場合は原因食品を優しく伝える（「悪い」ではなく「摂りすぎを整える」表現）
・たんぱく質不足なら次の食事で足せる具体的な食品を提案する
・医療診断はしない

【出力JSON形式】
必ずこのJSON形式のみで返してください：
${REPLY_JSON_SCHEMA}

replyの中身は以下の構成にしてください：
【出来ていること】
（良かった点を具体的に）

【目的と目標を達成するために改善が必要なこと】
（改善点を1〜2個、理由とともに優しく）`;
}
export function buildFoodPhotoFeedbackPrompt(
  client: Client,
  nutrition: NutritionData,
  target: NutritionTarget
): string {
  const allFoods = [
    ...nutrition.meals.breakfast,
    ...nutrition.meals.lunch,
    ...nutrition.meals.dinner,
    ...nutrition.meals.snack,
  ];
  const cookingMethods = (nutrition as any).cookingMethods ?? [];

  return `あなたはパーソナルジムの食事指導トレーナーAIです。
お客様が食事の写真を送ってくれました。
写真から判断できる範囲で、トレーナーらしい温かい返信案をJSON形式で返してください。

【顧客情報】
${buildClientContext(client, target)}

【写真から読み取った情報】
推定食品: ${allFoods.join("、") || "不明"}
調理法: ${cookingMethods.join("、") || "不明"}
推定カロリー: ${nutrition.totalCalories ? `${nutrition.totalCalories}kcal` : "不明"}

【食事指導方針】
${DIET_POLICY}

【返信ルール】
・「お写真ありがとうございます！」から始める
・見えている食品を具体的に褒める
・揚げ物・炒め物など脂質が多そうな調理法は優しく伝える
・数値が不明な場合は「写真から見る限り」という表現を使う
・次の食事でできる具体的な提案を1つする
・「〜でございますね！」「〜ましょう！」など明るく丁寧なトーン
・改善点は1〜2個に絞る
・医療診断はしない

【出力JSON形式】
${REPLY_JSON_SCHEMA}

replyの中身は以下の構成にしてください：
【出来ていること】
（見えている食品の良い点を具体的に）

【目的と目標を達成するために改善が必要なこと】
（改善点を1〜2個、理由とともに優しく）`;
}
