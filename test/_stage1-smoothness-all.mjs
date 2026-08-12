// Stage 1 smoothness: per-step ΔE diagnostic for all 6 spaces at 5°
// steps. Each space gets its rectified hue strip + ΔE bar chart
// underneath. Stacked so the user can visually compare where each
// space has its largest steps (presumably at compressed hue regions).
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const STEP_DEG = 5;
const N = 360 / STEP_DEG; // 72

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const data = await page.evaluate(({ SPACES, N }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  function dE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const stops = [];
    const labs = [];
    for (let i = 0; i < N; i++) {
      const h = (i / N) * 360;
      const rgb = D.atBary(sp, h, 0, 0, 1);
      stops.push(rgb.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)));
      labs.push(D.srgbToOklrab(rgb));
    }
    const dEs = [];
    for (let i = 0; i < N; i++) dEs.push(dE(labs[i], labs[(i + 1) % N]));
    const mean = dEs.reduce((s, x) => s + x, 0) / N;
    const sorted = dEs.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(N / 2)];
    const max = sorted[N - 1];
    // Δ²E and several aggregates testing "concentration of variation"
    const d2 = [];
    for (let i = 0; i < N; i++) d2.push(dEs[(i + 1) % N] - dEs[i]);
    const absD2 = d2.map(Math.abs);
    const maxAbsD2 = Math.max(...absD2);
    const sortedAbs = absD2.slice().sort((a, b) => b - a);
    // top-10% energy share — "what fraction of total |Δ²E|² is in the
    // worst 10% of cells?" Higher = more concentrated = more kinks.
    const k10 = Math.max(1, Math.ceil(N * 0.1));
    const top10Sum = sortedAbs.slice(0, k10).reduce((s, x) => s + x * x, 0);
    const totalSum = absD2.reduce((s, x) => s + x * x, 0);
    const top10Share = totalSum > 0 ? top10Sum / totalSum : 0;
    // Gini of |Δ²E| — concentration measure
    const sortedAsc = absD2.slice().sort((a, b) => a - b);
    let giniNum = 0;
    let giniDenom = 0;
    for (let i = 0; i < N; i++) {
      giniNum += (2 * (i + 1) - N - 1) * sortedAsc[i];
      giniDenom += sortedAsc[i];
    }
    const gini = giniDenom > 0 ? giniNum / (N * giniDenom) : 0;
    // 95th percentile of |Δ²E|
    const p95Index = Math.floor(N * 0.95);
    const p95AbsD2 = sortedAsc[p95Index];
    // Width of high-ΔE regions: for each "high" cell (ΔE > 1.5×median),
    // count its run length (how many consecutive high cells around it).
    // Wide bumps (HWB-style) = long run lengths. Narrow spikes = short.
    const HIGH = 1.5 * median;
    const isHigh = dEs.map(d => d > HIGH);
    const runLengths = new Array(N).fill(0);
    // Find runs and assign run length to every cell in each run.
    let i0 = 0;
    while (i0 < N) {
      if (!isHigh[i0]) { i0++; continue; }
      let j = i0;
      while (j < N && isHigh[j]) j++;
      const len = j - i0;
      for (let k = i0; k < j; k++) runLengths[k] = len;
      i0 = j;
    }
    // Wrap-around case: if both ends are "high", merge their runs.
    if (isHigh[0] && isHigh[N - 1]) {
      let endLen = 0;
      let k = N - 1;
      while (k >= 0 && isHigh[k]) { endLen++; k--; }
      let frontLen = 0;
      k = 0;
      while (k < N && isHigh[k]) { frontLen++; k++; }
      const merged = endLen + frontLen;
      for (let m = 0; m < frontLen; m++) runLengths[m] = merged;
      for (let m = N - endLen; m < N; m++) runLengths[m] = merged;
    }
    const highRunLengths = runLengths.filter(x => x > 0);
    const meanRunLen = highRunLengths.length
      ? highRunLengths.reduce((s, x) => s + x, 0) / highRunLengths.length
      : 0;
    out[sp] = {
      stops, dEs, mean, median, max, d2, absD2,
      maxAbsD2, top10Share, gini, p95AbsD2,
      meanRunLen, highCount: isHigh.filter(Boolean).length,
    };
  }
  return out;
}, { SPACES, N });

