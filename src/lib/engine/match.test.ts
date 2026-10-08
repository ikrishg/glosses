import { describe, expect, it } from "vitest";
import { rankPeopleByTaste, tasteMatchScore } from "@/lib/engine/match";
import {
  createEmptyDemoUser,
  SEED_PEOPLE,
} from "@/lib/demo/seed";
import { addTaste } from "@/lib/engine/profile";

describe("tasteMatchScore", () => {
  it("scores higher when tastes overlap", () => {
    const viewer = createEmptyDemoUser();
    const withRadiohead = addTaste(viewer, "qloo:music:radiohead");
    const maya = SEED_PEOPLE[0].profile;
    const { score: high } = tasteMatchScore(withRadiohead, maya);
    const { score: low } = tasteMatchScore(withRadiohead, SEED_PEOPLE[3].profile);
    expect(high).toBeGreaterThan(low);
  });
});

describe("rankPeopleByTaste", () => {
  it("prefers friends over second network and strangers at equal scores", () => {
    const viewer = createEmptyDemoUser();
    const ranked = rankPeopleByTaste(viewer, SEED_PEOPLE);
    const tiers = ranked.map((r) => r.tier);
    const firstStranger = tiers.indexOf("stranger");
    const lastFriend = tiers.lastIndexOf("friend");
    expect(lastFriend).toBeLessThan(firstStranger);
  });

  it("orders friends by match score within tier", () => {
    let viewer = createEmptyDemoUser();
    viewer = addTaste(viewer, "qloo:music:radiohead");
    viewer = addTaste(viewer, "qloo:film:her");
    const ranked = rankPeopleByTaste(viewer, SEED_PEOPLE);
    const friends = ranked.filter((r) => r.tier === "friend");
    expect(friends[0].displayName).toContain("Maya");
  });
});
