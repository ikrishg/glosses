import { loadAppGraph } from "@/lib/qloo/app-graph";
import { NextResponse } from "next/server";

export async function GET() {
  const { mode, graph } = await loadAppGraph();
  return NextResponse.json({
    mode,
    graphVersion: graph.version,
  });
}
