// Stage 3 — Painter's triangle metrics. The triangle has 3 corners:
// W (white), B (black), C (pure hue). Quality depends on the hue
// the triangle is built around, so we sweep the wheel and aggregate.
//
// 4 candidate metrics, 1:1 with §2.2 Stage 3 GOOD signals:
//
//   1. Hue stability    — interior OKLrab hue stays close to the C
//                         corner's hue (no blue→purple→blue drift).
//   2. Corner reach     — W reaches (1,1,1), B reaches (0,0,0), AND
//                         C reaches max sRGB chroma at its rendered
//                         OKLrab hue.
//   3. Chroma adequacy  — at the W↔C midpoint, chroma is ~50% of
//                         the C-corner chroma (linear build-up,
//                         no late-jump grey-then-vivid path).
//   4. Smoothness       — corner-to-corner gradient pacing has no
//                         sharp slopes (TBD: eye-calibration in
//                         progress).
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const HUES   = 36; // 10° hue sweep
const N_GRID = 20; // barycentric grid resolution
const N_PATH = 64; // samples along each corner-to-corner path

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, HUES, N_GRID, N_PATH }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();

  // Build OKLrab maxC-per-hue table for C-corner gamut reach.
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
  function maxChromaAtHue(thetaDeg) {
    let t = ((thetaDeg % 360) + 360) % 360;
    return maxC[Math.floor(t)];
  }

  function dE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  function chromaOf(lab) {
    return Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]);
  }
  function hueAngleOf(lab) {
    let th = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
    if (th < 0) th += 360;
    return th;
  }
  function angDiff(a, b) {
    let d = ((a - b) % 360 + 540) % 360 - 180;
    return Math.abs(d);
  }

  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const perHue = [];

    for (let hi = 0; hi < HUES; hi++) {
      const hue = (hi * 360) / HUES;

      // Triangle corners
      const cRgb = D.atBary(sp, hue, 0, 0, 1);
      const wRgb = D.atBary(sp, hue, 1, 0, 0);
      const bRgb = D.atBary(sp, hue, 0, 1, 0);
      const cLab = D.srgbToOklrab(cRgb);
      const wLab = D.srgbToOklrab(wRgb);
      const bLab = D.srgbToOklrab(bRgb);

      const cHue = hueAngleOf(cLab);
      const cChroma = chromaOf(cLab);

      // 1. Hue stability — sample interior at moderate chroma rows.
      //    Skip rows where chroma collapses (near W and near B corners
      //    have unstable hue regardless of space).
      let maxDrift = 0;
      let totalDrift = 0;
      let driftN = 0;
      for (let i = 1; i < N_GRID - 1; i++) {
        for (let j = 1; j < N_GRID - 1 - i; j++) {
          const k = N_GRID - 1 - i - j;
          if (k < 1) continue;
          const w = i / (N_GRID - 1);
          const b = j / (N_GRID - 1);
          const c = k / (N_GRID - 1);
          const rgb = D.atBary(sp, hue, w, b, c);
          const lab = D.srgbToOklrab(rgb);
          const ch = chromaOf(lab);
          if (ch < 0.02) continue; // near-grey hue is unstable, ignore
          const drift = angDiff(hueAngleOf(lab), cHue);
          if (drift > maxDrift) maxDrift = drift;
          totalDrift += drift;
          driftN++;
        }
      }
      const meanDrift = driftN > 0 ? totalDrift / driftN : 0;

      // 2. Corner reach — all 3 corners hit their idealized targets:
      //    W → pure white (1,1,1), B → pure black (0,0,0), and
      //    C → max sRGB chroma at its rendered OKLrab hue.
      const whitePure = D.srgbToOklrab([1, 1, 1]);
      const blackPure = D.srgbToOklrab([0, 0, 0]);
      const wReachDE = dE(wLab, whitePure);
      const bReachDE = dE(bLab, blackPure);
      const cMaxAtHue = maxChromaAtHue(cHue);
      const cReachFrac = cMaxAtHue > 1e-6
        ? Math.min(1, cChroma / cMaxAtHue)
        : 1;

      // 3. Chroma adequacy — at W↔C midpoint, chroma should be
      //    ~50% of C-corner chroma. Catches "grey-then-jump-to-color"
      //    paths (the canonical failure: extremely desaturated greys
      //    on the way to blue). midRatio = midChroma / cChroma.
      //    Ideal = 0.5 (linear build-up). Score = 1 - |midRatio - 0.5| / 0.5.
      const midRgb = D.atBary(sp, hue, 0.5, 0, 0.5);
      const midLab = D.srgbToOklrab(midRgb);
      const midChroma = chromaOf(midLab);
      const midRatio = cChroma > 1e-6 ? midChroma / cChroma : 0.5;
      const midDev = Math.abs(midRatio - 0.5);
      const adequacy = 1 - Math.min(1, midDev / 0.5);

      // 4. Smoothness candidates — for each of 3 corner-to-corner
      //    paths, compute three pacing measures:
      //      a. CV(step ΔE)  — stdev / mean of step sizes; high =
      //                        uneven pacing (some big, some tiny)
      //      b. max/mean     — worst step relative to mean step
      //      c. Δ²E roughness — sum |step[i+1] - step[i]| / total
      const paths = [
        [[0,0,1], [1,0,0]], // C → W
        [[0,0,1], [0,1,0]], // C → B
        [[1,0,0], [0,1,0]], // W → B
      ];
      let maxStretch = 1;
      let pathRoughness = 0;
      let cvSum = 0;
      let pathCount = 0;
      for (const [a, b] of paths) {
        const labs = [];
        for (let i = 0; i < N_PATH; i++) {
          const t = i / (N_PATH - 1);
          const w = a[0]*(1-t) + b[0]*t;
          const bc= a[1]*(1-t) + b[1]*t;
          const cc= a[2]*(1-t) + b[2]*t;
          const rgb = D.atBary(sp, hue, w, bc, cc);
          labs.push(D.srgbToOklrab(rgb));
        }
        const steps = [];
        let total = 0;
        for (let i = 0; i < labs.length - 1; i++) {
          const d = dE(labs[i], labs[i+1]);
          steps.push(d);
          total += d;
        }
        const mean = total / steps.length;
        const max = Math.max(...steps);
        const ratio = mean > 1e-9 ? max / mean : 1;
        if (ratio > maxStretch) maxStretch = ratio;
        let varSum = 0;
        for (const d of steps) varSum += (d - mean) ** 2;
        const cv = mean > 1e-9 ? Math.sqrt(varSum / steps.length) / mean : 0;
        cvSum += cv;
        let kink = 0;
        for (let i = 1; i < steps.length; i++) {
          kink += Math.abs(steps[i] - steps[i-1]);
        }
        pathRoughness += total > 1e-9 ? kink / total : 0;
        pathCount++;
      }
      pathRoughness /= pathCount;
      const meanCV = cvSum / pathCount;

      perHue.push({
        hue,
        maxDrift, meanDrift,
        wReachDE, bReachDE, cReachFrac,
        midRatio, adequacy,
        maxStretch, pathRoughness, meanCV,
      });
    }

    // Aggregate per-hue scores into per-space metrics.
    const meanOver = (key) =>
      perHue.reduce((s, p) => s + p[key], 0) / perHue.length;
    const maxOver = (key) =>
      perHue.reduce((s, p) => Math.max(s, p[key]), 0);

    out[sp] = {
      perHue,

      // Hue stability — penalty above 10° drift threshold (1° = JND-ish
      // for pure hues; 10° = clearly noticeable). Score = 1 saturates at
      // 0° drift, decays toward 0 as max drift grows.
      meanMaxDrift: meanOver("maxDrift"),
      worstMaxDrift: maxOver("maxDrift"),
      stability: 1 - Math.min(1, meanOver("maxDrift") / 30),

      // Corner reach — three sub-scores combined:
      //   wScore = 1 - min(1, wReachDE / 0.20)   (white corner)
      //   bScore = 1 - min(1, bReachDE / 0.20)   (black corner)
      //   cScore = cReachFrac                    (chroma corner)
      // Final = mean of the three. Soft: small ΔEs forgiven.
      meanWReach: meanOver("wReachDE"),
      meanBReach: meanOver("bReachDE"),
      meanCReach: meanOver("cReachFrac"),
      reach: (() => {
        const wS = 1 - Math.min(1, meanOver("wReachDE") / 0.20);
        const bS = 1 - Math.min(1, meanOver("bReachDE") / 0.20);
        const cS = meanOver("cReachFrac");
        return (wS + bS + cS) / 3;
      })(),

      // Chroma adequacy — midRatio close to 0.5 = linear build-up.
      meanMidRatio: meanOver("midRatio"),
      adequacy: meanOver("adequacy"),

      // Smoothness — three candidate aggregates, evaluating which
      // best correlates with chroma adequacy / eye perception.
      meanRoughness: meanOver("pathRoughness"),
      worstStretch: maxOver("maxStretch"),
      meanCV: meanOver("meanCV"),
      smoothRoughness: 1 - Math.min(1, meanOver("pathRoughness") / 1.0),
      smoothCV: 1 - Math.min(1, meanOver("meanCV") / 0.5),
      smoothStretch: 1 - Math.min(1, (maxOver("maxStretch") - 1) / 5),
    };
  }
  return out;
}, { SPACES, HUES, N_GRID, N_PATH });

