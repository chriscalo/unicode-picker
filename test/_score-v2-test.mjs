// Test harness for the v2 Smoothness scoring. Computes all 4
// sub-metrics on the three edges of each space's triangle, with
// the C corner normalized to sRGB pure blue across spaces.
//
// Sub-metrics (each in [0, 100]; quadratic-shortfall aggregate):
//   1. Pacing uniformity     — 100 - min(100, 100 * CV(ΔEs) / 0.5)
//   2. Corner-influence size — penalty if either endpoint's
//                              region count is outside [N/6, N/2]
//   3. Hue drift             — 100 - min(100, 100 * maxDrift° / 30°)
//                              N/A for W↔B (no C endpoint)
//   4. Chroma adequacy       — 100 - min(100, 100 * |midRatio - 0.5| / 0.5)
//                              N/A for W↔B
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N = 10;
const CORNER_REGION_THRESHOLD = 0.20;
const HUE_DRIFT_CEILING_DEG = 30;
const CV_CEILING = 0.5;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ SPACES, N, CORNER_REGION_THRESHOLD, HUE_DRIFT_CEILING_DEG, CV_CEILING }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();

  function aggregateShortfall(xs) {
    if (!xs.length) return 0;
    let s = 0;
    for (const x of xs) s += (100 - x) ** 2;
    return 100 - Math.sqrt(s / xs.length);
  }

  function findHueForBlue(sp) {
    D.setSpace(sp);
    const TARGET = [0, 0, 1];
    const targetLab = D.srgbToOklrab(TARGET);
    let bestH = 0, bestDE = Infinity;
    for (let h = 0; h < 360; h += 0.5) {
      D.setHue(h);
      const rgb = D.atBaryEased(h, 0, 0, 1);
      const lab = D.srgbToOklrab(rgb);
      const dx = lab[0]-targetLab[0], dy = lab[1]-targetLab[1], dz = lab[2]-targetLab[2];
      const e = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (e < bestDE) { bestDE = e; bestH = h; }
    }
    return bestH;
  }

  function sampleEdge(sp, hue, A, B, n) {
    D.setSpace(sp);
    D.setHue(hue);
    const labs = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = (1-t)*A[0] + t*B[0];
      const b = (1-t)*A[1] + t*B[1];
      const c = (1-t)*A[2] + t*B[2];
      const rgb = D.atBaryEased(hue, w, b, c);
      labs.push(D.srgbToOklrab(rgb));
    }
    return labs;
  }

  function deltaE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  // Score a 1-D scale of OKLrab labs.
  // endsAtC: true if cell n ends at the C corner (chromatic endpoint)
  function scoreSmoothness(labs, endsAtC) {
    const n = labs.length - 1;

    // 1. Pacing uniformity
    const dEs = [];
    for (let i = 0; i < n; i++) dEs.push(deltaE(labs[i], labs[i+1]));
    const meanDE = dEs.reduce((s, x) => s + x, 0) / dEs.length;
    let varDE = 0;
    for (const x of dEs) varDE += (x - meanDE) ** 2;
    varDE /= dEs.length;
    const cv = meanDE > 1e-9 ? Math.sqrt(varDE) / meanDE : 0;
    const pacingScore = 100 * (1 - Math.min(1, cv / CV_CEILING));

    // 2. Corner-influence size
    const A = labs[0], B = labs[n];
    const nearA = labs.filter(p => deltaE(p, A) < CORNER_REGION_THRESHOLD).length;
    const nearB = labs.filter(p => deltaE(p, B) < CORNER_REGION_THRESHOLD).length;
    const N1 = labs.length;
    const idealMin = Math.ceil(N1 / 6);
    const idealMax = Math.floor(N1 / 2);
    function cornerScore(count) {
      if (count >= idealMin && count <= idealMax) return 100;
      if (count < idealMin) return 100 * (count / idealMin);
      return 100 * Math.max(0, 1 - (count - idealMax) / (N1 - idealMax));
    }
    const cornerInfluenceA = cornerScore(nearA);
    const cornerInfluenceB = cornerScore(nearB);

    // 3. Hue drift (only if endsAtC)
    let hueDriftScore = 100;
    if (endsAtC) {
      const cLab = labs[n];
      const cHue = Math.atan2(cLab[2], cLab[1]) * 180 / Math.PI;
      let maxDrift = 0;
      for (const p of labs) {
        const ch = Math.sqrt(p[1]*p[1] + p[2]*p[2]);
        if (ch > 0.05) {
          let h = Math.atan2(p[2], p[1]) * 180 / Math.PI;
          let d = Math.abs(h - cHue);
          if (d > 180) d = 360 - d;
          if (d > maxDrift) maxDrift = d;
        }
      }
      hueDriftScore = 100 * (1 - Math.min(1, maxDrift / HUE_DRIFT_CEILING_DEG));
    }

    // 4. Chroma adequacy (only if endsAtC)
    let chromaAdequacyScore = 100;
    if (endsAtC) {
      const cMax = Math.sqrt(labs[n][1]**2 + labs[n][2]**2);
      const mid = labs[Math.floor(n/2)];
      const cMid = Math.sqrt(mid[1]**2 + mid[2]**2);
      if (cMax > 1e-6) {
        const ratio = cMid / cMax;
        const dev = Math.abs(ratio - 0.5);
        chromaAdequacyScore = 100 * (1 - Math.min(1, dev / 0.5));
      }
    }

    const subs = endsAtC
      ? [pacingScore, cornerInfluenceA, cornerInfluenceB, hueDriftScore, chromaAdequacyScore]
      : [pacingScore, cornerInfluenceA, cornerInfluenceB];
    const smoothness = aggregateShortfall(subs);
    return {
      smoothness,
      pacing: pacingScore,
      cornerA: cornerInfluenceA,
      cornerB: cornerInfluenceB,
      hueDrift: hueDriftScore,
      chromaAdequacy: chromaAdequacyScore,
      raw: { cv, nearA, nearB, meanDE },
    };
  }

  const W = [1, 0, 0], Bk = [0, 1, 0], C = [0, 0, 1];
  const out = {};
  for (const sp of SPACES) {
    const h = findHueForBlue(sp);
    const bcLabs = sampleEdge(sp, h, Bk, C, N);
    const wcLabs = sampleEdge(sp, h, W, C, N);
    const wbLabs = sampleEdge(sp, h, W, Bk, N);
    out[sp] = {
      hue: h,
      bc: scoreSmoothness(bcLabs, true),
      wc: scoreSmoothness(wcLabs, true),
      wb: scoreSmoothness(wbLabs, false),
    };
  }
  return out;
}, { SPACES, N, CORNER_REGION_THRESHOLD, HUE_DRIFT_CEILING_DEG, CV_CEILING });

