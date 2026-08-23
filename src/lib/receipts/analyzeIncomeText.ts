import OpenAI from "openai";
import { JournalEntry, parseJournalCsv } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const INCOME_SYSTEM_PROMPT = `あなたは税務に詳しい会計アシスタントです。
これから渡すテキストは、個人事業主（パーソナルトレーナー）が報告する「売上・収入」の内容です。
複式簿記の形式で仕訳を行い、以下の10列のCSV形式で出力してください。

【CSVのヘッダー】
借方勘定科目,借方金額,貸方勘定科目,貸方金額,日付,摘要,店名,税区分,消費税率,補助科目

【出力形式のルール】
- 収入は必ず「貸方勘定科目: 売上高」として仕訳する
- 借方勘定科目は入金手段に応じて判断する（特に指定がなければ「普通預金」とする。現金受け取りの場合は「現金」）
- 金額は数字のみ（カンマや円記号なし）
- 税区分は基本的に「課税売上」とする（免税事業者など特別な記載があれば従う）
- 消費税率は「10%」を基本とする（記載があれば従う）
- 日付はテキストに明記があればそれを使い、無ければ本日の日付を使う
- 店名の列には、報告してきた本人の屋号や「本人」など分かる範囲で記載（無ければ空欄）
- 摘要には何の売上か具体的に記載する
- ヘッダー行を出力に含め、その後にデータ行のみを続ける
- CSV以外の説明文やコードブロック記法は一切含めない

【出力例】
借方勘定科目,借方金額,貸方勘定科目,貸方金額,日付,摘要,店名,税区分,消費税率,補助科目
普通預金,250000,売上高,250000,2026-06-30,6月分パーソナルトレーニングセッション料,,課税売上,10%,`;

export async function analyzeIncomeText(text: string): Promise<JournalEntry[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    messages: [
      { role: "system", content: INCOME_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  });

  const csvText = completion.choices[0]?.message?.content?.trim();

  if (!csvText) {
    throw new Error("gpt-4oから収入の仕訳データが返されませんでした");
  }

  const entries = parseJournalCsv(csvText);

  if (entries.length === 0) {
    throw new Error("収入テキストの解析に失敗しました（CSVパース結果が空）");
  }

  return entries;
}
