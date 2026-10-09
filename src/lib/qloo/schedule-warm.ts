import "server-only";

import { after } from "next/server";
import {
  awaitLiveGraphBuild,
  warmLiveGraphCache,
  type LiveGraphStatus,
} from "@/lib/qloo/live-graph";
import type { QlooFetchOptions } from "@/lib/qloo/qloo-fetch";

function liveQlooEnabled(
  env: Record<string, string | undefined>,
): boolean {
  const key = env.QLOO_API_KEY?.trim();
  if (!key) return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return true;
}

/** Keeps the graph build alive after the response on serverless (Next `after`). */
export function scheduleLiveGraphWarm(fetchOpts: QlooFetchOptions): void {
  warmLiveGraphCache(fetchOpts);
  try {
    after(() => {
      void awaitLiveGraphBuild(fetchOpts);
    });
  } catch {
    // Not in a request context (tests, MCP stdio) — in-process warm only.
  }
}

export function scheduleLiveGraphWarmFromEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  const key = env.QLOO_API_KEY?.trim();
  if (!key || !liveQlooEnabled(env)) {
    return;
  }
  scheduleLiveGraphWarm({ apiKey: key });
}

export async function runLiveGraphWarmToCompletion(
  fetchOpts: QlooFetchOptions,
): Promise<LiveGraphStatus> {
  return await awaitLiveGraphBuild(fetchOpts);
}
