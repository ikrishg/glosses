import "server-only";

import type { QlooGraphSnapshot } from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  createQlooClient,
  shouldUseLiveQloo,
  type QlooClient,
} from "@/lib/qloo/client";
import {
  getLiveGraphStatus,
  hydrateLiveGraphState,
} from "@/lib/qloo/live-graph";

export type QlooDataMode = "mock" | "live" | "live-warming" | "live-fallback";

export type GraphDataSource = "fixture" | "live";

export function getQlooDataMode(): QlooDataMode {
  if (!shouldUseLiveQloo()) {
    return "mock";
  }
  const status = getLiveGraphStatus();
  if (status === "ready") return "live";
  if (status === "warming" || status === "idle") return "live-warming";
  return "live-fallback";
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
  if (hasKey) {
    await hydrateLiveGraphState();
  }
  const qloo = client ?? createQlooClient();
  const graph = await qloo.getGraph();
  const source = graphDataSource(graph);
  const buildStatus = getLiveGraphStatus();

  if (!hasKey) {
    return { mode: "mock", graph, source, degraded: false };
  }

  if (buildStatus === "ready" && source === "live") {
    return { mode: "live", graph, source: "live", degraded: false };
  }

  if (buildStatus === "degraded") {
    return {
      mode: "live-fallback",
      graph: { ...FIXTURE_GRAPH, dataSource: "fixture" },
      source: "fixture",
      degraded: true,
    };
  }

  if (buildStatus === "warming" || buildStatus === "idle") {
    const fixtureGraph = { ...FIXTURE_GRAPH, dataSource: "fixture" as const };
    return {
      mode: "live-warming",
      graph: fixtureGraph,
      source: "fixture",
      degraded: true,
    };
  }

  return {
    mode: "live-fallback",
    graph: { ...FIXTURE_GRAPH, dataSource: "fixture" },
    source: "fixture",
    degraded: true,
  };
}
