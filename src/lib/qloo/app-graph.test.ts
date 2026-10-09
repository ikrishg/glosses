import { afterEach, describe, expect, it, vi } from "vitest";
import type { QlooGraphSnapshot } from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { getQlooDataMode, loadAppGraph } from "@/lib/qloo/app-graph";
import type { QlooClient } from "@/lib/qloo/client";
import {
  __testSetLiveGraphReady,
  clearLiveGraphCache,
} from "@/lib/qloo/live-graph";

const LIVE_GRAPH: QlooGraphSnapshot = {
  version: "qloo-live-test-v1",
  entities: [
    {
      id: "live:music:a",
      name: "Live Artist",
      domain: "music",
      tags: ["live"],
    },
    {
      id: "live:film:b",
      name: "Live Film",
      domain: "film",
      tags: ["live"],
    },
  ],
  edges: [{ fromId: "live:music:a", toId: "live:film:b", weight: 0.9 }],
};

function stubClient(
  graph: QlooGraphSnapshot,
  mode: QlooClient["mode"],
): QlooClient {
  return {
    mode,
    degraded: false,
    searchDataSource: "fixture" as const,
    getGraph: async () => graph,
    searchEntities: async () => graph.entities,
    logTaste: async () => undefined,
    getProfile: async () => null,
  };
}

describe("loadAppGraph", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearLiveGraphCache();
  });

  it("reports mock mode and fixture graph without API key", async () => {
    vi.stubEnv("QLOO_API_KEY", "");
    const { mode, graph, source, degraded } = await loadAppGraph(
      stubClient({ ...FIXTURE_GRAPH, dataSource: "fixture" }, "mock"),
    );
    expect(mode).toBe("mock");
    expect(graph.version).toBe(FIXTURE_GRAPH.version);
    expect(source).toBe("fixture");
    expect(degraded).toBe(false);
  });

  it("reports live mode and uses LiveQlooClient graph when key is set", async () => {
    vi.stubEnv("QLOO_API_KEY", "test-secret");
    __testSetLiveGraphReady({ ...LIVE_GRAPH, dataSource: "live" });
    expect(getQlooDataMode()).toBe("live");
    const { mode, graph, source } = await loadAppGraph(
      stubClient({ ...LIVE_GRAPH, dataSource: "live" }, "live"),
    );
    expect(mode).toBe("live");
    expect(graph.version).toBe("qloo-live-test-v1");
    expect(graph).not.toEqual(FIXTURE_GRAPH);
    expect(source).toBe("live");
  });
});
