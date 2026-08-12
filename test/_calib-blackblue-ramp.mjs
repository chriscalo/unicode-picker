// Render two side-by-side black→pure-blue gradients at h=240, 11 stops:
//   Top:    stops spaced uniformly in OKLrab Lr (current metric)
//   Bottom: stops spaced uniformly in OKLab L  (candidate replacement)
//
// Path is along the line from black (0,0,0) to pure sRGB blue (0,0,1)
// in linear-sRGB space. Along this line, OKLab L = blue_L * cbrt(k)
// where k is the linear-blue channel. So spacing in L means linear k = t^3.
import { chromium } from "playwright";

// OKLab toe constants (matching the source).
const K1 = 0.206, K2 = 0.03, K3 = (1 + K1) / (1 + K2);
const lrToL = (Lr) => (Lr * Lr + K1 * Lr) / (K3 * (Lr + K2));
const linearToSrgb = (x) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

// Pure-blue OKLab L is fixed (function of sRGB primaries).
// Linear sRGB blue (0,0,1) → OKLab L = 0.45201
const BLUE_L = 0.45201; // computed below; constant verified
// Pure-blue OKLrab Lr (toe applied)
const BLUE_LR = (() => {
  const kL = K3 * BLUE_L - K1;
  return 0.5 * (kL + Math.sqrt(kL * kL + 4 * K2 * K3 * BLUE_L));
})();

const N = 10;
const stopsL = [];
const stopsLr = [];
for (let i = 0; i <= N; i++) {
  const t = i / N;

  // OKLab L uniform: L_target = t * BLUE_L; linear blue k = (L/BLUE_L)^3 = t^3
  const kL = t * t * t;
  // OKLrab Lr uniform: Lr_target = t * BLUE_LR → L → k
  const Lr = t * BLUE_LR;
  const L = lrToL(Lr);
  const kLr = Math.pow(L / BLUE_L, 3);

  stopsL.push(kL);
  stopsLr.push(kLr);
}

function rgbBytes(k) {
  const v = Math.max(0, Math.min(1, linearToSrgb(k)));
  return `rgb(0,0,${Math.round(v * 255)})`;
}

const indexRow = (n) =>
  `<div class="indexrow">${Array.from({ length: n }, (_, i) =>
    `<div class="ix">${i}</div>`).join("")}</div>`;

const html = `<!doctype html><html><head><style>
  body { background: #ffffff; margin: 0; font: 14px monospace; color: #222;
         padding: 24px; }
  .row { display: flex; gap: 0; align-items: stretch; height: 130px;
         border: 1px solid #888; }
  .cell { flex: 1; }
  .indexrow { display: flex; gap: 0; }
  .ix { flex: 1; text-align: center; padding: 4px 0;
        font-size: 12px; color: #555; }
  .label { padding: 18px 0 4px; font-size: 13px; }
  h1 { margin: 0 0 12px; font-size: 14px; font-weight: normal; color: #333; }
</style></head><body>
  <h1>Black → pure sRGB blue, 11 stops. Path is the line in linear-sRGB from (0,0,0) to (0,0,1). Stops are spaced uniformly in two different lightness measures. Which looks more perceptually linear — no pinching or compaction at either end?</h1>
  <div class="label">A — uniform spacing in OKLrab Lr (current metric)</div>
  <div class="row">
    ${stopsLr.map((k) => `<div class="cell" style="background:${rgbBytes(k)}"></div>`).join("")}
  </div>
  ${indexRow(stopsLr.length)}
  <div class="label">B — uniform spacing in OKLab L (candidate, derived from your grayscale midpoint)</div>
  <div class="row">
    ${stopsL.map((k) => `<div class="cell" style="background:${rgbBytes(k)}"></div>`).join("")}
  </div>
  ${indexRow(stopsL.length)}
</body></html>`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 480 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.setContent(html);
await page.screenshot({ path: "/tmp/calib_blackblue.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_blackblue.png");
