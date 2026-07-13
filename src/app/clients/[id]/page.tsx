"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Client } from "@/types";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

interface WeightRecord {
  id: string;
  weight: number;
  body_fat: number | null;
  recorded_date: string;
  note: string | null;
}

const GOALS = [
  { value: "fat_loss", label: "減量・体脂肪減少" },
  { value: "muscle_gain", label: "筋肉増量" },
  { value: "maintain", label: "現状維持" },
  { value: "health", label: "健康増進" },
];

const ACTIVITIES = [
  { value: "sedentary", label: "ほぼ運動なし" },
  { value: "light", label: "軽い運動（週1〜2回）" },
  { value: "moderate", label: "中程度（週3〜4回）" },
  { value: "active", label: "活発（週5〜6回）" },
  { value: "very_active", label: "非常に活発（毎日）" },
];

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [weightRecords, setWeightRecords] = useState<WeightRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [newWeight, setNewWeight] = useState("");
  const [newBodyFat, setNewBodyFat] = useState("");
  const [newNote, setNewNote] = useState("");
  const [addingWeight, setAddingWeight] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "weight" | "meals">("info");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((clients: Client[]) => {
        const found = clients.find((c) => c.id === id);
        if (found) {
          setClient(found);
          setForm(found);
        }
      });
    loadWeightRecords();
  }, [id]);

  async function loadWeightRecords() {
    const { data } = await supabase
      .from("weight_records")
      .select("*")
      .eq("client_id", id)
      .order("recorded_date", { ascending: true });
    setWeightRecords(data ?? []);
  }

  async function handleSave() {
    setSaving(true);
    await fetch("/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id }),
    });
    setClient(form);
    setEditing(false);
    setSaving(false);
  }

  async function handleAddWeight() {
    if (!newWeight) return;
    setAddingWeight(true);
    await supabase.from("weight_records").insert({
      client_id: id,
      weight: parseFloat(newWeight),
      body_fat: newBodyFat ? parseFloat(newBodyFat) : null,
      note: newNote || null,
      recorded_date: new Date().toISOString().split("T")[0],
    });
    setNewWeight("");
    setNewBodyFat("");
    setNewNote("");
    await loadWeightRecords();
    setAddingWeight(false);
  }

  async function handleDeleteWeight(recordId: string) {
    await supabase.from("weight_records").delete().eq("id", recordId);
    await loadWeightRecords();
  }

  function set(key: string, value: string) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  if (!client) return <div className="p-8 text-gray-400">読み込み中...</div>;

  const latestWeight = weightRecords[weightRecords.length - 1];
  const firstWeight = weightRecords[0];
  const weightDiff = latestWeight && firstWeight
    ? (latestWeight.weight - firstWeight.weight).toFixed(1)
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/clients")} className="text-gray-400 hover:text-gray-600">←</button>
          <div>
            <h1 className="font-bold text-gray-900">{client.name}</h1>
            <p className="text-xs text-gray-400">{client.age}歳 · {client.gender === "male" ? "男性" : "女性"}</p>
          </div>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            編集
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)}
              className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">
              キャンセル
            </button>
            <button onClick={handleSave} disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        )}
      </header>

      {/* タブ */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-6">
        {[
          { key: "info", label: "基本情報" },
          { key: "weight", label: "体重記録" },
          { key: "meals", label: "食事履歴" },
        ].map((tab) => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-4">

        {/* 基本情報タブ */}
        {activeTab === "info" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">基本情報</p>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">名前</label>
                    <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">年齢</label>
                      <input type="number" value={form.age ?? ""} onChange={(e) => set("age", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
                      <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                        <option value="female">女性</option>
                        <option value="male">男性</option>
                        <option value="other">その他</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">身長(cm)</label>
                      <input type="number" value={form.height ?? ""} onChange={(e) => set("height", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">体重(kg)</label>
                      <input type="number" value={form.weight ?? ""} onChange={(e) => set("weight", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">体脂肪率(%)</label>
                      <input type="number" value={form.bodyFat ?? ""} onChange={(e) => set("bodyFat", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">目標</label>
                    <select value={form.goal ?? ""} onChange={(e) => set("goal", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                      {GOALS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">活動量</label>
                    <select value={form.activityLevel ?? ""} onChange={(e) => set("activityLevel", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                      {ACTIVITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "身長", value: `${client.height}cm` },
                    { label: "体重", value: `${client.weight}kg` },
                    { label: "体脂肪率", value: client.bodyFat ? `${client.bodyFat}%` : "未設定" },
                    { label: "目標", value: GOALS.find((g) => g.value === client.goal)?.label ?? "" },
                    { label: "活動量", value: ACTIVITIES.find((a) => a.value === client.activityLevel)?.label ?? "" },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className="font-medium text-gray-900 text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 目標栄養素 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">目標栄養素</p>
              {editing ? (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "目標カロリー(kcal)", key: "targetCalories" },
                    { label: "目標たんぱく質(g)", key: "targetProtein" },
                    { label: "目標脂質(g)", key: "targetFat" },
                    { label: "目標炭水化物(g)", key: "targetCarbs" },
                  ].map((item) => (
                    <div key={item.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                      <input type="number" value={form[item.key] ?? ""}
                        onChange={(e) => set(item.key, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "カロリー", value: (client as any).targetCalories ? `${(client as any).targetCalories}kcal` : "自動計算" },
                    { label: "たんぱく質", value: (client as any).targetProtein ? `${(client as any).targetProtein}g` : "自動計算" },
                    { label: "脂質", value: (client as any).targetFat ? `${(client as any).targetFat}g` : "自動計算" },
                    { label: "炭水化物", value: (client as any).targetCarbs ? `${(client as any).targetCarbs}g` : "自動計算" },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className="font-medium text-gray-900 text-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 指導方針 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">指導方針・健康情報</p>
              {editing ? (
                <div className="space-y-3">
                  {[
                    { label: "アレルギー", key: "allergies" },
                    { label: "既往歴・疾患", key: "medicalHistory" },
                    { label: "苦手な食べ物", key: "dislikedFoods" },
                    { label: "食事指導方針", key: "dietaryPolicy" },
                    { label: "メンタル傾向", key: "mentalTendency" },
                    { label: "過食傾向", key: "bingeTendency" },
                    { label: "睡眠状況", key: "sleepStatus" },
                    { label: "LINEユーザーID", key: "lineUserId" },
                  ].map((item) => (
                    <div key={item.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{item.label}</label>
                      <input value={form[item.key] ?? ""}
                        onChange={(e) => set(item.key, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                  ))}
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">メッセージ送信時間</label>
                    <select value={form.messageHour ?? 1}
                      onChange={(e) => set("messageHour", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                      <option value={0}>朝9時</option>
                      <option value={1}>朝10時</option>
                      <option value={2}>朝11時</option>
                      <option value={3}>昼12時</option>
                      <option value={4}>午後13時</option>
                      <option value={5}>午後14時</option>
                      <option value={6}>午後15時</option>
                      <option value={7}>夕方18時</option>
                      <option value={8}>夜20時</option>
                      <option value={9}>夜21時</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">送信頻度</label>
                    <select value={form.messageFrequency ?? "daily"}
                      onChange={(e) => set("messageFrequency", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                      <option value="daily">毎日</option>
                      <option value="weekdays">平日のみ</option>
                      <option value="three_times">週3回（月水金）</option>
                      <option value="weekly">週1回（月曜）</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox"
                      checked={form.messageEnabled ?? true}
                      onChange={(e) => set("messageEnabled", e.target.checked)}
                      className="w-4 h-4" />
                    <label className="text-sm font-medium text-gray-700">自動メッセージを送信する</label>
                  </div>
                </div>
              ) : (
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { label: "アレルギー", value: client.allergies || "なし" },
                    { label: "既往歴", value: client.medicalHistory || "なし" },
                    { label: "苦手な食べ物", value: client.dislikedFoods || "なし" },
                    { label: "食事指導方針", value: client.dietaryPolicy || "未設定" },
                    { label: "LINE ID", value: (client as any).lineUserId || "未連携" },
                  ].map((item) => (
                    <div key={item.label} className="flex gap-2">
                      <span className="text-xs text-gray-500 w-24 flex-shrink-0 pt-0.5">{item.label}</span>
                      <span className="text-sm text-gray-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 体重記録タブ */}
        {activeTab === "weight" && (
          <div className="space-y-4">
            {/* サマリー */}
            {weightRecords.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">最新体重</p>
                  <p className="text-2xl font-bold text-gray-900">{latestWeight?.weight}<span className="text-sm font-normal text-gray-400 ml-1">kg</span></p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">開始時体重</p>
                  <p className="text-2xl font-bold text-gray-900">{firstWeight?.weight}<span className="text-sm font-normal text-gray-400 ml-1">kg</span></p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500 mb-1">増減</p>
                  <p className={`text-2xl font-bold ${Number(weightDiff) < 0 ? "text-green-600" : Number(weightDiff) > 0 ? "text-red-500" : "text-gray-900"}`}>
                    {Number(weightDiff) > 0 ? "+" : ""}{weightDiff}<span className="text-sm font-normal text-gray-400 ml-1">kg</span>
                  </p>
                </div>
              </div>
            )}

            {/* グラフ */}
            {weightRecords.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-700 mb-4">体重推移</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={weightRecords}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="recorded_date"
                      tickFormatter={(v) => format(new Date(v), "M/d")}
                      tick={{ fontSize: 11 }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(v) => format(new Date(v), "M月d日", { locale: ja })}
                      formatter={(v: any) => [`${v}kg`, "体重"]} />
                    <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 体重入力 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">体重を記録する</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">体重(kg) *</label>
                  <input type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)}
                    placeholder="58.5"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">体脂肪率(%)</label>
                  <input type="number" value={newBodyFat} onChange={(e) => setNewBodyFat(e.target.value)}
                    placeholder="25.0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)}
                placeholder="メモ（任意）"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              <button onClick={handleAddWeight} disabled={!newWeight || addingWeight}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {addingWeight ? "記録中..." : "記録する"}
              </button>
            </div>

            {/* 履歴一覧 */}
            {weightRecords.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">記録履歴</p>
                <div className="space-y-2">
                  {[...weightRecords].reverse().map((record) => (
                    <div key={record.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {format(new Date(record.recorded_date), "M月d日", { locale: ja })} — {record.weight}kg
                          {record.body_fat && <span className="text-gray-400 text-xs ml-2">体脂肪{record.body_fat}%</span>}
                        </p>
                        {record.note && <p className="text-xs text-gray-400">{record.note}</p>}
                      </div>
                      <button onClick={() => handleDeleteWeight(record.id)}
                        className="text-xs text-red-400 hover:text-red-600">削除</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 食事履歴タブ */}
        {activeTab === "meals" && (
          <MealHistory clientId={id} />
        )}
      </div>
    </div>
  );
}

function MealHistory({ clientId }: { clientId: string }) {
  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/meals?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        setMeals(data);
        setLoading(false);
      });
  }, [clientId]);

  if (loading) return <p className="text-gray-400 text-center py-8">読み込み中...</p>;
  if (meals.length === 0) return <p className="text-gray-400 text-center py-8">食事記録がありません</p>;

  return (
    <div className="space-y-3">
      {meals.map((meal) => (
        <div key={meal.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-900">{meal.mealDate}</p>
            <div className="flex items-center gap-2">
              {meal.inputType === "image" && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">📸 画像</span>
              )}
              {meal.dangerLevel === "danger" && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠ 要確認</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                meal.status === "sent" ? "bg-green-100 text-green-700" :
                meal.status === "reviewed" ? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {meal.status === "sent" ? "送信済" : meal.status === "reviewed" ? "確認済" : "未確認"}
              </span>
            </div>
          </div>
          {meal.nutrition?.totalCalories && (
            <p className="text-xs text-gray-500 mb-2">
              {meal.nutrition.totalCalories}kcal
              {meal.nutrition.protein && ` · P${meal.nutrition.protein}g`}
              {meal.nutrition.fat && ` · F${meal.nutrition.fat}g`}
              {meal.nutrition.carbs && ` · C${meal.nutrition.carbs}g`}
            </p>
          )}
          {meal.aiReply && (
            <p className="text-xs text-gray-500 line-clamp-2">{meal.aiReply}</p>
          )}
        </div>
      ))}
    </div>
  );
}
