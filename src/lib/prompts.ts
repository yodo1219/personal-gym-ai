import { Client, NutritionData, NutritionEvaluation, NutritionTarget } from "@/types";

export function calcTarget(client: Client): NutritionTarget {
  if (
    (client as any).targetCalories &&
    (client as any).targetProtein &&
    (client as any).targetFat &&
    (client as any).targetCarbs
  ) {
    return {
      calories: (client as any).targetCalories,
      protein: (client as any).targetProtein,
      fat: (client as any).targetFat,
      carbs: (client as any).targetCarbs,
    };
  }

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
  const map: Record<Client["goal"], string> = {
    fat_loss: "減量", muscle_gain: "筋肉増量", maintain: "現状維持", health: "健康増進"
  };
  return map[g];
}

function activityLabel(l: Client["activityLevel"]) {
  const map: Record<Client["activityLevel"], string> = {
    sedentary: "ほぼ運動なし", light: "軽い運動", moderate: "中程度",
    active: "活発", very_active: "非常に活発",
  };
  return map[l];
}

function statusLabel(s: string) {
  return ({ low: "少なめ", ok: "良好", high: "多め", unknown: "不明" } as Record<string, string>)[s] ?? "不明";
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
【出来ていること】✨
本日の鶏むね肉は素晴らしい選択でございますね！
鶏むね肉に含まれる必須アミノ酸（ロイシン・バリン・イソロイシン）は
筋肉の合成を促進し、運動後の回復を助ける効果がございます！
積極的に取り入れていきましょう！

【目的と目標を達成するために改善が必要なこと】💪
今日の揚げ物に含まれる飽和脂肪酸は、摂りすぎると
体脂肪として蓄積されやすく血中コレステロールを上昇させる
可能性がございます。週2〜3回程度に抑えていきましょう！

【リカバリー方法】
次の食事で食物繊維（ブロッコリー・きのこ・海藻）を
多めに摂ると余分な脂質の排出を助けます！
水分をしっかり摂ることで代謝促進にもなりますよ！
---

【文体のルール】
・「〜でございますね！」「〜ましょう！」など丁寧だけど明るいトーン
・必ず【出来ていること】を先に書く
・食材・料理名を具体的に挙げる
・その食材に含まれる栄養素名を必ず入れる
・その栄養素が体にもたらす具体的な作用を説明する
・摂りすぎた場合の体への影響を具体的に説明する
・必ず【リカバリー方法】を入れる
・改善点は1〜2個に絞る
・「〜はダメ」ではなく「〜を整えていきましょう」など前向きな表現
・絵文字を2〜3個使う（✨💪🥗など）
・文末は「！」で終わる
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
【出来ていること】✨
（食材名・含まれる栄養素名・その栄養素が体にもたらす具体的な作用を説明する）

【目的と目標を達成するために改善が必要なこと】💪
（改善が必要な食材名・含まれる成分・摂りすぎた場合の体への具体的な影響を説明する）

【リカバリー方法】
（次の食事・翌日でできる具体的な行動を1〜2個。食物繊維・水分・代替食品など）`;
}

export function buildImageFeedbackPrompt(
  client: Client,
  nutrition: NutritionData,
  evaluation: NutritionEvaluation,
  target: NutritionTarget
): string {
  const allFoods = [
    ...nutrition.meals.breakfast.map((f: string) => `朝：${f}`),
    ...nutrition.meals.lunch.map((f: string) => `昼：${f}`),
    ...nutrition.meals.dinner.map((f: string) => `夜：${f}`),
    ...nutrition.meals.snack.map((f: string) => `間食：${f}`),
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
・食材に含まれる栄養素名と体への具体的な作用を説明する
・摂りすぎた栄養素がどんな影響を体に与えるか具体的に説明する
・脂質が多い場合は原因食品を優しく伝える
・たんぱく質不足なら次の食事で足せる具体的な食品を提案する
・必ず【リカバリー方法】セクションを入れる
・医療診断はしない

【出力JSON形式】
必ずこのJSON形式のみで返してください：
${REPLY_JSON_SCHEMA}

replyの中身は以下の構成にしてください：
【出来ていること】✨
（食材名・含まれる栄養素名・その栄養素が体にもたらす具体的な作用を説明する）

【目的と目標を達成するために改善が必要なこと】💪
（改善が必要な食材名・含まれる成分・摂りすぎた場合の体への具体的な影響を説明する）

【リカバリー方法】
（次の食事・翌日でできる具体的な行動を1〜2個。食物繊維・水分・代替食品など）`;
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
写真から見えている食品・料理を具体的に言及しながら、トレーナーらしい温かい返信案をJSON形式で返してください。

【顧客情報】
${buildClientContext(client, target)}

【写真から読み取った情報】
推定食品: ${allFoods.join("、") || "不明"}
調理法: ${cookingMethods.length > 0 ? cookingMethods.join("、") : "不明"}
推定カロリー: ${nutrition.totalCalories ? `約${nutrition.totalCalories}kcal` : "不明"}
目標カロリー: ${target.calories}kcal
カロリー差: ${nutrition.totalCalories ? `${nutrition.totalCalories - target.calories > 0 ? "+" : ""}${nutrition.totalCalories - target.calories}kcal` : "不明"}
目標たんぱく質: ${target.protein}g
目標脂質: ${target.fat}g
目標炭水化物: ${target.carbs}g

【食事指導方針】
${DIET_POLICY}

${TRAINER_STYLE}

【写真返信追加ルール】
・「お写真ありがとうございます！」から始める
・写真に写っている具体的な食品名・料理名を必ず使って褒める
・食材に含まれる栄養素名と体への具体的な作用を説明する
・摂りすぎた場合の体への影響を具体的に説明する
・揚げ物など脂質が多そうな調理法がある場合は優しく伝える
・必ず【リカバリー方法】セクションを入れる
・推定カロリーが読み取れた場合は必ず目標カロリーと比較して伝える
・医療診断はしない

【出力JSON形式】
${REPLY_JSON_SCHEMA}

replyの中身は必ずこの構成にしてください：
【出来ていること】✨
（食材名・含まれる栄養素名・その栄養素が体にもたらす具体的な作用を説明する）

【目的と目標を達成するために改善が必要なこと】💪
（改善が必要な食材名・含まれる成分・摂りすぎた場合の体への具体的な影響を説明する）

【リカバリー方法】
（次の食事・翌日でできる具体的な行動を1〜2個。食物繊維・水分・代替食品など）`;
}

export function buildNutrientTip(nutrition: NutritionData, client: Client): string {
  const tips = [
    {
      condition: (n: NutritionData) => n.protein !== null && n.protein < 50,
      tip: "💡 今日のワンポイント｜たんぱく質\nたんぱく質は筋肉・肌・髪の材料になります！鶏むね肉・卵・豆腐などに多く含まれています。目安は体重×1.5g/日です！",
    },
    {
      condition: (n: NutritionData) => n.fiber !== null && n.fiber < 15,
      tip: "💡 今日のワンポイント｜食物繊維\n食物繊維は腸内環境を整えて脂肪の吸収を緩やかにします！ブロッコリー・きのこ・海藻類に豊富です！",
    },
    {
      condition: (n: NutritionData) => n.fat !== null && n.fat > 60,
      tip: "💡 今日のワンポイント｜オメガ3脂肪酸\n脂質を摂るなら質にこだわりましょう！サーモン・サバ・亜麻仁油に含まれるオメガ3は体の炎症を抑える良い脂質です！",
    },
    {
      condition: (n: NutritionData) => n.salt !== null && n.salt > 6,
      tip: "💡 今日のワンポイント｜カリウム\n塩分が多めの日はカリウムで調整しましょう！バナナ・アボカド・ほうれん草に豊富で、むくみ解消にも効果的です！",
    },
  ];

  const matched = tips.find((t) => t.condition(nutrition));
  if (matched) return matched.tip;

  const defaultTips = [
    "💡 今日のワンポイント｜ビタミンD\nビタミンDは骨を強くして免疫力を高めます！鮭・きのこ・卵黄に含まれています。日光浴でも生成されますよ！",
    "💡 今日のワンポイント｜マグネシウム\nマグネシウムは300以上の体内反応に関わる超重要ミネラルです！ナッツ・豆類・バナナに豊富です！",
    "💡 今日のワンポイント｜ビタミンC\nビタミンCはコラーゲン生成・免疫強化・鉄の吸収を助けます！ブロッコリー・パプリカ・キウイに豊富です！",
    "💡 今日のワンポイント｜亜鉛\n亜鉛は代謝・免疫・肌の健康に欠かせません！牡蠣・牛肉・ナッツ類に豊富です！",
  ];
  const idx = new Date().getDay() % defaultTips.length;
  return defaultTips[idx];
}

export function buildDetailedNutritionPrompt(
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

  return `あなたはパーソナルジムの管理栄養士AIです。
お客様から詳しい栄養素解説のリクエストがありました。
専門的でありながらわかりやすく、具体的な食品名を使って解説してください。

【顧客情報】
${buildClientContext(client, target)}

【本日の食事内容】
${allFoods.join("、") || "不明"}
総カロリー: ${nutrition.totalCalories ?? "不明"}kcal
たんぱく質: ${nutrition.protein ?? "不明"}g
脂質: ${nutrition.fat ?? "不明"}g
炭水化物: ${nutrition.carbs ?? "不明"}g
食物繊維: ${nutrition.fiber ?? "不明"}g
食塩相当量: ${nutrition.salt ?? "不明"}g

【既往歴・体質】
${client.medicalHistory || "特記なし"}

【解説ルール】
・本日の食事内容をもとに不足・過剰な栄養素を3つピックアップする
・各栄養素について以下を説明する：
  - どんな効果があるか
  - 今日の食事でどれくらい摂れているか
  - どの食品に多く含まれるか
  - 既往歴・体質に関係する場合は特記する
・「〜でございますね！」「〜ましょう！」など明るく丁寧なトーン
・絵文字を適度に使う
・医療診断はしない
・文末は「！」で終わる

以下の形式で返してください（JSONではなく通常テキスト）：

📊 本日の栄養素詳細レポート

【①栄養素名】
効果：〜
今日の摂取：〜
多く含む食品：〜

【②栄養素名】
効果：〜
今日の摂取：〜
多く含む食品：〜

【③栄養素名】
効果：〜
今日の摂取：〜
多く含む食品：〜

まとめ：〜`;
}

export function getOnboardingMessage(step: string, name?: string): string {
  const messages: Record<string, string> = {
    start: `はじめまして！GymAI食事指導システムへようこそ🎉\n\nより精度の高い食事アドバイスのために、いくつか教えてください！\n\nまずお名前を教えてください😊`,
    age: `${name}さん、よろしくお願いします！\n\n次に年齢を教えてください！\n（例：28）`,
    gender: `ありがとうございます！\n\n性別を教えてください！\n「男性」または「女性」と送ってください😊`,
    height: `ありがとうございます！\n\n身長を教えてください！\n（例：165）`,
    weight: `ありがとうございます！\n\n現在の体重を教えてください！\n（例：58）`,
    goal: `ありがとうございます！\n\n目標を教えてください！\n以下から選んで送ってください😊\n\n1️⃣ 減量・体脂肪を減らしたい\n2️⃣ 筋肉を増やしたい\n3️⃣ 現状維持・健康増進`,
    medical_history: `ありがとうございます！\n\n既往歴や持病があれば教えてください！\n（例：高血圧、なし、花粉症など）\n\n※食事アドバイスの参考にするためです。医療相談ではありません😊`,
    allergies: `ありがとうございます！\n\nアレルギーや苦手な食べ物があれば教えてください！\n（例：エビアレルギー、なし）`,
    constitution: `ありがとうございます！\n\n最後に体質や気になることを教えてください！\n（例：冷え性、むくみやすい、疲れやすい、なし）`,
    complete: `${name}さんの情報を登録しました🎉\n\nこれからカロミルやあすけんのスクリーンショット、または食事の写真を送ってください📸\n\n全部送り終わったら「完了」と送ってください！\nAIがまとめて解析してアドバイスをお届けします💪`,
  };
  return messages[step] ?? messages.start;
}

export function buildConsultationPrompt(client: Client, target: NutritionTarget): string {
  return `あなたはパーソナルジムの食事指導トレーナーAIです。
お客様からの食事に関する相談に答えてください。

【顧客情報】
${buildClientContext(client, target)}

【回答ルール】
・「〜でございますね！」「〜ましょう！」など丁寧だけど明るいトーン
・否定しない（「ダメ」「禁止」は使わない）
・食べたいものを完全に禁止せず、量や工夫を提案する
・具体的な代替食品や食べ方を提案する
・理由をわかりやすく説明する
・絵文字を1〜2個使う
・文末は「！」で終わる
・3〜5文程度で簡潔にまとめる
・医療診断はしない`;
}