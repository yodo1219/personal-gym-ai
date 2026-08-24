import { supabase } from "@/lib/supabase";

export type MonthlySummary = {
  yearMonth: string;
  incomeTotal: number;
  expenseTotal: number;
  profit: number;
  entryCount: number;
};

export async function getMonthlySummary(
  receiptUserId: string,
  yearMonth?: string
): Promise<MonthlySummary> {
  const targetYearMonth = yearMonth ?? new Date().toISOString().slice(0, 7);
  const startDate = `${targetYearMonth}-01`;
  const [year, month] = targetYearMonth.split("-").map(Number);
  const endDate = new Date(year, month, 1).toISOString().slice(0, 10);

  const { data: entries, error } = await supabase
    .from("receipts")
    .select("entry_type, debit_amount, credit_amount")
    .eq("receipt_user_id", receiptUserId)
    .gte("date", startDate)
    .lt("date", endDate);

  if (error) {
    console.error("月次サマリー取得エラー:", error);
    throw error;
  }

  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const e of entries ?? []) {
    if (e.entry_type === "income") {
      incomeTotal += e.credit_amount ?? 0;
    } else {
      expenseTotal += e.debit_amount ?? 0;
    }
  }

  return {
    yearMonth: targetYearMonth,
    incomeTotal,
    expenseTotal,
    profit: incomeTotal - expenseTotal,
    entryCount: (entries ?? []).length,
  };
}

export async function getAvailableMonths(receiptUserId: string): Promise<string[]> {
  const { data: entries, error } = await supabase
    .from("receipts")
    .select("date")
    .eq("receipt_user_id", receiptUserId)
    .order("date", { ascending: false });

  if (error) {
    console.error("年月一覧取得エラー:", error);
    throw error;
  }

  const months = new Set<string>();
  for (const e of entries ?? []) {
    if (e.date) months.add(String(e.date).slice(0, 7));
  }

  return Array.from(months);
}
