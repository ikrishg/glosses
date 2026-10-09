import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  clearLiveGraphCache,
  createQlooClient,
  LiveQlooClient,
  MockQlooClient,
} from "@/lib/qloo/client";
import { loadAppGraph } from "@/lib/qloo/app-graph";

const SECRET = "test-api-key-do-not-leak";

function searchResponse(entityId: string, name: string, urn: string) {
  return { results: [{ entity_id: entityId, name, types: [urn], tags: [] }] };
}

function insightsResponse(entities: { entity_id: string; affinity: number }[]) {
  return {
    success: true,
    results: {
      entities: entities.map((e) => ({
        entity_id: e.entity_id,
        name: "x",
        query: { affinity: e.affinity },
      })),
    },
  };
}

function makeLiveFetchStub() {
  const idByName = new Map<string, string>();
  let nextId = 1;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/search")) {
      const parsed = new URL(url);
      const name = parsed.searchParams.get("query") ?? "";
      const types = parsed.searchParams.get("types") ?? "";
      let entityId = idByName.get(name);
      if (!entityId) {
        entityId = `live-entity-${nextId++}`;
        idByName.set(name, entityId);
      }
      return new Response(JSON.stringify(searchResponse(entityId, name, types)), {
        status: 200,
      });
    }
    if (url.includes("/v2/insights")) {
      const parsed = new URL(url);
      const fromId = parsed.searchParams.get("signal.interests.entities");
      const filterType = parsed.searchParams.get("filter.type");
      const targets: { entity_id: string; affinity: number }[] = [];
      if (fromId && filterType === "urn:entity:movie") {
        targets.push({ entity_id: "live-entity-2", affinity: 0.88 });
      }
      return new Response(JSON.stringify(insightsResponse(targets)), {
        status: 200,
      });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("createQlooClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearLiveGraphCache();
  });

  it("selects mock without a key and live when set", () => {
    expect(createQlooClient({})).toBeInstanceOf(MockQlooClient);
    expect(createQlooClient({ QLOO_API_KEY: "  " })).toBeInstanceOf(
      MockQlooClient,
    );
    expect(createQlooClient({ QLOO_API_KEY: SECRET })).toBeInstanceOf(
      LiveQlooClient,
    );
    expect(
      createQlooClient({
        QLOO_API_KEY: SECRET,
        NEXT_PHASE: "phase-production-build",
      }),
    ).toBeInstanceOf(MockQlooClient);
  });
});

describe("LiveQlooClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearLiveGraphCache();
  });

  it("maps /search results to QlooEntity", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify(
          searchResponse("ent-99", "Radiohead", "urn:entity:artist"),
        ),
        { status: 200 },
      ),
    );
    const client = new LiveQlooClient(SECRET, fetchSpy);
    const entities = await client.searchEntities("music", "Radiohead");
    expect(entities[0]).toEqual({
      id: "ent-99",
      name: "Radiohead",
      domain: "music",
      tags: [],
    });
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toContain("hackathon.api.qloo.com/search");
  });

  it("builds a live snapshot with fixture id map and caches the second getGraph", async () => {
    const fetchSpy = makeLiveFetchStub();
    const client = new LiveQlooClient(SECRET, fetchSpy);
    const first = await client.getGraph();
    const second = await client.getGraph();
    expect(first.dataSource).toBe("live");
    expect(first.version).toMatch(/^qloo-live-\d{4}-\d{2}-\d{2}$/);
    expect(first.fixtureIdMap?.["qloo:music:radiohead"]).toBeTruthy();
    expect(second).toBe(first);
    const searchCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/search"),
    );
    expect(searchCalls.length).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(searchCalls.length);
  });

  it("falls back to fixtures on 401", async () => {
    const fetchSpy = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const client = new LiveQlooClient(SECRET, fetchSpy);
    const graph = await client.getGraph();
    expect(client.degraded).toBe(true);
    expect(graph.dataSource).toBe("fixture");
    expect(graph.version).toBe(FIXTURE_GRAPH.version);
  });

  it("falls back to fixtures on 500", async () => {
    const fetchSpy = vi.fn(async () => new Response("error", { status: 500 }));
    const client = new LiveQlooClient(SECRET, fetchSpy);
    const graph = await client.getGraph();
    expect(client.degraded).toBe(true);
    expect(graph.entities).toEqual(FIXTURE_GRAPH.entities);
  });

  it("falls back to fixtures on timeout", async () => {
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        }),
    );
    const client = new LiveQlooClient(SECRET, fetchSpy);
    const graph = await client.getGraph();
    expect(client.degraded).toBe(true);
    expect(graph.dataSource).toBe("fixture");
  });

});

describe("loadAppGraph live-fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearLiveGraphCache();
  });

  it("reports live-fallback when the live client degrades", async () => {
    vi.stubEnv("QLOO_API_KEY", SECRET);
    const client = {
      mode: "live" as const,
      degraded: true,
      getGraph: async () => ({ ...FIXTURE_GRAPH, dataSource: "fixture" as const }),
      searchEntities: async () => [],
      logTaste: async () => undefined,
      getProfile: async () => null,
    };
    const loaded = await loadAppGraph(client);
    expect(loaded.mode).toBe("live-fallback");
    expect(loaded.degraded).toBe(true);
    expect(loaded.source).toBe("fixture");
  });
});
