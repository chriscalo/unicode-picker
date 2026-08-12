// Stage 1 metrics at fine resolution (360 samples, 1\u00b0 step). The
// resolution is just for numerical accuracy of the continuous-wheel
// integrals \u2014 it's not a quantization decision.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N = 360;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, N }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();

  // Precompute max sRGB chroma per OKLrab hue (1° bins) for vibrancy.
  const HUE_BINS = 360;
  const maxC = new Float64Array(HUE_BINS);
  const FACES = [
    (s, t) => [0, s, t], (s, t) => [1, s, t],
    (s, t) => [s, 0, t], (s, t) => [s, 1, t],
    (s, t) => [s, t, 0], (s, t) => [s, t, 1],
  ];
  const STEP = 1 / 64;
  for (const f of FACES) {
    for (let s = 0; s <= 1 + 1e-9; s += STEP) {
      for (let t = 0; t <= 1 + 1e-9; t += STEP) {
        const rgb = f(Math.min(1, s), Math.min(1, t));
        const lab = D.srgbToOklrab(rgb);
        const c = Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]);
        if (c < 1e-6) continue;
        let th = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
        if (th < 0) th += 360;
        const bin = Math.floor(th) % HUE_BINS;
        if (c > maxC[bin]) maxC[bin] = c;
      }
    }
  }
  for (let i = 0; i < HUE_BINS; i++) {
    if (maxC[i] === 0) {
      maxC[i] = (maxC[(i - 1 + HUE_BINS) % HUE_BINS]
                + maxC[(i + 1) % HUE_BINS]) / 2;
    }
  }

  function dE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
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
    { name: "red", lo: 345, hi: 15 }, { name: "orange", lo: 15, hi: 45 },
    { name: "yellow", lo: 45, hi: 75 }, { name: "green", lo: 75, hi: 165 },
    { name: "cyan", lo: 165, hi: 195 }, { name: "blue", lo: 195, hi: 255 },
    { name: "purple", lo: 255, hi: 285 }, { name: "magenta", lo: 285, hi: 345 },
  ];
  function bucketFor(h) {
    for (const b of PRIMARY) {
      if (b.lo > b.hi) { if (h >= b.lo || h < b.hi) return b.name; }
      else if (h >= b.lo && h < b.hi) return b.name;
    }
    return "?";
  }

  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const labs = [];
    const buckets = {};
    for (const b of PRIMARY) buckets[b.name] = 0;
    let satTotal = 0, satMin = Infinity;
    for (let i = 0; i < N; i++) {
      const h = (i / N) * 360;
      const rgb = D.atBary(sp, h, 0, 0, 1);
      const lab = D.srgbToOklrab(rgb);
      labs.push(lab);
      buckets[bucketFor(rgbToHslHue(rgb))]++;
      const cR = Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]);
      let theta = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
      if (theta < 0) theta += 360;
      const cMaxAtHue = maxC[Math.floor(theta) % 360];
      const ratio = cMaxAtHue > 1e-6 ? cR / cMaxAtHue : 1;
      satTotal += ratio;
      if (ratio < satMin) satMin = ratio;
    }
    const meanSat = satTotal / N;
    const dEs = [];
    let total = 0;
    for (let i = 0; i < N; i++) {
      const d = dE(labs[i], labs[(i + 1) % N]);
      dEs.push(d);
      total += d;
    }
    const sorted = dEs.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(N / 2)];
    const max = sorted[N - 1];
    const minVal = sorted[0];
    const meanDE = total / N;
    let varDE = 0;
    for (const d of dEs) varDE += (d - meanDE) ** 2;
    const cv = meanDE > 1e-9 ? Math.sqrt(varDE / N) / meanDE : 0;
    const fractions = {};
    for (const k of Object.keys(buckets)) fractions[k] = buckets[k] / N;
    // Hue evenness — RMSE of per-family share deviations from 1/N ideal.
    // Normalize to max possible RMSE (one family = 1, others = 0).
    const FAMILIES = Object.keys(buckets);
    const NF = FAMILIES.length;
    const idealShare = 1 / NF;
    let sqSum = 0;
    for (const f of FAMILIES) {
      const share = buckets[f] / N;
      sqSum += (share - idealShare) ** 2;
    }
    const rmse = Math.sqrt(sqSum / NF);
    const maxRmse = Math.sqrt(((1 - idealShare) ** 2 + (NF - 1) * idealShare ** 2) / NF);
    const evenness = 1 - rmse / maxRmse;

    // Color smoothness — RMSE of per-step ΔE deviations from the mean
    // step size, normalized.
    let sqStep = 0;
    for (const d of dEs) sqStep += (d - meanDE) ** 2;
    const stepStdev = Math.sqrt(sqStep / N);
    // Use CV (stdev/mean) as the normalized form. CV=0 ideal, CV=1 = stdev as
    // big as the mean (chaotic). Score = 1 - clamp(CV / CV_ceiling).
    const stepCV = meanDE > 1e-9 ? stepStdev / meanDE : 0;
    const cvCeiling = 1.0; // calibration choice
    const smoothness = Math.max(0, 1 - stepCV / cvCeiling);

    out[sp] = {
      stretchRatio: max / Math.max(0.001, median),
      cv,
      meanDE, max, median, minVal,
      totalArcLength: total,
      fractions,
      meanSat,
      satMin,
      rmse,
      maxRmse,
      evenness,
      stepStdev,
      stepCV,
      smoothness,
    };
  }
  return out;
}, { SPACES, N });