await browser.close();

const pad = (s, n) => String(s).padEnd(n);
const fmt = (x) => x.toFixed(0).padStart(3);

console.log("\nv2 Smoothness scoring (4 sub-metrics, quadratic-shortfall aggregate)");
console.log("h chosen per space so C corner = sRGB pure blue. Identity curves.\n");

for (const edge of ["bc", "wc", "wb"]) {
  console.log(`══ ${edge.toUpperCase()} edge ══════════════════════════════════════════════════`);
  const labs = edge === "wb"
    ? "smooth pacing cornerA cornerB"
    : "smooth pacing cornerA cornerB hueDrift chromaAdq";
  console.log(`  ${pad("space", 8)}  ${labs}`);
  for (const sp of SPACES) {
    const r = result[sp][edge];
    if (edge === "wb") {
      console.log(`  ${pad(sp, 8)}    ${fmt(r.smoothness)}    ${fmt(r.pacing)}    ${fmt(r.cornerA)}    ${fmt(r.cornerB)}`);
    } else {
      console.log(`  ${pad(sp, 8)}    ${fmt(r.smoothness)}    ${fmt(r.pacing)}    ${fmt(r.cornerA)}    ${fmt(r.cornerB)}    ${fmt(r.hueDrift)}    ${fmt(r.chromaAdequacy)}`);
    }
  }
  console.log("");
}

console.log("══ Per-space Smoothness summary (mean of 3 edges) ══");
console.log(`  ${pad("space", 8)}  bc   wc   wb   mean`);
for (const sp of SPACES) {
  const bc = result[sp].bc.smoothness;
  const wc = result[sp].wc.smoothness;
  const wb = result[sp].wb.smoothness;
  const mean = (bc + wc + wb) / 3;
  console.log(`  ${pad(sp, 8)}    ${fmt(bc)}  ${fmt(wc)}  ${fmt(wb)}  ${fmt(mean)}`);
}
