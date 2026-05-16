import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase.from("clients").select("*");
  return NextResponse.json({ 
    data, 
    error,
    url: process.env.SUPABASE_URL ?? "未設定",
    keySet: !!process.env.SUPABASE_ANON_KEY,
  });
}
