import { supabase } from "./supabase";
import { Client, MealEntry } from "@/types";

// ---- Clients ----
export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return []; }
  return (data ?? []).map(toClient);
}

export async function getClient(id: string): Promise<Client | undefined> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return undefined;
  return toClient(data);
}

export async function getClientByLineUserId(lineUserId: string): Promise<Client | undefined> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("line_user_id", lineUserId)
    .single();
  if (error || !data) return undefined;
  return toClient(data);
}

export async function saveClient(client: Client): Promise<void> {
  const row = fromClient(client);
  const { error } = await supabase
    .from("clients")
    .upsert(row, { onConflict: "id" });
  if (error) console.error(error);
}

export async function deleteClient(id: string): Promise<void> {
  await supabase.from("clients").delete().eq("id", id);
}

// ---- Meals ----
export async function getMeals(clientId?: string): Promise<MealEntry[]> {
  let query = supabase
    .from("meals")
    .select("*")
    .order("created_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return (data ?? []).map(toMeal);
}

export async function getMeal(id: string): Promise<MealEntry | undefined> {
  const { data, error } = await supabase
    .from("meals")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return undefined;
  return toMeal(data);
}

export async function saveMeal(meal: MealEntry): Promise<void> {
  const { imageBase64: _, ...mealToSave } = meal;
  const row = fromMeal(mealToSave);
  const { error } = await supabase
    .from("meals")
    .upsert(row, { onConflict: "id" });
  if (error) console.error(error);
}

// ---- 変換関数 ----
function toClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    gender: row.gender,
    height: row.height,
    weight: row.weight,
    bodyFat: row.body_fat,
    goal: row.goal,
    activityLevel: row.activity_level,
    allergies: row.allergies ?? "",
    medicalHistory: row.medical_history ?? "",
    dislikedFoods: row.disliked_foods ?? "",
    dietaryPolicy: row.dietary_policy ?? "",
    mentalTendency: row.mental_tendency ?? "",
    bingeTendency: row.binge_tendency ?? "",
    sleepStatus: row.sleep_status ?? "",
    lineUserId: row.line_user_id ?? "",
    targetCalories: row.target_calories ?? undefined,
    targetProtein: row.target_protein ?? undefined,
    targetFat: row.target_fat ?? undefined,
    targetCarbs: row.target_carbs ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromClient(c: Client): any {
  return {
    id: c.id,
    name: c.name,
    age: c.age,
    gender: c.gender,
    height: c.height,
    weight: c.weight,
    body_fat: c.bodyFat,
    goal: c.goal,
    activity_level: c.activityLevel,
    allergies: c.allergies,
    medical_history: c.medicalHistory,
    disliked_foods: c.dislikedFoods,
    dietary_policy: c.dietaryPolicy,
    mental_tendency: c.mentalTendency,
    binge_tendency: c.bingeTendency,
    sleep_status: c.sleepStatus,
    line_user_id: (c as any).lineUserId ?? "",
    target_calories: (c as any).targetCalories ?? null,
    target_protein: (c as any).targetProtein ?? null,
    target_fat: (c as any).targetFat ?? null,
    target_carbs: (c as any).targetCarbs ?? null,
    updated_at: new Date().toISOString(),
  };
}

function toMeal(row: any): MealEntry {
  return {
    id: row.id,
    clientId: row.client_id,
    mealDate: row.meal_date,
    mealTime: row.meal_time,
    inputType: row.input_type,
    content: row.content ?? "",
    imageFileName: row.image_file_name,
    nutrition: row.nutrition,
    nutritionTarget: row.nutrition_target,
    nutritionEval: row.nutrition_eval,
    dangerLevel: row.danger_level,
    dangerReasons: row.danger_reasons ?? [],
    aiReply: row.ai_reply,
    trainerReply: row.trainer_reply,
    status: row.status,
    createdAt: row.created_at,
  };
}

function fromMeal(m: MealEntry): any {
  return {
    id: m.id,
    client_id: m.clientId,
    meal_date: m.mealDate,
    meal_time: m.mealTime,
    input_type: m.inputType,
    content: m.content,
    image_file_name: m.imageFileName,
    nutrition: m.nutrition,
    nutrition_target: m.nutritionTarget,
    nutrition_eval: m.nutritionEval,
    danger_level: m.dangerLevel,
    danger_reasons: m.dangerReasons,
    ai_reply: m.aiReply,
    trainer_reply: m.trainerReply,
    status: m.status,
  };
}
