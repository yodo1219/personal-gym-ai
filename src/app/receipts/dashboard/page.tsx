"use client";

import { useEffect, useMemo, useState } from "react";
import liff from "@line/liff";

type ReceiptEntry = {
  id: string;
  entry_type: "income" | "expense";
  date: string;
  debit_account: string;
  debit_amount: number;
  credit_account: string;
  credit_amount: number;
  description: string;
  store_name: string;
};

type MonthGroup = {
  yearMonth: string;
  entries: ReceiptEntry[];
  incomeTotal: number;
  expenseTotal: number;
};

const LIFF_ID = process.env.NEXT_PUBLIC_RECEIPT_LIFF_ID ?? "";

export default function ReceiptsDashboard() {
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ReceiptEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeMonth, setActiveMonth] = useState<string | null>(null);

  useEffect(() => {
    async function initLiff() {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const profile = await liff.getProfile();
        setLineUserId(profile.userId);
      } catch (e) {
        console.error("LIFF初期化エラー:", e);
        setError("LINEアプリからアクセスしてください。");
        setLoading(false);
      }
    }
    void initLiff();
  }, []);

  useEffect(() => {
    if (!lineUserId) return;
    void fetchEntries(lineUserId);
  }, [lineUserId]);

  async function fetchEntries(id: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/receipts/list?lineUserId=" + encodeURIComponent(id));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 404) {
          setEntries([]);
          return;
        }
        throw new Error(body.error ?? "取得に失敗しました");
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }

  const monthGroups: MonthGroup[] = useMemo(() => {
    if (!entries) return [];
    const map = new Map<string, ReceiptEntry[]>();
    for (const e of entries) {
      const ym = (e.date ?? "").slice(0, 7) || "不明";
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(e);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([yearMonth, list]) => ({
        yearMonth,
        entries: list.sort((a, b) => (a.date < b.date ? 1 : -1)),
        incomeTotal: list
          .filter((e) => e.entry_type === "income")
          .reduce((sum, e) => sum + (e.credit_amount ?? 0), 0),
        expenseTotal: list
          .filter((e) => e.entry_type === "expense")
          .reduce((sum, e) => sum + (e.debit_amount ?? 0), 0),
      }));
  }, [entries]);

  useEffect(() => {
    if (monthGroups.length > 0 && !activeMonth) {
      setActiveMonth(monthGroups[0].yearMonth);
    }
  }, [monthGroups, activeMonth]);

  const currentGroup = monthGroups.find((g) => g.yearMonth === activeMonth);
  const yearTotal = useMemo(() => {
    const income = monthGroups.reduce((s, g) => s + g.incomeTotal, 0);
    const expense = monthGroups.reduce((s, g) => s + g.expenseTotal, 0);
    return { income, expense, profit: income - expense };
  }, [monthGroups]);

  function formatYm(ym: string) {
    if (ym === "不明") return ym;
    const parts = ym.split("-");
    return parts[0] + "年" + Number(parts[1]) + "月";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
          {error}
        </p>
      </div>
    );
  }

  const exportHref = lineUserId
    ? "/api/receipts/export?lineUserId=" + encodeURIComponent(lineUserId)
    : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">記帳ダッシュボード</h1>
        <p className="text-sm text-gray-400 mb-6">LINEで記帳した収支を月ごとに確認できます</p>

        {entries && entries.length === 0 && (
          <p className="text-sm text-gray-400">
            まだ記帳データがありません。トークでレシートを送るか「売上」と送って記帳してください。
          </p>
        )}

        {monthGroups.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">総収入</p>
                <p className="text-lg font-bold text-blue-600">¥{yearTotal.income.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">総支出</p>
                <p className="text-lg font-bold text-gray-700">¥{yearTotal.expense.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">利益</p>
                <p className={"text-lg font-bold " + (yearTotal.profit >= 0 ? "text-green-600" : "text-red-600")}>
                  ¥{yearTotal.profit.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {monthGroups.map((g) => (
                <button
                  key={g.yearMonth}
                  onClick={() => setActiveMonth(g.yearMonth)}
                  className={
                    "shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors " +
                    (activeMonth === g.yearMonth
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100")
                  }
                >
                  {formatYm(g.yearMonth)}
                </button>
              ))}
            </div>

            {currentGroup && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="font-medium text-gray-700">{formatYm(currentGroup.yearMonth)}</span>
                  <span className="text-sm text-gray-400">
                    収入 ¥{currentGroup.incomeTotal.toLocaleString()} / 支出 ¥{currentGroup.expenseTotal.toLocaleString()}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {currentGroup.entries.map((e) => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "text-xs px-2 py-0.5 rounded-full " +
                              (e.entry_type === "income"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-gray-100 text-gray-600")
                            }
                          >
                            {e.entry_type === "income" ? "収入" : "支出"}
                          </span>
                          <span className="text-sm text-gray-700 truncate">
                            {e.description || e.store_name || "(内容なし)"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{e.date}</p>
                      </div>
                      <span
                        className={
                          "text-sm font-medium whitespace-nowrap ml-3 " +
                          (e.entry_type === "income" ? "text-blue-600" : "text-gray-700")
                        }
                      >
                        {e.entry_type === "income" ? "+" : "-"}¥
                        {(e.entry_type === "income" ? e.credit_amount : e.debit_amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lineUserId && (
              <a href={exportHref} className="inline-block mt-4 text-sm text-blue-600 hover:underline">
                CSVでダウンロード（弥生形式）
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
