import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_QLOO_BASE_URL,
  getQlooBaseUrl,
  qlooFetch,
} from "@/lib/qloo/qloo-fetch";

describe("getQlooBaseUrl", () => {
  it("defaults to the hackathon API host", () => {
    expect(getQlooBaseUrl({})).toBe(DEFAULT_QLOO_BASE_URL);
    expect(DEFAULT_QLOO_BASE_URL).toBe("https://hackathon.api.qloo.com");
  });

  it("reads QLOO_BASE_URL when set", () => {
    expect(getQlooBaseUrl({ QLOO_BASE_URL: "https://example.test" })).toBe(
      "https://example.test",
    );
  });
});

describe("qlooFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends GET with X-Api-Key and query params", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await qlooFetch(
      "/search",
      { query: "Radiohead", types: "urn:entity:artist", take: 1 },
      { apiKey: "secret-key-123" },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0];
    expect(url).toBe(
      "https://hackathon.api.qloo.com/search?query=Radiohead&types=urn%3Aentity%3Aartist&take=1",
    );
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({ "X-Api-Key": "secret-key-123" });
  });

  it("retries once on 500", async () => {
    let calls = 0;
    const fetchSpy = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("err", { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const data = await qlooFetch("/search", { query: "x" }, { apiKey: "k" });
    expect(data).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not include the API key in errors", async () => {
    const fetchSpy = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      qlooFetch("/search", { query: "x" }, { apiKey: "super-secret-key" }),
    ).rejects.toMatchObject({ status: 401, path: "/search" });

    try {
      await qlooFetch("/search", { query: "x" }, { apiKey: "super-secret-key" });
    } catch (err) {
      expect(String(err)).not.toContain("super-secret-key");
    }
  });
});
