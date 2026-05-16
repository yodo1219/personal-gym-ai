export type Gender = "male" | "female" | "other";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "fat_loss" | "muscle_gain" | "maintain" | "health";
export type DangerLevel = "safe" | "caution" | "danger";

export interface Client {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  height: number;
  weight: number;
  bodyFat?: number;
  goal: Goal;
  activityLevel: ActivityLevel;
  allergies: string;
  medicalHistory: string;
  dislikedFoods: string;
  dietaryPolicy: string;
  mentalTendency: string;
  bingeTendency: string;
  sleepStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionData {
  totalCalories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber: number | null;
  salt: number | null;
  meals: {
    breakfast: string[];
    lunch: string[];
    dinner: string[];
    snack: string[];
  };
  rawText: string;
  appName: string | null;
  recordDate: string | null;
}

export interface NutritionTarget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface NutritionEvaluation {
  calorieStatus: "low" | "ok" | "high" | "unknown";
  proteinStatus: "low" | "ok" | "high" | "unknown";
  fatStatus: "low" | "ok" | "high" | "unknown";
  carbStatus: "low" | "ok" | "high" | "unknown";
  fiberStatus: "low" | "ok" | "unknown";
  saltStatus: "ok" | "high" | "unknown";
  highFatFoods: string[];
  lowProteinSuggestions: string[];
}

export interface MealEntry {
  id: string;
  clientId: string;
  mealDate: string;
  mealTime: "breakfast" | "lunch" | "dinner" | "snack" | "daily";
  inputType: "text" | "image";
  content: string;
  imageFileName?: string;
  imageBase64?: string;
  nutrition?: NutritionData;
  nutritionTarget?: NutritionTarget;
  nutritionEval?: NutritionEvaluation;
  dangerLevel: DangerLevel;
  dangerReasons: string[];
  aiReply?: string;
  trainerReply?: string;
  status: "pending" | "reviewed" | "sent";
  createdAt: string;
}

export interface AIReplyResult {
  reply: string;
  dangerLevel: DangerLevel;
  dangerReasons: string[];
  goodPoints: string[];
  improvements: string[];
  nextAction: string;
}