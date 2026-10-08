import { describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { buildSeedPeople } from "@/lib/demo/seed-people";
import { entityInGraph } from "@/lib/graph/lookup";
import { blendProfiles } from "@/lib/engine/blend";
import { createEmptyDemoUser } from "@/lib/demo/seed";
import { tasteMatchScore } from "@/lib/engine/match";
import type { QlooGraphSnapshot } from "@/lib/qloo/types";

function remapFixtureGraphIds(graph: QlooGraphSnapshot): QlooGraphSnapshot {
  const remap = (id: string) => id.replace(/^qloo:/, "live:");
  return {
    version: "live-remapped-v1",
    entities: graph.entities.map((e) => ({ ...e, id: remap(e.id) })),
    edges: graph.edges.map((e) => ({
      fromId: remap(e.fromId),
      toId: remap(e.toId),
      weight: e.weight,
    })),
  };
}

describe("buildSeedPeople", () => {
  it("resolves friend tastes onto a live graph with different entity IDs", () => {
    const liveGraph = remapFixtureGraphIds(FIXTURE_GRAPH);
    const people = buildSeedPeople(liveGraph);
    const maya = people[0];

    expect(maya.profile.tastes.length).toBeGreaterThan(0);
    for (const taste of maya.profile.tastes) {
      expect(entityInGraph(liveGraph, taste.entityId)).toBeDefined();
      expect(taste.entityId.startsWith("live:")).toBe(true);
    }
  });

  it("lets resolved friend tastes affect match and blend in live-shaped graphs", () => {
    const liveGraph = remapFixtureGraphIds(FIXTURE_GRAPH);
    const people = buildSeedPeople(liveGraph);
    const maya = people[0];

    let viewer = createEmptyDemoUser();
    viewer = {
      ...viewer,
      tastes: [
        {
          entityId: liveGraph.entities.find((e) => e.name === "Radiohead")!.id,
          weight: 1,
          loggedAt: 1,
        },
      ],
    };

    const { score } = tasteMatchScore(viewer, maya.profile, liveGraph);
    expect(score).toBeGreaterThan(0);

    const blend = blendProfiles([viewer, maya.profile]);
    expect(blend.tastes.length).toBeGreaterThan(0);
  });
});
