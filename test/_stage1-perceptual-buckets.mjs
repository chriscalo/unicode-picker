// Stage 1 — perceptual-bucket metric. 16 equal-HSL-width buckets
// (8 primaries + 8 transitions, each 22.5°). Sample wheel at 1°,
// bucket each sample, measure RMSE of share deviations from 1/16.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N_BUCKETS = 16;
const SAMPLES = 360;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, N_BUCKETS, SAMPLES }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  function rgbToHslHue(rgb) {
    const r = rgb[0], g = rgb[1], b = rgb[2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 1e-9) return 0;
    let h;
    if (mx === r) h = ((g - b) / (mx - mn)) % 6;
    else if (mx === g) h = (b - r) / (mx - mn) + 2;
    else h = (r - g) / (mx - mn) + 4;
    h *= 60;
    return ((h % 360) + 360) % 360;
  }
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const buckets = new Array(N_BUCKETS).fill(0);
    for (let i = 0; i < SAMPLES; i++) {
      const h = (i / SAMPLES) * 360;
      const rgb = D.atBary(sp, h, 0, 0, 1);
      const hslH = rgbToHslHue(rgb);
      // Bucket 0 centered on red (0°). Bucket boundaries at
      // -11.25, 11.25, 33.75, ..., 348.75.
      const shifted = (hslH + 11.25 + 360) % 360;
      const bucket = Math.floor(shifted / (360 / N_BUCKETS));
      buckets[bucket]++;
    }
    const shares = buckets.map(c => c / SAMPLES);
    const ideal = 1 / N_BUCKETS;
    let sqSum = 0;
    for (const s of shares) sqSum += (s - ideal) ** 2;
    const rmse = Math.sqrt(sqSum / N_BUCKETS);
    // Max possible RMSE: one bucket has all samples, rest = 0
    const maxRmse = Math.sqrt(((1 - ideal) ** 2 + (N_BUCKETS - 1) * ideal ** 2) / N_BUCKETS);
    const score = 1 - rmse / maxRmse;
    out[sp] = { shares, rmse, score };
  }
  return out;
}, { SPACES, N_BUCKETS, SAMPLES });

await browser.close();

// 16 perceptual labels in order
const LABELS = [
  "R", "R-O", "O", "O-Y", "Y", "Y-G", "G", "G-C",
  "C", "C-B", "B", "B-P", "P", "P-M", "M", "M-R",
];

const fmt = (x) => (x * 100).toFixed(1).padStart(5);
const pad = (s, n) => String(s).padEnd(n);

console.log(`\n16-bucket perceptual evenness (sample at 1°/step, ${SAMPLES} samples)\n`);
console.log(`Ideal share per bucket = ${(100/N_BUCKETS).toFixed(2)}%\n`);

console.log("Per-space bucket shares (% of 360°):");
console.log(pad("space", 8), LABELS.map(l => pad(l, 5)).join(""), " score");
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    r.shares.map(s => pad(fmt(s), 5)).join(""),
    " " + r.score.toFixed(3));
}
