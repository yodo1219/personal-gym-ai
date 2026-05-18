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

const VISION_SYSTEM_PROMPT = `あなたは食事・栄養管理の専門AIです。
送られてきた画像を解析し、必ず以下のJSON形式のみで返してください。
JSON以外のテキストは一切出力しないでください。

画像の種類を判別してください：
- "summary": 食事記録アプリの1日の合計栄養数値（カロリー・PFC等）が表示されている画面
- "meal_detail": 食事記録アプリの食品名・メニュー名が一覧表示されている画面
- "food_photo": 実際の食事・料理・食品の写真
- "unknown": その他

{
  "imageType": "summary" または "meal_detail" または "food_photo" または "unknown",
  "totalCalories": <数値またはnull>,
  "protein": <数値またはnull>,
  "fat": <数値またはnull>,
  "carbs": <数値またはnull>,
  "fiber": <数値またはnull>,
  "salt": <数値またはnull>,
  "meals": {
    "breakfast": ["食品名1", "食品名2"],
    "lunch": ["食品名1"],
    "dinner": ["食品名1"],
    "snack": ["食品名1"]
  },
  "estimatedCalories": <食事写真から推定したカロリー数値またはnull>,
  "estimatedFoods": ["推定食品1", "推定食品2"],
  "cookingMethods": ["調理法1", "調理法2"],
  "rawText": "画像に写っているテキストをすべて書き起こした文字列",
  "appName": "カロミル または あすけん または MyFitnessPal または 不明",
  "recordDate": "YYYY-MM-DD形式またはnull"
}

【重要ルール】
- summaryの場合：栄養数値を正確に読み取る
- meal_detailの場合：食品名を朝昼夜間食に分けて読み取る
- food_photoの場合：
  * 見えている料理・食品をすべてestimatedFoodsに列挙する
  * 調理法（揚げ物・炒め物・蒸し物等）をcookingMethodsに記載
  * カロリーを推定してestimatedCaloriesに記載
  * 食事の時間帯が推定できればmealsに振り分ける
- 単位はkcal・gに統一
- 読み取れない項目はnullまたは空配列`;

async function analyzeSingleImage(
  base64Image: string,
  mimeType: string
): Promise<SingleImageResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1500,
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
            text: "この画像を解析してJSON形式で返してください。",
          },
        ],
      },
    ],
  });

  const raw = response.choices[0].message.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
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

  return {
    totalCalories: nutritionSource?.nutrition.totalCalories ??
      (isFoodPhotoOnly && estimatedCalories > 0 ? estimatedCalories : null),
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
  target: NutritionTarget
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
    lowProteinSuggestions.push(
      "サラダチキン（1パックで約20g）",
      "ギリシャヨーグルト（1個で約10g）",
      "ゆで卵（1個で約6g）"
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
