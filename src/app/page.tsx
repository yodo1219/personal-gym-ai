"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Client, MealEntry } from "@/types";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [pendingMeals, setPendingMeals] = useState<MealEntry[]>([]);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    fetch("/api/meals").then((r) => r.json()).then((meals: MealEntry[]) =>
      setPendingMeals(meals.filter((m) => m.status !== "sent"))
    );
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🏋️ GymAI — 食事指導システム</h1>
      </header>
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">登録顧客</p>
            <p className="text-3xl font-bold text-gray-900">
              {clients.length}
              <span className="text-sm font-normal text-gray-400 ml-1">名</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">未確認の返信案</p>
            <p className="text-3xl font-bold text-orange-500">
              {pendingMeals.length}
              <span className="text-sm font-normal text-gray-400 ml-1">件</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 mb-1">危険フラグ</p>
            <p className="text-3xl font-bold text-red-500">
              {pendingMeals.filter((m) => m.dangerLevel === "danger").length}
              <span className="text-sm font-normal text-gray-400 ml-1">件</span>
            </p>
          </div>
        </div>

        {pendingMeals.length > 0 && (
          <section>
            <h2 className="font-semibold text-gray-700 mb-3">未確認の返信案</h2>
            <div className="space-y-2">
              {pendingMeals.map((meal) => {
                const client = clients.find((c) => c.id === meal.clientId);
                return (
                  <Link
                    key={meal.id}
                    href={`/meals/${meal.id}`}
                    className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {client?.name ?? "不明"}さん
                      </p>
                      <p className="text-sm text-gray-500 truncate max-w-xs">
                        {meal.content.slice(0, 40)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {meal.inputType === "image" && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                          📸 画像
                        </span>
                      )}
                      {meal.dangerLevel === "danger" && (
                        <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-medium">
                          ⚠ 要確認
                        </span>
                      )}
                      {meal.dangerLevel === "caution" && (
                        <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full font-medium">
                          注意
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {format(new Date(meal.createdAt), "M/d HH:mm", { locale: ja })}
                      </span>
                      <span className="text-gray-400">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex gap-3">
          <Link
            href="/clients/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + 顧客登録
          </Link>
          <Link
            href="/meals"
            className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            食事入力
          </Link>
          <Link
            href="/clients"
            className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            顧客一覧
          </Link>
        </div>
      </main>
    </div>
  );
}