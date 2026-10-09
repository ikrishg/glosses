import { describe, expect, it } from "vitest";
import { QLOO_FOOD_INSIGHTS_TAG } from "@/lib/qloo/food-tags";
import { isOutingActivity, isRestaurantFood } from "@/lib/qloo/entity-filters";
import type { QlooEntity } from "@/lib/qloo/types";

describe("entity filters", () => {
  it("rejects neighbourhoods as restaurant food", () => {
    const littleItaly: QlooEntity = {
      id: "live:little-italy",
      name: "Little Italy",
      domain: "food",
      tags: ["qloo-insight", "urn:tag:genre:place:neighbourhood"],
    };
    expect(isRestaurantFood(littleItaly)).toBe(false);
  });

  it("accepts tagged restaurants", () => {
    const restaurant: QlooEntity = {
      id: "live:jon-vinny",
      name: "Jon & Vinny's",
      domain: "food",
      tags: ["qloo-insight", QLOO_FOOD_INSIGHTS_TAG],
    };
    expect(isRestaurantFood(restaurant)).toBe(true);
  });

  it("treats places as outing activities, not bands", () => {
    const venue: QlooEntity = {
      id: "live:venue",
      name: "Blue Note",
      domain: "places",
      tags: ["qloo-insight"],
    };
    const band: QlooEntity = {
      id: "live:band",
      name: "Radiohead",
      domain: "music",
      tags: ["qloo-insight"],
    };
    expect(isOutingActivity(venue)).toBe(true);
    expect(isOutingActivity(band)).toBe(false);
  });
});
