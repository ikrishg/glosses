import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  __testSetVercelRuntimeCache,
  applyPersistedState,
  getMemoryLiveGraphStore,
  loadSharedLiveGraphState,
  persistSharedLiveGraphState,
  resetMemoryLiveGraphStore,
  snapshotPersistedState,
} from "@/lib/qloo/live-graph-store";
import { clearLiveGraphCache } from "@/lib/qloo/live-graph";

describe("live graph shared cache", () => {
  afterEach(() => {
    clearLiveGraphCache();
    __testSetVercelRuntimeCache(null);
  });

  it("shares ready graph state through the runtime cache backing", async () => {
    const remote = new Map<string, unknown>();
    __testSetVercelRuntimeCache({
      get: async (key) => remote.get(key) ?? null,
      set: async (key, value) => {
        remote.set(key, value);
      },
      delete: async (key) => {
        remote.delete(key);
      },
    });

    const store = getMemoryLiveGraphStore();
    store.readyCache = {
      graph: { ...FIXTURE_GRAPH, dataSource: "live", version: "shared-v1" },
      expiresAt: Date.now() + 60_000,
    };
    store.lastStatus = "ready";
    await persistSharedLiveGraphState();

    resetMemoryLiveGraphStore();
    expect(getMemoryLiveGraphStore().readyCache).toBeNull();

    await loadSharedLiveGraphState();
    expect(getMemoryLiveGraphStore().readyCache?.graph.version).toBe(
      "shared-v1",
    );
    expect(getMemoryLiveGraphStore().lastStatus).toBe("ready");
  });

  it("round-trips partial build progress", () => {
    const mem = getMemoryLiveGraphStore();
    mem.partial = {
      fixtureIdMap: { "qloo:music:radiohead": "live-1" },
      entities: [],
      edges: [],
      searchedFixtures: new Set(["qloo:music:radiohead"]),
      insightsJobsDone: new Set(["urn:entity:movie"]),
    };
    const snap = snapshotPersistedState(mem);
    resetMemoryLiveGraphStore();
    applyPersistedState(getMemoryLiveGraphStore(), snap);
    expect(
      getMemoryLiveGraphStore().partial?.insightsJobsDone.has(
        "urn:entity:movie",
      ),
    ).toBe(true);
  });
});
