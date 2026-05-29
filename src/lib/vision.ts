import OpenAI from "openai";
import { NutritionData, NutritionEvaluation, NutritionTarget, Client } from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ImageType = "summary" | "meal_detail" | "food_photo" | "unknown";

interface SingleImageResult {
  imageType: ImageType;
  estimatedFoods: string[];
  cookingMethods: string[];
  nutrition: Partial<NutritionData>;
}

const VISION_SYSTEM_PROMPT = `あなたは食事記録アプリのスクリーンショットと食事写真を解析する専門AIです。
画像内のテキスト・数値を一字一句正確に読み取ることが最優先です。

【文字・数値読み取りの厳守ルール】
・画像内の数字は絶対に推測しない。見えている数字をそのまま読む
・小数点・単位（kcal・g・mg）も正確に読む
・似た数字（1と7、6と0、3と8など）は文脈から慎重に判断する
・文字が小さくても拡大して読む（detail:highで送信されています）
・読み取れない場合のみnullにする（推測値は入れない）
・カロミル・あすけん・MyFitnessPalなど各アプリのUI構造を理解して読む

【カロミルの場合】
・上部の大きな数字が総カロリー
・PFCは「たんぱく質・脂質・炭水化物」の順で表示
・グラフの下に数値が表示される

【あすけんの場合】
・「今日の食事」画面に総カロリーとPFCが表示
・食品名リストから朝昼夜間食を読み取る

画像の種類を判別してください：
- "summary": 1日の合計栄養数値（カロリー・PFC等）が表示されている画面
- "meal_detail": 食品名・メニュー名が一覧表示されている画面
- "food_photo": 実際の食事・料理・食品の写真
- "unknown": その他

必ず以下のJSON形式のみで返してください。JSON以外は一切出力しないでください：

{
  "imageType": "summary" または "meal_detail" または "food_photo" または "unknown",
  "totalCalories": <画像から読み取った数値またはnull>,
  "protein": <画像から読み取った数値またはnull>,
  "fat": <画像から読み取った数値またはnull>,
  "carbs": <画像から読み取った数値またはnull>,
  "fiber": <画像から読み取った数値またはnull>,
  "salt": <画像から読み取った数値またはnull>,
  "meals": {
    "breakfast": ["食品名1", "食品名2"],
    "lunch": ["食品名1"],
    "dinner": ["食品名1"],
    "snack": ["食品名1"]
  },
  "estimatedCalories": <食事写真の場合は必ず各食品のカロリーを推定して合計値を数値で入れる。例：おにぎり200+アボカド160+味噌汁40=400なら400。絶対にnullにしない>,
  "totalCalories": <food_photoの場合はestimatedCaloriesと同じ値を入れる。summaryの場合は画像から読み取った値>,
  "estimatedFoods": ["推定食品1", "推定食品2"],
  "cookingMethods": ["調理法1", "調理法2"],
  "rawText": "画像に写っているテキストをすべて一字一句書き起こした文字列",
  "appName": "カロミル または あすけん または MyFitnessPal または 不明",
  "recordDate": "YYYY-MM-DD形式またはnull"
}

【重要】
- rawTextには画像内の全テキストを漏れなく書き起こすこと
- 数値は見えているものをそのまま使う（四捨五入・推測禁止）
- 単位はkcal・gに統一（mg→g変換すること）
-  読み取れない項目はnull、食品がない区分は空配列[]
- food_photoの場合はestimatedCaloriesを必ず数値で返す（推定でOK、nullは禁止）
- food_photoの場合はtotalCaloriesにもestimatedCaloriesと同じ値を入れる`;

