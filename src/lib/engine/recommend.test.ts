import { describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { recommendNextThing } from "@/lib/engine/recommend";
import { createEmptyDemoUser } from "@/lib/demo/seed";
import { addTaste } from "@/lib/engine/profile";

describe("recommendNextThing", () => {
  it("returns cross-domain picks from graph edges, not logged entities", () => {
    let profile = createEmptyDemoUser();
    profile = addTaste(profile, "qloo:music:radiohead");

    const recs = recommendNextThing(profile, FIXTURE_GRAPH, 5);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].entity.domain).not.toBe("music");
    expect(recs.some((r) => r.entity.id === "qloo:film:her")).toBe(true);
    expect(recs.every((r) => r.entity.id !== "qloo:music:radiohead")).toBe(true);
  });

  it("is stable for the same profile and graph version", () => {
    let profile = createEmptyDemoUser();
    profile = addTaste(profile, "qloo:music:khruangbin");
    const a = recommendNextThing(profile, FIXTURE_GRAPH, 1)[0]?.entity.id;
    const b = recommendNextThing(profile, FIXTURE_GRAPH, 1)[0]?.entity.id;
    expect(a).toBe(b);
  });
});
