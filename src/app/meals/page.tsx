"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, MealEntry, NutritionData, NutritionEvaluation, NutritionTarget } from "@/types";
import MealImageUpload from "@/components/MealImageUpload";
import { format } from "date-fns";

type InputMode = "text" | "image";

interface AnalyzeResult {
  nutrition: NutritionData;
  target: NutritionTarget;
  evaluation: NutritionEvaluation;
  dangerLevel: string;
  dangerReasons: string[];
  aiReply: string;
  goodPoints: string[];
  improvements: string[];
  nextAction: string;
  fileName: string;
}

function NutritionCard({ label, value, target, unit, status, lowerIsBetter = false }: {
  label: string; value: number | null; target: number;
  unit: string; status: string; lowerIsBetter?: boolean;
}) {
  const colorMap: Record<string, string> = {
    ok: "text-green-600 bg-green-50 border-green-200",
    low: "text-yellow-600 bg-yellow-50 border-yellow-200",
    high: lowerIsBetter ? "text-red-600 bg-red-50 border-red-200" : "text-orange-600 bg-orange-50 border-orange-200",
    unknown: "text-gray-400 bg-gray-50 border-gray-200",
  };
  const labelMap: Record<string, string> = {
    ok: "良好", low: "少なめ", high: lowerIsBetter ? "多め⚠" : "多め", unknown: "不明",
  };
  return (
    <div className={`border rounded-lg p-3 ${colorMap[status] ?? colorMap.unknown}`}>
      <p className="text-xs font-medium mb-1">{label}</p>
      <p className="text-lg font-bold">
        {value !== null ? value : "—"}
        <span className="text-xs font-normal ml-1">{unit}</span>
      </p>
      <p className="text-xs opacity-70">目標 {target}{unit} · {labelMap[status] ?? "不明"}</p>
    </div>
  );
}

function buildContentText(n: NutritionData): string {
  const lines: string[] = [];
  if (n.recordDate) lines.push(`記録日: ${n.recordDate}`);
  if (n.appName) lines.push(`アプリ: ${n.appName}`);
  if (n.totalCalories) lines.push(`総カロリー: ${n.totalCalories}kcal`);
  if (n.protein) lines.push(`たんぱく質: ${n.protein}g`);
  if (n.fat) lines.push(`脂質: ${n.fat}g`);
  if (n.carbs) lines.push(`炭水化物: ${n.carbs}g`);
  if (n.fiber) lines.push(`食物繊維: ${n.fiber}g`);
  if (n.salt) lines.push(`食塩相当量: ${n.salt}g`);
  const meals = [
    n.meals.breakfast.length > 0 ? `朝食: ${n.meals.breakfast.join("、")}` : null,
    n.meals.lunch.length > 0 ? `昼食: ${n.meals.lunch.join("、")}` : null,
    n.meals.dinner.length > 0 ? `夕食: ${n.meals.dinner.join("、")}` : null,
    n.meals.snack.length > 0 ? `間食: ${n.meals.snack.join("、")}` : null,
  ].filter(Boolean);
  if (meals.length > 0) lines.push(...meals as string[]);
  return lines.join("\n");
}

