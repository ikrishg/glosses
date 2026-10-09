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

  it("returns the same cached live graph on repeated getGraph when the background build is ready", async () => {
    const { __testSetLiveGraphReady } = await import("@/lib/qloo/live-graph");
    const liveGraph = {
      version: "qloo-live-2026-10-09",
      entities: FIXTURE_GRAPH.entities,
      edges: FIXTURE_GRAPH.edges,
      dataSource: "live" as const,
      fixtureIdMap: { "qloo:music:radiohead": "live-entity-1" },
    };
    __testSetLiveGraphReady(liveGraph);
    const client = new LiveQlooClient(SECRET, vi.fn());
    const first = await client.getGraph();
    const second = await client.getGraph();
    expect(first.dataSource).toBe("live");
    expect(first.fixtureIdMap?.["qloo:music:radiohead"]).toBe("live-entity-1");
    expect(second).toBe(first);
  });

  it("serves fixtures on the request path while the graph warms", async () => {
    const fetchSpy = vi.fn(
      () => new Promise<Response>(() => {
        /* never resolves during test */
      }),
    );
    const client = new LiveQlooClient(SECRET, fetchSpy);
    const graph = await client.getGraph();
    expect(client.degraded).toBe(false);
    expect(graph.dataSource).toBe("fixture");
    expect(graph.version).toBe(FIXTURE_GRAPH.version);
  });

});

describe("loadAppGraph live-fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearLiveGraphCache();
  });

  it("reports live-fallback when the live graph is degraded", async () => {
    vi.stubEnv("QLOO_API_KEY", SECRET);
    clearLiveGraphCache();
    const { __testSetLiveGraphStatus } = await import("@/lib/qloo/live-graph");
    __testSetLiveGraphStatus("degraded");
    const client = {
      mode: "live" as const,
      degraded: false,
      searchDataSource: "fixture" as const,
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
