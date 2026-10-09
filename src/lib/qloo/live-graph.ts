import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import type {
  QlooAffinityEdge,
  QlooDomain,
  QlooEntity,
  QlooGraphSnapshot,
} from "@/lib/qloo/types";
import {
  QLOO_SEARCH_TYPE_BY_DOMAIN,
  qlooInsightsFilterType,
} from "@/lib/qloo/domain-types";
import { QlooHttpError, qlooFetch, type QlooFetchOptions } from "@/lib/qloo/qloo-fetch";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_COOLDOWN_MS = 60 * 1000;
const BUILD_BUDGET_MS = 60_000;
export const POOL_CONCURRENCY = 3;
export const MIN_LIVE_EDGE_COUNT = 20;
export const INSIGHTS_SIGNAL_BATCH_SIZE = 6;
export const INSIGHTS_TIMEOUT_MS = 20_000;
const INSIGHT_ENTITY_TAG = "qloo-insight";

const MIN_RESOLVED_ENTITIES = Math.max(
  3,
  Math.ceil(FIXTURE_GRAPH.entities.length * 0.2),
);

const ALL_DOMAINS: QlooDomain[] = [
  "music",
  "film",
  "books",
  "places",
  "food",
  "tv",
];

/** One insights call per Qloo filter type (`food` + `places` share `urn:entity:place`). */
const INSIGHT_FILTER_GROUPS: {
  filterType: string;
  entityDomain: QlooDomain;
}[] = [
  {
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.music,
    entityDomain: "music",
  },
  {
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.film,
    entityDomain: "film",
  },
  {
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.books,
    entityDomain: "books",
  },
  {
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.tv,
    entityDomain: "tv",
  },
  {
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.places,
    entityDomain: "places",
  },
];

type SearchHit = {
  entity_id: string;
  name: string;
  types?: string[];
  tags?: unknown;
};

type InsightsHit = {
  entity_id: string;
  name?: string;
  query?: { affinity?: number };
};

export type LiveGraphBuildProgress = {
  fixtureIdMap: Record<string, string>;
  entities: QlooEntity[];
  edges: QlooAffinityEdge[];
  searchedFixtures: Set<string>;
  insightsFilterTypesDone: Set<string>;
};

export type LiveGraphStatus = "idle" | "warming" | "ready" | "degraded";

type LiveCache = {
  graph: QlooGraphSnapshot;
  expiresAt: number;
};

let readyCache: LiveCache | null = null;
let inflight: Promise<void> | null = null;
let retryAfter = 0;
let partial: LiveGraphBuildProgress | null = null;
let lastStatus: LiveGraphStatus = "idle";

function emptyProgress(): LiveGraphBuildProgress {
  return {
    fixtureIdMap: {},
    entities: [],
    edges: [],
    searchedFixtures: new Set(),
    insightsFilterTypesDone: new Set(),
  };
}

function cloneProgress(src: LiveGraphBuildProgress): LiveGraphBuildProgress {
  return {
    fixtureIdMap: { ...src.fixtureIdMap },
    entities: [...src.entities],
    edges: [...src.edges],
    searchedFixtures: new Set(src.searchedFixtures),
    insightsFilterTypesDone: new Set(src.insightsFilterTypesDone),
  };
}

export function progressFingerprint(
  progress: LiveGraphBuildProgress,
): string {
  return JSON.stringify({
    entities: progress.entities.length,
    edges: progress.edges.length,
    searched: progress.searchedFixtures.size,
    insights: [...progress.insightsFilterTypesDone].sort(),
  });
}

export function isSeedEntity(entity: QlooEntity): boolean {
  return !entity.tags.includes(INSIGHT_ENTITY_TAG);
}