await browser.close();

const fmt = (x, d=3) => (typeof x === "number" ? x.toFixed(d) : "?");
const pad = (s, n) => String(s).padEnd(n);

console.log(`\nStage 3 — Painter's triangle metrics`);
console.log(`${HUES} hue samples, N=${N_GRID} barycentric grid.\n`);

const cols = [
  { key: "stability",       label: "stab" },
  { key: "reach",           label: "reach" },
  { key: "adequacy",        label: "adequacy" },
  { key: "smoothCV",        label: "smCV" },
  { key: "smoothRoughness", label: "smRough" },
  { key: "smoothStretch",   label: "smStr" },
];
console.log(pad("space", 8), cols.map(c => pad(c.label, 10)).join(""));
for (const sp of SPACES) {
  console.log(pad(sp, 8),
    cols.map(c => pad(fmt(result[sp][c.key]), 10)).join(""));
}

console.log(`\nDiagnostics:`);
console.log(pad("space", 8),
  pad("drift°(mean/wst)", 18),
  pad("Wre", 6), pad("Bre", 6), pad("Cre", 6),
  pad("midR", 6),
  pad("CV", 6), pad("rough", 6), pad("stretch", 8));
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    pad(`${fmt(r.meanMaxDrift,1)}/${fmt(r.worstMaxDrift,1)}`, 18),
    pad(fmt(r.meanWReach, 3), 6),
    pad(fmt(r.meanBReach, 3), 6),
    pad(fmt(r.meanCReach, 3), 6),
    pad(fmt(r.meanMidRatio, 3), 6),
    pad(fmt(r.meanCV, 3), 6),
    pad(fmt(r.meanRoughness, 3), 6),
    pad(fmt(r.worstStretch, 2), 8));
}

console.log(`\nCorrelation check — does smoothness candidate match adequacy?`);
console.log(pad("space", 8), pad("adeq", 8), pad("smCV", 8), pad("smRough", 9), pad("smStr", 8));
for (const sp of SPACES) {
  const r = result[sp];
  console.log(pad(sp, 8),
    pad(fmt(r.adequacy, 3), 8),
    pad(fmt(r.smoothCV, 3), 8),
    pad(fmt(r.smoothRoughness, 3), 9),
    pad(fmt(r.smoothStretch, 3), 8));
}
