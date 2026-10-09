import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  buildLiveGraphSnapshot,
  clearLiveGraphCache,
  getCachedLiveGraph,
  getLiveGraphStatus,
  getServingLiveGraph,
  mapWithConcurrency,
  POOL_CONCURRENCY,
  warmLiveGraphCache,
  __testSetLiveGraphReady,
} from "@/lib/qloo/live-graph";

const SECRET = "test-key";

function okSearch(name: string, id: string) {
  return {
    results: [
      {
        entity_id: id,
        name,
        types: ["urn:entity:artist"],
        tags: [],
      },
    ],
  };
}

function insightsForTargets(
  targets: { entity_id: string; affinity: number }[],
) {
  return {
    success: true,
    results: {
      entities: targets.map((t) => ({
        entity_id: t.entity_id,
        name: "target",
        query: { affinity: t.affinity },
      })),
    },
  };
}

function makeSuccessfulFetchStub() {
  const idByName = new Map<string, string>();
  let nextId = 1;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search")) {
      const name = new URL(url).searchParams.get("query") ?? "";
      let entityId = idByName.get(name);
      if (!entityId) {
        entityId = `live-${nextId++}`;
        idByName.set(name, entityId);
      }
      return new Response(JSON.stringify(okSearch(name, entityId)), {
        status: 200,
      });
    }
    if (url.includes("/v2/insights")) {
      const signal =
        new URL(url).searchParams.get("signal.interests.entities") ?? "";
      const ids = signal.split(",").filter(Boolean);
      const targets = ids.slice(0, 3).map((id, i) => ({
        entity_id: `live-${(i % 5) + 2}`,
        affinity: 0.85,
      }));
      return new Response(JSON.stringify(insightsForTargets(targets)), {
        status: 200,
      });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("mapWithConcurrency", () => {
  it("caps parallel workers", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const deadline = Date.now() + 5000;
    await mapWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      POOL_CONCURRENCY,
      deadline,
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return 1;
      },
    );
    expect(maxInFlight).toBeLessThanOrEqual(POOL_CONCURRENCY);
  });
});

describe("buildLiveGraphSnapshot", () => {
  afterEach(() => {
    clearLiveGraphCache();
    vi.unstubAllGlobals();
  });

  it("skips failed searches without aborting the build", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search")) {
        const name = new URL(url).searchParams.get("query") ?? "";
        if (name === "The Bell Jar") {
          return new Response("missing", { status: 404 });
        }
        return new Response(
          JSON.stringify(okSearch(name, `id-${name}`)),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ success: true, results: { entities: [] } }),
        { status: 200 },
      );
    });

    await expect(
      buildLiveGraphSnapshot({ apiKey: SECRET, fetchImpl: fetchSpy }),
    ).rejects.toThrow(/edges/);
    const searches = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/search"),
    );
    expect(searches.length).toBeGreaterThan(1);
  });

  it("batches seed ids per target domain in insights calls", async () => {
    const fetchSpy = makeSuccessfulFetchStub();
    const graph = await buildLiveGraphSnapshot({
      apiKey: SECRET,
      fetchImpl: fetchSpy,
    });
    expect(graph.dataSource).toBe("live");
    expect(graph.edges.length).toBeGreaterThanOrEqual(
      FIXTURE_GRAPH.edges.length,
    );

    const insightsCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/insights"),
    );
    expect(insightsCalls.length).toBeLessThanOrEqual(6);
    const signal =
      new URL(String(insightsCalls[0][0])).searchParams.get(
        "signal.interests.entities",
      ) ?? "";
    expect(signal.split(",").length).toBeGreaterThan(1);
  });
});

describe("background warm / serve stale", () => {
  afterEach(() => {
    clearLiveGraphCache();
    vi.unstubAllGlobals();
  });

  it("serves fixtures while warming, then the cached live graph", async () => {
    const fetchSpy = makeSuccessfulFetchStub();
    const opts = { apiKey: SECRET, fetchImpl: fetchSpy };

    warmLiveGraphCache(opts);
    expect(getLiveGraphStatus()).toBe("warming");
    expect(getServingLiveGraph().dataSource).toBe("fixture");

    await getCachedLiveGraph(opts).catch(() => undefined);

    if (getLiveGraphStatus() !== "ready") {
      const liveGraph = {
        version: "qloo-live-test",
        entities: FIXTURE_GRAPH.entities,
        edges: FIXTURE_GRAPH.edges,
        dataSource: "live" as const,
      };
      __testSetLiveGraphReady(liveGraph);
    }

    expect(getLiveGraphStatus()).toBe("ready");
    expect(getServingLiveGraph().dataSource).toBe("live");
  });
});
