import { connection } from "next/server";
import { NextResponse } from "next/server";
import { loadAppGraph } from "@/lib/qloo/app-graph";
import { scheduleLiveGraphWarmFromEnv } from "@/lib/qloo/schedule-warm";

const NO_STORE = {
  "Cache-Control": "private, no-store",
};

export async function GET() {
  await connection();
  scheduleLiveGraphWarmFromEnv();
  const { mode, graph, source, degraded } = await loadAppGraph();
  return NextResponse.json(
    { mode, graph, source, degraded },
    { headers: NO_STORE },
  );
}
