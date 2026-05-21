"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const GOALS = [
  { value: "fat_loss", label: "減量・体脂肪減少" },
  { value: "muscle_gain", label: "筋肉増量" },
  { value: "maintain", label: "現状維持" },
  { value: "health", label: "健康増進" },
];
const ACTIVITIES = [
  { value: "sedentary", label: "ほぼ運動なし（デスクワーク中心）" },
  { value: "light", label: "軽い運動（週1〜2回）" },
  { value: "moderate", label: "中程度の運動（週3〜4回）" },
  { value: "active", label: "活発な運動（週5〜6回）" },
  { value: "very_active", label: "非常に活発（毎日ハードに運動）" },
];

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("female");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [goal, setGoal] = useState("fat_loss");
  const [activityLevel, setActivityLevel] = useState("moderate");
  const [allergies, setAllergies] = useState("");
  const [medicalHistory, setMedicalHistory] = useState("");
  const [dislikedFoods, setDislikedFoods] = useState("");
  const [dietaryPolicy, setDietaryPolicy] = useState("");
  const [mentalTendency, setMentalTendency] = useState("");
  const [bingeTendency, setBingeTendency] = useState("");
  const [sleepStatus, setSleepStatus] = useState("");
  const [lineUserId, setLineUserId] = useState("");
  const [targetCalories, setTargetCalories] = useState("");
const [targetProtein, setTargetProtein] = useState("");
const [targetFat, setTargetFat] = useState("");
const [targetCarbs, setTargetCarbs] = useState("");

  async function handleSubmit() {
    if (!name || !age || !height || !weight) {
      alert("名前・年齢・身長・体重は必須です");
      return;
    }
    setSaving(true);
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, gender,
        age: Number(age),
        height: Number(height),
        weight: Number(weight),
        bodyFat: bodyFat ? Number(bodyFat) : undefined,
        goal, activityLevel, allergies, medicalHistory,
        dislikedFoods, dietaryPolicy, mentalTendency,
        bingeTendency, sleepStatus,
        lineUserId,
        targetCalories: targetCalories ? Number(targetCalories) : undefined,
targetProtein: targetProtein ? Number(targetProtein) : undefined,
targetFat: targetFat ? Number(targetFat) : undefined,
targetCarbs: targetCarbs ? Number(targetCarbs) : undefined,
      }),
    });
    setSaving(false);
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="font-bold text-gray-900">顧客登録</h1>
      </header>
      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* 基本情報 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">基本情報</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名前 *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="山田 花子"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年齢 *</label>
              <input type="number" value={age} onChange={(e) => setAge(e.target.value)}
                placeholder="30"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">性別　*</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                <option value="female">女性</option>
                <option value="male">男性</option>
                <option value="other">その他</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">身長(cm) *</label>
              <input type="number" value={height} onChange={(e) => setHeight(e.target.value)}
                placeholder="160"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">体重(kg) *</label>
              <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
                placeholder="58"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">体脂肪率(%)</label>
              <input type="number" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)}
                placeholder="25"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
        </div>

        {/* 目標・活動量 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">目標・活動量</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">目標</label>
            <select value={goal} onChange={(e) => setGoal(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
              {GOALS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">活動量</label>
            <select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
              {ACTIVITIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </div>

        {/* 健康・食事情報 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">健康・食事情報</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">アレルギー</label>
            <textarea value={allergies} onChange={(e) => setAllergies(e.target.value)}
              placeholder="エビ、卵など（なければ空欄）" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">既往歴・疾患</label>
            <textarea value={medicalHistory} onChange={(e) => setMedicalHistory(e.target.value)}
              placeholder="なし、または記載" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">苦手な食べ物</label>
            <textarea value={dislikedFoods} onChange={(e) => setDislikedFoods(e.target.value)}
              placeholder="レバー、納豆など" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
        </div>

        {/* 指導方針・傾向 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">指導方針・傾向</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">食事指導方針</label>
            <textarea value={dietaryPolicy} onChange={(e) => setDietaryPolicy(e.target.value)}
              placeholder="脂質制限ベース、間食を減らす方向など" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メンタル傾向</label>
            <textarea value={mentalTendency} onChange={(e) => setMentalTendency(e.target.value)}
              placeholder="落ち込みやすい、完璧主義など" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">過食傾向</label>
            <textarea value={bingeTendency} onChange={(e) => setBingeTendency(e.target.value)}
              placeholder="ストレス時に過食あり、など" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">睡眠状況</label>
            <textarea value={sleepStatus} onChange={(e) => setSleepStatus(e.target.value)}
              placeholder="6時間程度、不眠気味など" rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
  <p className="font-medium text-gray-700 border-b border-gray-100 pb-2">
    目標栄養素（トレーナー設定）
  </p>
  <p className="text-xs text-gray-400">
    入力がある場合はこの値を優先します。空欄の場合は自動計算します。
  </p>
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">目標カロリー(kcal)</label>
      <input type="number" value={targetCalories}
        onChange={(e) => setTargetCalories(e.target.value)}
        placeholder="1450"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">目標たんぱく質(g)</label>
      <input type="number" value={targetProtein}
        onChange={(e) => setTargetProtein(e.target.value)}
        placeholder="80"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">目標脂質(g)</label>
      <input type="number" value={targetFat}
        onChange={(e) => setTargetFat(e.target.value)}
        placeholder="37"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">目標炭水化物(g)</label>
      <input type="number" value={targetCarbs}
        onChange={(e) => setTargetCarbs(e.target.value)}
        placeholder="199"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
    </div>
  </div>
</div>

          <div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    LINE ユーザーID
  </label>
  <input
    type="text"
    value={lineUserId}
    onChange={(e) => setLineUserId(e.target.value)}
    placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
  />
  <p className="text-xs text-gray-400 mt-1">
    お客様にLINEで「自分のID」と送ってもらうと確認できます
  </p>
</div>
        </div>

        <button onClick={handleSubmit} disabled={saving}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? "登録中..." : "顧客を登録する"}
        </button>
      </div>
    </div>
  );
}