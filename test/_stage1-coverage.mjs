// Stage 1 coverage: angular sweep of each primary hue family on the
// continuous wheel. No quantization \u2014 720 samples is just numerical
// integration resolution.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N_INT = 720; // 0.5\u00b0 integration steps

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, N_INT }) => {
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
  const PRIMARY = [
    { name: "red",     lo: 345, hi: 15 },
    { name: "orange",  lo: 15,  hi: 45 },
    { name: "yellow",  lo: 45,  hi: 75 },
    { name: "green",   lo: 75,  hi: 165 },
    { name: "cyan",    lo: 165, hi: 195 },
    { name: "blue",    lo: 195, hi: 255 },
    { name: "purple",  lo: 255, hi: 285 },
    { name: "magenta", lo: 285, hi: 345 },
  ];
  function bucketFor(hslH) {
    for (const b of PRIMARY) {
      if (b.lo > b.hi) {
        if (hslH >= b.lo || hslH < b.hi) return b.name;
      } else {
        if (hslH >= b.lo && hslH < b.hi) return b.name;
      }
    }
    return "?";
  }
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const counts = {};
    for (const b of PRIMARY) counts[b.name] = 0;
    for (let i = 0; i < N_INT; i++) {
      const h = (i / N_INT) * 360;
      const rgb = D.atBary(sp, h, 0, 0, 1);
      counts[bucketFor(rgbToHslHue(rgb))]++;
    }
    const fractions = {};
    for (const k of Object.keys(counts)) fractions[k] = counts[k] / N_INT;
    out[sp] = { fractions };
  }
  return out;
}, { SPACES, N_INT });

await browser.close();

const FAMILIES = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta"];
const IDEAL = 1 / 8;
const fmt = (x) => (x * 100).toFixed(1).padStart(5);
const pad = (s, n) => String(s).padEnd(n);

console.log("\nAngular sweep of each primary family on the wheel (% of 360\u00b0):");
console.log("Ideal: 12.5% per family.\n");
console.log(pad("space", 8), FAMILIES.map(f => pad(f, 7)).join(""), "  min%   max%   maxDev%");
for (const sp of SPACES) {
  const f = result[sp].fractions;
  const vals = FAMILIES.map(k => f[k]);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const maxDev = Math.max(...vals.map(v => Math.abs(v - IDEAL)));
  console.log(pad(sp, 8),
    vals.map(v => pad(fmt(v), 7)).join(""),
    "  " + fmt(mn) + "  " + fmt(mx) + "  " + fmt(maxDev));
}
console.log("\nmaxDev% = how far the worst family is from the 12.5% ideal.");