async function analyzeSingleImage(
  base64Image: string,
  mimeType: string
): Promise<SingleImageResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: "high",
            },
          },
          {
            type: "text",
            text: `この画像を解析してJSON形式で返してください。
食事・料理の写真の場合（food_photo）：
・見えている食品を全て特定してください
・各食品のカロリーを必ず推定してください（例：おにぎり1個=200kcal、アボカド半分=120kcal）
・estimatedCaloriesに全食品の合計カロリーを数値で入れてください（nullは絶対禁止）
・totalCaloriesにもestimatedCaloriesと同じ値を入れてください
スクリーンショットの場合：数値は絶対に推測せず、見えているものだけを使ってください。`,
          },
        ],
      },
    ],
  });

  const raw = response.choices[0].message.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    console.log("Vision parsed:", JSON.stringify({ imageType: parsed.imageType, totalCalories: parsed.totalCalories, estimatedCalories: parsed.estimatedCalories }));
    return {
      imageType: parsed.imageType ?? "unknown",
      estimatedFoods: parsed.estimatedFoods ?? [],
      cookingMethods: parsed.cookingMethods ?? [],
      nutrition: {
        totalCalories: parsed.totalCalories ?? parsed.estimatedCalories ?? null,
        protein: parsed.protein ?? null,
        fat: parsed.fat ?? null,
        carbs: parsed.carbs ?? null,
        fiber: parsed.fiber ?? null,
        salt: parsed.salt ?? null,
        meals: {
          breakfast: parsed.meals?.breakfast ?? [],
          lunch: parsed.meals?.lunch ?? [],
          dinner: parsed.meals?.dinner ?? [],
          snack: parsed.meals?.snack ?? [],
        },
        rawText: parsed.rawText ?? "",
        appName: parsed.appName ?? null,
        recordDate: parsed.recordDate ?? null,
      },
    };
  } catch {
    return {
      imageType: "unknown",
      estimatedFoods: [],
      cookingMethods: [],
      nutrition: {
        totalCalories: null, protein: null, fat: null, carbs: null,
        fiber: null, salt: null,
        meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
        rawText: raw, appName: null, recordDate: null,
      },
    };
  }
}

export async function analyzeMultipleImages(
  images: { base64: string; mimeType: string }[]
): Promise<NutritionData> {
  const results = await Promise.all(
    images.map((img) => analyzeSingleImage(img.base64, img.mimeType))
  );

  const summaryResult = results.find((r) => r.imageType === "summary");
  const mealResults = results.filter((r) => r.imageType === "meal_detail");
  const foodPhotoResults = results.filter((r) => r.imageType === "food_photo");
  const unknownResults = results.filter((r) => r.imageType === "unknown");

  const nutritionSource = summaryResult ?? unknownResults[0];

  const allMealSources = mealResults.length > 0
    ? mealResults
    : foodPhotoResults.length > 0
    ? foodPhotoResults
    : [summaryResult, ...unknownResults].filter(Boolean);

  const foodPhotoFoods = foodPhotoResults.flatMap((r) => r.estimatedFoods);
  const cookingMethods = foodPhotoResults.flatMap((r) => r.cookingMethods);

  const mergedMeals = {
    breakfast: allMealSources.flatMap((r) => r?.nutrition.meals?.breakfast ?? []),
    lunch: allMealSources.flatMap((r) => r?.nutrition.meals?.lunch ?? []),
    dinner: [
      ...allMealSources.flatMap((r) => r?.nutrition.meals?.dinner ?? []),
      ...foodPhotoFoods,
    ],
    snack: allMealSources.flatMap((r) => r?.nutrition.meals?.snack ?? []),
  };

  const rawText = results.map((r) => r.nutrition.rawText ?? "").join("\n");
  const appName = results.find((r) => r.nutrition.appName)?.nutrition.appName ?? null;
  const recordDate = results.find((r) => r.nutrition.recordDate)?.nutrition.recordDate ?? null;

  const estimatedCalories = foodPhotoResults.reduce((sum, r) => {
    return sum + (r.nutrition.totalCalories ?? 0);
  }, 0);

  const isFoodPhotoOnly = foodPhotoResults.length > 0 && !summaryResult;

  // 食事写真がある場合は推定カロリーを合算
  const summaryCalories = nutritionSource?.nutrition.totalCalories ?? null;
  const totalCalories = summaryCalories !== null
    ? summaryCalories + (foodPhotoResults.length > 0 ? estimatedCalories : 0)
    : (isFoodPhotoOnly && estimatedCalories > 0 ? estimatedCalories : null);

  return {
    totalCalories,
    protein: nutritionSource?.nutrition.protein ?? null,
    fat: nutritionSource?.nutrition.fat ?? null,
    carbs: nutritionSource?.nutrition.carbs ?? null,
    fiber: nutritionSource?.nutrition.fiber ?? null,
    salt: nutritionSource?.nutrition.salt ?? null,
    meals: mergedMeals,
    rawText,
    appName,
    recordDate,
    isFoodPhotoOnly,
    cookingMethods,
  };
}

