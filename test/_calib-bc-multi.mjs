// Render all 6 UI spaces' B↔C edge as 11-stop horizontal ramps,
// stacked. Same hue (240), same N (10), identity curves. White
// background, plain labels below. User ranks "compacted at the
// black corner" by eye.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const HUE = 240;
const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N = 10;

const ramps = await page.evaluate(({ HUE, SPACES, N }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setHue(HUE);
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const cells = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // B↔C edge: w=0, b varies from 1 to 0, c varies from 0 to 1
      const rgb = D.atBaryEased(HUE, 0, 1 - t, t);
      cells.push(rgb);
    }
    out[sp] = cells;
  }
  return out;
}, { HUE, SPACES, N });
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
  .indexrow { display: flex; gap: 0; padding-left: 80px; }
  .ix { flex: 1; text-align: center; padding: 6px 0;
        font-size: 12px; color: #555; }
  .ramp { display: flex; align-items: stretch; }
  .name { width: 80px; padding: 8px 12px 0 0; font-size: 13px;
          background: #fff; border-right: 1px solid #888; text-align: right; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #333; }
  .sub { font-size: 12px; color: #666; margin-bottom: 10px; }
</style></head><body>
  <h1>B↔C edge for all 6 UI spaces, h=240, identity curves, 11 stops each.</h1>
  <div class="sub">Cell 0 = black corner. Cell 10 = pure-color corner.</div>
  ${SPACES.map(sp => `
    <div class="ramp">
      <div class="name">${sp}</div>
      <div class="row" style="flex: 1">
        ${ramps[sp].map(rgb => `<div class="cell" style="background:${toCss(rgb)}"></div>`).join("")}
      </div>
    </div>
  `).join("")}
  ${indexRow(N + 1)}
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 700 });
await newPage.setContent(html);
await newPage.screenshot({ path: "/tmp/calib_bc_multi.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_bc_multi.png");
