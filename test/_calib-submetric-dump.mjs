// Dump per-1D-scale sub-metric breakdown for HWB vs OKHSL at h=180.
// Tells us which sub-metric is responsible for HWB's lower Smoothness.
import { chromium } from "playwright";

const HUE = parseInt(process.argv[2] || "240", 10);
const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

for (const sp of SPACES) {
  await page.evaluate(({ sp, h }) => {
    window.__diag.resetAllCurvesToIdentity();
    window.__diag.setSpace(sp);
    window.__diag.setHue(h);
  }, { sp, h: HUE });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const r = window.__lastGridResult;
    if (!r) return null;
    const labels = ["W↔C top", "W↔B left", "B↔C diag"];
    return {
      Q: r.quality, D: r.distinctQ, S: r.smoothQ, R: r.reachQ,
      cornerEdges: r.cornerEdges.map((s, i) => ({
        label: labels[i] || `corner-${i}`,
        smoothness: s.smoothness,
        hueDrift: s.hueDrift,
        chromaAdequacy: s.chromaAdequacy,
        blackPocket: s.blackPocket,
      })),
    };
  });

  console.log(`\n══ ${sp} at h=${HUE} ══════════════════════════════`);
  console.log(`  Q ${result.Q.toFixed(0)}  D ${result.D.toFixed(0)}  S ${result.S.toFixed(0)}  R ${result.R.toFixed(0)}`);
  console.log(`  ${"edge".padEnd(10)}  smooth hueDrift chromaAdq blackPocket`);
  for (const e of result.cornerEdges) {
    console.log(`  ${e.label.padEnd(10)}    ${e.smoothness.toFixed(0).padStart(3)}      ${e.hueDrift.toFixed(0).padStart(3)}       ${e.chromaAdequacy.toFixed(0).padStart(3)}        ${(e.blackPocket ?? 100).toFixed(0).padStart(3)}`);
  }
}

await browser.close();
