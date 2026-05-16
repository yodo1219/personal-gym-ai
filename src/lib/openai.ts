import OpenAI from "openai";
import { Client, AIReplyResult } from "@/types";
import { buildSystemPrompt } from "./prompts";
import { checkDanger } from "./danger-check";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateAIReply(
  client: Client,
  mealContent: string
): Promise<AIReplyResult> {
  const dangerCheck = checkDanger(mealContent);

  if (dangerCheck.level === "danger") {
    return {
      reply: "",
      dangerLevel: "danger",
      dangerReasons: dangerCheck.reasons,
      goodPoints: [],
      improvements: [],
      nextAction: "",
    };
  }

  const systemPrompt = buildSystemPrompt(client);
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `【本日の食事内容】\n${mealContent}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(content);

  return {
    reply: parsed.reply ?? "",
    dangerLevel: dangerCheck.level,
    dangerReasons: dangerCheck.reasons,
    goodPoints: parsed.goodPoints ?? [],
    improvements: parsed.improvements ?? [],
    nextAction: parsed.nextAction ?? "",
  };
}