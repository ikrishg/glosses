import { afterEach, describe, expect, it } from "vitest";
import {
  applyPersistedState,
  getMemoryLiveGraphStore,
  resetMemoryLiveGraphStore,
  snapshotPersistedState,
} from "@/lib/qloo/live-graph-store";
import { clearLiveGraphCache } from "@/lib/qloo/live-graph";

describe("live graph memory store", () => {
  afterEach(() => {
    clearLiveGraphCache();
  });

  it("round-trips partial build progress in memory", () => {
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
