import type {
  QlooDomain,
  QlooEntity,
  QlooGraphSnapshot,
  UserTasteProfile,
} from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";

export type QlooClientMode = "mock" | "live";

export interface QlooClient {
  readonly mode: QlooClientMode;
  getGraph(): Promise<QlooGraphSnapshot>;
  searchEntities(domain: QlooDomain, query: string): Promise<QlooEntity[]>;
  logTaste(userId: string, entityId: string): Promise<void>;
  getProfile(userId: string): Promise<UserTasteProfile | null>;
}

const LIVE_BASE = "https://api.qloo.com";

/**
 * Live Qloo adapter — requires QLOO_API_KEY. Falls back to fixture graph search locally
 * until endpoints are wired; swap implementation bodies when key is available.
 */
export class LiveQlooClient implements QlooClient {
  readonly mode = "live" as const;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("QLOO_API_KEY is required for LiveQlooClient");
    }
    this.apiKey = apiKey;
  }

  async getGraph(): Promise<QlooGraphSnapshot> {
    const res = await fetch(`${LIVE_BASE}/v2/graph/snapshot`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Qloo graph fetch failed: ${res.status}`);
    }
    return (await res.json()) as QlooGraphSnapshot;
  }

  async searchEntities(domain: QlooDomain, query: string): Promise<QlooEntity[]> {
    const res = await fetch(
      `${LIVE_BASE}/v2/entities/search?domain=${domain}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    if (!res.ok) {
      throw new Error(`Qloo search failed: ${res.status}`);
    }
    const data = (await res.json()) as { results: QlooEntity[] };
    return data.results;
  }

  async logTaste(): Promise<void> {
    // Persist tastes via your backend store when live; demo uses in-memory session.
  }

  async getProfile(): Promise<UserTasteProfile | null> {
    return null;
  }
}

/** Fixture-backed client used for Oct 30 demo without an API key. */
export class MockQlooClient implements QlooClient {
  readonly mode = "mock" as const;

  async getGraph(): Promise<QlooGraphSnapshot> {
    return FIXTURE_GRAPH;
  }

  async searchEntities(domain: QlooDomain, query: string): Promise<QlooEntity[]> {
    const q = query.trim().toLowerCase();
    return FIXTURE_GRAPH.entities.filter(
      (e) =>
        e.domain === domain &&
        (q === "" || e.name.toLowerCase().includes(q)),
    );
  }

  async logTaste(): Promise<void> {
    return;
  }

  async getProfile(): Promise<UserTasteProfile | null> {
    return null;
  }
}

export function createQlooClient(
  env: Record<string, string | undefined> = process.env,
): QlooClient {
  const key = env.QLOO_API_KEY?.trim();
  if (key) {
    return new LiveQlooClient(key);
  }
  return new MockQlooClient();
}
