import { loadAppGraph } from "@/lib/qloo/app-graph";
import { scheduleLiveGraphWarmFromEnv } from "@/lib/qloo/schedule-warm";
import { connection } from "next/server";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET() {
  await connection();
  scheduleLiveGraphWarmFromEnv();
  const { mode, graph, source, degraded } = await loadAppGraph();
  return NextResponse.json({
    mode,
    graphVersion: graph.version,
    source,
    degraded,
  });
}
