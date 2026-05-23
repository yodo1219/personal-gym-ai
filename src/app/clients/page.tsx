"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Client } from "@/types";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import Link from "next/link";

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => {
        setClients(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="font-bold text-gray-900">顧客一覧</h1>
        </div>
        <Link href="/clients/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + 顧客登録
        </Link>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {loading ? (
          <p className="text-gray-400 text-center py-12">読み込み中...</p>
        ) : clients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">顧客が登録されていません</p>
            <Link href="/clients/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
              顧客を登録する
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => (
              <Link key={client.id} href={`/clients/${client.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {client.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{client.name}</p>
                    <p className="text-sm text-gray-500">
                      {client.age}歳 · {client.gender === "male" ? "男性" : "女性"} · {client.weight}kg
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(client as any).lineUserId && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">LINE連携済</span>
                  )}
                  {(client as any).targetCalories && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                      目標{(client as any).targetCalories}kcal
                    </span>
                  )}
                  <span className="text-gray-400">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
