"use client";

import { useEffect, useState } from "react";
import type { QlooToolMap } from "@/mcp/qloo/in-process";
import type { QlooToolName } from "@/mcp/qloo/tools";

export async function fetchQlooTool<N extends QlooToolName>(
  tool: N,
  args: QlooToolMap[N]["args"],
): Promise<QlooToolMap[N]["result"]> {
  const res = await fetch("/api/qloo-mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, arguments: args }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? `Qloo MCP ${tool} failed: ${res.status}`);
  }
  return body as QlooToolMap[N]["result"];
}

/** Latest result of a Qloo MCP tool call; keeps the previous result while a new one loads. */
export function useQlooTool<N extends QlooToolName>(
  tool: N,
  args: QlooToolMap[N]["args"],
): QlooToolMap[N]["result"] | null {
  const [result, setResult] = useState<QlooToolMap[N]["result"] | null>(null);
  const key = JSON.stringify(args);

  useEffect(() => {
    let cancelled = false;
    fetchQlooTool(tool, JSON.parse(key))
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [tool, key]);

  return result;
}
