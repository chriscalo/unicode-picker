// Validate the proposed Reach + Smoothness measurements:
//   Reach: ΔE from W/B corners to true white/black, plus C-corner
//          chroma normalized to max sRGB chroma at that hue.
//   Smoothness: cumulative-ΔE deviation from y=x along each of the
//               three edges (W↔B, W↔C, B↔C), in OKLrab.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGE: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });

await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const HUES = [0, 30, 60, 120, 180, 210, 240, 300];

const result = await page.evaluate(({ HUES }) => {
  const D = window.__diag;

  // ──────────────────────────────────────────────────────────────
  // Precompute max sRGB chroma per OKLrab hue (1° bins).
  // Sample sRGB cube boundary densely; convert to OKLrab; bin by
  // hue; track max chroma per bin.
  // ──────────────────────────────────────────────────────────────
  const HUE_BINS = 360;
  const maxChromaAtHue = new Float64Array(HUE_BINS);
  const FACES = [
    // (r, g, b) parameterized by two dims in [0,1] with one fixed.
    (s, t) => [0, s, t], (s, t) => [1, s, t],
    (s, t) => [s, 0, t], (s, t) => [s, 1, t],
    (s, t) => [s, t, 0], (s, t) => [s, t, 1],
  ];
  const STEP = 1 / 64;
  for (const face of FACES) {
    for (let s = 0; s <= 1 + 1e-9; s += STEP) {
      for (let t = 0; t <= 1 + 1e-9; t += STEP) {
        const rgb = face(Math.min(1, s), Math.min(1, t));
        const lab = D.srgbToOklrab(rgb);
        const a = lab[1], b = lab[2];
        const chroma = Math.sqrt(a * a + b * b);
        if (chroma < 1e-6) continue;
        let theta = Math.atan2(b, a) * 180 / Math.PI;
        if (theta < 0) theta += 360;
        const bin = Math.floor(theta) % HUE_BINS;
        if (chroma > maxChromaAtHue[bin]) maxChromaAtHue[bin] = chroma;
      }
    }
  }
  // Smooth gaps (some bins may be empty).
  for (let i = 0; i < HUE_BINS; i++) {
    if (maxChromaAtHue[i] === 0) {
      const prev = maxChromaAtHue[(i - 1 + HUE_BINS) % HUE_BINS];
      const next = maxChromaAtHue[(i + 1) % HUE_BINS];
      maxChromaAtHue[i] = (prev + next) / 2;
    }
  }
  function maxChromaAt(thetaDeg) {
    let t = ((thetaDeg % 360) + 360) % 360;
    return maxChromaAtHue[Math.floor(t)];
  }

  function reachOf(space, hue) {
    D.setSpace(space);
    const W = D.atBaryEased(hue, 1, 0, 0);
    const B = D.atBaryEased(hue, 0, 1, 0);
    const C = D.atBaryEased(hue, 0, 0, 1);
    const wLab = D.srgbToOklrab(W);
    const bLab = D.srgbToOklrab(B);
    const cLab = D.srgbToOklrab(C);
    const dW = D.deltaE(wLab, [1, 0, 0]);
    const dB = D.deltaE(bLab, [0, 0, 0]);
    const cChroma = Math.sqrt(cLab[1] * cLab[1] + cLab[2] * cLab[2]);
    let cHue = Math.atan2(cLab[2], cLab[1]) * 180 / Math.PI;
    if (cHue < 0) cHue += 360;
    const cTarget = maxChromaAt(cHue);
    const cReachFrac = cTarget > 1e-6
      ? Math.min(1, cChroma / cTarget)
      : 1;
    return {
      whiteDE: dW, blackDE: dB,
      cChroma, cTarget, cReachFrac,
      cHue,
    };
  }

  function smoothEdge(space, hue, A, BB, N = 20) {
    D.setSpace(space);
    const labs = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const w = (1 - t) * A[0] + t * BB[0];
      const b = (1 - t) * A[1] + t * BB[1];
      const c = (1 - t) * A[2] + t * BB[2];
      const rgb = D.atBaryEased(hue, w, b, c);
      labs.push(D.srgbToOklrab(rgb));
    }
    const seg = [];
    for (let i = 0; i < labs.length - 1; i++) {
      seg.push(D.deltaE(labs[i], labs[i + 1]));
    }
    const total = seg.reduce((s, x) => s + x, 0);
    if (total < 1e-9) return { maxDev: 0, atT: 0, total: 0 };
    let acc = 0;
    let maxDev = 0;
    let atT = 0;
    for (let i = 1; i <= N; i++) {
      acc += seg[i - 1];
      const sNorm = acc / total;
      const tIdeal = i / N;
      const dev = Math.abs(sNorm - tIdeal);
      if (dev > maxDev) { maxDev = dev; atT = tIdeal; }
    }
    return { maxDev, atT, total };
  }

  const W = [1, 0, 0]; // (w, b, c) of white corner
  const Bk = [0, 1, 0];
  const C = [0, 0, 1];
  // Edge midpoints
  const M_WB = [0.5, 0.5, 0]; // midpoint of W↔B edge
  const M_WC = [0.5, 0, 0.5]; // midpoint of W↔C edge
  const M_BC = [0, 0.5, 0.5]; // midpoint of B↔C edge

  const out = [];
  for (const sp of D.spaces) {
    const reachByHue = HUES.map(h => reachOf(sp, h));
    // 3 edges
    const wbByHue = HUES.map(h => smoothEdge(sp, h, W, Bk));
    const wcByHue = HUES.map(h => smoothEdge(sp, h, W, C));
    const bcByHue = HUES.map(h => smoothEdge(sp, h, Bk, C));
    // 3 medians (each corner to opposite-side midpoint)
    const mWByHue = HUES.map(h => smoothEdge(sp, h, W, M_BC));
    const mBByHue = HUES.map(h => smoothEdge(sp, h, Bk, M_WC));
    const mCByHue = HUES.map(h => smoothEdge(sp, h, C, M_WB));
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    out.push({
      sp,
      whiteDE:    mean(reachByHue.map(r => r.whiteDE)),
      blackDE:    mean(reachByHue.map(r => r.blackDE)),
      cReach:     mean(reachByHue.map(r => r.cReachFrac)),
      cChromaAvg: mean(reachByHue.map(r => r.cChroma)),
      cTargetAvg: mean(reachByHue.map(r => r.cTarget)),
      // edges
      eWB:  mean(wbByHue.map(r => r.maxDev)),
      eWC:  mean(wcByHue.map(r => r.maxDev)),
      eBC:  mean(bcByHue.map(r => r.maxDev)),
      eWB_t: mean(wbByHue.map(r => r.atT)),
      eWC_t: mean(wcByHue.map(r => r.atT)),
      eBC_t: mean(bcByHue.map(r => r.atT)),
      // medians (corner → opposite midpoint)
      mW: mean(mWByHue.map(r => r.maxDev)),
      mB: mean(mBByHue.map(r => r.maxDev)),
      mC: mean(mCByHue.map(r => r.maxDev)),
      mW_t: mean(mWByHue.map(r => r.atT)),
      mB_t: mean(mBByHue.map(r => r.atT)),
      mC_t: mean(mCByHue.map(r => r.atT)),
    });
  }
  return out;
}, { HUES });