const W = 1440;
const STRIP_H = 28;
const PLOT_H = 100;
const ROW_GAP = 14;

// Find global max ΔE across all spaces, so all bar plots use same y-scale.
let globalMax = 0;
for (const sp of SPACES) globalMax = Math.max(globalMax, data[sp].max);

function rowFor(sp) {
  const r = data[sp];
  const stripStops = r.stops.map((c, i) => {
    const pct = (i / N) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(2)}%`;
  }).join(", ");

  const barW = W / N;
  const yScale = (PLOT_H - 20) / globalMax;
  const bars = r.dEs.map((d, i) => {
    const x = i * barW;
    const h = d * yScale;
    const y = PLOT_H - 20 - h;
    const isSpike = d >= 2 * r.mean;
    const color = isSpike ? "#ff5060" : "#888";
    return `<rect x="${x}" y="${y}" width="${Math.max(1, barW)}" height="${h}" fill="${color}" />`;
  }).join("");
  const meanY = PLOT_H - 20 - r.mean * yScale;
  const ratio = r.max / r.median;

  return `
    <div class="row">
      <div class="label">${sp} <small>max/med ${ratio.toFixed(2)}</small></div>
      <div class="strip" style="background: linear-gradient(to right, ${stripStops})"></div>
      <svg width="${W}" height="${PLOT_H}" viewBox="0 0 ${W} ${PLOT_H}">
        ${[60, 120, 180, 240, 300].map(d => {
          const x = (d / 360) * W;
          return `<line x1="${x}" y1="0" x2="${x}" y2="${PLOT_H - 14}" stroke="#333" stroke-dasharray="2,3" />`;
        }).join("")}
        ${bars}
        <line x1="0" y1="${meanY}" x2="${W}" y2="${meanY}" stroke="#ddc847" stroke-width="0.8" stroke-dasharray="4,3" />
        <text x="6" y="${meanY - 2}" fill="#ddc847" font-size="10">mean ${r.mean.toFixed(3)}</text>
      </svg>
    </div>
  `;
}

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 12px monospace; color: #ddd;
         padding: 20px; }
  h1 { margin: 0 0 8px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #888; font-size: 11px; margin-bottom: 14px; }
  .row { margin-bottom: ${ROW_GAP}px; }
  .label { padding: 2px 0 4px; font-size: 12px; color: #ccc; }
  .label small { color: #888; margin-left: 8px; }
  .strip { width: ${W}px; height: ${STRIP_H}px; border: 1px solid #333; }
  svg { display: block; background: #1f1f1f; border: 1px solid #333;
        border-top: none; }
  .scale { display: flex; padding-left: 0; padding-top: 4px; }
  .tick { width: ${W / 6}px; font-size: 10px; color: #777; }
</style></head><body>
  <h1>All 6 spaces — hue strip and per-step ΔE at 5°/step (72 bars)</h1>
  <div class="sub">Yellow line = mean ΔE for that space. Red bars = step ΔE ≥ 2× that space's mean. All plots use the same y-scale (global max = ${globalMax.toFixed(3)}).</div>
  ${SPACES.map(rowFor).join("")}
  <div class="scale">
    ${[0, 60, 120, 180, 240, 300].map(d => `<div class="tick">${d}°</div>`).join("")}
  </div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 1100 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/calib_smooth_all.png", fullPage: true });

console.log("wrote /tmp/calib_smooth_all.png");
console.log(`\nFive candidate smoothness aggregates (N=${N}, ${STEP_DEG}°/step):\n`);
console.log(`  ${"space".padEnd(8)}  ${"max/med".padStart(8)}  ${"p95|Δ²E|/mean".padStart(13)}  ${"top10share".padStart(11)}  ${"gini|Δ²E|".padStart(10)}  ${"runLen".padStart(7)}  ${"highCells".padStart(9)}`);
for (const sp of SPACES) {
  const r = data[sp];
  console.log(`  ${sp.padEnd(8)}  ${(r.max / r.median).toFixed(2).padStart(8)}  ${(r.p95AbsD2 / r.mean).toFixed(3).padStart(13)}  ${r.top10Share.toFixed(3).padStart(11)}  ${r.gini.toFixed(3).padStart(10)}  ${r.meanRunLen.toFixed(1).padStart(7)}  ${(r.highCount + "/" + N).padStart(9)}`);
}

await browser.close();
