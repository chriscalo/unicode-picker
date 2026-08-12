// Render a 21-stop black-to-white grayscale ramp. The user picks
// the stop that looks like the perceptual midpoint between black
// and white. From that we derive their lightness curve.
//
// Stops are spaced uniformly in linear sRGB, so 0..20 means
// linear values 0/20, 1/20, ..., 20/20. The visible midpoint stop
// will tell us where their eye places "middle gray" in linear
// sRGB → which can then be compared to OKLab L=0.5, OKLrab Lr=0.5,
// or sRGB byte 128.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 240 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const N = 20;
const cells = [];
for (let i = 0; i <= N; i++) {
  const linear = i / N;
  // sRGB display value (gamma-encoded) for the linear-sRGB sample
  const srgb = linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  const byte = Math.max(0, Math.min(255, Math.round(srgb * 255)));
  cells.push({ i, linear, byte });
}

const html = `<!doctype html><html><head><style>
  body { background: #1f1f1f; margin: 0; font: 14px monospace; color: #ddd;
         padding: 24px; }
  .row { display: flex; gap: 0; align-items: stretch; height: 140px;
         border: 1px solid #444; }
  .cell { flex: 1; display: flex; flex-direction: column;
          justify-content: flex-end; align-items: center; padding-bottom: 4px;
          color: #fff; mix-blend-mode: difference; font-size: 11px; }
  .label { padding: 6px 0 12px; text-align: center; font-size: 12px; }
  h1 { margin: 0 0 12px; font-size: 14px; font-weight: normal; color: #ccc; }
</style></head><body>
  <h1>Black-to-white grayscale ramp — pick the stop that looks like the perceptual midpoint between the two ends.</h1>
  <div class="row">
    ${cells.map(c => `<div class="cell" style="background:rgb(${c.byte},${c.byte},${c.byte})">${c.i}</div>`).join("")}
  </div>
  <div class="label">Stops are spaced uniformly in linear sRGB (i/20 for i=0..20). Pick the index whose perceived brightness sits halfway between the leftmost and rightmost cells. Edges are pure black (0) and pure white (20).</div>
</body></html>`;

await page.setContent(html);
await page.screenshot({ path: "/tmp/calib_gray_ramp.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_gray_ramp.png");