const fmt = (x, d = 3) => (typeof x === "number" ? x.toFixed(d) : "  -  ");
const pad = (s, n) => String(s).padEnd(n);

console.log("\n══ Reach (mean over 8 hues) ══════════════════════════════════════════════");
console.log(pad("space", 8),
  pad("white ΔE", 10), pad("black ΔE", 10),
  pad("C chroma", 10), pad("C target", 10), pad("C reach", 9));
console.log("(white/black ΔE: 0 = perfect; large = corner doesn't reach extreme.)");
console.log("(C reach: rendered chroma / max sRGB chroma at that OKLrab hue. 1 = full.)");
for (const r of result) {
  console.log(
    pad(r.sp, 8),
    pad(fmt(r.whiteDE), 10),
    pad(fmt(r.blackDE), 10),
    pad(fmt(r.cChromaAvg), 10),
    pad(fmt(r.cTargetAvg), 10),
    pad(fmt(r.cReach), 9));
}

console.log("\n══ Smoothness — three edges (max cumulative-ΔE deviation from linear) ═════");
console.log(pad("space", 8),
  pad("W↔B", 8), pad("@t", 6),
  pad("W↔C", 8), pad("@t", 6),
  pad("B↔C", 8), pad("@t", 6));
console.log("(0 = perfectly linear. atT = where the deviation peaks. atT << 0.5 means");
console.log(" the path rushes from the first endpoint; atT >> 0.5 means it lingers.)");
for (const r of result) {
  console.log(
    pad(r.sp, 8),
    pad(fmt(r.eWB), 8), pad(fmt(r.eWB_t, 2), 6),
    pad(fmt(r.eWC), 8), pad(fmt(r.eWC_t, 2), 6),
    pad(fmt(r.eBC), 8), pad(fmt(r.eBC_t, 2), 6));
}

console.log("\n══ Smoothness — three medians (corner → opposite-edge midpoint) ═════════");
console.log(pad("space", 8),
  pad("W→mid", 9), pad("@t", 6),
  pad("B→mid", 9), pad("@t", 6),
  pad("C→mid", 9), pad("@t", 6));
console.log("(catches interior failures invisible on edges. atT << 0.5 means corner's");
console.log(" influence dominates the interior; atT >> 0.5 means tiny corner.)");
for (const r of result) {
  console.log(
    pad(r.sp, 8),
    pad(fmt(r.mW), 9), pad(fmt(r.mW_t, 2), 6),
    pad(fmt(r.mB), 9), pad(fmt(r.mB_t, 2), 6),
    pad(fmt(r.mC), 9), pad(fmt(r.mC_t, 2), 6));
}

await browser.close();
if (errs.length) { for (const e of errs) console.log(e); process.exit(1); }
