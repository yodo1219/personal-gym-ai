import { NextRequest, NextResponse } from "next/server";
import { getMeals, saveMeal, getClient } from "@/lib/storage";
import { appendMealToSheet } from "@/lib/sheets";
import { v4 as uuidv4 } from "uuid";
import { MealEntry } from "@/types";
import { checkDanger } from "@/lib/danger-check";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
  const meals = await getMeals(clientId);
  return NextResponse.json(meals);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dangerCheck = checkDanger(body.content ?? "");
  const meal: MealEntry = {
    ...body,
    id: body.id ?? uuidv4(),
    dangerLevel: body.dangerLevel ?? dangerCheck.level,
    dangerReasons: body.dangerReasons ?? dangerCheck.reasons,
    status: body.status ?? "pending",
    createdAt: body.createdAt ?? new Date().toISOString(),
  };
  await saveMeal(meal);
  return NextResponse.json(meal, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const meal: MealEntry = await req.json();
  await saveMeal(meal);
  if (meal.status === "sent") {
    const client = await getClient(meal.clientId);
    if (client) {
      try { await appendMealToSheet(meal, client); }
      catch (e) { console.error("Sheets保存エラー:", e); }
    }
  }
  return NextResponse.json(meal);
}
