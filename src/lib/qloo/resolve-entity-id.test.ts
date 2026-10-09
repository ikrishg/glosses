import { describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  normalizeProfileForLiveGraph,
  resolveEntityIdForLiveGraph,
} from "@/lib/qloo/resolve-entity-id";
import { createEmptyDemoUser } from "@/lib/demo/seed";
import { addTaste } from "@/lib/engine/profile";

describe("resolveEntityIdForLiveGraph", () => {
  it("maps fixture ids through fixtureIdMap on live graphs", () => {
    const graph = {
      ...FIXTURE_GRAPH,
      dataSource: "live" as const,
      fixtureIdMap: { "qloo:music:radiohead": "live-radiohead-uuid" },
    };
    expect(
      resolveEntityIdForLiveGraph(graph, "qloo:music:radiohead"),
    ).toBe("live-radiohead-uuid");
    expect(
      resolveEntityIdForLiveGraph(graph, "qloo:music:radiohead"),
    ).toBe("live-radiohead-uuid");
  });

  it("normalizes profile tastes for recommend", () => {
    const graph = {
      ...FIXTURE_GRAPH,
      dataSource: "live" as const,
      fixtureIdMap: { "qloo:film:her": "live-her" },
    };
    const profile = addTaste(createEmptyDemoUser(), "qloo:film:her");
    const normalized = normalizeProfileForLiveGraph(profile, graph);
    expect(normalized.tastes[0].entityId).toBe("live-her");
  });
});
