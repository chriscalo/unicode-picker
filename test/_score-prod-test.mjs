// Verify the in-tool v2 score pills match the eye-validated rankings.
// For each space, set h=240 and identity curves, read the actual grid
// and arc score pills.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
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
    window.__diag.setHue(240);
  }, sp);
  await page.waitForTimeout(400);
  const scores = await page.evaluate(() => {
    function read(id) {
      const el = document.getElementById(id);
      if (!el) return null;
      const items = el.querySelectorAll(".tile-status__item");
      const out = {};
      for (const it of items) {
        const k = it.querySelector(".tile-status__key")?.textContent;
        const v = it.querySelector(".tile-status__value")?.textContent;
        if (k && v) out[k] = v;
      }
      return out;
    }
    return { grid: read("grid-score"), arcs: read("arc-score") };
  });
  results.push({ space: sp, ...scores });
}

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log("\nIn-tool score pills at h=240, identity curves:\n");
console.log(pad("space", 8), pad("Q (grid)", 9), pad("D", 5), pad("S", 5), pad("R", 5),
            "  ", pad("Q (arcs)", 9), pad("D", 5), pad("S", 5), pad("R", 5));
for (const r of results) {
  const g = r.grid || {};
  const a = r.arcs || {};
  console.log(pad(r.space, 8),
    pad(g.Quality || "-", 9), pad(g.Distinct || "-", 5),
    pad(g.Smooth || "-", 5), pad(g.Reach || "-", 5),
    "  ",
    pad(a.Quality || "-", 9), pad(a.Distinct || "-", 5),
    pad(a.Smooth || "-", 5), pad(a.Reach || "-", 5),
  );
}