await browser.close();

const FAMILIES = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "magenta"];
const fmt = (x, d=3) => (typeof x === "number" ? x.toFixed(d) : "?");
const fmtPct = (x) => (x * 100).toFixed(1).padStart(5);
const pad = (s, n) => String(s).padEnd(n);

console.log(`\nStage 1 metrics at N=${N} samples (1\u00b0/step, continuous-wheel resolution).\n`);

console.log("Smoothness diagnostic:");
console.log(pad("space", 8),
  pad("max\u0394E/median", 13), pad("CV(\u0394E)", 9),
  pad("totalArc", 10), pad("medDE", 8), pad("maxDE", 8));
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    pad(fmt(r.stretchRatio, 2), 13),
    pad(fmt(r.cv, 3), 9),
    pad(fmt(r.totalArcLength, 3), 10),
    pad(fmt(r.median, 4), 8),
    pad(fmt(r.max, 4), 8));
}

console.log("\nVibrancy (mean of per-hue saturation ratios):");
console.log(pad("space", 8), pad("score", 7));
for (const sp of SPACES) {
  console.log(pad(sp, 8), pad(fmt(result[sp].meanSat, 3), 7));
}

console.log("\nHue evenness (RMSE of family-share deviations from 1/8 ideal, normalized):");
console.log(pad("space", 8), pad("score", 7), pad("RMSE", 7));
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    pad(fmt(r.evenness, 3), 7),
    pad(fmt(r.rmse, 4), 7));
}

console.log("\nColor smoothness (1 - CV of step-size deviations, normalized):");
console.log(pad("space", 8), pad("score", 7), pad("CV", 7));
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    pad(fmt(r.smoothness, 3), 7),
    pad(fmt(r.stepCV, 3), 7));
}

console.log("\nCoverage (angular sweep per primary, 1\u00b0 resolution):");
console.log(pad("space", 8), FAMILIES.map(f => pad(f, 7)).join(""), "  min%");
for (const sp of SPACES) {
  const f = result[sp].fractions;
  const vals = FAMILIES.map(k => f[k]);
  const mn = Math.min(...vals);
  console.log(pad(sp, 8),
    vals.map(v => pad(fmtPct(v), 7)).join(""),
    "  " + fmtPct(mn));
}
