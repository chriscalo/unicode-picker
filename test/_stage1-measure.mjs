// Stage 1 candidate metrics on the C-corner-color wheel for each space.
//   K=24 equal-angle samples; convert each to OKLrab.
//   m1 (uniformity)    : CV of consecutive OKLrab \u0394Es \u2014 low = even
//   m2 (plateau count) : pairs with \u0394E < 0.04 (perceptually flat)
//   m3 (stretch)       : max(\u0394E) / median(\u0394E) \u2014 high = some region stretched
//   m4 (vibrancy)      : mean chroma over all 24 samples
//   m5 (range hue)     : mean OKLrab hue step deg \u2014 should be ~15 if even
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const K = 24;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, K }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  function deltaE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const labs = [];
    const chromas = [];
    const hues = [];
    for (let i = 0; i < K; i++) {
      const h = (i / K) * 360;
      const rgb = D.atBary(sp, h, 0, 0, 1);
      const lab = D.srgbToOklrab(rgb);
      labs.push(lab);
      chromas.push(Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]));
      let theta = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
      if (theta < 0) theta += 360;
      hues.push(theta);
    }
    const dEs = [];
    for (let i = 0; i < K; i++) {
      dEs.push(deltaE(labs[i], labs[(i + 1) % K]));
    }
    const meanDE = dEs.reduce((s, x) => s + x, 0) / K;
    let varDE = 0;
    for (const x of dEs) varDE += (x - meanDE) ** 2;
    varDE /= K;
    const cv = meanDE > 1e-9 ? Math.sqrt(varDE) / meanDE : 0;
    const sortedDE = dEs.slice().sort((a, b) => a - b);
    const medianDE = sortedDE[Math.floor(K / 2)];
    const maxDE = sortedDE[K - 1];
    const minDE = sortedDE[0];
    const plateauCount = dEs.filter(x => x < 0.04).length;
    const meanChroma = chromas.reduce((s, x) => s + x, 0) / K;
    // Hue-step uniformity in degrees: consecutive OKLrab-hue diffs
    const hueSteps = [];
    for (let i = 0; i < K; i++) {
      let dh = hues[(i + 1) % K] - hues[i];
      while (dh < -180) dh += 360;
      while (dh > 180) dh -= 360;
      hueSteps.push(dh);
    }
    const sortedHue = hueSteps.slice().sort((a, b) => a - b);
    const medHue = sortedHue[Math.floor(K / 2)];
    const minHue = sortedHue[0];
    const maxHue = sortedHue[K - 1];
    // Named-family distribution
    const names = [];
    for (let i = 0; i < K; i++) {
      const angle = (i / K) * 360;
      names.push(D.hueNameAt(angle));
    }
    const counts = {};
    for (const n of names) counts[n] = (counts[n] || 0) + 1;

    // Primary-family bucketing via HSL hue of each rendered C corner
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
    const PRIMARY_BUCKETS = [
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
      for (const b of PRIMARY_BUCKETS) {
        if (b.lo > b.hi) {
          if (hslH >= b.lo || hslH < b.hi) return b.name;
        } else {
          if (hslH >= b.lo && hslH < b.hi) return b.name;
        }
      }
      return "?";
    }
    const primaryCounts = {};
    for (const b of PRIMARY_BUCKETS) primaryCounts[b.name] = 0;
    for (let i = 0; i < K; i++) {
      const angle = (i / K) * 360;
      const rgb = D.atBary(sp, angle, 0, 0, 1);
      const hslH = rgbToHslHue(rgb);
      const bk = bucketFor(hslH);
      primaryCounts[bk] = (primaryCounts[bk] || 0) + 1;
    }
    const primaryVals = Object.values(primaryCounts);
    const meanPrim = primaryVals.reduce((s, x) => s + x, 0) / primaryVals.length;
    let varPrim = 0;
    for (const c of primaryVals) varPrim += (c - meanPrim) ** 2;
    varPrim /= primaryVals.length;
    const cvPrimary = meanPrim > 0 ? Math.sqrt(varPrim) / meanPrim : 0;
    const maxPrimary = Math.max(...primaryVals);
    const minPrimary = Math.min(...primaryVals);

    const familyCounts = Object.values(counts);
    const numFamilies = familyCounts.length;
    const meanFamily = K / numFamilies;
    let varFamily = 0;
    for (const c of familyCounts) varFamily += (c - meanFamily) ** 2;
    varFamily /= numFamilies;
    const cvFamily = meanFamily > 0 ? Math.sqrt(varFamily) / meanFamily : 0;
    const maxFamily = Math.max(...familyCounts);
    out[sp] = {
      cv,
      plateauCount,
      stretch: maxDE / Math.max(0.001, medianDE),
      meanChroma,
      meanDE,
      minDE, maxDE,
      hueSpread: { min: minHue, med: medHue, max: maxHue },
      numFamilies,
      maxFamily,
      cvFamily,
      familyCounts: counts,
      primaryCounts,
      cvPrimary,
      maxPrimary,
      minPrimary,
      dEs,
      hues,
    };
  }
  return out;
}, { SPACES, K });

