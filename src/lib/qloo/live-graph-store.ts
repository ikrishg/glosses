import type { QlooGraphSnapshot } from "@/lib/qloo/types";

export type LiveGraphStatus = "idle" | "warming" | "ready" | "degraded";

export type LiveGraphBuildProgress = {
  fixtureIdMap: Record<string, string>;
  entities: QlooGraphSnapshot["entities"];
  edges: QlooGraphSnapshot["edges"];
  searchedFixtures: Set<string>;
  insightsJobsDone: Set<string>;
};

const GLOBAL_KEY = "__glossesLiveGraphMem__";

export type LiveCache = {
  graph: QlooGraphSnapshot;
  expiresAt: number;
};

type MemoryStore = {
  readyCache: LiveCache | null;
  inflight: Promise<void> | null;
  retryAfter: number;
  partial: LiveGraphBuildProgress | null;
  lastStatus: LiveGraphStatus;
};

type PersistedProgress = {
  fixtureIdMap: Record<string, string>;
  entities: QlooGraphSnapshot["entities"];
  edges: QlooGraphSnapshot["edges"];
  searchedFixtures: string[];
  insightsJobsDone: string[];
};

export type PersistedLiveGraphState = {
  readyCache: LiveCache | null;
  retryAfter: number;
  partial: PersistedProgress | null;
  lastStatus: LiveGraphStatus;
};

function defaultMemory(): MemoryStore {
  return {
    readyCache: null,
    inflight: null,
    retryAfter: 0,
    partial: null,
    lastStatus: "idle",
  };
}

function memoryStore(): MemoryStore {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: MemoryStore;
  };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = defaultMemory();
  }
  return g[GLOBAL_KEY];
}

export function getMemoryLiveGraphStore(): MemoryStore {
  return memoryStore();
}

export function resetMemoryLiveGraphStore(): void {
  const g = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: MemoryStore;
  };
  g[GLOBAL_KEY] = defaultMemory();
}

export function serializeProgress(
  progress: LiveGraphBuildProgress,
): PersistedProgress {
  return {
    fixtureIdMap: progress.fixtureIdMap,
    entities: progress.entities,
    edges: progress.edges,
    searchedFixtures: [...progress.searchedFixtures],
    insightsJobsDone: [...progress.insightsJobsDone],
  };
}

export function deserializeProgress(
  raw: PersistedProgress,
): LiveGraphBuildProgress {
  return {
    fixtureIdMap: raw.fixtureIdMap,
    entities: raw.entities,
    edges: raw.edges,
    searchedFixtures: new Set(raw.searchedFixtures),
    insightsJobsDone: new Set(raw.insightsJobsDone),
  };
}

export function snapshotPersistedState(
  mem: MemoryStore,
): PersistedLiveGraphState {
  return {
    readyCache: mem.readyCache,
    retryAfter: mem.retryAfter,
    partial: mem.partial ? serializeProgress(mem.partial) : null,
    lastStatus: mem.lastStatus,
  };
}

export function applyPersistedState(
  mem: MemoryStore,
  persisted: PersistedLiveGraphState,
): void {
  mem.readyCache = persisted.readyCache;
  mem.retryAfter = persisted.retryAfter;
  mem.lastStatus = persisted.lastStatus;
  mem.partial = persisted.partial
    ? deserializeProgress(persisted.partial)
    : null;
}
