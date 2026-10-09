import type { RankablePerson } from "@/lib/engine/match";
import type { QlooGraphSnapshot, UserTasteProfile } from "@/lib/qloo/types";
import { entityById as fixtureEntityById } from "@/lib/graph/fixture-graph";
import { buildEntityIndex } from "@/lib/graph/lookup";

interface SeedBlueprint {
  personId: string;
  displayName: string;
  tier: RankablePerson["tier"];
  /** Stable fixture entity IDs; resolved against the active graph at runtime. */
  tasteFixtureIds: string[];
}

const SEED_BLUEPRINTS: SeedBlueprint[] = [
  {
    personId: "person:maya",
    displayName: "Maya (friend)",
    tier: "friend",
    tasteFixtureIds: [
      "qloo:music:radiohead",
      "qloo:film:her",
      "qloo:books:bell-jar",
      "qloo:places:amoeba-hollywood",
    ],
  },
  {
    personId: "person:jordan",
    displayName: "Jordan (friend)",
    tier: "friend",
    tasteFixtureIds: [
      "qloo:music:khruangbin",
      "qloo:film:blade-runner-2049",
      "qloo:places:los-feliz-cinema",
      "qloo:food:jon-vincent",
    ],
  },
  {
    personId: "person:priya",
    displayName: "Priya (friend of a friend)",
    tier: "second_network",
    tasteFixtureIds: [
      "qloo:music:bjork",
      "qloo:film:portrait-lady-fire",
      "qloo:books:ocean-end-lane",
      "qloo:places:brooklyn-botanic",
    ],
  },
  {
    personId: "person:alex",
    displayName: "Alex (stranger)",
    tier: "stranger",
    tasteFixtureIds: [
      "qloo:books:dune",
      "qloo:film:blade-runner-2049",
      "qloo:tv:slow-horses",
      "qloo:places:strand-bookstore",
    ],
  },
];

function profile(
  userId: string,
  displayName: string,
  entityIds: string[],
): UserTasteProfile {
  return {
    userId,
    displayName,
    tastes: entityIds.map((entityId, i) => ({
      entityId,
      weight: 1 - i * 0.08,
      loggedAt: 1_700_000_000_000 - i * 1000,
    })),
  };
}

/**
 * Map a fixture catalog ID to an entity ID present in the active Qloo graph
 * (exact ID match, then domain + display name).
 */
export function resolveEntityIdForGraph(
  graph: QlooGraphSnapshot,
  fixtureEntityId: string,
): string | null {
  const mapped = graph.fixtureIdMap?.[fixtureEntityId];
  if (mapped) {
    return mapped;
  }
  const index = buildEntityIndex(graph);
  if (index.has(fixtureEntityId)) {
    return fixtureEntityId;
  }
  const fixture = fixtureEntityById(fixtureEntityId);
  if (!fixture) {
    return null;
  }
  const byName = graph.entities.find(
    (e) =>
      e.domain === fixture.domain &&
      e.name.toLowerCase() === fixture.name.toLowerCase(),
  );
  return byName?.id ?? null;
}

/** Demo cast with tastes bound to the active graph (mock or live). */
export function buildSeedPeople(graph: QlooGraphSnapshot): RankablePerson[] {
  return SEED_BLUEPRINTS.map((bp) => {
    const entityIds = bp.tasteFixtureIds
      .map((id) => resolveEntityIdForGraph(graph, id))
      .filter((id): id is string => id !== null);
    return {
      personId: bp.personId,
      displayName: bp.displayName,
      tier: bp.tier,
      profile: profile(bp.personId, bp.displayName.replace(/ \(.*\)$/, ""), entityIds),
    };
  });
}
