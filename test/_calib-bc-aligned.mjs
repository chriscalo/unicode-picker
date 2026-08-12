// Render each space's B↔C edge with its C-corner color forced to
// sRGB pure blue (0,0,255). For each space we sweep its hue and
// pick the one whose C corner is closest to sRGB blue. That way
// cell 10 is identical across all 6 rows; only the path from
// black-to-blue differs by space.
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
  // Target = sRGB pure blue
  const TARGET = [0, 0, 1];
  const targetLab = D.srgbToOklrab(TARGET);

  function deltaE(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  // For each space, find the hue whose C-corner sRGB best matches blue.
  // We need to switch the active space, then sample atBaryEased(h,0,0,1)
  // for each h. atBaryEased reads state.space, so we set it first.
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
    // Now render the B↔C edge at that hue.
    D.setHue(bestH);
    const cells = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const rgb = D.atBaryEased(bestH, 0, 1 - t, t);
      cells.push(rgb);
    }
    out[sp] = { cells, bestH, bestDE };
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
  <h1>B↔C edge — each space at the hue where its C corner = sRGB pure blue (0,0,255).</h1>
  <div class="sub">Cell 10 is identical across rows. Each row's hue label shows the space-specific hue used.</div>
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
await newPage.screenshot({ path: "/tmp/calib_bc_aligned.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_bc_aligned.png");

// Now compute Lr per cell for each space and count "dark" cells.
const browser2 = await chromium.launch({ headless: true });
const ctx2 = await browser2.newContext({ viewport: { width: 800, height: 600 } });
const p2 = await ctx2.newPage();
await p2.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await p2.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await p2.waitForLoadState("networkidle");
await p2.waitForFunction(() => !!window.__diag);

const lrTable = await p2.evaluate((res) => {
  const D = window.__diag;
  const out = {};
  for (const [sp, info] of Object.entries(res)) {
    out[sp] = info.cells.map(rgb => D.srgbToOklrab(rgb)[0]);
  }
  return out;
}, result);
await browser2.close();

const fmt = (x) => x.toFixed(2).padStart(5);
console.log("\nLr per cell (cell 0 = black, cell 10 = sRGB blue):");
for (const sp of SPACES) {
  console.log(`  ${sp.padEnd(8)}  ${lrTable[sp].map(fmt).join(" ")}`);
}

console.log("\nCount of cells with Lr below threshold:");
console.log(`  ${"space".padEnd(8)}  Lr<0.15  Lr<0.20  Lr<0.25  Lr<0.30`);
for (const sp of SPACES) {
  const ct = (t) => lrTable[sp].filter(v => v < t).length;
  console.log(`  ${sp.padEnd(8)}     ${ct(0.15)}        ${ct(0.20)}        ${ct(0.25)}        ${ct(0.30)}`);
}
