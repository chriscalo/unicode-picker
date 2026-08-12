// Boundary calibration probe. Renders 8 swatches around a target
// hue with a random offset (so the midpoint isn't predictable),
// with 7 numbered markers between adjacent pairs. User identifies
// which marker is the boundary.
//
// Usage: node test/_stage1-boundary-probe.mjs <id> <centerHue> [windowSpan]
import { chromium } from "playwright";

const [, , id, centerStr, spanStr] = process.argv;
if (!id || !centerStr) {
  console.error("usage: node test/_stage1-boundary-probe.mjs <id> <centerHue> [windowSpan=24]");
  process.exit(2);
}
const center = parseFloat(centerStr);
const span = parseFloat(spanStr || "40");

// Random offset in [-span/4, +span/4] — shifts the window so the
// boundary isn't visually centered. Wider windows ensure the
// boundary is always inside.
const offsetMag = span / 4;
const offset = (Math.random() * 2 - 1) * offsetMag;
const windowCenter = center + offset;
const start = windowCenter - span / 2;
const end   = windowCenter + span / 2;

const N_SWATCHES = 12;
const swatches = [];
for (let i = 0; i < N_SWATCHES; i++) {
  swatches.push(start + (i / (N_SWATCHES - 1)) * span);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 360 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const colors = await page.evaluate(({ swatches }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setSpace("hwb");
  return swatches.map(h => {
    const rgb = D.atBary("hwb", h, 0, 0, 1);
    return rgb.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255));
  });
}, { swatches });

await page.close();

const cells = colors.map((c, i) => {
  const swatch = `<div class="swatch" style="background:rgb(${c[0]},${c[1]},${c[2]})"></div>`;
  if (i < N_SWATCHES - 1) {
    return swatch + `<div class="marker">${i + 1}</div>`;
  }
  return swatch;
}).join("");

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 14px monospace; color: #ddd;
         padding: 24px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #888; font-size: 12px; margin-bottom: 16px; }
  .row { display: flex; align-items: center; height: 220px; }
  .swatch { width: 130px; height: 200px; border: 1px solid #333; }
  .marker { width: 36px; text-align: center; font-size: 22px;
            color: #ddd; padding: 0 4px; }
</style></head><body>
  <h1>Boundary probe — ${id}</h1>
  <div class="sub">Identify the marker number where the transition happens. Marker numbers shown between the swatches.</div>
  <div class="row">${cells}</div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 320 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: `/tmp/calib_boundary_${id}.png`, fullPage: true });
await browser.close();

console.log(`wrote /tmp/calib_boundary_${id}.png`);
console.log(`HIDDEN window: ${start.toFixed(2)}° to ${end.toFixed(2)}° (offset ${offset.toFixed(2)})`);
console.log(`HIDDEN swatch hues: ${swatches.map(h => h.toFixed(1)).join(", ")}`);
console.log(`HIDDEN marker midpoints:`);
for (let i = 0; i < N_SWATCHES - 1; i++) {
  const mid = (swatches[i] + swatches[i + 1]) / 2;
  console.log(`  marker ${i + 1}: ${mid.toFixed(2)}°`);
}
