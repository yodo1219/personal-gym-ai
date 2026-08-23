// レシート仕訳の型定義

export type JournalEntry = {
    debitAccount: string;   // 借方勘定科目
    debitAmount: number;    // 借方金額
    creditAccount: string;  // 貸方勘定科目
    creditAmount: number;   // 貸方金額
    date: string;           // 日付 (YYYY-MM-DD)
    description: string;    // 摘要
    storeName: string;      // 店名
    taxCategory: string;    // 税区分（課税仕入・課税売上・非課税・対象外など）
    taxRate: string;        // 消費税率（10%・8%・0%など）
    subAccount: string;     // 補助科目（なければ空文字）
  };
  
  export type ReceiptImageInput = {
    base64: string;
    mimeType: string;
  };
  
  /**
   * gpt-4o Visionから返ってきたCSVテキストを JournalEntry[] にパースする。
   * ヘッダー行はスキップし、列数が足りない行は無視する。
   *
   * 期待するCSV列順:
   * 借方勘定科目,借方金額,貸方勘定科目,貸方金額,日付,摘要,店名,税区分,消費税率,補助科目
   */
  export function parseJournalCsv(csvText: string): JournalEntry[] {
    const lines = csvText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  
    const entries: JournalEntry[] = [];
  
    for (const line of lines) {
      // ヘッダー行らしき行はスキップ
      if (line.startsWith("借方勘定科目")) continue;
  
      const cols = line.split(",").map((cell) => cell.trim());
      if (cols.length < 9) continue; // 列数が足りない行は不正データとして無視
  
      const [
        debitAccount,
        debitAmountRaw,
        creditAccount,
        creditAmountRaw,
        date,
        description,
        storeName,
        taxCategory,
        taxRate,
        subAccountRaw,
      ] = cols;
  
      const subAccount =
        !subAccountRaw ||
        subAccountRaw.toLowerCase() === "none" ||
        subAccountRaw.toLowerCase() === "n/a"
          ? ""
          : subAccountRaw;
  
      entries.push({
        debitAccount,
        debitAmount: Number(debitAmountRaw.replace(/[^\d.-]/g, "")) || 0,
        creditAccount,
        creditAmount: Number(creditAmountRaw.replace(/[^\d.-]/g, "")) || 0,
        date,
        description,
        storeName,
        taxCategory,
        taxRate,
        subAccount: subAccount ?? "",
      });
    }
  
    return entries;
  }