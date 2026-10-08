import { describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { suggestSharedOuting } from "@/lib/engine/outing";
import { SEED_PEOPLE } from "@/lib/demo/seed";

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
  });
});
