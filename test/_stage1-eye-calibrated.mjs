// Stage 1 — Hue evenness using eye-calibrated category boundaries
// (collected via the boundary probes 2026-04-25). Each of 16
// categories ideally claims 1/16 = 22.5° of the wheel.
import { chromium } from "playwright";

const BOUNDARIES = [
  ["R",   346.37,   2.06],
  ["R-O",   2.06,  11.63],
  ["O",    11.63,  32.07],
  ["O-Y",  32.07,  46.40],
  ["Y",    46.40,  65.17],
  ["Y-G",  65.17,  85.24],
  ["G",    85.24, 137.00],
  ["G-C", 137.00, 175.47],
  ["C",   175.47, 188.98],
  ["C-B", 188.98, 200.65],
  ["B",   200.65, 253.26],
  ["B-P", 253.26, 265.04],
  ["P",   265.04, 287.63],
  ["P-M", 287.63, 290.09],
  ["M",   290.09, 327.52],
  ["M-R", 327.52, 346.37],
];

function categoryFor(h) {
  const x = ((h % 360) + 360) % 360;
  for (const [name, lo, hi] of BOUNDARIES) {
    if (lo > hi) {
      if (x >= lo || x < hi) return name;
    } else {
      if (x >= lo && x < hi) return name;
    }
  }
  return "?";
}

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const SAMPLES = 720;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, SAMPLES, BOUNDARIES }) => {
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
  function categoryFor(h) {
    const x = ((h % 360) + 360) % 360;
    for (const [name, lo, hi] of BOUNDARIES) {
      if (lo > hi) {
        if (x >= lo || x < hi) return name;
      } else {
        if (x >= lo && x < hi) return name;
      }
    }
    return "?";
  }
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const counts = {};
    for (const [name] of BOUNDARIES) counts[name] = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const h = (i / SAMPLES) * 360;
      const rgb = D.atBary(sp, h, 0, 0, 1);
      const hslH = rgbToHslHue(rgb);
      counts[categoryFor(hslH)]++;
    }
    out[sp] = counts;
  }
  return out;
}, { SPACES, SAMPLES, BOUNDARIES });

await browser.close();

const N_CAT = BOUNDARIES.length;
const ideal = 1 / N_CAT;
const fmt = (x) => (x * 100).toFixed(1).padStart(5);
const pad = (s, n) => String(s).padEnd(n);

console.log("\nHue evenness with eye-calibrated 16-category boundaries");
console.log(`Ideal share per category = ${(100 / N_CAT).toFixed(2)}%\n`);

console.log("Per-space category shares (% of 360°):");
const headers = BOUNDARIES.map(([n]) => pad(n, 5)).join("");
console.log(pad("space", 8), headers);
for (const sp of SPACES) {
  const shares = BOUNDARIES.map(([n]) => result[sp][n] / SAMPLES);
  console.log(pad(sp, 8), shares.map(s => pad(fmt(s), 5)).join(""));
}

console.log("\nAsymmetric weighting: compress_w² × compression² + stretch_w² × stretch²");
console.log("(scores are 1 - sqrt(weighted_mean) / max_RMSE)\n");
const RATIOS = [
  { c: 1, s: 1, label: "1:1 symmetric"  },
  { c: 2, s: 1, label: "2:1 comp×2"     },
  { c: 4, s: 1, label: "4:1 comp×4"     },
  { c: 1, s: 0, label: "comp-only"      },
];
console.log(pad("space", 8), RATIOS.map(r => pad(r.label, 16)).join(""));
for (const sp of SPACES) {
  const shares = BOUNDARIES.map(([n]) => result[sp][n] / SAMPLES);
  const cells = [];
  for (const r of RATIOS) {
    let sqSum = 0;
    for (const s of shares) {
      const dev = s - ideal;
      const w = dev < 0 ? r.c : r.s;
      sqSum += (w * dev) ** 2;
    }
    const rmse = Math.sqrt(sqSum / N_CAT);
    const maxRmse = Math.sqrt(((1 - ideal) ** 2 + (N_CAT - 1) * ideal ** 2) / N_CAT);
    const score = 1 - rmse / (r.c * maxRmse);
    cells.push(pad(score.toFixed(3), 16));
  }
  console.log(pad(sp, 8), cells.join(""));
}
