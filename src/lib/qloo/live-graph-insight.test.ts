import { describe, expect, it } from "vitest";
import { QLOO_FOOD_INSIGHTS_TAG } from "@/lib/qloo/food-tags";
import {
  applyFoodInsightMerge,
  linkPlaceFoodInsightPairs,
} from "@/lib/qloo/live-graph";
import type { QlooEntity } from "@/lib/qloo/types";

describe("applyFoodInsightMerge", () => {
  const basePlace: QlooEntity = {
    id: "insight-1",
    name: "Restaurant",
    domain: "places",
    tags: ["qloo-insight"],
  };

  it("adds restaurant tag when food job merges onto a places insight entity", () => {
    const entity = { ...basePlace, tags: [...basePlace.tags] };
    applyFoodInsightMerge(entity, "food");
    expect(entity.domain).toBe("food");
    expect(entity.tags).toContain(QLOO_FOOD_INSIGHTS_TAG);
  });

  it("preserves restaurant tag when food job arrives before places job", () => {
    const entity: QlooEntity = {
      id: "insight-1",
      name: "Restaurant",
      domain: "food",
      tags: ["qloo-insight", QLOO_FOOD_INSIGHTS_TAG],
    };
    applyFoodInsightMerge(entity, "places");
    expect(entity.domain).toBe("food");
    expect(entity.tags).toContain(QLOO_FOOD_INSIGHTS_TAG);
  });
});

describe("linkPlaceFoodInsightPairs", () => {
  it("links place and restaurant food that share a signalling seed", () => {
    const state = {
      fixtureIdMap: {},
      entities: [
        {
          id: "place-1",
          name: "Venue",
          domain: "places" as const,
          tags: ["qloo-insight"],
        },
        {
          id: "food-1",
          name: "Eatery",
          domain: "food" as const,
          tags: ["qloo-insight", QLOO_FOOD_INSIGHTS_TAG],
        },
      ],
      edges: [
        { fromId: "seed-a", toId: "place-1", weight: 0.9 },
        { fromId: "seed-a", toId: "food-1", weight: 0.9 },
      ],
      searchedFixtures: new Set<string>(),
      insightsJobsDone: new Set<string>(),
    };
    const edgeKeys = new Set(state.edges.map((e) => `${e.fromId}->${e.toId}`));
    linkPlaceFoodInsightPairs(state, edgeKeys);
    expect(
      state.edges.some(
        (e) => e.fromId === "place-1" && e.toId === "food-1",
      ),
    ).toBe(true);
  });
});
