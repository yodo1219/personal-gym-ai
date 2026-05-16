import fs from "fs";
import path from "path";
import { Client, MealEntry } from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");
const MEALS_FILE = path.join(DATA_DIR, "meals.json");

function ensureFile(filePath: string) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([]));
}

export function getClients(): Client[] {
  ensureFile(CLIENTS_FILE);
  return JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf-8"));
}

export function getClient(id: string): Client | undefined {
  return getClients().find((c) => c.id === id);
}

export function saveClient(client: Client): void {
  const clients = getClients();
  const idx = clients.findIndex((c) => c.id === client.id);
  if (idx >= 0) clients[idx] = client;
  else clients.push(client);
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

export function deleteClient(id: string): void {
  const clients = getClients().filter((c) => c.id !== id);
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

export function getMeals(clientId?: string): MealEntry[] {
  ensureFile(MEALS_FILE);
  const meals: MealEntry[] = JSON.parse(fs.readFileSync(MEALS_FILE, "utf-8"));
  return clientId ? meals.filter((m) => m.clientId === clientId) : meals;
}

export function getMeal(id: string): MealEntry | undefined {
  return getMeals().find((m) => m.id === id);
}

export function saveMeal(meal: MealEntry): void {
  const { imageBase64: _, ...mealToSave } = meal;
  const meals = getMeals();
  const idx = meals.findIndex((m) => m.id === meal.id);
  if (idx >= 0) meals[idx] = mealToSave;
  else meals.push(mealToSave);
  fs.writeFileSync(MEALS_FILE, JSON.stringify(meals, null, 2));
}