// Stage 1 — perceptual evenness via §14-grouped 16 categories.
// Each category has unequal HSL width (reflecting empirical naming
// density), but all share the same ideal 1/16 angular share. HWB's
// HSL-uniform sampling no longer scores perfectly because green-
// family categories span much more HSL than the others.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const SAMPLES = 360;

// Map each §14 name to one of 16 perceptual categories.
const NAME_TO_CATEGORY = {
  red: "R", crimson: "R", tomato: "R-O", coral: "R-O",
  orange: "O", tangerine: "O", amber: "O-Y", gold: "O-Y",
  yellow: "Y", olive: "Y-G",
  chartreuse: "G", lime: "G", green: "G", grass: "G",
  emerald: "G-C", jade: "G-C",
  teal: "C", turquoise: "C", cyan: "C", aqua: "C",
  cerulean: "C-B", sky: "C-B", dodger: "C-B",
  azure: "B", blue: "B",
  iris: "B-P", indigo: "B-P",
  violet: "P", purple: "P",
  fuchsia: "P-M", orchid: "P-M",
  magenta: "M", hotpink: "M",
  pink: "M-R", rose: "M-R",
};
const CATEGORIES = ["R", "R-O", "O", "O-Y", "Y", "Y-G", "G", "G-C",
                    "C", "C-B", "B", "B-P", "P", "P-M", "M", "M-R"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, SAMPLES, NAME_TO_CATEGORY, CATEGORIES }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const counts = {};
    for (const c of CATEGORIES) counts[c] = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const h = (i / SAMPLES) * 360;
      D.setHue(h);
      const name = D.hueNameAt(h);
      const cat = NAME_TO_CATEGORY[name];
      if (cat) counts[cat]++;
    }
    const shares = CATEGORIES.map(c => counts[c] / SAMPLES);
    const ideal = 1 / CATEGORIES.length;
    let sqSum = 0;
    for (const s of shares) sqSum += (s - ideal) ** 2;
    const rmse = Math.sqrt(sqSum / CATEGORIES.length);
    const N1 = CATEGORIES.length;
    const maxRmse = Math.sqrt(((1 - ideal) ** 2 + (N1 - 1) * ideal ** 2) / N1);
    const score = 1 - rmse / maxRmse;
    out[sp] = { shares, rmse, score };
  }
  return out;
}, { SPACES, SAMPLES, NAME_TO_CATEGORY, CATEGORIES });

await browser.close();

const fmt = (x) => (x * 100).toFixed(1).padStart(5);
const pad = (s, n) => String(s).padEnd(n);

console.log(`\n16-category perceptual evenness (§14-grouped, ${SAMPLES} samples)\n`);
console.log(`Ideal share per category = ${(100/CATEGORIES.length).toFixed(2)}%\n`);

console.log("Per-space category shares (% of 360°):");
console.log(pad("space", 8), CATEGORIES.map(c => pad(c, 5)).join(""), " score");
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    r.shares.map(s => pad(fmt(s), 5)).join(""),
    " " + r.score.toFixed(3));
}
