import { describe, expect, it } from "vitest";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { createEmptyDemoUser, SEED_PEOPLE } from "@/lib/demo/seed";
import { addTaste } from "@/lib/engine/profile";
import { pickFriends, pickOutingBlend, pickTasteTwin } from "@/lib/engine/friend-picks";
import type { QlooGraphSnapshot } from "@/lib/qloo/types";

const demoViewer = [
  "qloo:music:radiohead",
  "qloo:film:her",
  "qloo:places:los-feliz-cinema",
].reduce(addTaste, createEmptyDemoUser());

describe("pickFriends on the demo profile", () => {
  it("names Maya the taste twin with graph-derived shared items", () => {
    const twin = pickTasteTwin(demoViewer, SEED_PEOPLE, FIXTURE_GRAPH);
    expect(twin?.personId).toBe("person:maya");
    expect(twin?.displayName).toBe("Maya");
    expect(twin?.sharedEntityIds).toEqual([
      "qloo:music:radiohead",
      "qloo:film:her",
    ]);
    expect(twin?.sharedNextThingId).toBe("qloo:books:bell-jar");
    expect(twin?.reason).toBe(
      "Shares Radiohead and Her, and already has The Bell Jar — your top next thing.",
    );
  });

  it("names Jordan the best outing blend from complementary route picks", () => {
    const blend = pickOutingBlend(demoViewer, SEED_PEOPLE, FIXTURE_GRAPH);
    expect(blend?.personId).toBe("person:jordan");
    expect(blend?.placeId).toBe("qloo:places:amoeba-hollywood");
    expect(blend?.foodId).toBe("qloo:food:jon-vincent");
    expect(blend?.contributions).toEqual([
      {
        stopId: "qloo:places:amoeba-hollywood",
        owner: "viewer",
        viaEntityId: "qloo:music:radiohead",
      },
      {
        stopId: "qloo:food:jon-vincent",
        owner: "person",
        viaEntityId: "qloo:food:jon-vincent",
      },
    ]);
    expect(blend?.reason).toBe(
      "Complementary picks: your Radiohead (→ Amoeba Hollywood) + Jordan's Jon & Vinny's make the Amoeba Hollywood → Jon & Vinny's outing.",
    );
  });

  it("skips people whose outing route comes only from your own picks", () => {
    const withoutJordan = SEED_PEOPLE.filter((p) => p.personId !== "person:jordan");
    expect(pickOutingBlend(demoViewer, withoutJordan, FIXTURE_GRAPH)).toBeNull();
  });

  it("returns no picks before anything is logged", () => {
    expect(pickFriends(createEmptyDemoUser(), SEED_PEOPLE, FIXTURE_GRAPH)).toEqual({
      tasteTwin: null,
      outingBlend: null,
    });
  });

  it("reads names from the active graph, not the fixture copy", () => {
    const renamed: QlooGraphSnapshot = {
      ...FIXTURE_GRAPH,
      entities: FIXTURE_GRAPH.entities.map((e) =>
        e.id === "qloo:music:radiohead" ? { ...e, name: "Radiohead (live)" } : e,
      ),
    };
    const picks = pickFriends(demoViewer, SEED_PEOPLE, renamed);
    expect(picks.tasteTwin?.reason).toMatch(/^Shares Radiohead \(live\) and Her/);
    expect(picks.outingBlend?.reason).toContain("your Radiohead (live)");
  });
});
