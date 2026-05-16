import { NextRequest, NextResponse } from "next/server";
import { generateAIReply } from "@/lib/openai";
import { getClient } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const { clientId, mealContent } = await req.json();
    if (!clientId || !mealContent) {
      return NextResponse.json({ error: "clientId と mealContent は必須です" }, { status: 400 });
    }
    const client = getClient(clientId);
    if (!client) {
      return NextResponse.json({ error: "顧客が見つかりません" }, { status: 404 });
    }
    const result = await generateAIReply(client, mealContent);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "AI返信の生成に失敗しました" }, { status: 500 });
  }
}
