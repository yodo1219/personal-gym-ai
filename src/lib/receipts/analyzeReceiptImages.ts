import OpenAI from "openai";
import { JournalEntry, ReceiptImageInput, parseJournalCsv } from "./types";

// 既存の食事指導LINEの analyzeMultipleImages と同じクライアント初期化を想定。
// すでに lib/openai.ts 等で client を共通化している場合はそちらを import してください。
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `あなたは税務に詳しい会計アシスタントです。
これから渡す画像はレシート・領収書・納品書などの証憑です。
複式簿記の形式で仕訳を行い、以下の10列のCSV形式で出力してください。

【CSVのヘッダー】
借方勘定科目,借方金額,貸方勘定科目,貸方金額,日付,摘要,店名,税区分,消費税率,補助科目

【出力形式のルール】
- 仕訳が複数ある場合は複数行に分けて出力する
- 金額は数字のみ（カンマや円記号なし）
- 税区分は「課税仕入」「課税売上」「非課税」「対象外」などで明記する
- 消費税率は「10%」「8%」「0%」などで記載する
- 補助科目がある場合は明示し、ない場合は空欄にする
- ヘッダー行を出力に含め、その後にデータ行のみを続ける
- CSV以外の説明文やコードブロック記法（\`\`\`など）は一切含めない

【勘定科目の指定】
- ガソリン代: 旅費交通費
- クレジットカード払い: 未払金
- 銀行引き落とし: 普通預金
- 現金払い: 現金

【摘要】
何に使ったのかが具体的に分かるように記載してください。

【出力例】
借方勘定科目,借方金額,貸方勘定科目,貸方金額,日付,摘要,店名,税区分,消費税率,補助科目
車両費,8177,未払金,8177,2025-05-27,業務車両のガソリン代,Enejet,課税仕入,10%,`;

/**
 * レシート画像（1枚〜複数枚）を gpt-4o Vision に渡し、
 * 複式簿記形式の仕訳データを JournalEntry[] として返す。
 *
 * @param images  base64エンコード済み画像とMIMEタイプの配列
 * @param memo    ユーザーが添えた補足メモ（任意）
 */
export async function analyzeReceiptImages(
  images: ReceiptImageInput[],
  memo?: string
): Promise<JournalEntry[]> {
  if (!images || images.length === 0) {
    throw new Error("画像が指定されていません");
  }

  const imageContents = images.map((img) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
    },
  }));

  const userContent = [
    {
      type: "text" as const,
      text: memo
        ? `補足メモ:\n${memo}`
        : "上記のルールに従って、このレシート画像を仕訳してください。",
    },
    ...imageContents,
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const csvText = completion.choices[0]?.message?.content?.trim();

  if (!csvText) {
    throw new Error("gpt-4o Visionから仕訳データが返されませんでした");
  }

  const entries = parseJournalCsv(csvText);

  if (entries.length === 0) {
    throw new Error("仕訳データの解析に失敗しました（CSVパース結果が空）");
  }

  return entries;
}