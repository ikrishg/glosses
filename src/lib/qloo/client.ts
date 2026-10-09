import "server-only";

import type {
  QlooDomain,
  QlooEntity,
  QlooGraphSnapshot,
  UserTasteProfile,
} from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import {
  QLOO_SEARCH_TYPE_BY_DOMAIN,
} from "@/lib/qloo/domain-types";
import {
  getCachedLiveGraph,
  clearLiveGraphCache,
  warmLiveGraphCache,
} from "@/lib/qloo/live-graph";
import { qlooFetch, type QlooFetchOptions } from "@/lib/qloo/qloo-fetch";

export type QlooClientMode = "mock" | "live";

export interface QlooClient {
  readonly mode: QlooClientMode;
  /** True when live calls failed and fixture data is being served. */
  readonly degraded: boolean;
  /** Whether the latest `searchEntities` call hit Qloo HTTP or fixtures. */
  readonly searchDataSource: "live" | "fixture";
  getGraph(): Promise<QlooGraphSnapshot>;
  searchEntities(domain: QlooDomain, query: string): Promise<QlooEntity[]>;
  logTaste(userId: string, entityId: string): Promise<void>;
  getProfile(userId: string): Promise<UserTasteProfile | null>;
}

export { clearLiveGraphCache };

type SearchRow = {
  entity_id: string;
  name: string;
  types?: string[];
  tags?: unknown;
};

function domainFromQlooTypes(types: string[] | undefined): QlooDomain | null {
  if (!types?.length) return null;
  for (const [domain, urn] of Object.entries(QLOO_SEARCH_TYPE_BY_DOMAIN)) {
    if (types.includes(urn)) {
      return domain as QlooDomain;
    }
  }
  if (types.includes("urn:entity:place")) return "places";
  return null;
}

function mapSearchRow(row: SearchRow, fallbackDomain: QlooDomain): QlooEntity {
  const domain = domainFromQlooTypes(row.types) ?? fallbackDomain;
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === "string")
    : [];
  return {
    id: row.entity_id,
    name: row.name,
    domain,
    tags,
  };
}

function fixtureGraph(): QlooGraphSnapshot {
  return { ...FIXTURE_GRAPH, dataSource: "fixture" };
}

function fixtureSearch(domain: QlooDomain, query: string): QlooEntity[] {
  const q = query.trim().toLowerCase();
  return FIXTURE_GRAPH.entities.filter(
    (e) =>
      e.domain === domain &&
      (q === "" || e.name.toLowerCase().includes(q)),
  );
}

export class LiveQlooClient implements QlooClient {
  readonly mode = "live" as const;
  searchDataSource: "live" | "fixture" = "fixture";
  private _degraded = false;
  private readonly fetchOpts: QlooFetchOptions;

  constructor(apiKey: string, fetchImpl?: typeof fetch) {
    if (!apiKey) {
      throw new Error("QLOO_API_KEY is required for LiveQlooClient");
    }
    this.fetchOpts = { apiKey, fetchImpl };
    warmLiveGraphCache(this.fetchOpts);
  }

  get degraded(): boolean {
    return this._degraded;
  }

  private markDegraded(): QlooGraphSnapshot {
    this._degraded = true;
    return fixtureGraph();
  }

  async getGraph(): Promise<QlooGraphSnapshot> {
    try {
      const graph = await getCachedLiveGraph(this.fetchOpts);
      return graph;
    } catch {
      return this.markDegraded();
    }
  }

  async searchEntities(domain: QlooDomain, query: string): Promise<QlooEntity[]> {
    if (this._degraded) {
      this.searchDataSource = "fixture";
      return fixtureSearch(domain, query);
    }
    try {
      const types = QLOO_SEARCH_TYPE_BY_DOMAIN[domain];
      const data = (await qlooFetch(
        "/search",
        {
          query: query.trim() || domain,
          types,
          take: 50,
        },
        this.fetchOpts,
      )) as { results?: SearchRow[] };
      this.searchDataSource = "live";
      return (data.results ?? []).map((row) => mapSearchRow(row, domain));
    } catch {
      this._degraded = true;
      this.searchDataSource = "fixture";
      return fixtureSearch(domain, query);
    }
  }

  async logTaste(): Promise<void> {
    return;
  }

  async getProfile(): Promise<UserTasteProfile | null> {
    return null;
  }
}

/** Fixture-backed client used for Oct 30 demo without an API key. */
export class MockQlooClient implements QlooClient {
  readonly mode = "mock" as const;
  readonly degraded = false;
  readonly searchDataSource = "fixture" as const;

  async getGraph(): Promise<QlooGraphSnapshot> {
    return fixtureGraph();
  }

  async searchEntities(domain: QlooDomain, query: string): Promise<QlooEntity[]> {
    return fixtureSearch(domain, query);
  }

  async logTaste(): Promise<void> {
    return;
  }

  async getProfile(): Promise<UserTasteProfile | null> {
    return null;
  }
}

/** Live HTTP only at runtime — not during `next build` (Cache Components prerender). */
export function shouldUseLiveQloo(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const key = env.QLOO_API_KEY?.trim();
  if (!key) return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return true;
}

export function createQlooClient(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): QlooClient {
  const key = env.QLOO_API_KEY?.trim();
  if (key && shouldUseLiveQloo(env)) {
    return new LiveQlooClient(key, fetchImpl);
  }
  return new MockQlooClient();
}
