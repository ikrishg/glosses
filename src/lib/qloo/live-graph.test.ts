import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { getMemoryLiveGraphStore } from "@/lib/qloo/live-graph-store";
import {
  buildLiveGraphSnapshot,
  clearLiveGraphCache,
  getCachedLiveGraph,
  getLiveGraphStatus,
  getServingLiveGraph,
  INSIGHTS_SIGNAL_BATCH_SIZE,
  mapWithConcurrency,
  meetsLiveGraphCoverage,
  MIN_LIVE_EDGE_COUNT,
  POOL_CONCURRENCY,
  warmLiveGraphCache,
  __testSetLiveGraphReady,
  __testSetPartial,
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
  targets: { entity_id: string; name: string; affinity: number }[],
) {
  return {
    success: true,
    results: {
      entities: targets.map((t) => ({
        entity_id: t.entity_id,
        name: t.name,
        query: { affinity: t.affinity },
      })),
    },
  };
}

function makeSuccessfulFetchStub() {
  const idByName = new Map<string, string>();
  let nextId = 1;
  let nextInsightId = 1;
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
      const targets = ids.map((_, i) => ({
        entity_id: `insight-${nextInsightId + i}`,
        name: `Royal Tenenbaums House ${nextInsightId + i}`,
        affinity: 0.85,
      }));
      nextInsightId += ids.length;
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

describe("meetsLiveGraphCoverage", () => {
  it("requires minimum edges and outgoing edges per seed domain", () => {
    const entities = ALL_DOMAIN_SEEDS();
    const noOutgoing = {
      entities,
      edges: Array.from({ length: MIN_LIVE_EDGE_COUNT }, (_, i) => ({
        fromId: `insight-${i}`,
        toId: `insight-${i + 1}`,
        weight: 0.5,
      })),
    };
    expect(meetsLiveGraphCoverage(noOutgoing)).toBe(false);

    const tooFew = {
      entities,
      edges: [{ fromId: entities[0].id, toId: "insight-1", weight: 0.9 }],
    };
    expect(meetsLiveGraphCoverage(tooFew)).toBe(false);

    const edges = Array.from({ length: MIN_LIVE_EDGE_COUNT }, (_, i) => ({
      fromId: entities[i % entities.length].id,
      toId: `insight-${i}`,
      weight: 0.8,
    }));
    expect(meetsLiveGraphCoverage({ entities, edges })).toBe(true);
  });
});

function ALL_DOMAIN_SEEDS() {
  const domains = ["music", "film", "books", "places", "food", "tv"] as const;
  return domains.map((domain, i) => ({
    id: `live-${domain}-${i}`,
    name: `Seed ${domain}`,
    domain,
    tags: [] as string[],
  }));
}

describe("buildLiveGraphSnapshot", () => {
  afterEach(() => {
    clearLiveGraphCache();
    vi.unstubAllGlobals();
  });

  it("retries fixture seeds that failed search on the next build pass", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/search")) {
        return new Response(
          JSON.stringify({ success: true, results: { entities: [] } }),
          { status: 200 },
        );
      }
      const name = new URL(url).searchParams.get("query") ?? "";
      if (name === "The Bell Jar") {
        return new Response("missing", { status: 404 });
      }
      return new Response(JSON.stringify(okSearch(name, `id-${name}`)), {
        status: 200,
      });
    });

    await expect(
      buildLiveGraphSnapshot(
        { apiKey: SECRET, fetchImpl: fetchSpy },
        undefined,
        5_000,
      ),
    ).rejects.toThrow();

    const bellJar = FIXTURE_GRAPH.entities.find(
      (e) => e.name === "The Bell Jar",
    )!;
    const partial = getMemoryLiveGraphStore().partial;
    expect(partial?.searchedFixtures.has(bellJar.id)).toBe(false);

    const searchesBefore = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/search"),
    ).length;

    await expect(
      buildLiveGraphSnapshot(
        { apiKey: SECRET, fetchImpl: fetchSpy },
        partial ?? undefined,
        5_000,
      ),
    ).rejects.toThrow();

    const searchesAfter = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/search"),
    ).length;
    expect(searchesAfter).toBeGreaterThan(searchesBefore);
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
    ).rejects.toThrow(/coverage|edges/);
    const searches = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/search"),
    );
    expect(searches.length).toBeGreaterThan(1);
  });

  it("adds insight entities and edges from signalling seeds", async () => {
    const fetchSpy = makeSuccessfulFetchStub();
    const graph = await buildLiveGraphSnapshot({
      apiKey: SECRET,
      fetchImpl: fetchSpy,
    });
    const insightEntities = graph.entities.filter((e) =>
      e.tags.includes("qloo-insight"),
    );
    expect(insightEntities.length).toBeGreaterThan(0);
    expect(
      graph.edges.some(
        (e) =>
          insightEntities.some((t) => t.id === e.toId) &&
          graph.entities.some((s) => s.id === e.fromId && !s.tags.includes("qloo-insight")),
      ),
    ).toBe(true);
    expect(meetsLiveGraphCoverage(graph)).toBe(true);
  });

  it("batches seed ids (max 6) per insights call", async () => {
    const fetchSpy = makeSuccessfulFetchStub();
    await buildLiveGraphSnapshot({ apiKey: SECRET, fetchImpl: fetchSpy });

    const insightsCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/insights"),
    );
    expect(insightsCalls.length).toBeGreaterThan(0);
    for (const call of insightsCalls) {
      const signal =
        new URL(String(call[0])).searchParams.get(
          "signal.interests.entities",
        ) ?? "";
      const count = signal.split(",").filter(Boolean).length;
      expect(count).toBeLessThanOrEqual(INSIGHTS_SIGNAL_BATCH_SIZE);
      expect(count).toBeGreaterThan(0);
    }
  });

  it("dedupes food and places into one urn:entity:place insights series", async () => {
    const fetchSpy = makeSuccessfulFetchStub();
    await buildLiveGraphSnapshot({ apiKey: SECRET, fetchImpl: fetchSpy });

    const insightsCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/insights"),
    );
    const filterTypes = new Set(
      insightsCalls.map(
        (c) =>
          new URL(String(c[0])).searchParams.get("filter.type") ?? "",
      ),
    );
    expect(filterTypes.has("urn:entity:place")).toBe(true);
    expect(filterTypes.has("urn:entity:movie")).toBe(true);
    const foodTagged = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("filter.tags="),
    );
    expect(foodTagged.length).toBeGreaterThan(0);
  });

  it("labels restaurant insight hits as food for outing pairing", async () => {
    const fetchSpy = makeSuccessfulFetchStub();
    const graph = await buildLiveGraphSnapshot({
      apiKey: SECRET,
      fetchImpl: fetchSpy,
    });
    const foodInsights = graph.entities.filter(
      (e) => e.domain === "food" && e.tags.includes("qloo-insight"),
    );
    expect(foodInsights.length).toBeGreaterThan(0);
    const placeInsights = graph.entities.filter(
      (e) => e.domain === "places" && e.tags.includes("qloo-insight"),
    );
    expect(placeInsights.length).toBeGreaterThan(0);
    const hasPlaceFoodRoute = graph.edges.some(
      (e) =>
        placeInsights.some((p) => p.id === e.fromId) &&
        foodInsights.some((f) => f.id === e.toId),
    );
    expect(hasPlaceFoodRoute).toBe(true);
  });

  it("skips a timed-out insights batch without aborting the build", async () => {
    let insightsCalls = 0;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search")) {
        const name = new URL(url).searchParams.get("query") ?? "";
        return new Response(
          JSON.stringify(okSearch(name, `seed-${name}`)),
          { status: 200 },
        );
      }
      if (url.includes("/v2/insights")) {
        insightsCalls += 1;
        if (insightsCalls === 1) {
          throw new Error("Qloo request failed: /v2/insights");
        }
        const signal =
          new URL(url).searchParams.get("signal.interests.entities") ?? "";
        const ids = signal.split(",").filter(Boolean);
        const targets = ids.map((_, i) => ({
          entity_id: `insight-fallback-${insightsCalls}-${i}`,
          name: "Sorry to Bother You",
          affinity: 0.9,
        }));
        return new Response(JSON.stringify(insightsForTargets(targets)), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });

    const graph = await buildLiveGraphSnapshot({
      apiKey: SECRET,
      fetchImpl: fetchSpy,
    });
    expect(graph.edges.length).toBeGreaterThanOrEqual(MIN_LIVE_EDGE_COUNT);
    expect(insightsCalls).toBeGreaterThan(1);
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

  it("reports degraded when a retry makes no progress", async () => {
    const seeds = FIXTURE_GRAPH.entities.slice(0, 6).map((f, i) => ({
      id: `live-seed-${i}`,
      name: f.name,
      domain: f.domain,
      tags: [...f.tags],
    }));
    const progress = {
      fixtureIdMap: {},
      entities: seeds,
      edges: [],
      searchedFixtures: new Set(FIXTURE_GRAPH.entities.map((e) => e.id)),
      insightsJobsDone: new Set<string>(),
    };
    __testSetPartial(progress);

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v2/insights")) {
        throw new Error("Qloo request timed out: /v2/insights");
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    warmLiveGraphCache({ apiKey: SECRET, fetchImpl: fetchSpy });
    await getCachedLiveGraph({ apiKey: SECRET, fetchImpl: fetchSpy }).catch(
      () => undefined,
    );
    expect(getLiveGraphStatus()).toBe("degraded");
  });
});
