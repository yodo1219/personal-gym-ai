import { google } from "googleapis";
import { MealEntry, Client } from "@/types";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function appendMealToSheet(meal: MealEntry, client: Client) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const n = meal.nutrition;
  const e = meal.nutritionEval;

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID!,
    range: "食事記録!A:Z",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        meal.createdAt, client.name, meal.mealDate,
        meal.inputType === "image" ? "画像" : "テキスト",
        meal.imageFileName ?? "",
        n?.totalCalories ?? "", n?.protein ?? "", n?.fat ?? "",
        n?.carbs ?? "", n?.fiber ?? "", n?.salt ?? "",
        meal.nutritionTarget?.calories ?? "",
        meal.nutritionTarget?.protein ?? "",
        meal.nutritionTarget?.fat ?? "",
        meal.nutritionTarget?.carbs ?? "",
        e?.calorieStatus ?? "", e?.proteinStatus ?? "",
        e?.fatStatus ?? "", e?.carbStatus ?? "",
        e?.highFatFoods?.join("、") ?? "",
        meal.content,
        meal.dangerLevel, meal.dangerReasons.join("、"),
        meal.aiReply ?? "", meal.trainerReply ?? "", meal.status,
      ]],
    },
  });
}

export async function initSheetHeaders() {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID!,
    range: "食事記録!A1:Z1",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        "登録日時", "顧客名", "食事日", "入力方式", "画像ファイル名",
        "総カロリー(kcal)", "たんぱく質(g)", "脂質(g)", "炭水化物(g)",
        "食物繊維(g)", "食塩相当量(g)",
        "目標カロリー", "目標P", "目標F", "目標C",
        "カロリー評価", "P評価", "F評価", "C評価", "脂質多め食品",
        "食事内容", "危険レベル", "危険理由",
        "AI返信案", "トレーナー最終返信", "ステータス",
      ]],
    },
  });
}