#!/usr/bin/env node
/**
 * Optional smoke check against Qloo hackathon API.
 * Skips when QLOO_API_KEY is unset; prints only status codes and result counts.
 */

const key = process.env.QLOO_API_KEY?.trim();
if (!key) {
  console.log("skip: QLOO_API_KEY not set");
  process.exit(0);
}

const base =
  process.env.QLOO_BASE_URL?.trim() || "https://hackathon.api.qloo.com";

async function probe(path, query) {
  const params = new URLSearchParams(query);
  const url = `${base.replace(/\/$/, "")}${path}?${params}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": key },
  });
  let count = 0;
  try {
    const data = await res.json();
    if (Array.isArray(data.results)) count = data.results.length;
    else if (data.results?.entities) count = data.results.entities.length;
  } catch {
    count = -1;
  }
  console.log(`${path} ${res.status} count=${count}`);
}

await probe("/search", {
  query: "Radiohead",
  types: "urn:entity:artist",
  take: "1",
});

const searchRes = await fetch(
  `${base.replace(/\/$/, "")}/search?query=Radiohead&types=urn%3Aentity%3Aartist&take=1`,
  { headers: { "X-Api-Key": key } },
);
const searchJson = await searchRes.json();
const entityId = searchJson.results?.[0]?.entity_id;
if (entityId) {
  await probe("/v2/insights", {
    "filter.type": "urn:entity:book",
    "signal.interests.entities": entityId,
    take: "2",
  });
} else {
  console.log("/v2/insights skip (no entity id from search)");
}
