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

## What’s in / out (signed Oct 30)

**In:** taste logging, cross-domain recommendations, friend match + blend + outing, profile shift, hobbit-style social discovery ranking, seeded fake friends for filming.

**Out:** Substack / research papers / YouTube as entities, strangers-only cold start as the main path, anything past Oct 30 without a new sign-off.

## Project map

- `src/lib/graph/fixture-graph.ts` — cross-domain entities & edges
- `src/lib/engine/*` — recommend, match, blend, outing (unit tested)
- `src/lib/qloo/client.ts` — mock vs live adapter
- `src/components/GlossesDemo.tsx` — main UI flow

## Deploy (Vercel)

Import the repo, set `QLOO_API_KEY` when ready, default build command `npm run build`.
