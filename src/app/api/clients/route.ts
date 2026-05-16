import { NextRequest, NextResponse } from "next/server";
import { getClients, saveClient, deleteClient } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";
import { Client } from "@/types";

export async function GET() {
  const clients = await getClients();
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const now = new Date().toISOString();
  const client: Client = { ...body, id: uuidv4(), createdAt: now, updatedAt: now };
  await saveClient(client);
  return NextResponse.json(client, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const client: Client = { ...body, updatedAt: new Date().toISOString() };
  await saveClient(client);
  return NextResponse.json(client);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await deleteClient(id);
  return NextResponse.json({ success: true });
}
