import { loadAppGraph } from "@/lib/qloo/app-graph";
import { connection } from "next/server";
import { NextResponse } from "next/server";

export async function GET() {
  await connection();
  const { mode, graph, source, degraded } = await loadAppGraph();
  return NextResponse.json({
    mode,
    graphVersion: graph.version,
    source,
    degraded,
  });
}
