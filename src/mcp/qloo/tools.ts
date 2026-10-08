import { z } from "zod";
import type { QlooClient } from "@/lib/qloo/client";
import type { UserTasteProfile } from "@/lib/qloo/types";
import { recommendNextThing } from "@/lib/engine/recommend";
import { rankPeopleByTaste, type RankablePerson } from "@/lib/engine/match";
import { blendProfiles, blendedAsProfile } from "@/lib/engine/blend";
import { suggestSharedOuting } from "@/lib/engine/outing";

export const QLOO_TOOL_NAMES = [
  "search_entities",
  "recommend",
  "compare_taste",
] as const;
export type QlooToolName = (typeof QLOO_TOOL_NAMES)[number];

const domainSchema = z.enum(["music", "film", "books", "places", "food", "tv"]);

const entitySchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: domainSchema,
  tags: z.array(z.string()),
});

const tasteSignalSchema = z.object({
  entityId: z.string(),
  weight: z.number().min(0).max(1),
  loggedAt: z.number().optional(),
});

const profileSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  tastes: z.array(tasteSignalSchema),
});

const personSchema = z.object({
  personId: z.string(),
  displayName: z.string(),
  tier: z.enum(["friend", "second_network", "stranger"]),
  tastes: z.array(tasteSignalSchema),
});

const recommendationSchema = z.object({
  entity: entitySchema,
  score: z.number(),
  sourceDomains: z.array(domainSchema),
  rationale: z.string(),
});

const responseMetaShape = {
  source: z.enum(["fixture", "live"]),
  /** Stable per (graph version, tool, input); null when served live. */
  fixtureId: z.string().nullable(),
  graphVersion: z.string(),
};

export const searchEntitiesInput = {
  domain: domainSchema,
  query: z.string().default(""),
  limit: z.number().int().min(1).max(50).optional(),
};
export const searchEntitiesOutput = {
  ...responseMetaShape,
  entities: z.array(entitySchema),
};

export const recommendInput = {
  profile: profileSchema,
  limit: z.number().int().min(1).max(24).default(3),
};
export const recommendOutput = {
  ...responseMetaShape,
  recommendations: z.array(recommendationSchema),
};

export const compareTasteInput = {
  viewer: profileSchema,
  people: z.array(personSchema).min(1),
  /** Person to blend with and plan an outing for; defaults to the first person. */
  blendWithPersonId: z.string().optional(),
  blendLimit: z.number().int().min(1).max(24).default(3),
};
export const compareTasteOutput = {
  ...responseMetaShape,
  matches: z.array(
    z.object({
      personId: z.string(),
      displayName: z.string(),
      tier: z.enum(["friend", "second_network", "stranger"]),
      score: z.number(),
      sharedEntityIds: z.array(z.string()),
    }),
  ),
  blend: z.object({
    withPersonId: z.string(),
    recommendations: z.array(recommendationSchema),
    outing: z
      .object({
        place: entitySchema,
        food: entitySchema,
        activity: entitySchema.optional(),
        score: z.number(),
        rationale: z.string(),
      })
      .nullable(),
  }),
};

type Infer<S extends z.ZodRawShape> = z.infer<z.ZodObject<S>>;
export type SearchEntitiesArgs = z.input<z.ZodObject<typeof searchEntitiesInput>>;
export type SearchEntitiesResult = Infer<typeof searchEntitiesOutput>;
export type RecommendArgs = z.input<z.ZodObject<typeof recommendInput>>;
export type RecommendResult = Infer<typeof recommendOutput>;
export type CompareTasteArgs = z.input<z.ZodObject<typeof compareTasteInput>>;
export type CompareTasteResult = Infer<typeof compareTasteOutput>;

/** FNV-1a 32-bit, hex — enough to give fixture responses short stable ids. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** `loggedAt` is excluded so the same tastes always map to the same fixture id. */
function canonicalTastes(tastes: z.infer<typeof tasteSignalSchema>[]) {
  return tastes.map((t) => [t.entityId, Math.round(t.weight * 1000) / 1000]);
}

function responseMeta(
  client: QlooClient,
  graphVersion: string,
  tool: QlooToolName,
  canonicalInput: unknown,
) {
  if (client.mode === "live") {
    return { source: "live" as const, fixtureId: null, graphVersion };
  }
  return {
    source: "fixture" as const,
    fixtureId: `${graphVersion}/${tool}/${fnv1a(JSON.stringify(canonicalInput))}`,
    graphVersion,
  };
}

function toProfile(p: z.infer<typeof profileSchema>): UserTasteProfile {
  return {
    userId: p.userId,
    displayName: p.displayName,
    tastes: p.tastes.map((t) => ({
      entityId: t.entityId,
      weight: t.weight,
      loggedAt: t.loggedAt ?? 0,
    })),
  };
}

function toRankable(p: z.infer<typeof personSchema>): RankablePerson {
  return {
    personId: p.personId,
    displayName: p.displayName,
    tier: p.tier,
    profile: toProfile({
      userId: p.personId,
      displayName: p.displayName,
      tastes: p.tastes,
    }),
  };
}

export async function searchEntities(
  client: QlooClient,
  rawArgs: SearchEntitiesArgs,
): Promise<SearchEntitiesResult> {
  const args = z.object(searchEntitiesInput).parse(rawArgs);
  const [graph, found] = await Promise.all([
    client.getGraph(),
    client.searchEntities(args.domain, args.query),
  ]);
  const entities = args.limit ? found.slice(0, args.limit) : found;
  return {
    ...responseMeta(client, graph.version, "search_entities", [
      args.domain,
      args.query.trim().toLowerCase(),
      args.limit ?? null,
    ]),
    entities,
  };
}

export async function recommend(
  client: QlooClient,
  rawArgs: RecommendArgs,
): Promise<RecommendResult> {
  const args = z.object(recommendInput).parse(rawArgs);
  const graph = await client.getGraph();
  return {
    ...responseMeta(client, graph.version, "recommend", [
      canonicalTastes(args.profile.tastes),
      args.limit,
    ]),
    recommendations: recommendNextThing(
      toProfile(args.profile),
      graph,
      args.limit,
    ),
  };
}

export async function compareTaste(
  client: QlooClient,
  rawArgs: CompareTasteArgs,
): Promise<CompareTasteResult> {
  const args = z.object(compareTasteInput).parse(rawArgs);
  const graph = await client.getGraph();
  const viewer = toProfile(args.viewer);
  const people = args.people.map(toRankable);

  const partner = args.blendWithPersonId
    ? people.find((p) => p.personId === args.blendWithPersonId)
    : people[0];
  if (!partner) {
    throw new Error(
      `blendWithPersonId "${args.blendWithPersonId}" is not in people`,
    );
  }

  const blendProfile = blendedAsProfile(
    blendProfiles([viewer, partner.profile]),
    `${viewer.displayName} + ${partner.displayName}`,
  );

  return {
    ...responseMeta(client, graph.version, "compare_taste", [
      canonicalTastes(args.viewer.tastes),
      args.people.map((p) => [p.personId, p.tier, canonicalTastes(p.tastes)]),
      partner.personId,
      args.blendLimit,
    ]),
    matches: rankPeopleByTaste(viewer, people, graph),
    blend: {
      withPersonId: partner.personId,
      recommendations: recommendNextThing(blendProfile, graph, args.blendLimit),
      outing: suggestSharedOuting(viewer, partner.profile, graph),
    },
  };
}
