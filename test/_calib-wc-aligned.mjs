// W↔C edge for all 6 UI spaces, with each space's hue chosen so its
// C corner = sRGB pure blue. Cell 0 = pure white, cell 10 = sRGB blue.
// Tests white-corner compaction (how many cells stay near white before
// transitioning) — the opposite-direction analogue of the black-corner
// test in M2.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N = 10;

const result = await page.evaluate(({ SPACES, N }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  const TARGET = [0, 0, 1];
  const targetLab = D.srgbToOklrab(TARGET);
  function deltaE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    let bestH = 0, bestDE = Infinity;
    for (let h = 0; h < 360; h += 0.5) {
      D.setHue(h);
      const rgb = D.atBaryEased(h, 0, 0, 1);
      const lab = D.srgbToOklrab(rgb);
      const e = deltaE(lab, targetLab);
      if (e < bestDE) { bestDE = e; bestH = h; }
    }
    D.setHue(bestH);
    const cells = [];
    const lrs = [];
    const chromas = [];
    const hues = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const rgb = D.atBaryEased(bestH, 1 - t, 0, t);
      cells.push(rgb);
      const lab = D.srgbToOklrab(rgb);
      lrs.push(lab[0]);
      const cChroma = Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]);
      chromas.push(cChroma);
      let h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
      if (h < 0) h += 360;
      hues.push(h);
    }
    out[sp] = { cells, lrs, chromas, hues, bestH, bestDE };
  }
  return out;
}, { SPACES, N });
await page.close();

const toCss = (rgb) => {
  const [r, g, b] = rgb.map(x => Math.max(0, Math.min(255, Math.round(x * 255))));
  return `rgb(${r},${g},${b})`;
};
const indexRow = (n) =>
  `<div class="indexrow">${Array.from({ length: n }, (_, i) =>
    `<div class="ix">${i}</div>`).join("")}</div>`;

const html = `<!doctype html><html><head><style>
  body { background: #ffffff; margin: 0; font: 14px monospace; color: #222;
         padding: 24px; }
  .row { display: flex; gap: 0; align-items: stretch; height: 80px;
         border: 1px solid #888; border-bottom: none; }
  .row:last-of-type { border-bottom: 1px solid #888; }
  .cell { flex: 1; }
  .indexrow { display: flex; gap: 0; padding-left: 110px; }
  .ix { flex: 1; text-align: center; padding: 6px 0;
        font-size: 12px; color: #555; }
  .ramp { display: flex; align-items: stretch; }
  .name { width: 110px; padding: 8px 12px 0 0; font-size: 12px;
          background: #fff; border-right: 1px solid #888; text-align: right;
          line-height: 1.3; }
  .name small { color: #888; font-size: 10px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #333; }
  .sub { font-size: 12px; color: #666; margin-bottom: 10px; }
</style></head><body>
  <h1>W↔C edge — each space at the hue where its C corner = sRGB pure blue.</h1>
  <div class="sub">Cell 0 = pure white, cell 10 = sRGB blue. Cells 0 and 10 identical across rows.</div>
  ${SPACES.map(sp => `
    <div class="ramp">
      <div class="name">${sp}<br><small>h=${result[sp].bestH.toFixed(1)}°</small></div>
      <div class="row" style="flex: 1">
        ${result[sp].cells.map(rgb => `<div class="cell" style="background:${toCss(rgb)}"></div>`).join("")}
      </div>
    </div>
  `).join("")}
  ${indexRow(N + 1)}
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 700 });
await newPage.setContent(html);
await newPage.screenshot({ path: "/tmp/calib_wc_aligned.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_wc_aligned.png");

const fmt = (x) => x.toFixed(2).padStart(5);
console.log("\nLr per cell along W↔C (cell 0=white, cell 10=blue):");
for (const sp of SPACES) {
  console.log(`  ${sp.padEnd(8)}  ${result[sp].lrs.map(fmt).join(" ")}`);
}

console.log("\nChroma per cell:");
for (const sp of SPACES) {
  console.log(`  ${sp.padEnd(8)}  ${result[sp].chromas.map(fmt).join(" ")}`);
}

console.log("\nOKLrab hue per cell (C corner is at hue 264.2°):");
const fmtHue = (x) => x.toFixed(0).padStart(4);
for (const sp of SPACES) {
  console.log(`  ${sp.padEnd(8)}  ${result[sp].hues.map(fmtHue).join("  ")}`);
}

console.log("\nMetrics:");
console.log(`  ${"space".padEnd(8)}  whiteZone  hueDrift°  chromaMid/Max`);
for (const sp of SPACES) {
  const r = result[sp];
  const whiteZone = r.lrs.filter(v => v > 0.80).length;
  // Hue drift: max |hue(cell) - hue(C corner)| over cells with chroma > 0.05
  const cHue = r.hues[r.hues.length - 1];
  let maxDrift = 0;
  for (let i = 0; i < r.cells.length; i++) {
    if (r.chromas[i] > 0.05) {
      let d = Math.abs(r.hues[i] - cHue);
      if (d > 180) d = 360 - d;
      if (d > maxDrift) maxDrift = d;
    }
  }
  // Chroma midpoint vs max: chroma at cell 5 / chroma at cell 10
  const cMax = r.chromas[r.chromas.length - 1];
  const cMid = r.chromas[Math.floor(r.chromas.length / 2)];
  const chromaRatio = cMax > 1e-6 ? cMid / cMax : 0;
  console.log(`  ${sp.padEnd(8)}  ${whiteZone.toString().padStart(5)}/11  ${maxDrift.toFixed(1).padStart(7)}°  ${chromaRatio.toFixed(2).padStart(8)}`);
}
