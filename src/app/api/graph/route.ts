import { connection } from "next/server";
import { NextResponse } from "next/server";
import { loadAppGraph } from "@/lib/qloo/app-graph";
import { shouldUseLiveQloo } from "@/lib/qloo/client";
import { awaitLiveGraphBuild } from "@/lib/qloo/live-graph";
import { scheduleLiveGraphWarmFromEnv } from "@/lib/qloo/schedule-warm";

const NO_STORE = {
  "Cache-Control": "private, no-store",
};

export const maxDuration = 60;

export async function GET() {
  await connection();
  scheduleLiveGraphWarmFromEnv();
  if (shouldUseLiveQloo()) {
    const apiKey = process.env.QLOO_API_KEY?.trim();
    if (apiKey) {
      await awaitLiveGraphBuild({ apiKey });
    }
  }
  const { mode, graph, source, degraded } = await loadAppGraph();
  return NextResponse.json(
    { mode, graph, source, degraded },
    { headers: NO_STORE },
  );
}
