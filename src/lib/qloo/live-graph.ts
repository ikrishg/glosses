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
import { QLOO_FOOD_INSIGHTS_TAG } from "@/lib/qloo/food-tags";
import { isRestaurantFood } from "@/lib/qloo/entity-filters";
import {
  getMemoryLiveGraphStore,
  resetMemoryLiveGraphStore,
  type LiveGraphBuildProgress,
  type LiveGraphStatus,
} from "@/lib/qloo/live-graph-store";
import { QlooHttpError, qlooFetch, type QlooFetchOptions } from "@/lib/qloo/qloo-fetch";

export type { LiveGraphBuildProgress, LiveGraphStatus };

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

type InsightJob = {
  jobKey: string;
  filterType: string;
  entityDomain: QlooDomain;
  filterTags?: string;
};

const INSIGHT_JOBS: InsightJob[] = [
  {
    jobKey: QLOO_SEARCH_TYPE_BY_DOMAIN.music,
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.music,
    entityDomain: "music",
  },
  {
    jobKey: QLOO_SEARCH_TYPE_BY_DOMAIN.film,
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.film,
    entityDomain: "film",
  },
  {
    jobKey: QLOO_SEARCH_TYPE_BY_DOMAIN.books,
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.books,
    entityDomain: "books",
  },
  {
    jobKey: QLOO_SEARCH_TYPE_BY_DOMAIN.tv,
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.tv,
    entityDomain: "tv",
  },
  {
    jobKey: QLOO_SEARCH_TYPE_BY_DOMAIN.places,
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.places,
    entityDomain: "places",
  },
  {
    jobKey: `${QLOO_SEARCH_TYPE_BY_DOMAIN.places}:food`,
    filterType: QLOO_SEARCH_TYPE_BY_DOMAIN.places,
    entityDomain: "food",
    filterTags: QLOO_FOOD_INSIGHTS_TAG,
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

function mem() {
  return getMemoryLiveGraphStore();
}

function emptyProgress(): LiveGraphBuildProgress {
  return {
    fixtureIdMap: {},
    entities: [],
    edges: [],
    searchedFixtures: new Set(),
    insightsJobsDone: new Set(),
  };
}

function cloneProgress(src: LiveGraphBuildProgress): LiveGraphBuildProgress {
  return {
    fixtureIdMap: { ...src.fixtureIdMap },
    entities: [...src.entities],
    edges: [...src.edges],
    searchedFixtures: new Set(src.searchedFixtures),
    insightsJobsDone: new Set(src.insightsJobsDone),
  };
}

export function progressFingerprint(
  progress: LiveGraphBuildProgress,
): string {
  return JSON.stringify({
    entities: progress.entities.length,
    edges: progress.edges.length,
    searched: progress.searchedFixtures.size,
    insights: [...progress.insightsJobsDone].sort(),
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
  resetMemoryLiveGraphStore();
}

/** Test helper: mark a graph as the ready cached snapshot. */
export function __testSetLiveGraphReady(graph: QlooGraphSnapshot): void {
  const store = mem();
  store.readyCache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
  store.lastStatus = "ready";
}

export function __testSetLiveGraphStatus(status: LiveGraphStatus): void {
  mem().lastStatus = status;
}

export function __testSetPartial(progress: LiveGraphBuildProgress): void {
  mem().partial = cloneProgress(progress);
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
  return mem().lastStatus;
}

export function isLiveGraphReady(): boolean {
  const store = mem();
  return store.lastStatus === "ready" && store.readyCache !== null;
}

/** Graph served on the request path — never blocks on a background build. */
export function getServingLiveGraph(): QlooGraphSnapshot {
  const store = mem();
  if (store.readyCache) {
    return store.readyCache.graph;
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
  job: InsightJob,
  fetchOpts: QlooFetchOptions,
): Promise<InsightsHit[]> {
  if (seedEntityIds.length === 0) {
    return [];
  }
  const query: Record<string, string | number | undefined> = {
    "filter.type": job.filterType,
    "signal.interests.entities": seedEntityIds.join(","),
    take: 48,
  };
  if (job.filterTags) {
    query["filter.tags"] = job.filterTags;
  }
  const data = (await qlooFetch("/v2/insights", query, {
    ...fetchOpts,
    timeoutMs: INSIGHTS_TIMEOUT_MS,
  })) as { success?: boolean; results?: { entities?: InsightsHit[] } };
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
    if (
      entityDomain === "food" &&
      existing.tags.includes(INSIGHT_ENTITY_TAG) &&
      existing.domain !== "food"
    ) {
      existing.domain = "food";
    }
    return existing;
  }
  const tags = [INSIGHT_ENTITY_TAG];
  if (entityDomain === "food") {
    tags.push(QLOO_FOOD_INSIGHTS_TAG);
  }
  const entity: QlooEntity = {
    id: hit.entity_id,
    name: hit.name?.trim() || "Qloo pick",
    domain: entityDomain,
    tags,
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

/** Place ↔ food edges for outing routes (shared signalling seeds). */
function linkPlaceFoodInsightPairs(
  state: LiveGraphBuildProgress,
  edgeKeys: Set<string>,
): void {
  const places = state.entities.filter(
    (e) => e.domain === "places" && e.tags.includes(INSIGHT_ENTITY_TAG),
  );
  const foods = state.entities.filter(
    (e) =>
      e.tags.includes(INSIGHT_ENTITY_TAG) && isRestaurantFood(e),
  );
  if (places.length === 0 || foods.length === 0) {
    return;
  }
  const seedsForTarget = (targetId: string): Set<string> => {
    return new Set(
      state.edges.filter((e) => e.toId === targetId).map((e) => e.fromId),
    );
  };
  for (const place of places) {
    const placeSeeds = seedsForTarget(place.id);
    if (placeSeeds.size === 0) continue;
    for (const food of foods) {
      const foodSeeds = seedsForTarget(food.id);
      const shared = [...placeSeeds].some((s) => foodSeeds.has(s));
      if (!shared) continue;
      mergeEdges(state.edges, edgeKeys, place.id, food.id, 0.78);
    }
  }
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

  mem().partial = cloneProgress(state);

  if (state.entities.length < MIN_RESOLVED_ENTITIES) {
    throw new Error(
      `Live graph build failed: only ${state.entities.length}/${FIXTURE_GRAPH.entities.length} entities resolved`,
    );
  }

  const allSeedIds = state.entities
    .filter(isSeedEntity)
    .map((e) => e.id);

  const pendingJobs = INSIGHT_JOBS.filter(
    (job) => !state.insightsJobsDone.has(job.jobKey),
  );

  await mapWithConcurrency(
    pendingJobs,
    POOL_CONCURRENCY,
    deadline,
    async (job) => {
      if (budgetExpired(deadline)) {
        return;
      }
      const batches = chunkArray(allSeedIds, INSIGHTS_SIGNAL_BATCH_SIZE);
      let jobSucceeded = true;
      for (const batch of batches) {
        if (budgetExpired(deadline)) {
          jobSucceeded = false;
          break;
        }
        try {
          const hits = await fetchInsightsBatch(batch, job, fetchOpts);
          ingestInsightHits(
            hits,
            batch,
            job.filterType,
            job.entityDomain,
            state,
            liveIdToEntity,
            edgeKeys,
          );
        } catch (err) {
          jobSucceeded = false;
          const detail =
            err instanceof Error ? err.message : "insights batch failed";
          console.warn(
            `[qloo] insights batch (${job.jobKey}, ${batch.length} signals): ${detail}`,
          );
        }
      }
      if (jobSucceeded) {
        state.insightsJobsDone.add(job.jobKey);
      }
    },
  );

  linkPlaceFoodInsightPairs(state, edgeKeys);

  mem().partial = cloneProgress(state);

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
  const store = mem();
  store.retryAfter = Date.now() + RETRY_COOLDOWN_MS;
  if (store.readyCache !== null) {
    store.lastStatus = "ready";
  } else if (store.partial !== null && store.lastStatus !== "degraded") {
    store.lastStatus = "warming";
  }
  setTimeout(() => {
    warmLiveGraphCache(fetchOpts);
  }, RETRY_COOLDOWN_MS);
}

function runBackgroundBuild(fetchOpts: QlooFetchOptions): Promise<void> {
  const store = mem();
  const stale = store.readyCache;
  const progressAtStart = store.partial
    ? progressFingerprint(store.partial)
    : null;
  store.lastStatus = stale ? "ready" : "warming";

  return buildLiveGraphSnapshot(fetchOpts, store.partial ?? undefined)
    .then((graph) => {
      const s = mem();
      s.readyCache = { graph, expiresAt: Date.now() + CACHE_TTL_MS };
      s.partial = null;
      s.retryAfter = 0;
      s.lastStatus = "ready";
    })
    .catch((err) => {
      console.warn(
        `[qloo] background graph build: ${err instanceof Error ? err.message : "failed"}`,
      );
      const s = mem();
      const progressAtEnd = s.partial ? progressFingerprint(s.partial) : null;
      if (s.readyCache) {
        s.lastStatus = "ready";
      } else if (
        progressAtStart !== null &&
        progressAtStart === progressAtEnd
      ) {
        s.lastStatus = "degraded";
      } else {
        s.lastStatus = "warming";
      }
      scheduleRetry(fetchOpts);
    })
    .finally(() => {
      const s = mem();
      s.inflight = null;
      const now = Date.now();
      if (
        s.readyCache &&
        s.readyCache.expiresAt <= now &&
        !s.inflight &&
        now >= s.retryAfter
      ) {
        warmLiveGraphCache(fetchOpts);
      }
    });
}

function startWarmIfNeeded(fetchOpts: QlooFetchOptions): void {
  const store = mem();
  const now = Date.now();
  if (store.readyCache && store.readyCache.expiresAt > now) {
    return;
  }
  if (store.inflight) {
    return;
  }
  if (now < store.retryAfter) {
    return;
  }
  if (!store.readyCache) {
    store.lastStatus = "warming";
  }
  store.inflight = runBackgroundBuild(fetchOpts);
}

/** Starts a background graph build; requests never await this. */
export function warmLiveGraphCache(fetchOpts: QlooFetchOptions): void {
  startWarmIfNeeded(fetchOpts);
}

/** Await the in-flight background build (for `after()` / warm routes). */
export async function awaitLiveGraphBuild(
  fetchOpts: QlooFetchOptions,
): Promise<LiveGraphStatus> {
  warmLiveGraphCache(fetchOpts);
  const store = mem();
  if (store.inflight) {
    await store.inflight;
  }
  return getLiveGraphStatus();
}

/** @deprecated Requests should use getServingLiveGraph — kept for tests. */
export async function getCachedLiveGraph(
  fetchOpts: QlooFetchOptions,
): Promise<QlooGraphSnapshot> {
  await awaitLiveGraphBuild(fetchOpts);
  const store = mem();
  if (store.readyCache) {
    return store.readyCache.graph;
  }
  throw new Error("Live graph not ready");
}