export async function analyzeImageNutrition(
  base64Image: string,
  mimeType: string = "image/jpeg"
): Promise<NutritionData> {
  return analyzeMultipleImages([{ base64: base64Image, mimeType }]);
}

export function calcNutritionTarget(client: Client): NutritionTarget {
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

export function evaluateNutrition(
  data: NutritionData,
  target: NutritionTarget,
  recentFoods: string[] = []
): NutritionEvaluation {
  function status(
    actual: number | null, targetVal: number,
    lowRatio = 0.85, highRatio = 1.2
  ): "low" | "ok" | "high" | "unknown" {
    if (actual === null) return "unknown";
    if (actual < targetVal * lowRatio) return "low";
    if (actual > targetVal * highRatio) return "high";
    return "ok";
  }

  const fatStatus = status(data.fat, target.fat, 0.5, 1.15);
  const highFatFoods: string[] = [];
  if (fatStatus === "high") {
    const allFoods = [
      ...data.meals.breakfast, ...data.meals.lunch,
      ...data.meals.dinner, ...data.meals.snack,
    ];
    const HIGH_FAT_KEYWORDS = [
      "揚げ", "フライ", "天ぷら", "とんかつ", "ナッツ", "チーズ", "バター",
      "マヨネーズ", "ラーメン", "カレー", "焼肉", "チョコ", "ケーキ", "スナック",
    ];
    allFoods.forEach((food) => {
      if (HIGH_FAT_KEYWORDS.some((kw) => food.includes(kw))) {
        highFatFoods.push(food);
      }
    });
  }

  const proteinStatus = status(data.protein, target.protein);
  const lowProteinSuggestions: string[] = [];
  if (proteinStatus === "low") {
    const allSuggestions = [
      { food: "サラダチキン", detail: "1パックで約20g", keywords: ["サラダチキン", "チキン"] },
      { food: "ギリシャヨーグルト", detail: "1個で約10g", keywords: ["ヨーグルト"] },
      { food: "ゆで卵", detail: "1個で約6g", keywords: ["卵", "ゆで卵", "たまご"] },
      { food: "木綿豆腐", detail: "半丁で約10g", keywords: ["豆腐"] },
      { food: "納豆", detail: "1パックで約8g", keywords: ["納豆"] },
      { food: "ツナ缶", detail: "1缶で約15g", keywords: ["ツナ", "まぐろ"] },
      { food: "魚肉ソーセージ", detail: "1本で約7g", keywords: ["魚肉ソーセージ"] },
      { food: "枝豆", detail: "100gで約11g", keywords: ["枝豆"] },
      { food: "鮭フレーク", detail: "大さじ2で約8g", keywords: ["鮭", "さけ"] },
      { food: "するめ・さきいか", detail: "1袋で約15g", keywords: ["するめ", "さきいか", "いか"] },
      { food: "プロテインバー", detail: "1本で約20g", keywords: ["プロテイン"] },
      { food: "しらす", detail: "大さじ3で約6g", keywords: ["しらす"] },
      { food: "鶏むね肉", detail: "100gで約24g", keywords: ["鶏むね", "むね肉"] },
      { food: "ちくわ", detail: "2本で約6g", keywords: ["ちくわ"] },
      { food: "カッテージチーズ", detail: "100gで約12g", keywords: ["チーズ", "カッテージ"] },
    ];

    // 直近で食べているものを除外
    const notRecentlyEaten = allSuggestions.filter((s) =>
      !s.keywords.some((kw) =>
        recentFoods.some((f) => f.includes(kw))
      )
    );

    // 食べていないものを優先、なければ全体からランダム
    const pool = notRecentlyEaten.length >= 3 ? notRecentlyEaten : allSuggestions;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    lowProteinSuggestions.push(
      ...shuffled.slice(0, 3).map((s) => `${s.food}（${s.detail}）`)
    );
  }
  

  return {
    calorieStatus: status(data.totalCalories, target.calories),
    proteinStatus,
    fatStatus,
    carbStatus: status(data.carbs, target.carbs, 0.6, 1.3),
    fiberStatus: data.fiber === null ? "unknown" : data.fiber < 15 ? "low" : "ok",
    saltStatus: data.salt === null ? "unknown" : data.salt > 7.5 ? "high" : "ok",
    highFatFoods,
    lowProteinSuggestions,
  };
}
