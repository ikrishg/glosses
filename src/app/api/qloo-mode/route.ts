import { createQlooClient } from "@/lib/qloo/client";
import { NextResponse } from "next/server";

export async function GET() {
  const mode = process.env.QLOO_API_KEY?.trim() ? "live" : "mock";
  const client = createQlooClient();
  const graph = await client.getGraph();
  return NextResponse.json({
    mode,
    graphVersion: graph.version,
  });
}
