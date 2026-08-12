// Capture each space's actual tool-rendered tonal grid + live score
// pill at the chosen hue, identity curves. Stitch into one composite
// image for side-by-side judgment.
import { chromium } from "playwright";

const HUE = parseInt(process.argv[2] || "180", 10);
const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const results = [];
for (const sp of SPACES) {
  await page.evaluate((sp) => {
    window.__diag.resetAllCurvesToIdentity();
    window.__diag.setSpace(sp);
  }, sp);
  await page.evaluate((h) => window.__diag.setHue(h), HUE);
  await page.waitForTimeout(500);

  // Read the score pill values
  const score = await page.evaluate(() => {
    const el = document.getElementById("grid-score");
    const out = {};
    for (const it of el.querySelectorAll(".tile-status__item")) {
      const k = it.querySelector(".tile-status__key")?.textContent;
      const v = it.querySelector(".tile-status__value")?.textContent;
      if (k && v) out[k] = v;
    }
    return out;
  });

  // Screenshot just the tile-4 grid area
  const elBox = await page.evaluate(() => {
    const el = document.getElementById("grid-target");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const path = `/tmp/calib_tool_grid_${sp}.png`;
  await page.screenshot({ path, clip: elBox });
  results.push({ space: sp, score, image: path });
}

// Inline images as base64 data URIs (Playwright's setContent blocks file://).
const fs = await import("fs");
const cells = results.map(r => {
  const buf = fs.readFileSync(r.image);
  const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
  return `
    <div class="cell">
      <div class="label">${r.space} <small>h=${HUE}°</small>
        <span class="score">Q ${r.score.Quality} · D ${r.score.Distinct} · S ${r.score.Smooth} · R ${r.score.Reach}</span>
      </div>
      <img src="${dataUri}" />
    </div>
  `;
}).join("");

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 13px monospace; color: #ddd;
         padding: 24px; }
  h1 { margin: 0 0 14px; font-size: 14px; font-weight: normal; color: #ccc; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cell { background: #1f1f1f; padding: 8px; border-radius: 4px; }
  .label { padding: 4px 0 8px; font-size: 13px; color: #ddd;
           display: flex; flex-direction: column; gap: 4px; }
  .label small { color: #888; font-size: 11px; font-weight: normal; }
  .score { color: #aaa; font-size: 11px; }
  img { display: block; width: 100%; }
</style></head><body>
  <h1>Tonal grid for each space at h=${HUE}, identity curves. Score pills as the tool reports them.</h1>
  <div class="grid">${cells}</div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 1400 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/calib_tool_grids.png", fullPage: true });

await browser.close();

console.log("wrote /tmp/calib_tool_grids.png\n");
console.log("Smoothness scores:");
for (const r of results) {
  console.log(`  ${r.space.padEnd(8)}  Q=${r.score.Quality} D=${r.score.Distinct} S=${r.score.Smooth} R=${r.score.Reach}`);
}
