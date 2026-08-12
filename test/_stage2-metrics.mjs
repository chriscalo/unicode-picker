// Stage 2 — Hue quantization metrics. For each (space, K) pair,
// pick K slots at uniform input-hue angles 0, 360/K, ..., compute
// the C-corner color, and score three properties:
//
//   1. Distinctness   — mean of min(1, ΔE_i / JND) over adjacent
//                       pairs (each pair contributes its safety
//                       margin up to JND; saturates above)
//   2. Family coverage — fraction of the 16 eye-calibrated perceptual
//                       categories that contain ≥ 1 slot
//   3. Vibrancy       — mean per-slot saturation ratio c / maxC(η)
//                       in OKLrab
//
// Same eye-calibrated 16 boundaries used in Stage 1 are reused here.
// JND threshold in OKLrab is a calibration parameter; default 0.010
// (roughly the perceptibility threshold for hue/chroma ΔE).
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const KS     = [8, 12, 16, 24, 32];
const JND    = 0.010; // OKLrab ΔE perceptibility threshold

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

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, KS, BOUNDARIES, JND }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();

  // Build the OKLrab maxC-per-hue table from sRGB cube faces.
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
  function dE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    out[sp] = {};
    for (const K of KS) {
      const slots = [];
      const labs  = [];
      const cats  = new Set();
      let satSum  = 0;
      for (let i = 0; i < K; i++) {
        const h = (i * 360) / K;
        const rgb = D.atBary(sp, h, 0, 0, 1);
        const lab = D.srgbToOklrab(rgb);
        slots.push({ h, rgb, lab });
        labs.push(lab);
        cats.add(categoryFor(rgbToHslHue(rgb)));
        const c = Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]);
        let theta = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
        if (theta < 0) theta += 360;
        const cMax = maxC[Math.floor(theta) % HUE_BINS];
        const ratio = cMax > 1e-6 ? c / cMax : 1;
        satSum += ratio;
      }
      // Adjacent ΔE around the wheel (wraparound)
      const dEs = [];
      let total = 0;
      for (let i = 0; i < K; i++) {
        const d = dE(labs[i], labs[(i + 1) % K]);
        dEs.push(d);
        total += d;
      }
      const meanDE = total / K;
      // JND-floor distinctness: each pair contributes its safety margin
      // up to 1.0 (saturates above JND). Penalizes only pairs below JND.
      let safetySum = 0;
      let belowJND = 0;
      for (const d of dEs) {
        safetySum += Math.min(1, d / JND);
        if (d < JND) belowJND++;
      }
      const distinctness = safetySum / K;

      // Family coverage: fraction of min(K,16) categories represented
      const coverage = cats.size / Math.min(K, 16);

      // Vibrancy: mean saturation ratio
      const vibrancy = satSum / K;

      out[sp][K] = {
        distinctness, coverage, vibrancy,
        cats: [...cats].sort(),
        catCount: cats.size,
        meanDE,
        minDE:  Math.min(...dEs),
        maxDE:  Math.max(...dEs),
        belowJND,
      };
    }
  }
  return out;
}, { SPACES, KS, BOUNDARIES, JND });

await browser.close();

const fmt = (x, d=3) => (typeof x === "number" ? x.toFixed(d) : "?");
const pad = (s, n) => String(s).padEnd(n);

console.log(`\nStage 2 — Hue quantization metrics`);
console.log(`16 eye-calibrated categories. K = ${KS.join(", ")}. JND = ${JND}.\n`);

for (const metric of ["distinctness", "coverage", "vibrancy"]) {
  console.log(`${metric}:`);
  console.log(pad("space", 8), KS.map(k => pad(`K=${k}`, 8)).join(""));
  for (const sp of SPACES) {
    console.log(pad(sp, 8),
      KS.map(k => pad(fmt(result[sp][k][metric]), 8)).join(""));
  }
  console.log();
}

console.log(`Pairs below JND=${JND}:`);
console.log(pad("space", 8), KS.map(k => pad(`K=${k}`, 8)).join(""));
for (const sp of SPACES) {
  console.log(pad(sp, 8),
    KS.map(k => pad(`${result[sp][k].belowJND}/${k}`, 8)).join(""));
}
console.log();

console.log(`Distinctness diagnostic — adjacent ΔE in OKLrab (min/mean/max):`);
console.log(pad("space", 8),
  KS.map(k => pad(`K=${k}`, 22)).join(""));
for (const sp of SPACES) {
  console.log(pad(sp, 8),
    KS.map(k => {
      const r = result[sp][k];
      return pad(`${fmt(r.minDE,3)}/${fmt(r.meanDE,3)}/${fmt(r.maxDE,3)}`, 22);
    }).join(""));
}
console.log();

console.log(`Coverage diagnostic — # distinct categories (out of 16):`);
console.log(pad("space", 8), KS.map(k => pad(`K=${k}`, 8)).join(""));
for (const sp of SPACES) {
  console.log(pad(sp, 8),
    KS.map(k => pad(`${result[sp][k].catCount}/16`, 8)).join(""));
}

const ALL16 = ["R", "R-O", "O", "O-Y", "Y", "Y-G", "G", "G-C",
               "C", "C-B", "B", "B-P", "P", "P-M", "M", "M-R"];
console.log(`\nMissing categories at K=24 (most common designer choice):`);
for (const sp of SPACES) {
  const have = new Set(result[sp][24].cats);
  const miss = ALL16.filter(c => !have.has(c));
  console.log(pad(sp, 8), miss.length ? miss.join(", ") : "(none)");
}
