import { NextResponse } from "next/server";
import { callQlooTool } from "@/mcp/qloo/in-process";
import { QLOO_TOOL_NAMES, type QlooToolName } from "@/mcp/qloo/tools";

function isToolName(name: unknown): name is QlooToolName {
  return (
    typeof name === "string" &&
    (QLOO_TOOL_NAMES as readonly string[]).includes(name)
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tool?: unknown;
    arguments?: unknown;
  } | null;
  if (!body || !isToolName(body.tool)) {
    return NextResponse.json(
      { error: `tool must be one of: ${QLOO_TOOL_NAMES.join(", ")}` },
      { status: 400 },
    );
  }
  try {
    const result = await callQlooTool(
      body.tool,
      (body.arguments ?? {}) as never,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Qloo MCP call failed" },
      { status: 400 },
    );
  }
}
