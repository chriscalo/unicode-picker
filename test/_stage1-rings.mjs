// Stage 1 calibration: capture tile-1 ring (continuous hue wheel) for
// all 6 UI spaces. Stitch into one composite image for ranking.
import { chromium } from "playwright";
import fs from "fs";

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

const images = [];
for (const sp of SPACES) {
  await page.evaluate((sp) => {
    window.__diag.resetAllCurvesToIdentity();
    window.__diag.setSpace(sp);
  }, sp);
  await page.waitForTimeout(500);
  const elBox = await page.evaluate(() => {
    const el = document.getElementById("picker-stage");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const path = `/tmp/calib_stage1_ring_${sp}.png`;
  await page.screenshot({ path, clip: elBox });
  images.push({ space: sp, path });
}

const cells = images.map(r => {
  const buf = fs.readFileSync(r.path);
  const dataUri = `data:image/png;base64,${buf.toString("base64")}`;
  return `
    <div class="cell">
      <div class="label">${r.space}</div>
      <img src="${dataUri}" />
    </div>
  `;
}).join("");

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 14px monospace; color: #ddd;
         padding: 24px; }
  h1 { margin: 0 0 14px; font-size: 14px; font-weight: normal; color: #ccc; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .cell { background: #1f1f1f; padding: 8px; border-radius: 4px; }
  .label { padding: 4px 0 8px; font-size: 13px; color: #ddd; }
  img { display: block; width: 100%; }
</style></head><body>
  <h1>Stage 1 \u2014 continuous hue wheel for each space (Tile 1 ring). Identity curves.</h1>
  <div class="grid">${cells}</div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 1100 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/calib_stage1_rings.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_stage1_rings.png");
