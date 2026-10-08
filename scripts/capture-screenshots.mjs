import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const outDir = "/opt/cursor/artifacts/screenshots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.screenshot({
  path: `${outDir}/01-taste-logging.png`,
  fullPage: true,
});

await page.getByRole("button", { name: /music · Radiohead/i }).click();
await page.getByRole("button", { name: /film · Her/i }).click();
await page.waitForTimeout(400);
await page.screenshot({
  path: `${outDir}/02-recommendations-profile.png`,
  fullPage: true,
});

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(300);
await page.screenshot({
  path: `${outDir}/03-friends-blend-outing.png`,
  fullPage: true,
});

await browser.close();
console.log("Screenshots saved to", outDir);
