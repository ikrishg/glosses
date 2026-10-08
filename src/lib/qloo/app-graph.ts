import type { QlooGraphSnapshot } from "@/lib/qloo/types";
import { createQlooClient, type QlooClient } from "@/lib/qloo/client";

export type QlooDataMode = "mock" | "live";

export function getQlooDataMode(): QlooDataMode {
  return process.env.QLOO_API_KEY?.trim() ? "live" : "mock";
}

/** Server-side graph load used by the page and `/api/qloo-mode`. */
export async function loadAppGraph(client?: QlooClient): Promise<{
  mode: QlooDataMode;
  graph: QlooGraphSnapshot;
}> {
  const mode = getQlooDataMode();
  const qloo = client ?? createQlooClient();
  const graph = await qloo.getGraph();
  return { mode, graph };
}
