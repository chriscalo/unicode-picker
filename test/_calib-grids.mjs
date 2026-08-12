// Render each space's tonal grid as discrete cells (N=10 → 66 cells),
// all hue-aligned so C corner = sRGB pure blue. Identity curves.
// Layout: W = top-left, C = top-right, B = bottom. 6 spaces in 2x3 grid.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N = 10;
const CELL = 28;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const grids = await page.evaluate(({ SPACES, N }) => {
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
    // Sample the triangular grid: rows j = 0..N, cells i = 0..(N-j)
    // For cell (j, i): b_idx = j, w_idx = N-j-i, c_idx = i
    const rows = [];
    for (let j = 0; j <= N; j++) {
      const row = [];
      for (let i = 0; i <= N - j; i++) {
        const b = j / N;
        const w = (N - j - i) / N;
        const c = i / N;
        const rgb = D.atBaryEased(bestH, w, b, c);
        row.push(rgb);
      }
      rows.push(row);
    }
    out[sp] = { hue: bestH, rows };
  }
  return out;
}, { SPACES, N });
await page.close();

const toCss = (rgb) => {
  const [r, g, b] = rgb.map(x => Math.max(0, Math.min(255, Math.round(x * 255))));
  return `rgb(${r},${g},${b})`;
};

function renderGrid(sp, info) {
  const rows = info.rows.map((row, j) => {
    const cells = row.map(rgb =>
      `<div class="cell" style="background:${toCss(rgb)}"></div>`).join("");
    // Indent each row by j/2 cells (because each row has one fewer cell;
    // visual triangle has W top-left, C top-right, B bottom-center).
    const offset = j * CELL / 2;
    return `<div class="row" style="margin-left:${offset}px">${cells}</div>`;
  }).join("");
  return `
    <div class="grid-cell">
      <div class="label">${sp} <small>(h=${info.hue.toFixed(1)}°)</small></div>
      <div class="grid">${rows}</div>
    </div>
  `;
}

const html = `<!doctype html><html><head><style>
  body { background: #ffffff; margin: 0; font: 14px monospace; color: #222;
         padding: 24px; }
  h1 { margin: 0 0 14px; font-size: 14px; font-weight: normal; color: #333; }
  .layout { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
  .grid-cell { display: flex; flex-direction: column; align-items: flex-start; }
  .label { padding-bottom: 8px; font-size: 13px; color: #333; }
  .label small { color: #888; }
  .grid { display: flex; flex-direction: column; }
  .row { display: flex; }
  .cell { width: ${CELL}px; height: ${CELL}px; }
</style></head><body>
  <h1>Tonal grid for each space, 11×11 stops, hue per space normalized so C corner = sRGB pure blue. Identity curves. W = top-left, C = top-right, B = bottom-center.</h1>
  <div class="layout">${SPACES.map(sp => renderGrid(sp, grids[sp])).join("")}</div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1400, height: 1100 });
await newPage.setContent(html);
await newPage.waitForTimeout(300);
await newPage.screenshot({ path: "/tmp/calib_grids.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_grids.png");
