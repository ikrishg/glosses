export const DEFAULT_QLOO_BASE_URL = "https://hackathon.api.qloo.com";

const RETRY_429_BASE_MS = [500, 1000, 2000];
const MAX_429_RETRIES = 3;

export function getQlooBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = env.QLOO_BASE_URL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_QLOO_BASE_URL;
}

export class QlooHttpError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message?: string) {
    super(message ?? `Qloo request failed: ${status} ${path}`);
    this.name = "QlooHttpError";
    this.status = status;
    this.path = path;
  }
}

export interface QlooFetchOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Test hook for 429 backoff delays. */
  sleep?: (ms: number) => Promise<void>;
}

function redactSecrets(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join("[REDACTED]");
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs(base: number): number {
  return base + Math.floor(Math.random() * 120);
}

/**
 * GET helper for Qloo hackathon API: `X-Api-Key`, timeout, exponential 429 backoff.
 * Errors mention status and path only — never headers or the key.
 */
export async function qlooFetch(
  path: string,
  query: Record<string, string | number | undefined>,
  options: QlooFetchOptions,
): Promise<unknown> {
  const baseUrl = (options.baseUrl ?? getQlooBaseUrl()).replace(/\/$/, "");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  const url = `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;

  const attempt = async (
    networkRetry: boolean,
    rateLimitAttempt: number,
  ): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "GET",
        headers: { "X-Api-Key": options.apiKey },
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 429 && rateLimitAttempt < MAX_429_RETRIES) {
          const delay = jitterMs(
            RETRY_429_BASE_MS[rateLimitAttempt] ?? RETRY_429_BASE_MS.at(-1)!,
          );
          await sleep(delay);
          return attempt(networkRetry, rateLimitAttempt + 1);
        }
        if (!networkRetry && res.status >= 500) {
          return attempt(true, rateLimitAttempt);
        }
        throw new QlooHttpError(res.status, path);
      }
      return await res.json();
    } catch (err) {
      if (err instanceof QlooHttpError) {
        throw err;
      }
      if (!networkRetry) {
        return attempt(true, rateLimitAttempt);
      }
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `Qloo request timed out: ${path}`
          : `Qloo request failed: ${path}`;
      throw new Error(redactSecrets(message, options.apiKey));
    } finally {
      clearTimeout(timer);
    }
  };

  return attempt(false, 0);
}
