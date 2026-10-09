import { awaitLiveGraphBuild } from "@/lib/qloo/live-graph";
import { shouldUseLiveQloo } from "@/lib/qloo/client";
import { connection } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET() {
  await connection();
  if (!shouldUseLiveQloo()) {
    return NextResponse.json({ status: "mock" });
  }
  const apiKey = process.env.QLOO_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ status: "mock" });
  }
  const status = await awaitLiveGraphBuild({ apiKey });
  return NextResponse.json({ status });
}
