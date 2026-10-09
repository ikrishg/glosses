import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createQlooClient,
  LiveQlooClient,
  MockQlooClient,
} from "@/lib/qloo/client";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";
import { recommendNextThing } from "@/lib/engine/recommend";
import { addTaste } from "@/lib/engine/profile";
import { createEmptyDemoUser, SEED_PEOPLE } from "@/lib/demo/seed";
import { compareTaste, recommend, searchEntities } from "@/mcp/qloo/tools";
import { callQlooTool } from "@/mcp/qloo/in-process";
import { createQlooMcpServer } from "@/mcp/qloo/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const mock = new MockQlooClient();

const people = SEED_PEOPLE.map((p) => ({
  personId: p.personId,
  displayName: p.displayName,
  tier: p.tier,
  tastes: p.profile.tastes,
}));

function loggedProfile(ids: string[]) {
  return ids.reduce(addTaste, createEmptyDemoUser());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("search_entities", () => {
  it("labels live Qloo search results as source live", async () => {
    const client = {
      mode: "live" as const,
      degraded: false,
      searchDataSource: "live" as const,
      getGraph: async () => ({
        ...FIXTURE_GRAPH,
        version: "qloo-live-test",
        dataSource: "fixture" as const,
      }),
      searchEntities: async () => [
        {
          id: "live-entity-1",
          name: "Radiohead",
          domain: "music" as const,
          tags: [],
        },
      ],
      logTaste: async () => undefined,
      getProfile: async () => null,
    };
    const r = await searchEntities(client, { domain: "music", query: "radio" });
    expect(r.source).toBe("live");
    expect(r.fixtureId).toBeNull();
  });

  it("returns fixture entities for a domain with a stable fixture id", async () => {
    const a = await searchEntities(mock, { domain: "music", query: "" });
    const b = await searchEntities(mock, { domain: "music", query: "" });
    expect(a.source).toBe("fixture");
    expect(a.graphVersion).toBe("qloo-fixture-oct30-v1");
    expect(a.entities.map((e) => e.id)).toEqual([
      "qloo:music:radiohead",
      "qloo:music:khruangbin",
      "qloo:music:bjork",
    ]);
    expect(a.fixtureId).toMatch(
      /^qloo-fixture-oct30-v1\/search_entities\/[0-9a-f]{8}$/,
    );
    expect(b.fixtureId).toBe(a.fixtureId);
  });

  it("filters by name and honours limit", async () => {
    const r = await searchEntities(mock, { domain: "film", query: "her" });
    expect(r.entities.map((e) => e.id)).toEqual(["qloo:film:her"]);
    const limited = await searchEntities(mock, { domain: "places", limit: 2 });
    expect(limited.entities).toHaveLength(2);
    expect(limited.fixtureId).not.toBe(r.fixtureId);
  });
});

describe("recommend", () => {
  it("maps fixture taste ids when serving a live graph", async () => {
    const liveGraph = {
      ...FIXTURE_GRAPH,
      dataSource: "live" as const,
      version: "qloo-live-test",
      fixtureIdMap: {
        "qloo:music:radiohead": "live-radiohead",
        "qloo:film:her": "live-her",
      },
      entities: FIXTURE_GRAPH.entities.map((e) => {
        const mapped =
          e.id === "qloo:music:radiohead"
            ? "live-radiohead"
            : e.id === "qloo:film:her"
              ? "live-her"
              : e.id;
        return mapped === e.id ? e : { ...e, id: mapped };
      }),
      edges: FIXTURE_GRAPH.edges.map((edge) => ({
        ...edge,
        fromId:
          edge.fromId === "qloo:music:radiohead"
            ? "live-radiohead"
            : edge.fromId === "qloo:film:her"
              ? "live-her"
              : edge.fromId,
        toId:
          edge.toId === "qloo:music:radiohead"
            ? "live-radiohead"
            : edge.toId === "qloo:film:her"
              ? "live-her"
              : edge.toId,
      })),
    };
    const client = {
      mode: "live" as const,
      degraded: false,
      searchDataSource: "fixture" as const,
      getGraph: async () => liveGraph,
      searchEntities: async () => [],
      logTaste: async () => undefined,
      getProfile: async () => null,
    };
    const profile = loggedProfile(["qloo:music:radiohead", "qloo:film:her"]);
    const r = await recommend(client, { profile, limit: 4 });
    expect(r.source).toBe("live");
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it("delegates to the existing engine on the client graph", async () => {
    const profile = loggedProfile(["qloo:music:radiohead", "qloo:film:her"]);
    const r = await recommend(mock, { profile, limit: 4 });
    expect(r.recommendations).toEqual(
      recommendNextThing(profile, FIXTURE_GRAPH, 4),
    );
    expect(r.recommendations[0].entity.id).toBe("qloo:books:bell-jar");
  });

  it("keys the fixture id on tastes, not timestamps", async () => {
    const profile = loggedProfile(["qloo:music:radiohead"]);
    const later = {
      ...profile,
      tastes: profile.tastes.map((t) => ({ ...t, loggedAt: t.loggedAt + 5000 })),
    };
    const other = loggedProfile(["qloo:music:bjork"]);
    const a = await recommend(mock, { profile });
    const b = await recommend(mock, { profile: later });
    const c = await recommend(mock, { profile: other });
    expect(a.fixtureId).toBe(b.fixtureId);
    expect(c.fixtureId).not.toBe(a.fixtureId);
  });
});

describe("compare_taste", () => {
  it("ranks people by tier then match, and blends with the chosen person", async () => {
    const viewer = loggedProfile(["qloo:music:radiohead", "qloo:film:her"]);
    const r = await compareTaste(mock, {
      viewer,
      people,
      blendWithPersonId: "person:jordan",
    });
    expect(r.source).toBe("fixture");
    expect(r.fixtureId).toMatch(/^qloo-fixture-oct30-v1\/compare_taste\//);
    expect(r.matches.map((m) => m.tier)).toEqual([
      "friend",
      "friend",
      "second_network",
      "stranger",
    ]);
    expect(r.matches[0].personId).toBe("person:maya");
    expect(r.blend.withPersonId).toBe("person:jordan");
    expect(r.blend.recommendations).toHaveLength(3);
    expect(r.blend.outing?.place.domain).toBe("places");
    expect(r.blend.outing?.food.domain).toBe("food");
  });

  it("keeps the demo click-path fixture ids and returns both friend picks", async () => {
    const viewer = loggedProfile([
      "qloo:music:radiohead",
      "qloo:film:her",
      "qloo:places:los-feliz-cinema",
    ]);
    const next = await recommend(mock, { profile: viewer, limit: 4 });
    expect(next.fixtureId).toBe("qloo-fixture-oct30-v1/recommend/c5aa6291");
    const r = await compareTaste(mock, {
      viewer,
      people,
      blendWithPersonId: "person:jordan",
      blendLimit: 3,
    });
    expect(r.fixtureId).toBe("qloo-fixture-oct30-v1/compare_taste/c0b55f07");
    expect(r.picks.tasteTwin?.personId).toBe("person:maya");
    expect(r.picks.outingBlend?.personId).toBe("person:jordan");
    expect(r.blend.outing?.place.id).toBe("qloo:places:amoeba-hollywood");
    expect(r.blend.outing?.food.id).toBe("qloo:food:jon-vincent");
  });

  it("gives a different fixture id per blend partner", async () => {
    const viewer = loggedProfile(["qloo:music:radiohead"]);
    const maya = await compareTaste(mock, { viewer, people });
    const priya = await compareTaste(mock, {
      viewer,
      people,
      blendWithPersonId: "person:priya",
    });
    expect(maya.blend.withPersonId).toBe("person:maya");
    expect(priya.fixtureId).not.toBe(maya.fixtureId);
  });

  it("rejects an unknown blend partner", async () => {
    await expect(
      compareTaste(mock, {
        viewer: createEmptyDemoUser(),
        people,
        blendWithPersonId: "person:nobody",
      }),
    ).rejects.toThrow(/not in people/);
  });
});

describe("Qloo MCP server", () => {
  it("exposes exactly the three tools over MCP", async () => {
    const server = createQlooMcpServer(mock);
    const client = new Client({ name: "test", version: "0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "compare_taste",
      "recommend",
      "search_entities",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    await client.close();
  });

  it("returns structured results matching the direct handler", async () => {
    const profile = loggedProfile(["qloo:music:khruangbin"]);
    const viaMcp = await callQlooTool("recommend", { profile, limit: 2 }, mock);
    expect(viaMcp).toEqual(await recommend(mock, { profile, limit: 2 }));
  });

  it("surfaces input validation errors", async () => {
    await expect(
      callQlooTool(
        "search_entities",
        { domain: "podcasts" } as never,
        mock,
      ),
    ).rejects.toThrow(/search_entities failed/);
  });
});

describe("fixture/live switch", () => {
  it("uses fixtures when QLOO_API_KEY is unset or blank", () => {
    expect(createQlooClient({})).toBeInstanceOf(MockQlooClient);
    expect(createQlooClient({ QLOO_API_KEY: "  " })).toBeInstanceOf(
      MockQlooClient,
    );
  });

  it("uses the live client when QLOO_API_KEY is set", () => {
    const client = createQlooClient({ QLOO_API_KEY: "test-key" });
    expect(client).toBeInstanceOf(LiveQlooClient);
    expect(client.mode).toBe("live");
  });

  it("never touches the network in fixture mode", async () => {
    vi.stubEnv("QLOO_API_KEY", "");
    const fetchSpy = vi.fn(() => {
      throw new Error("network disabled in tests");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const r = await callQlooTool("recommend", {
      profile: loggedProfile(["qloo:music:bjork"]),
    });
    expect(r.source).toBe("fixture");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes tools through the live client when the key is set", async () => {
    vi.stubEnv("QLOO_API_KEY", "test-key");
    const liveGraph = {
      ...FIXTURE_GRAPH,
      version: "qloo-live-test",
      dataSource: "live" as const,
    };
    const client = {
      mode: "live" as const,
      degraded: false,
      searchDataSource: "live" as const,
      getGraph: async () => liveGraph,
      searchEntities: async () => liveGraph.entities,
      logTaste: async () => undefined,
      getProfile: async () => null,
    };
    const r = await callQlooTool(
      "recommend",
      { profile: loggedProfile(["qloo:music:radiohead"]) },
      client,
    );
    expect(r.source).toBe("live");
    expect(r.fixtureId).toBeNull();
    expect(r.graphVersion).toBe("qloo-live-test");
  });
});