export function meetsLiveGraphCoverage(state: {
  entities: QlooEntity[];
  edges: QlooAffinityEdge[];
}): boolean {
  if (state.edges.length < MIN_LIVE_EDGE_COUNT) {
    return false;
  }
  for (const domain of ALL_DOMAINS) {
    const seeds = state.entities.filter(
      (e) => e.domain === domain && isSeedEntity(e),
    );
    if (seeds.length === 0) {
      continue;
    }
    const hasOutgoing = seeds.some((seed) =>
      state.edges.some((e) => e.fromId === seed.id),
    );
    if (!hasOutgoing) {
      return false;
    }
  }
  return true;
}

export function clearLiveGraphCache(): void {
  readyCache = null;
  inflight = null;
  retryAfter = 0;
  partial = null;
  lastStatus = "idle";
}

/** Test helper: mark a graph as the ready cached snapshot. */
export function __testSetLiveGraphReady(graph: QlooGraphSnapshot): void {
  readyCache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
  lastStatus = "ready";
}

export function __testSetLiveGraphStatus(status: LiveGraphStatus): void {
  lastStatus = status;
}

export function __testSetPartial(progress: LiveGraphBuildProgress): void {
  partial = cloneProgress(progress);
}

function liveGraphVersion(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `qloo-live-${day}`;
}

function budgetExpired(deadline: number): boolean {
  return Date.now() >= deadline;
}

function fixtureGraph(): QlooGraphSnapshot {
  return { ...FIXTURE_GRAPH, dataSource: "fixture" };
}

export function getLiveGraphStatus(): LiveGraphStatus {
  return lastStatus;
}

export function isLiveGraphReady(): boolean {
  return lastStatus === "ready" && readyCache !== null;
}

/** Graph served on the request path — never blocks on a background build. */
export function getServingLiveGraph(): QlooGraphSnapshot {
  if (readyCache) {
    return readyCache.graph;
  }
  return fixtureGraph();
}

