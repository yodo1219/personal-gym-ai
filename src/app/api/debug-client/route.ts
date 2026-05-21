import { NextResponse } from "next/server";
import { getClients } from "@/lib/storage";

export async function GET() {
  const clients = await getClients();
  return NextResponse.json(clients.map((c: any) => ({
    name: c.name,
    targetCalories: c.targetCalories,
    targetProtein: c.targetProtein,
    targetFat: c.targetFat,
    targetCarbs: c.targetCarbs,
  })));
}
