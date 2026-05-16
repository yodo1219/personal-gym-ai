import OpenAI from "openai";
import { NutritionData, NutritionEvaluation, NutritionTarget, Client } from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 画像の種類を判別
type ImageType = "summary" | "meal_detail" | "unknown";

interface SingleImageResult {
  imageType: ImageType;
  nutrition: Partial<NutritionData>;
}

const VISION_SYSTEM_PROMPT = `あなたは食事記録アプリ（カロミル・あすけん等）のスクリーンショットを解析する専門AIです。

まず画像の種類を判別してください：
- "summary": 1日の合計カロリー・PFC（たんぱく質・脂質・炭水化物）・食物繊維・食塩などの栄養数値がまとめて表示されている画面
- "meal_detail": 朝食・昼食・夕食・間食などの食品名・メニュー名が一覧で表示されている画面
- "unknown": どちらでもない

必ず以下のJSON形式のみで返してください。JSON以外は一切出力しないでください。

{
  "imageType": "summary" または "meal_detail" または "unknown",
  "totalCalories": <数値またはnull（summaryのみ）>,
  "protein": <数値またはnull（summaryのみ）>,
  "fat": <数値またはnull（summaryのみ）>,
  "carbs": <数値またはnull（summaryのみ）>,
  "fiber": <数値またはnull（summaryのみ）>,
  "salt": <数値またはnull（summaryのみ）>,
  "meals": {
    "breakfast": ["食品名1", "食品名2"],
    "lunch": ["食品名1"],
    "dinner": ["食品名1"],
    "snack": ["食品名1"]
  },
  "rawText": "画像に写っているテキストをすべて書き起こした文字列",
  "appName": "カロミル または あすけん または MyFitnessPal または 不明",
  "recordDate": "YYYY-MM-DD形式またはnull"
}

【重要ルール】
- summaryの場合：栄養数値を読み取る。mealsは空配列でOK
- meal_detailの場合：食品名を朝昼夜間食に分けて読み取る。栄養数値はnullでOK
- 単位はkcal・gに統一（mg→g変換すること）
- 読み取れない項目はnull or 空配列`;

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
            text: "この画像の種類を判別し、栄養情報と食事内容を読み取ってJSON形式で返してください。",
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
      nutrition: {
        totalCalories: parsed.totalCalories ?? null,
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
      nutrition: {
        totalCalories: null, protein: null, fat: null, carbs: null,
        fiber: null, salt: null,
        meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
        rawText: raw, appName: null, recordDate: null,
      },
    };
  }
}

// 複数画像を解析してマージ
export async function analyzeMultipleImages(
  images: { base64: string; mimeType: string }[]
): Promise<NutritionData> {
  const results = await Promise.all(
    images.map((img) => analyzeSingleImage(img.base64, img.mimeType))
  );

  // summaryとmeal_detailを分ける
  const summaryResult = results.find((r) => r.imageType === "summary");
  const mealResults = results.filter((r) => r.imageType === "meal_detail");
  const unknownResults = results.filter((r) => r.imageType === "unknown");

  // 栄養数値はsummaryから取得（なければunknownから）
  const nutritionSource = summaryResult ?? unknownResults[0];

  // 食事内容はmeal_detailから集約（なければsummaryやunknownから）
  const allMealSources = mealResults.length > 0
    ? mealResults
    : [summaryResult, ...unknownResults].filter(Boolean);

  const mergedMeals = {
    breakfast: allMealSources.flatMap((r) => r?.nutrition.meals?.breakfast ?? []),
    lunch: allMealSources.flatMap((r) => r?.nutrition.meals?.lunch ?? []),
    dinner: allMealSources.flatMap((r) => r?.nutrition.meals?.dinner ?? []),
    snack: allMealSources.flatMap((r) => r?.nutrition.meals?.snack ?? []),
  };

  const rawText = results.map((r) => r.nutrition.rawText ?? "").join("\n");
  const appName = results.find((r) => r.nutrition.appName)?.nutrition.appName ?? null;
  const recordDate = results.find((r) => r.nutrition.recordDate)?.nutrition.recordDate ?? null;

  return {
    totalCalories: nutritionSource?.nutrition.totalCalories ?? null,
    protein: nutritionSource?.nutrition.protein ?? null,
    fat: nutritionSource?.nutrition.fat ?? null,
    carbs: nutritionSource?.nutrition.carbs ?? null,
    fiber: nutritionSource?.nutrition.fiber ?? null,
    salt: nutritionSource?.nutrition.salt ?? null,
    meals: mergedMeals,
    rawText,
    appName,
    recordDate,
  };
}

// 後方互換性のため1枚用も残す
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