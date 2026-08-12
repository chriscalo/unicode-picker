// Stage 3 — calibrate the user's perceptual halfway between white
// and black. Renders a W↔B horizontal strip plus 7 candidate
// "midpoint" swatches at OKLrab Lr ∈ {0.40, 0.45, 0.50, 0.55,
// 0.60, 0.65, 0.70}, numbered. User picks the swatch number that
// reads as exactly halfway between W and B.
import { chromium } from "playwright";

const N_PATH = 200;
const CANDIDATES = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65];
const SURROUND = "#767676"; // neutral mid-grey (CIE L*=50, OKLrab Lr≈0.50)

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 600 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

// Build the W↔B strip in HWB (which is sRGB-uniform on the achromatic axis)
const data = await page.evaluate(({ N_PATH, CANDIDATES }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x*255))); }
  // OKLrab's Lr is monotonic in luminance; to render a candidate at
  // Lr=L, we need to invert. Easiest: search sRGB grey value g such
  // that srgbToOklrab([g,g,g])[0] ≈ L.
  function greyForLr(L) {
    let lo = 0, hi = 1;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      const lr = D.srgbToOklrab([mid, mid, mid])[0];
      if (lr < L) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const stripColors = [];
  for (let i = 0; i < N_PATH; i++) {
    const t = i / (N_PATH - 1);
    // Linear-Lr ramp: rendered Lr = 1 - t, so the sRGB value is greyForLr(1-t)
    const g = greyForLr(1 - t);
    stripColors.push([clamp(g), clamp(g), clamp(g)]);
  }
  const candidates = CANDIDATES.map(lr => {
    const g = greyForLr(lr);
    return { lr, rgb: [clamp(g), clamp(g), clamp(g)] };
  });
  return { stripColors, candidates };
}, { N_PATH, CANDIDATES });
await page.close();

function gradient(colors) {
  return colors.map((c, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
  }).join(", ");
}

const candCells = data.candidates.map((c, i) => `
  <div class="cand">
    <div class="num">#${i + 1}</div>
    <div class="sw" style="background:rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})"></div>
    <div class="lr">Lr=${c.lr.toFixed(2)}</div>
  </div>
`).join("");

const html = `<!doctype html><html><head><style>
  body { background:${SURROUND}; margin:0; font:13px monospace; color:#000;
         padding:24px; }
  h1 { font-size:14px; font-weight:normal; color:#222; margin:0 0 4px; }
  .sub { color:#444; font-size:11px; margin-bottom:14px; line-height:1.5; }
  .strip { width:1200px; height:80px; border:1px solid #444; }
  .row { display:flex; gap:14px; align-items:flex-start; margin-top:24px; }
  .cand { display:flex; flex-direction:column; align-items:center; gap:4px; }
  .num { color:#222; font-size:12px; }
  .sw { width:140px; height:120px; border:1px solid #444; }
  .lr { color:#555; font-size:10px; }
  .endpoints { display:flex; justify-content:space-between; width:1200px;
               margin-top:6px; color:#222; font-size:11px; }
</style></head><body>
  <h1>Calibration — perceptual halfway between white and black (NEUTRAL grey surround ${SURROUND})</h1>
  <div class="sub">
    Surround is neutral grey (#767676). The strip is a continuous gradient
    from W (left) to B (right).<br>
    Below are 7 candidate "midpoint" swatches.<br>
    <b>Which numbered swatch reads as exactly perceptually halfway between white and black?</b>
    Just give the number (1–7).
  </div>
  <div class="strip" style="background:linear-gradient(to right, ${gradient(data.stripColors)})"></div>
  <div class="endpoints"><span>W (Lr=1.00)</span><span>B (Lr=0.00)</span></div>
  <div class="row">${candCells}</div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1300, height: 480 });
await newPage.setContent(html);
await newPage.waitForTimeout(500);
await newPage.screenshot({ path: "/tmp/stage3_lr_cal.png", fullPage: true });
await browser.close();
console.log(`wrote /tmp/stage3_lr_cal.png`);
console.log(`Candidates: ${data.candidates.map((c,i)=>`#${i+1}=Lr${c.lr}`).join(", ")}`);
