# Glosses (Oct 30 demo)

Glosses is a taste-driven social discovery demo: log what you like across Qloo domains (music, film, books, places, food, TV), get a **cross-domain “next thing”** from the affinity graph, compare **taste match** with seeded friends, **blend** tastes, and see a **shared outing** suggestion. The hobbit-era idea—“meet people through taste, not the feed”—is folded into the **Friends & discovery** ranking (friends → second in network → strangers).

Built for [ikrishg/glosses](https://github.com/ikrishg/glosses). Deploys cleanly to Vercel (Next.js + TypeScript).

## Kill test

**ChatGPT alone, given the same quiz answers, must not pick the same next thing / pair / outing.**

This demo is designed so recommendations are produced only by traversing the **Qloo-style cross-domain graph** (`src/lib/graph/fixture-graph.ts`, version `qloo-fixture-oct30-v1`): opaque entity IDs, edge weights, domain-diversity bonus, and graph-version tie-breakers. Quiz buttons map to entity IDs, but the ranked outputs depend on that graph structure—not on natural-language reasoning. A general LLM without this graph will not reliably reproduce the same top pick, blend list, or outing pairing.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
npm test
```

### Production build

```bash
npm run build
npm start
```

## Qloo API (mock today, live swap)

The Qloo client lives behind a small interface in `src/lib/qloo/client.ts`:

| Mode | When | Implementation |
|------|------|----------------|
| **Mock** (default) | `QLOO_API_KEY` unset | `MockQlooClient` serves `FIXTURE_GRAPH` |
| **Live** | `QLOO_API_KEY` set | `LiveQlooClient` calls Qloo HTTP APIs |

1. Copy env template and set your key:

   ```bash
   cp .env.example .env.local
   # edit QLOO_API_KEY=your_key_here
   ```

2. Restart the dev server (or redeploy on Vercel with the env var).

3. Confirm mode: `GET /api/qloo-mode` returns `{ "mode": "live", "graphVersion": "..." }`.

**Note:** `LiveQlooClient` is wired to the expected Qloo base URL and auth header pattern; when your key is issued, validate response shapes against Qloo’s docs and adjust parsing if needed. Taste persistence for the demo remains in the browser session; production would persist via your backend.

## Qloo MCP server (`src/mcp/qloo/`)

A thin [MCP](https://modelcontextprotocol.io) wrapper over the same `QlooClient` seam and engines. Three read-only tools:

| Tool | Input | Returns |
|------|-------|---------|
| `search_entities` | `domain`, `query?`, `limit?` | Qloo entities in one domain |
| `recommend` | `profile` (tastes), `limit?` | Cross-domain “next thing” picks |
| `compare_taste` | `viewer`, `people[]`, `blendWithPersonId?`, `blendLimit?` | Ranked taste matches + blend picks + shared outing |

Every response carries `source` (`fixture` or `live`), `graphVersion`, and `fixtureId`. In fixture mode the id is stable for the same graph version, tool, and input (e.g. `qloo-fixture-oct30-v1/recommend/7d41e88a`); in live mode it is `null`.

**Fixture/live switch:** same as the app — `QLOO_API_KEY` unset or blank serves fixtures; set routes through `LiveQlooClient`. Tests stub `fetch` and never call Qloo.

The app’s taste log (`search_entities`), next thing (`recommend`), and friends/blend/outing (`compare_taste`) call these tools via `POST /api/qloo-mcp`, which talks to the server over an in-memory MCP transport.

### Run locally over stdio

```bash
npm run mcp:qloo
```

To register it with an MCP client (Cursor, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "glosses-qloo": {
      "command": "npm",
      "args": ["run", "--silent", "mcp:qloo"],
      "cwd": "/path/to/glosses"
    }
  }
}
```

Add `"env": { "QLOO_API_KEY": "..." }` only once the key is issued; leave it out to stay on fixtures.

## What’s in / out (signed Oct 30)

**In:** taste logging, cross-domain recommendations, friend match + blend + outing, profile shift, hobbit-style social discovery ranking, seeded fake friends for filming.

**Out:** Substack / research papers / YouTube as entities, strangers-only cold start as the main path, anything past Oct 30 without a new sign-off.

## Project map

- `src/lib/graph/fixture-graph.ts` — cross-domain entities & edges
- `src/lib/engine/*` — recommend, match, blend, outing (unit tested)
- `src/lib/qloo/client.ts` — mock vs live adapter
- `src/mcp/qloo/` — Qloo MCP server (`tools.ts` handlers, `server.ts`, `stdio.ts` entry)
- `src/app/api/qloo-mcp/route.ts` — app → MCP tool bridge
- `src/components/GlossesDemo.tsx` — main UI flow

## Deploy (Vercel)

Import the repo, set `QLOO_API_KEY` when ready, default build command `npm run build`.
