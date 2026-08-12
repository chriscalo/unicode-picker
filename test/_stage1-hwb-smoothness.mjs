// Visualize HWB's per-step ΔE along the wheel. Top: rectified hue
// strip. Bottom: bar plot of ΔE between each pair of adjacent 1°
// samples, with mean and 2x-mean lines for reference. Steps above
// 2× mean highlighted red.
import { chromium } from "playwright";

const N = 360;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 800 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const { stops, dEs, mean, median, max } = await page.evaluate(({ N }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setSpace("hwb");
  function dE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  const labs = [];
  const stops = [];
  for (let i = 0; i < N; i++) {
    const h = (i / N) * 360;
    const rgb = D.atBary("hwb", h, 0, 0, 1);
    labs.push(D.srgbToOklrab(rgb));
    stops.push(rgb.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)));
  }
  const dEs = [];
  for (let i = 0; i < N; i++) dEs.push(dE(labs[i], labs[(i + 1) % N]));
  const sorted = dEs.slice().sort((a, b) => a - b);
  const mean = dEs.reduce((s, x) => s + x, 0) / N;
  return {
    stops, dEs, mean,
    median: sorted[Math.floor(N / 2)],
    max: sorted[N - 1],
  };
}, { N });

// Identify the top spikes (>= 2x mean)
const spikes = dEs.map((d, i) => ({ i, deg: i + 0.5, d }))
  .filter(s => s.d >= 2 * mean)
  .sort((a, b) => b.d - a.d);

const W = 1440;
const STRIP_H = 60;
const PLOT_H = 220;

const stripStops = stops.map((c, i) =>
  `rgb(${c[0]},${c[1]},${c[2]}) ${(i / N * 100).toFixed(2)}%`).join(", ");

// Build SVG bar plot
const barW = W / N;
const maxBarH = PLOT_H - 30;
const yScale = maxBarH / max;
const bars = dEs.map((d, i) => {
  const x = i * barW;
  const h = d * yScale;
  const y = PLOT_H - 30 - h;
  const isSpike = d >= 2 * mean;
  const color = isSpike ? "#ff5060" : "#888";
  return `<rect x="${x}" y="${y}" width="${Math.max(1, barW)}" height="${h}" fill="${color}" />`;
}).join("");

const meanLine = PLOT_H - 30 - mean * yScale;
const twoMeanLine = PLOT_H - 30 - 2 * mean * yScale;

const ticks = [0, 60, 120, 180, 240, 300].map(d => {
  const x = (d / 360) * W;
  return `<line x1="${x}" y1="0" x2="${x}" y2="${PLOT_H - 25}" stroke="#444" stroke-dasharray="2,3" />
          <text x="${x + 4}" y="${PLOT_H - 5}" fill="#888" font-size="11">${d}°</text>`;
}).join("");

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 13px monospace; color: #ddd;
         padding: 24px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #999; font-size: 12px; margin-bottom: 14px; }
  .strip { width: ${W}px; height: ${STRIP_H}px; border: 1px solid #444; }
  svg { display: block; background: #1f1f1f; border: 1px solid #444;
        border-top: none; }
  .stat { margin-top: 14px; font-size: 12px; color: #ccc; }
  .stat span { color: #fff; font-weight: bold; }
</style></head><body>
  <h1>HWB hue wheel — per-step ΔE diagnostic</h1>
  <div class="sub">Top: HWB's rectified hue strip. Bottom: ΔE between adjacent 1° samples (360 bars). Yellow line = mean. Red line = 2× mean. Bars ≥ 2× mean shown in red.</div>
  <div class="strip" style="background: linear-gradient(to right, ${stripStops})"></div>
  <svg width="${W}" height="${PLOT_H}" viewBox="0 0 ${W} ${PLOT_H}">
    ${ticks}
    ${bars}
    <line x1="0" y1="${meanLine}" x2="${W}" y2="${meanLine}" stroke="#ddc847" stroke-width="1" stroke-dasharray="4,3" />
    <line x1="0" y1="${twoMeanLine}" x2="${W}" y2="${twoMeanLine}" stroke="#ff5060" stroke-width="1" stroke-dasharray="4,3" />
    <text x="6" y="${meanLine - 2}" fill="#ddc847" font-size="11">mean ${mean.toFixed(4)}</text>
    <text x="6" y="${twoMeanLine - 2}" fill="#ff5060" font-size="11">2× mean ${(2*mean).toFixed(4)}</text>
  </svg>
  <div class="stat">
    Mean ΔE: <span>${mean.toFixed(4)}</span> &nbsp;
    Median: <span>${median.toFixed(4)}</span> &nbsp;
    Max: <span>${max.toFixed(4)}</span> &nbsp;
    CV: <span>${((Math.sqrt(dEs.reduce((s, d) => s + (d - mean)**2, 0) / N)) / mean).toFixed(3)}</span>
  </div>
  <div class="stat">
    Top spikes (≥ 2× mean) — angular position and ΔE:
    ${spikes.slice(0, 12).map(s => `<br>&nbsp;&nbsp;${s.deg.toFixed(1)}° → ${s.d.toFixed(4)} (${(s.d/mean).toFixed(2)}× mean)`).join("")}
  </div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 700 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/calib_hwb_smoothness.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_hwb_smoothness.png");
console.log(`mean=${mean.toFixed(4)} median=${median.toFixed(4)} max=${max.toFixed(4)} cv=${((Math.sqrt(dEs.reduce((s, d) => s + (d - mean)**2, 0) / N)) / mean).toFixed(3)}`);
console.log(`top spikes:`);
for (const s of spikes.slice(0, 12)) {
  console.log(`  ${s.deg.toFixed(1)}°  ΔE=${s.d.toFixed(4)}  (${(s.d/mean).toFixed(2)}× mean)`);
}