/** Run async work over items with a concurrency cap and time budget. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  deadline: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (!budgetExpired(deadline)) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function searchEntityId(
  fixture: QlooEntity,
  fetchOpts: QlooFetchOptions,
): Promise<string | null> {
  try {
    const types = QLOO_SEARCH_TYPE_BY_DOMAIN[fixture.domain];
    const data = (await qlooFetch(
      "/search",
      { query: fixture.name, types, take: 1 },
      fetchOpts,
    )) as { results?: SearchHit[] };
    const hit = data.results?.[0];
    return hit?.entity_id ?? null;
  } catch (err) {
    if (err instanceof QlooHttpError) {
      console.warn(
        `[qloo] search ${err.status} for "${fixture.name}" — skipping seed`,
      );
    } else {
      console.warn(
        `[qloo] search failed for "${fixture.name}" — skipping seed`,
      );
    }
    return null;
  }
}

async function fetchInsightsBatch(
  seedEntityIds: string[],
  filterType: string,
  fetchOpts: QlooFetchOptions,
): Promise<InsightsHit[]> {
  if (seedEntityIds.length === 0) {
    return [];
  }
  const data = (await qlooFetch(
    "/v2/insights",
    {
      "filter.type": filterType,
      "signal.interests.entities": seedEntityIds.join(","),
      take: 48,
    },
    { ...fetchOpts, timeoutMs: INSIGHTS_TIMEOUT_MS },
  )) as { success?: boolean; results?: { entities?: InsightsHit[] } };
  return data.results?.entities ?? [];
}

function mergeEdges(
  edges: QlooAffinityEdge[],
  edgeKeys: Set<string>,
  fromId: string,
  toId: string,
  weight: number,
): void {
  if (weight <= 0) return;
  const key = `${fromId}->${toId}`;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push({ fromId, toId, weight });
}

function ensureInsightEntity(
  hit: InsightsHit,
  entityDomain: QlooDomain,
  state: LiveGraphBuildProgress,
  liveIdToEntity: Map<string, QlooEntity>,
): QlooEntity {
  const existing = liveIdToEntity.get(hit.entity_id);
  if (existing) {
    return existing;
  }
  const entity: QlooEntity = {
    id: hit.entity_id,
    name: hit.name?.trim() || "Qloo pick",
    domain: entityDomain,
    tags: [INSIGHT_ENTITY_TAG],
  };
  state.entities.push(entity);
  liveIdToEntity.set(hit.entity_id, entity);
  return entity;
}

function seedExcludedFromInsightFilter(
  seedDomain: QlooDomain,
  filterType: string,
): boolean {
  return qlooInsightsFilterType(seedDomain) === filterType;
}

function ingestInsightHits(
  hits: InsightsHit[],
  signallingSeedIds: string[],
  filterType: string,
  entityDomain: QlooDomain,
  state: LiveGraphBuildProgress,
  liveIdToEntity: Map<string, QlooEntity>,
  edgeKeys: Set<string>,
): void {
  for (const hit of hits) {
    const weight = hit.query?.affinity ?? 0;
    if (weight <= 0) continue;
    const target = ensureInsightEntity(
      hit,
      entityDomain,
      state,
      liveIdToEntity,
    );
    for (const seedId of signallingSeedIds) {
      const seed = liveIdToEntity.get(seedId);
      if (!seed || !isSeedEntity(seed)) continue;
      if (seedExcludedFromInsightFilter(seed.domain, filterType)) continue;
      if (seed.id === target.id) continue;
      mergeEdges(state.edges, edgeKeys, seed.id, target.id, weight);
    }
  }
}

export async function buildLiveGraphSnapshot(
  fetchOpts: QlooFetchOptions,
  initialProgress?: LiveGraphBuildProgress,
): Promise<QlooGraphSnapshot> {
  const deadline = Date.now() + BUILD_BUDGET_MS;
  const state = initialProgress
    ? cloneProgress(initialProgress)
    : emptyProgress();
  const liveIdToEntity = new Map(state.entities.map((e) => [e.id, e]));
  const edgeKeys = new Set(
    state.edges.map((e) => `${e.fromId}->${e.toId}`),
  );

  const fixturesToSearch = FIXTURE_GRAPH.entities.filter(
    (f) => !state.searchedFixtures.has(f.id),
  );

  const liveIds = await mapWithConcurrency(
    fixturesToSearch,
    POOL_CONCURRENCY,
    deadline,
    (fixture) => searchEntityId(fixture, fetchOpts),
  );

  for (let i = 0; i < fixturesToSearch.length; i++) {
    const fixture = fixturesToSearch[i];
    state.searchedFixtures.add(fixture.id);
    const liveId = liveIds[i];
    if (!liveId) continue;
    state.fixtureIdMap[fixture.id] = liveId;
    if (liveIdToEntity.has(liveId)) continue;
    const entity: QlooEntity = {
      id: liveId,
      name: fixture.name,
      domain: fixture.domain,
      tags: [...fixture.tags],
    };
    state.entities.push(entity);
    liveIdToEntity.set(liveId, entity);
  }

  partial = cloneProgress(state);

  if (state.entities.length < MIN_RESOLVED_ENTITIES) {
    throw new Error(
      `Live graph build failed: only ${state.entities.length}/${FIXTURE_GRAPH.entities.length} entities resolved`,
    );
  }

  const allSeedIds = state.entities
    .filter(isSeedEntity)
    .map((e) => e.id);

  const pendingGroups = INSIGHT_FILTER_GROUPS.filter(
    (g) => !state.insightsFilterTypesDone.has(g.filterType),
  );

  await mapWithConcurrency(
    pendingGroups,
    POOL_CONCURRENCY,
    deadline,
    async (group) => {
      if (budgetExpired(deadline)) {
        return;
      }
      const batches = chunkArray(allSeedIds, INSIGHTS_SIGNAL_BATCH_SIZE);
      let groupSucceeded = true;
      for (const batch of batches) {
        if (budgetExpired(deadline)) {
          groupSucceeded = false;
          break;
        }
        try {
          const hits = await fetchInsightsBatch(
            batch,
            group.filterType,
            fetchOpts,
          );
          ingestInsightHits(
            hits,
            batch,
            group.filterType,
            group.entityDomain,
            state,
            liveIdToEntity,
            edgeKeys,
          );
        } catch (err) {
          groupSucceeded = false;
          const detail =
            err instanceof Error ? err.message : "insights batch failed";
          console.warn(
            `[qloo] insights batch (${group.filterType}, ${batch.length} signals): ${detail}`,
          );
        }
      }
      if (groupSucceeded) {
        state.insightsFilterTypesDone.add(group.filterType);
      }
    },
  );

  partial = cloneProgress(state);

  if (!meetsLiveGraphCoverage(state)) {
    throw new Error(
      `Live graph build incomplete: ${state.edges.length} edges, coverage thresholds not met`,
    );
  }

  return {
    version: liveGraphVersion(),
    entities: state.entities,
    edges: state.edges,
    fixtureIdMap: state.fixtureIdMap,
    dataSource: "live",
  };
}

function scheduleRetry(fetchOpts: QlooFetchOptions): void {
  retryAfter = Date.now() + RETRY_COOLDOWN_MS;
  if (readyCache !== null) {
    lastStatus = "ready";
  } else if (
    partial !== null &&
    lastStatus !== "degraded"
  ) {
    lastStatus = "warming";
  }
  setTimeout(() => {
    warmLiveGraphCache(fetchOpts);
  }, RETRY_COOLDOWN_MS);
}

function runBackgroundBuild(fetchOpts: QlooFetchOptions): Promise<void> {
  const stale = readyCache;
  const progressAtStart = partial ? progressFingerprint(partial) : null;
  lastStatus = stale ? "ready" : "warming";

  return buildLiveGraphSnapshot(fetchOpts, partial ?? undefined)
    .then((graph) => {
      readyCache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
      partial = null;
      retryAfter = 0;
      lastStatus = "ready";
    })
    .catch((err) => {
      console.warn(
        `[qloo] background graph build: ${err instanceof Error ? err.message : "failed"}`,
      );
      const progressAtEnd = partial ? progressFingerprint(partial) : null;
      if (readyCache) {
        lastStatus = "ready";
      } else if (
        progressAtStart !== null &&
        progressAtStart === progressAtEnd
      ) {
        lastStatus = "degraded";
      } else {
        lastStatus = "warming";
      }
      scheduleRetry(fetchOpts);
    })
    .finally(() => {
      inflight = null;
      const now = Date.now();
      if (
        readyCache &&
        readyCache.expiresAt <= now &&
        !inflight &&
        now >= retryAfter
      ) {
        warmLiveGraphCache(fetchOpts);
      }
    });
}

/** Starts a background graph build; requests never await this. */
export function warmLiveGraphCache(fetchOpts: QlooFetchOptions): void {
  const now = Date.now();
  if (readyCache && readyCache.expiresAt > now) {
    return;
  }
  if (inflight) {
    return;
  }
  if (now < retryAfter) {
    return;
  }
  if (!readyCache) {
    lastStatus = "warming";
  }
  inflight = runBackgroundBuild(fetchOpts);
}

/** Await the in-flight background build (for `after()` / warm routes). */
export async function awaitLiveGraphBuild(
  fetchOpts: QlooFetchOptions,
): Promise<LiveGraphStatus> {
  warmLiveGraphCache(fetchOpts);
  if (inflight) {
    await inflight;
  }
  return getLiveGraphStatus();
}

/** @deprecated Requests should use getServingLiveGraph — kept for tests. */
export async function getCachedLiveGraph(
  fetchOpts: QlooFetchOptions,
): Promise<QlooGraphSnapshot> {
  await awaitLiveGraphBuild(fetchOpts);
  if (readyCache) {
    return readyCache.graph;
  }
  throw new Error("Live graph not ready");
}
