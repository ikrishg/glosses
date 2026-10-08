import type { RankablePerson } from "@/lib/engine/match";
import type { UserTasteProfile as Profile } from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { buildSeedPeople } from "@/lib/demo/seed-people";

export const DEMO_USER_ID = "user:demo";

export function createEmptyDemoUser(displayName = "You"): Profile {
  return {
    userId: DEMO_USER_ID,
    displayName,
    tastes: [],
  };
}

/** Seeded cast for filming the friend loop (fixture graph). */
export const SEED_PEOPLE: RankablePerson[] = buildSeedPeople(FIXTURE_GRAPH);

export { buildSeedPeople, resolveEntityIdForGraph } from "@/lib/demo/seed-people";

export const HOBBIT_TAGLINE =
  "Taste-driven social discovery — find your people through the graph, not the feed.";
