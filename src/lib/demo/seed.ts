import type { RankablePerson } from "@/lib/engine/match";
import type { UserTasteProfile as Profile } from "@/lib/qloo/types";

export const DEMO_USER_ID = "user:demo";

export function createEmptyDemoUser(displayName = "You"): Profile {
  return {
    userId: DEMO_USER_ID,
    displayName,
    tastes: [],
  };
}

function profile(
  userId: string,
  displayName: string,
  entityIds: string[],
): Profile {
  return {
    userId,
    displayName,
    tastes: entityIds.map((entityId, i) => ({
      entityId,
      weight: 1 - i * 0.08,
      loggedAt: Date.now() - i * 1000,
    })),
  };
}

/** Seeded cast for filming the friend loop. */
export const SEED_PEOPLE: RankablePerson[] = [
  {
    personId: "person:maya",
    displayName: "Maya (friend)",
    tier: "friend",
    profile: profile("person:maya", "Maya", [
      "qloo:music:radiohead",
      "qloo:film:her",
      "qloo:books:bell-jar",
      "qloo:places:amoeba-hollywood",
    ]),
  },
  {
    personId: "person:jordan",
    displayName: "Jordan (friend)",
    tier: "friend",
    profile: profile("person:jordan", "Jordan", [
      "qloo:music:khruangbin",
      "qloo:film:blade-runner-2049",
      "qloo:places:los-feliz-cinema",
      "qloo:food:jon-vincent",
    ]),
  },
  {
    personId: "person:priya",
    displayName: "Priya (friend of a friend)",
    tier: "second_network",
    profile: profile("person:priya", "Priya", [
      "qloo:music:bjork",
      "qloo:film:portrait-lady-fire",
      "qloo:books:ocean-end-lane",
      "qloo:places:brooklyn-botanic",
    ]),
  },
  {
    personId: "person:alex",
    displayName: "Alex (stranger)",
    tier: "stranger",
    profile: profile("person:alex", "Alex", [
      "qloo:books:dune",
      "qloo:film:blade-runner-2049",
      "qloo:tv:slow-horses",
      "qloo:places:strand-bookstore",
    ]),
  },
];

export const HOBBIT_TAGLINE =
  "Taste-driven social discovery — find your people through the graph, not the feed.";
