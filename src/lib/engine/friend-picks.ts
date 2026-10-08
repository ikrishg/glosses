import type { QlooGraphSnapshot, UserTasteProfile } from "@/lib/qloo/types";
import type { RankablePerson } from "@/lib/engine/match";
import { tasteMatchScore } from "@/lib/engine/match";
import { recommendNextThing } from "@/lib/engine/recommend";
import { suggestSharedOuting } from "@/lib/engine/outing";
import { buildEntityIndex } from "@/lib/graph/lookup";
import { tasteEntitySet } from "@/lib/engine/profile";

export interface TasteTwinPick {
  personId: string;
  displayName: string;
  /** Entities both of you logged. */
  sharedEntityIds: string[];
  /** The viewer's top next-thing pick, when it is already on this person's list. */
  sharedNextThingId: string | null;
  reason: string;
}

export interface RouteContribution {
  stopId: string;
  owner: "viewer" | "person";
  /** The logged entity that leads to the stop (the stop itself when logged). */
  viaEntityId: string;
}

export interface OutingBlendPick {
  personId: string;
  displayName: string;
  placeId: string;
  foodId: string;
  contributions: RouteContribution[];
  reason: string;
}

export interface FriendPicks {
  tasteTwin: TasteTwinPick | null;
  outingBlend: OutingBlendPick | null;
}

function shortName(person: RankablePerson): string {
  return person.displayName.replace(/ \(.*\)$/, "");
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Strongest link from a profile's logged tastes to `stopId` (1 when logged directly). */
function strongestLink(
  profile: UserTasteProfile,
  stopId: string,
  graph: QlooGraphSnapshot,
): { viaEntityId: string; weight: number } | null {
  const logged = tasteEntitySet(profile);
  if (logged.has(stopId)) return { viaEntityId: stopId, weight: 1 };
  let best: { viaEntityId: string; weight: number } | null = null;
  for (const edge of graph.edges) {
    const via =
      edge.toId === stopId ? edge.fromId : edge.fromId === stopId ? edge.toId : null;
    if (!via || !logged.has(via)) continue;
    if (!best || edge.weight > best.weight) {
      best = { viaEntityId: via, weight: edge.weight };
    }
  }
  return best;
}

/** Highest taste match, ignoring tier — the person whose logged picks overlap yours most. */
export function pickTasteTwin(
  viewer: UserTasteProfile,
  people: RankablePerson[],
  graph: QlooGraphSnapshot,
): TasteTwinPick | null {
  let best: { person: RankablePerson; score: number; shared: string[] } | null =
    null;
  for (const person of people) {
    const { score, sharedEntityIds } = tasteMatchScore(
      viewer,
      person.profile,
      graph,
    );
    if (sharedEntityIds.length === 0) continue;
    if (!best || score > best.score) {
      best = { person, score, shared: sharedEntityIds };
    }
  }
  if (!best) return null;

  const index = buildEntityIndex(graph);
  const topNext = recommendNextThing(viewer, graph, 1)[0]?.entity;
  const sharedNextThingId =
    topNext && tasteEntitySet(best.person.profile).has(topNext.id)
      ? topNext.id
      : null;
  const sharedNames = best.shared.map((id) => index.get(id)?.name ?? id);
  const reason = sharedNextThingId
    ? `Shares ${joinNames(sharedNames)}, and already has ${topNext!.name} — your top next thing.`
    : `Shares ${joinNames(sharedNames)}.`;

  return {
    personId: best.person.personId,
    displayName: shortName(best.person),
    sharedEntityIds: best.shared,
    sharedNextThingId,
    reason,
  };
}

/**
 * The person whose own picks complete a shared outing route that your picks start:
 * each route stop (place, food) is credited to whoever links to it most strongly,
 * and only routes with stops from both sides qualify.
 */
export function pickOutingBlend(
  viewer: UserTasteProfile,
  people: RankablePerson[],
  graph: QlooGraphSnapshot,
): OutingBlendPick | null {
  const index = buildEntityIndex(graph);
  let best: { pick: OutingBlendPick; score: number } | null = null;

  for (const person of people) {
    const outing = suggestSharedOuting(viewer, person.profile, graph);
    if (!outing) continue;

    const contributions: RouteContribution[] = [];
    for (const stop of [outing.place, outing.food]) {
      const mine = strongestLink(viewer, stop.id, graph);
      const theirs = strongestLink(person.profile, stop.id, graph);
      if (theirs && (!mine || theirs.weight > mine.weight)) {
        contributions.push({ stopId: stop.id, owner: "person", viaEntityId: theirs.viaEntityId });
      } else if (mine) {
        contributions.push({ stopId: stop.id, owner: "viewer", viaEntityId: mine.viaEntityId });
      }
    }
    const owners = new Set(contributions.map((c) => c.owner));
    if (!owners.has("viewer") || !owners.has("person")) continue;

    const name = shortName(person);
    const parts = contributions.map((c) => {
      const owner = c.owner === "viewer" ? "your" : `${name}'s`;
      const via = index.get(c.viaEntityId)?.name ?? c.viaEntityId;
      const stop = index.get(c.stopId)?.name ?? c.stopId;
      return c.viaEntityId === c.stopId ? `${owner} ${via}` : `${owner} ${via} (→ ${stop})`;
    });
    const pick: OutingBlendPick = {
      personId: person.personId,
      displayName: name,
      placeId: outing.place.id,
      foodId: outing.food.id,
      contributions,
      reason: `Complementary picks: ${parts.join(" + ")} make the ${outing.place.name} → ${outing.food.name} outing.`,
    };
    if (!best || outing.score > best.score) {
      best = { pick, score: outing.score };
    }
  }
  return best?.pick ?? null;
}

export function pickFriends(
  viewer: UserTasteProfile,
  people: RankablePerson[],
  graph: QlooGraphSnapshot,
): FriendPicks {
  return {
    tasteTwin: pickTasteTwin(viewer, people, graph),
    outingBlend: pickOutingBlend(viewer, people, graph),
  };
}
