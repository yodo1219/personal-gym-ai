"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MealEntry, Client } from "@/types";

export default function MealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meal, setMeal] = useState<MealEntry | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [goodPoints, setGoodPoints] = useState<string[]>([]);
  const [improvements, setImprovements] = useState<string[]>([]);
  const [nextAction, setNextAction] = useState("");

  useEffect(() => {
    fetch("/api/meals")
      .then((r) => r.json())
      .then((meals: MealEntry[]) => {
        const found = meals.find((m) => m.id === id);
        if (found) {
          setMeal(found);
          if (found.aiReply) setEditedReply(found.aiReply);
          fetch("/api/clients")
            .then((r) => r.json())
            .then((clients: Client[]) => {
              setClient(clients.find((c) => c.id === found.clientId) ?? null);
            });
        }
      });
  }, [id]);

  async function generateReply() {
    if (!meal || !client) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, mealContent: meal.content }),
      });
      const result = await res.json();
      setEditedReply(result.reply ?? "");
      setGoodPoints(result.goodPoints ?? []);
      setImprovements(result.improvements ?? []);
      setNextAction(result.nextAction ?? "");

      const updated = { ...meal, aiReply: result.reply, status: "reviewed" as const };
      await fetch("/api/meals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      setMeal(updated);
    } catch (e) {
      console.error(e);
      alert("AI返信の生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function sendReply() {
    if (!meal) return;
    setSending(true);
    const updated: MealEntry = { ...meal, trainerReply: editedReply, status: "sent" };
    await fetch("/api/meals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setSending(false);
    router.push("/");
  }

  if (!meal || !client) {
    return <div className="p-8 text-gray-400">読み込み中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="font-bold text-gray-900">{client.name}さんの食事確認</h1>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-4">

        {/* 危険警告 */}
        {meal.dangerLevel === "danger" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="font-bold text-red-700 mb-2">⚠ トレーナー確認必須</p>
            <ul className="text-sm text-red-600 space-y-1">
              {meal.dangerReasons.map((r, i) => <li key={i}>・{r}</li>)}
            </ul>
          </div>
        )}
        {meal.dangerLevel === "caution" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="font-bold text-yellow-700 mb-1">注意事項</p>
            <ul className="text-sm text-yellow-600 space-y-1">
              {meal.dangerReasons.map((r, i) => <li key={i}>・{r}</li>)}
            </ul>
          </div>
        )}

        {/* 食事内容 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-2">📝 食事内容</p>
          <p className="text-gray-900 whitespace-pre-wrap text-sm">{meal.content}</p>
        </div>

        {/* AI返信生成ボタン（未生成の場合） */}
        {!editedReply && (
          <button
            onClick={generateReply}
            disabled={loading || meal.dangerLevel === "danger"}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "⏳ AI返信を生成中..." : "✨ AI返信案を生成する"}
          </button>
        )}

        {/* 生成中インジケーター */}
        {loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm text-blue-700">AIが返信案を作成しています...</p>
          </div>
        )}

        {/* AI分析結果 */}
        {(goodPoints.length > 0 || improvements.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-500">AI分析</p>
            {goodPoints.length > 0 && (
              <div>
                <p className="text-xs text-green-600 font-medium mb-1">✅ 良い点</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {goodPoints.map((p, i) => <li key={i}>・{p}</li>)}
                </ul>
              </div>
            )}
            {improvements.length > 0 && (
              <div>
                <p className="text-xs text-blue-600 font-medium mb-1">💡 改善提案</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {improvements.map((p, i) => <li key={i}>・{p}</li>)}
                </ul>
              </div>
            )}
            {nextAction && (
              <div>
                <p className="text-xs text-orange-600 font-medium mb-1">👉 次のアクション</p>
                <p className="text-sm text-gray-700">{nextAction}</p>
              </div>
            )}
          </div>
        )}

        {/* 返信文編集 */}
        {editedReply && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-2">💬 返信文（編集可能）</p>
            <textarea
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              rows={8}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-900 resize-none focus:outline-none focus:border-blue-400"
            />
          </div>
        )}

        {/* 再生成ボタン */}
        {editedReply && (
          <button
            onClick={generateReply}
            disabled={loading}
            className="w-full bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loading ? "生成中..." : "🔄 返信案を再生成する"}
          </button>
        )}

        {/* 送信ボタン */}
        {editedReply && (
          <button
            onClick={sendReply}
            disabled={sending}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {sending ? "保存中..." : "✓ この返信で確定・保存"}
          </button>
        )}
      </div>
    </div>
  );
}