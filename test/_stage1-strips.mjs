// Stage 1: rectify each space's hue wheel into a horizontal strip
// (linear 0\u00b0\u2192360\u00b0). Stacked, plateaus and family compaction become
// visible because the eye sees same-hued colors as a flat band.
import { chromium } from "playwright";
import fs from "fs";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

// For each space, sample the active strategy's ringAt(hue) at 720 angles
// (every 0.5\u00b0). Each space exposes ringAt via window.__diag implicitly
// through atBary at C corner with state set, but we have a simpler path:
// strategy.ringAt(hue). Need to expose that.
const strips = await page.evaluate(({ SPACES }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    const colors = [];
    for (let i = 0; i < 720; i++) {
      const h = i * 0.5;
      // Use the C corner of the triangle as the "pure hue" for that angle
      // (consistent with how the ring is rendered in tile 1).
      const rgb = D.atBary(sp, h, 0, 0, 1);
      colors.push(rgb.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)));
    }
    out[sp] = colors;
  }
  return out;
}, { SPACES });
await page.close();

const W = 1440, H = 60;
const cells = SPACES.map(sp => {
  const colors = strips[sp];
  const stops = colors.map((c, i) => {
    const pct = (i / colors.length) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(2)}%`;
  }).join(", ");
  return `
    <div class="cell">
      <div class="label">${sp}</div>
      <div class="strip" style="background: linear-gradient(to right, ${stops})"></div>
    </div>
  `;
}).join("");

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 14px monospace; color: #ddd;
         padding: 24px; }
  h1 { margin: 0 0 8px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #999; font-size: 12px; padding-bottom: 14px; }
  .cell { padding-bottom: 8px; }
  .label { padding: 2px 0; font-size: 12px; color: #aaa; }
  .strip { width: ${W}px; height: ${H}px; }
  .ruler { display: flex; padding-top: 6px; }
  .tick { flex: 1; text-align: left; font-size: 11px; color: #777;
          border-left: 1px solid #555; padding: 2px 0 0 4px; }
</style></head><body>
  <h1>Stage 1 \u2014 hue wheels rectified to strips. Identity curves.</h1>
  <div class="sub">Each strip is the C-corner color of the active strategy at angles 0\u00b0\u2026360\u00b0. Plateaus look like flat bands; compacted families look like narrow ones.</div>
  ${cells}
  <div class="ruler" style="width:${W}px">
    ${[0, 60, 120, 180, 240, 300].map(d => `<div class="tick">${d}\u00b0</div>`).join("")}
  </div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1600, height: 700 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/calib_stage1_strips.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_stage1_strips.png");
