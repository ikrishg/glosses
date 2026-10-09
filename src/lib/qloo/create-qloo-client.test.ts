import { describe, expect, it } from "vitest";
import { mapSearchRow } from "@/lib/qloo/create-qloo-client";
import { QLOO_FOOD_INSIGHTS_TAG } from "@/lib/qloo/food-tags";

describe("mapSearchRow", () => {
  it("labels food domain search hits as food, not places", () => {
    const entity = mapSearchRow(
      {
        entity_id: "live-1",
        name: "Jon & Vinny's",
        types: ["urn:entity:place"],
        tags: [],
      },
      "food",
    );
    expect(entity.domain).toBe("food");
    expect(entity.tags).toContain(QLOO_FOOD_INSIGHTS_TAG);
  });
});
