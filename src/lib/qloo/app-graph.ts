import "server-only";

import type { QlooGraphSnapshot } from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  createQlooClient,
  shouldUseLiveQloo,
  type QlooClient,
} from "@/lib/qloo/client";

export type QlooDataMode = "mock" | "live" | "live-fallback";

export type GraphDataSource = "fixture" | "live";

export function getQlooDataMode(): QlooDataMode {
  return shouldUseLiveQloo() ? "live" : "mock";
}

function graphDataSource(graph: QlooGraphSnapshot): GraphDataSource {
  return graph.dataSource ?? "fixture";
}

/** Server-side graph load used by the page and `/api/qloo-mode`. */
export async function loadAppGraph(client?: QlooClient): Promise<{
  mode: QlooDataMode;
  graph: QlooGraphSnapshot;
  source: GraphDataSource;
  degraded: boolean;
}> {
  const hasKey = shouldUseLiveQloo();
  const qloo = client ?? createQlooClient();
  const graph = await qloo.getGraph();
  const source = graphDataSource(graph);
  const degraded = qloo.degraded || (hasKey && source === "fixture");

  if (!hasKey) {
    return { mode: "mock", graph, source, degraded: false };
  }
  if (degraded) {
    return {
      mode: "live-fallback",
      graph: source === "fixture" ? graph : { ...FIXTURE_GRAPH, dataSource: "fixture" },
      source: "fixture",
      degraded: true,
    };
  }
  return { mode: "live", graph, source: "live", degraded: false };
}
