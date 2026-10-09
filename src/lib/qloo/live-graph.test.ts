import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  buildLiveGraphSnapshot,
  clearLiveGraphCache,
  getCachedLiveGraph,
  mapWithConcurrency,
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

describe("mapWithConcurrency", () => {
  it("caps parallel workers", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const deadline = Date.now() + 5000;
    await mapWithConcurrency(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      deadline,
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return 1;
      },
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("stops scheduling when the time budget is exceeded", async () => {
    const deadline = Date.now() + 5;
    const started = await mapWithConcurrency(
      Array.from({ length: 40 }, (_, i) => i),
      6,
      deadline,
      async (n) => {
        await new Promise((r) => setTimeout(r, 20));
        return n;
      },
    );
    const completed = started.filter((v) => v !== undefined).length;
    expect(completed).toBeLessThan(40);
  });
});

describe("buildLiveGraphSnapshot", () => {
  afterEach(() => {
    clearLiveGraphCache();
    vi.unstubAllGlobals();
  });

  it("skips insights 400 for rejected seeds without failing the build", async () => {
    const badSeedId = "bad-seed-id";
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search")) {
        const name = new URL(url).searchParams.get("query") ?? "";
        const id = name === "The Bell Jar" ? badSeedId : `id-${name}`;
        return new Response(JSON.stringify(okSearch(name, id)), { status: 200 });
      }
      const fromId = new URL(url).searchParams.get("signal.interests.entities");
      if (fromId === badSeedId) {
        return new Response("invalid signal", { status: 400 });
      }
      return new Response(
        JSON.stringify({
          success: true,
          results: { entities: [] },
        }),
        { status: 200 },
      );
    });

    const graph = await buildLiveGraphSnapshot({
      apiKey: SECRET,
      fetchImpl: fetchSpy,
    });
    expect(graph.dataSource).toBe("live");
    expect(graph.entities.length).toBeGreaterThanOrEqual(
      Math.ceil(FIXTURE_GRAPH.entities.length * 0.2),
    );
    const insightsCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/v2/insights"),
    );
    const badCalls = insightsCalls.filter((c) =>
      String(c[0]).includes(badSeedId),
    );
    expect(badCalls.length).toBeGreaterThan(0);
    expect(badCalls.length).toBeLessThan(insightsCalls.length);
  });

  it("clears inflight after a failed build so a later attempt can retry", async () => {
    let calls = 0;
    const fetchSpy = vi.fn(async () => {
      calls += 1;
      return new Response("nope", { status: 500 });
    });
    const opts = { apiKey: SECRET, fetchImpl: fetchSpy };

    await expect(getCachedLiveGraph(opts)).rejects.toBeDefined();
    const afterFirstBuild = calls;
    clearLiveGraphCache();
    await expect(getCachedLiveGraph(opts)).rejects.toBeDefined();
    expect(calls).toBeGreaterThan(afterFirstBuild);
  });
});
