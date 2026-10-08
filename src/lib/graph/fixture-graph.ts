import type { QlooGraphSnapshot, QlooEntity } from "@/lib/qloo/types";

/**
 * Fixture graph mimicking Qloo cross-domain affinities.
 * Recommendation outputs depend on these opaque IDs/weights — not inferable from quiz labels alone.
 */
export const FIXTURE_GRAPH: QlooGraphSnapshot = {
  version: "qloo-fixture-oct30-v1",
  entities: [
    // Music
    {
      id: "qloo:music:radiohead",
      name: "Radiohead",
      domain: "music",
      tags: ["art-rock", "melancholy", "experimental"],
    },
    {
      id: "qloo:music:khruangbin",
      name: "Khruangbin",
      domain: "music",
      tags: ["instrumental", "groove", "cosmic"],
    },
    {
      id: "qloo:music:bjork",
      name: "Björk",
      domain: "music",
      tags: ["art-pop", "iceland", "avant"],
    },
    // Film
    {
      id: "qloo:film:her",
      name: "Her",
      domain: "film",
      tags: ["intimate", "near-future", "loneliness"],
    },
    {
      id: "qloo:film:blade-runner-2049",
      name: "Blade Runner 2049",
      domain: "film",
      tags: ["neo-noir", "visual", "dystopia"],
    },
    {
      id: "qloo:film:portrait-lady-fire",
      name: "Portrait of a Lady on Fire",
      domain: "film",
      tags: ["period", "slow-burn", "art"],
    },
    // Books
    {
      id: "qloo:books:bell-jar",
      name: "The Bell Jar",
      domain: "books",
      tags: ["literary", "interior", "1960s"],
    },
    {
      id: "qloo:books:dune",
      name: "Dune",
      domain: "books",
      tags: ["epic", "ecology", "politics"],
    },
    {
      id: "qloo:books:ocean-end-lane",
      name: "The Ocean at the End of the Lane",
      domain: "books",
      tags: ["mythic", "memory", "english-countryside"],
    },
    // Places
    {
      id: "qloo:places:los-feliz-cinema",
      name: "Los Feliz 3",
      domain: "places",
      tags: ["indie-cinema", "la", "matinee"],
    },
    {
      id: "qloo:places:strand-bookstore",
      name: "The Strand",
      domain: "places",
      tags: ["bookstore", "nyc", "used-books"],
    },
    {
      id: "qloo:places:brooklyn-botanic",
      name: "Brooklyn Botanic Garden",
      domain: "places",
      tags: ["garden", "quiet", "seasonal"],
    },
    {
      id: "qloo:places:amoeba-hollywood",
      name: "Amoeba Hollywood",
      domain: "places",
      tags: ["record-store", "la", "digging"],
    },
    // Food
    {
      id: "qloo:food:jon-vincent",
      name: "Jon & Vinny's",
      domain: "food",
      tags: ["italian", "la", "natural-wine"],
    },
    {
      id: "qloo:food:superiority-burger",
      name: "Superiority Burger",
      domain: "food",
      tags: ["vegetarian", "east-village", "casual"],
    },
    {
      id: "qloo:food:fish-cheeks",
      name: "Fish Cheeks",
      domain: "food",
      tags: ["thai", "noho", "sharing"],
    },
    // TV
    {
      id: "qloo:tv:severance",
      name: "Severance",
      domain: "tv",
      tags: ["workplace", "uncanny", "minimal"],
    },
    {
      id: "qloo:tv:slow-horses",
      name: "Slow Horses",
      domain: "tv",
      tags: ["spy", "dry", "london"],
    },
  ],
  edges: [
    { fromId: "qloo:music:radiohead", toId: "qloo:film:her", weight: 0.91 },
    { fromId: "qloo:music:radiohead", toId: "qloo:books:bell-jar", weight: 0.84 },
    { fromId: "qloo:music:radiohead", toId: "qloo:places:amoeba-hollywood", weight: 0.77 },
    { fromId: "qloo:music:radiohead", toId: "qloo:food:superiority-burger", weight: 0.62 },
    { fromId: "qloo:music:khruangbin", toId: "qloo:film:blade-runner-2049", weight: 0.88 },
    { fromId: "qloo:music:khruangbin", toId: "qloo:places:los-feliz-cinema", weight: 0.8 },
    { fromId: "qloo:music:khruangbin", toId: "qloo:food:jon-vincent", weight: 0.75 },
    { fromId: "qloo:music:bjork", toId: "qloo:film:portrait-lady-fire", weight: 0.86 },
    { fromId: "qloo:music:bjork", toId: "qloo:books:ocean-end-lane", weight: 0.83 },
    { fromId: "qloo:music:bjork", toId: "qloo:places:brooklyn-botanic", weight: 0.71 },
    { fromId: "qloo:film:her", toId: "qloo:books:bell-jar", weight: 0.79 },
    { fromId: "qloo:film:her", toId: "qloo:tv:severance", weight: 0.74 },
    { fromId: "qloo:film:blade-runner-2049", toId: "qloo:books:dune", weight: 0.82 },
    { fromId: "qloo:film:portrait-lady-fire", toId: "qloo:places:strand-bookstore", weight: 0.78 },
    { fromId: "qloo:books:dune", toId: "qloo:places:los-feliz-cinema", weight: 0.65 },
    { fromId: "qloo:books:ocean-end-lane", toId: "qloo:food:fish-cheeks", weight: 0.7 },
    { fromId: "qloo:places:los-feliz-cinema", toId: "qloo:food:jon-vincent", weight: 0.85 },
    { fromId: "qloo:places:strand-bookstore", toId: "qloo:food:superiority-burger", weight: 0.81 },
    { fromId: "qloo:places:brooklyn-botanic", toId: "qloo:food:fish-cheeks", weight: 0.68 },
    { fromId: "qloo:places:amoeba-hollywood", toId: "qloo:food:jon-vincent", weight: 0.72 },
    { fromId: "qloo:tv:slow-horses", toId: "qloo:places:strand-bookstore", weight: 0.66 },
    { fromId: "qloo:tv:severance", toId: "qloo:food:superiority-burger", weight: 0.59 },
  ],
};

export function entityById(id: string): QlooEntity | undefined {
  return FIXTURE_GRAPH.entities.find((e) => e.id === id);
}

export function entitiesByDomain(
  domain: QlooEntity["domain"],
): QlooEntity[] {
  return FIXTURE_GRAPH.entities.filter((e) => e.domain === domain);
}