await browser.close();

const fmt = (x, d=3) => (typeof x === "number" ? x.toFixed(d) : "?");
const pad = (s, n) => String(s).padEnd(n);

console.log("\nStage 1 candidate metrics (K=24 angular samples around the C-corner ring):\n");
console.log(pad("space", 8),
  pad("CV(\u0394E)", 9), pad("plateaus", 10), pad("stretch", 10),
  pad("meanC", 7), pad("hue-step \u00b0(min/med/max)", 26));
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    pad(fmt(r.cv, 3), 9),
    pad(`${r.plateauCount}/${K}`, 10),
    pad(fmt(r.stretch, 2), 10),
    pad(fmt(r.meanChroma, 3), 7),
    pad(`${fmt(r.hueSpread.min, 1)} / ${fmt(r.hueSpread.med, 1)} / ${fmt(r.hueSpread.max, 1)}`, 26));
}
console.log("\nLower CV = more uniform. Lower plateau count = fewer flat regions.");
console.log("Lower stretch = no region wildly different. Higher meanC = more vibrant.");
console.log("Hue-step spread of 15\u00b0/15\u00b0/15\u00b0 is perfectly even (24 angles \u2192 360/24 = 15\u00b0).");

console.log("\nPrimary-family distribution (8 buckets: red/orange/yellow/green/cyan/blue/purple/magenta) at K=24:");
console.log(pad("space", 8),
  pad("min/max", 9), pad("CV", 7), "  per-bucket counts (R O Y G C B P M)");
for (const sp of SPACES) {
  const r = result[sp];
  const counts = ["red","orange","yellow","green","cyan","blue","purple","magenta"]
    .map(b => `${(r.primaryCounts[b] || 0).toString().padStart(2)}`)
    .join("  ");
  console.log(pad(sp, 8),
    pad(`${r.minPrimary}/${r.maxPrimary}`, 9),
    pad(fmt(r.cvPrimary, 3), 7),
    "  " + counts);
}
console.log("\nIdeal: each bucket gets 24/8 = 3 slots. CV=0 = perfectly balanced.\n");

console.log("\nNamed-family distribution (35-name \u00a714 vocabulary):\n");
console.log(pad("space", 8),
  pad("# distinct", 11), pad("max share", 10), pad("CV(family)", 12), "  family counts");
for (const sp of SPACES) {
  const r = result[sp];
  const counts = Object.entries(r.familyCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}\u00d7${v}`)
    .join(", ");
  console.log(pad(sp, 8),
    pad(`${r.numFamilies}/${K}`, 11),
    pad(`${r.maxFamily}/${K}`, 10),
    pad(fmt(r.cvFamily, 3), 12),
    "  " + counts);
}