export default function MealInputPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("image");
  const [textContent, setTextContent] = useState("");
  const [mealDate, setMealDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [imageFileName, setImageFileName] = useState("");
  const [editedReply, setEditedReply] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then((data: Client[]) => {
      setClients(data);
      if (data.length > 0) setSelectedClientId(data[0].id);
    });
  }, []);

  function handleAnalyzed(results: AnalyzeResult[], fileNames: string[]) {
    // 複数枚の結果をマージする
    const merged = mergeResults(results);
    setAnalyzeResult(merged);
    setImageFileName(fileNames.join("、"));
    setEditedReply(merged.aiReply);
  }
  
  function mergeResults(results: AnalyzeResult[]): AnalyzeResult {
    if (results.length === 1) return results[0];
  
    // 栄養素を合算
    const sum = (key: keyof Pick<typeof results[0]["nutrition"], "totalCalories" | "protein" | "fat" | "carbs" | "fiber" | "salt">) => {
      const vals = results.map((r) => r.nutrition[key]).filter((v): v is number => v !== null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    };
  
    const mergedNutrition = {
      ...results[0].nutrition,
      totalCalories: sum("totalCalories"),
      protein: sum("protein"),
      fat: sum("fat"),
      carbs: sum("carbs"),
      fiber: sum("fiber"),
      salt: sum("salt"),
      meals: {
        breakfast: results.flatMap((r) => r.nutrition.meals.breakfast),
        lunch: results.flatMap((r) => r.nutrition.meals.lunch),
        dinner: results.flatMap((r) => r.nutrition.meals.dinner),
        snack: results.flatMap((r) => r.nutrition.meals.snack),
      },
      rawText: results.map((r) => r.nutrition.rawText).join("\n"),
    };
  
    // 危険レベルは最も高いものを採用
    const dangerPriority = { danger: 2, caution: 1, safe: 0 };
    const highestDanger = results.reduce((a, b) =>
      dangerPriority[a.dangerLevel as keyof typeof dangerPriority] >
      dangerPriority[b.dangerLevel as keyof typeof dangerPriority] ? a : b
    );
  
    return {
      ...results[0],
      nutrition: mergedNutrition,
      dangerLevel: highestDanger.dangerLevel,
      dangerReasons: [...new Set(results.flatMap((r) => r.dangerReasons))],
      aiReply: results.map((r, i) => i === 0 ? r.aiReply : `\n---\n${r.aiReply}`).join(""),
      goodPoints: [...new Set(results.flatMap((r) => r.goodPoints))],
      improvements: [...new Set(results.flatMap((r) => r.improvements))].slice(0, 2),
      nextAction: results[0].nextAction,
    };
  }

  async function handleSave() {
    if (!selectedClientId) return;
    setSaving(true);
    const content = inputMode === "image" && analyzeResult
      ? buildContentText(analyzeResult.nutrition)
      : textContent;

    const meal: Omit<MealEntry, "id"> = {
      clientId: selectedClientId,
      mealDate,
      mealTime: "daily",
      inputType: inputMode,
      content,
      imageFileName: inputMode === "image" ? imageFileName : undefined,
      nutrition: analyzeResult?.nutrition,
      nutritionTarget: analyzeResult?.target,
      nutritionEval: analyzeResult?.evaluation,
      dangerLevel: (analyzeResult?.dangerLevel ?? "safe") as MealEntry["dangerLevel"],
      dangerReasons: analyzeResult?.dangerReasons ?? [],
      aiReply: editedReply,
      status: "reviewed",
      createdAt: new Date().toISOString(),
    };

    await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...meal, id: crypto.randomUUID() }),
    });
    setSaving(false);
    router.push("/");
  }

  const result = analyzeResult;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="font-bold text-gray-900">食事入力</h1>
      </header>
      <div className="max-w-2xl mx-auto p-6 space-y-5">

        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">顧客を選択</label>
            <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">食事日</label>
            <input type="date" value={mealDate} onChange={(e) => setMealDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setInputMode("image")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${inputMode === "image" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            📸 スクリーンショット
          </button>
          <button onClick={() => setInputMode("text")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${inputMode === "text" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            ✏️ テキスト入力
          </button>
        </div>

        {inputMode === "image" && selectedClientId && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <MealImageUpload clientId={selectedClientId} onAnalyzed={handleAnalyzed} />
          </div>
        )}

        {inputMode === "text" && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">食事内容を入力</label>
            <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)}
              placeholder={"朝：ご飯、納豆、味噌汁\n昼：サラダチキン、野菜サラダ\n夜：鮭の塩焼き、きんぴら、ご飯"}
              rows={6}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
        )}

        {result && (
          <>
            {result.dangerLevel === "danger" && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="font-bold text-red-700 mb-2">⚠ トレーナー確認必須</p>
                <ul className="text-sm text-red-600 space-y-1">
                  {result.dangerReasons.map((r, i) => <li key={i}>・{r}</li>)}
                </ul>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-500 mb-3">📊 解析結果</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <NutritionCard label="カロリー" value={result.nutrition.totalCalories} target={result.target.calories} unit="kcal" status={result.evaluation.calorieStatus} />
                <NutritionCard label="たんぱく質" value={result.nutrition.protein} target={result.target.protein} unit="g" status={result.evaluation.proteinStatus} />
                <NutritionCard label="脂質" value={result.nutrition.fat} target={result.target.fat} unit="g" status={result.evaluation.fatStatus} />
                <NutritionCard label="炭水化物" value={result.nutrition.carbs} target={result.target.carbs} unit="g" status={result.evaluation.carbStatus} />
                <NutritionCard label="食物繊維" value={result.nutrition.fiber} target={20} unit="g" status={result.evaluation.fiberStatus} />
                <NutritionCard label="食塩相当量" value={result.nutrition.salt} target={7.5} unit="g" status={result.evaluation.saltStatus} lowerIsBetter />
              </div>
              {Object.entries(result.nutrition.meals).some(([, foods]) => foods.length > 0) && (
                <div className="border-t border-gray-100 pt-3 space-y-1">
                  <p className="text-xs font-medium text-gray-500 mb-2">読み取った食事内容</p>
                  {result.nutrition.meals.breakfast.length > 0 && <p className="text-xs text-gray-600">🌅 朝食：{result.nutrition.meals.breakfast.join("、")}</p>}
                  {result.nutrition.meals.lunch.length > 0 && <p className="text-xs text-gray-600">☀️ 昼食：{result.nutrition.meals.lunch.join("、")}</p>}
                  {result.nutrition.meals.dinner.length > 0 && <p className="text-xs text-gray-600">🌙 夕食：{result.nutrition.meals.dinner.join("、")}</p>}
                  {result.nutrition.meals.snack.length > 0 && <p className="text-xs text-gray-600">🍪 間食：{result.nutrition.meals.snack.join("、")}</p>}
                </div>
              )}
            </div>

            {result.aiReply && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-500 mb-2">💬 AI返信案（編集可能）</p>
                <textarea value={editedReply} onChange={(e) => setEditedReply(e.target.value)}
                  rows={8}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-400 resize-none" />
                <div className="mt-3 space-y-2">
                  {result.goodPoints.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-green-600 mb-1">✅ 良い点</p>
                      <ul className="text-xs text-gray-600 space-y-0.5">
                        {result.goodPoints.map((p, i) => <li key={i}>・{p}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.improvements.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-blue-600 mb-1">💡 改善提案</p>
                      <ul className="text-xs text-gray-600 space-y-0.5">
                        {result.improvements.map((p, i) => <li key={i}>・{p}</li>)}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-orange-600 mb-1">👉 次のアクション</p>
                    <p className="text-xs text-gray-600">{result.nextAction}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {(result?.aiReply || (inputMode === "text" && textContent)) && (
          <button onClick={handleSave} disabled={saving}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
            {saving ? "保存中..." : "✓ 確認済みとして保存"}
          </button>
        )}
      </div>
    </div>
  );
}