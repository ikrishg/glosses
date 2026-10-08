import { describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  outingRouteIsValid,
  suggestSharedOuting,
} from "@/lib/engine/outing";
import { SEED_PEOPLE, createEmptyDemoUser } from "@/lib/demo/seed";
import { addTaste } from "@/lib/engine/profile";

describe("suggestSharedOuting", () => {
  it("returns a place and food from blended graph traversal", () => {
    const outing = suggestSharedOuting(
      SEED_PEOPLE[0].profile,
      SEED_PEOPLE[1].profile,
      FIXTURE_GRAPH,
    );
    expect(outing).not.toBeNull();
    expect(outing!.place.domain).toBe("places");
    expect(outing!.food.domain).toBe("food");
    expect(outingRouteIsValid(outing!, FIXTURE_GRAPH)).toBe(true);
  });

  it("pairs food linked to the place (Dune + Maya → Los Feliz → Jon & Vinny's)", () => {
    let viewer = createEmptyDemoUser();
    viewer = addTaste(viewer, "qloo:books:dune");
    const maya = SEED_PEOPLE[0].profile;
    const outing = suggestSharedOuting(viewer, maya, FIXTURE_GRAPH);
    expect(outing).not.toBeNull();
    expect(outing!.place.id).toBe("qloo:places:los-feliz-cinema");
    expect(outing!.food.id).toBe("qloo:food:jon-vincent");
    expect(outingRouteIsValid(outing!, FIXTURE_GRAPH)).toBe(true);
  });

  it("skips a top place without food and uses the next viable place", () => {
    const graph = {
      ...FIXTURE_GRAPH,
      entities: [
        ...FIXTURE_GRAPH.entities,
        {
          id: "qloo:places:no-food-spot",
          name: "No Food Spot",
          domain: "places" as const,
          tags: ["test"],
        },
      ],
      edges: [
        ...FIXTURE_GRAPH.edges,
        {
          fromId: "qloo:books:dune",
          toId: "qloo:places:no-food-spot",
          weight: 0.99,
        },
        {
          fromId: "qloo:places:los-feliz-cinema",
          toId: "qloo:food:jon-vincent",
          weight: 0.85,
        },
      ],
    };

    let viewer = createEmptyDemoUser();
    viewer = addTaste(viewer, "qloo:books:dune");
    const outing = suggestSharedOuting(viewer, SEED_PEOPLE[0].profile, graph);
    expect(outing).not.toBeNull();
    expect(outing!.place.id).not.toBe("qloo:places:no-food-spot");
    expect(outingRouteIsValid(outing!, graph)).toBe(true);
  });

  it("does not show film activity linked only to the place (Slow Horses + Maya)", () => {
    let viewer = createEmptyDemoUser();
    viewer = addTaste(viewer, "qloo:tv:slow-horses");
    const maya = SEED_PEOPLE[0].profile;
    const outing = suggestSharedOuting(viewer, maya, FIXTURE_GRAPH);
    expect(outing).not.toBeNull();
    expect(outing!.place.id).toBe("qloo:places:strand-bookstore");
    expect(outing!.food.id).toBe("qloo:food:superiority-burger");
    expect(outing!.activity).toBeUndefined();
    expect(outingRouteIsValid(outing!, FIXTURE_GRAPH)).toBe(true);
  });
});
