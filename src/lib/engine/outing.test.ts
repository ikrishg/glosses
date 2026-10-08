import { describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  outingUsesCoherentRoute,
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
    expect(outingUsesCoherentRoute(outing!, FIXTURE_GRAPH)).toBe(true);
  });

  it("pairs food linked to the place (Dune + Maya → Los Feliz → Jon & Vinny's)", () => {
    let viewer = createEmptyDemoUser();
    viewer = addTaste(viewer, "qloo:books:dune");
    const maya = SEED_PEOPLE[0].profile;
    const outing = suggestSharedOuting(viewer, maya, FIXTURE_GRAPH);
    expect(outing).not.toBeNull();
    expect(outing!.place.id).toBe("qloo:places:los-feliz-cinema");
    expect(outing!.food.id).toBe("qloo:food:jon-vincent");
    expect(outingUsesCoherentRoute(outing!, FIXTURE_GRAPH)).toBe(true);
  });
});
