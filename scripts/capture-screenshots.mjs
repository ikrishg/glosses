// Per-AC click-path capture. Run against a server started WITHOUT QLOO_API_KEY (fixtures only).
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = process.env.OUT_DIR ?? "/opt/cursor/artifacts/screenshots";
await mkdir(outDir, { recursive: true });

const mode = await (await fetch(`${baseUrl}/api/qloo-mode`)).json();
if (mode.mode !== "mock") {
  throw new Error(`Refusing to capture: server is in ${mode.mode} mode`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const lastByTool = {};
page.on("response", async (res) => {
  if (!res.url().endsWith("/api/qloo-mcp")) return;
  const tool = res.request().postDataJSON()?.tool;
  if (tool) lastByTool[tool] = await res.json();
});

const waitForTool = (tool) =>
  page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/qloo-mcp") &&
      res.request().postDataJSON()?.tool === tool,
  );

const section = (heading) =>
  page.locator("section").filter({
    has: page.getByRole("heading", { name: heading }),
  });

async function logTaste(label) {
  const done = Promise.all([waitForTool("recommend"), waitForTool("compare_taste")]);
  await page.getByRole("button", { name: label }).click();
  await done;
  await page.waitForTimeout(150);
}

// AC-G1: taste log saves entries across 2+ domains.
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /music · Radiohead/i }).waitFor();
await page.screenshot({ path: `${outDir}/ac-g1-1-empty-taste-log.png` });
await logTaste(/music · Radiohead/i);
await logTaste(/film · Her/i);
await logTaste(/places · Los Feliz 3/i);
await page.getByText("Logged: Radiohead, Her, Los Feliz 3").waitFor();
await page.screenshot({ path: `${outDir}/ac-g1-2-logged-music-film-places.png` });

// AC-G2: next-thing pick for the logged profile.
const nextSection = section("Cross-domain next thing");
await nextSection.getByTestId("recommend-fixture-id").waitFor();
await nextSection.scrollIntoViewIfNeeded();
await nextSection.screenshot({ path: `${outDir}/ac-g2-next-thing.png` });
const recommend = lastByTool.recommend;

// AC-G3: friend blend/outing for 2 profiles (You + Jordan).
const blendDone = waitForTool("compare_taste");
await page.getByRole("button", { name: /Jordan \(friend\)/ }).click();
await blendDone;
await page.getByText("With Jordan (friend)").waitFor();
await page.waitForTimeout(150);
const friends = section("Friends & discovery");
await friends.getByTestId("pick-taste-twin").waitFor();
await friends.getByTestId("pick-outing-blend").waitFor();
await friends.scrollIntoViewIfNeeded();
await friends.screenshot({ path: `${outDir}/ac-g3-0-friend-picks.png` });
const friendPicks = {
  tasteTwin: await friends.getByTestId("pick-taste-twin").innerText(),
  outingBlend: await friends.getByTestId("pick-outing-blend").innerText(),
};
await page.screenshot({ path: `${outDir}/ac-g3-1-pick-jordan.png` });
await section("Suggested shared outing").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${outDir}/ac-g3-2-blend-and-outing.png` });
const compare = lastByTool.compare_taste;

await page.screenshot({ path: `${outDir}/full-page-after-click-path.png`, fullPage: true });
await browser.close();

const proof = {
  qlooMode: mode,
  "AC-G2": {
    tool: "recommend",
    fixtureId: recommend.fixtureId,
    graphVersion: recommend.graphVersion,
    topPick: recommend.recommendations[0]?.entity,
    picks: recommend.recommendations.map((r) => r.entity.id),
  },
  "AC-G3": {
    tool: "compare_taste",
    fixtureId: compare.fixtureId,
    graphVersion: compare.graphVersion,
    blendWith: compare.blend.withPersonId,
    friendPicksOnScreen: friendPicks,
    blendPicks: compare.blend.recommendations.map((r) => r.entity.id),
    outing: compare.blend.outing && {
      place: compare.blend.outing.place.id,
      food: compare.blend.outing.food.id,
      activity: compare.blend.outing.activity?.id ?? null,
    },
  },
};
await writeFile(`${outDir}/fixture-ids.json`, JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
console.log("Screenshots saved to", outDir);
