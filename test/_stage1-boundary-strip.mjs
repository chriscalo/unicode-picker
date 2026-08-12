// Stage 1 boundary annotation: render a hue strip with degree
// markings so the user can identify the 16 perceptual category
// boundaries (R↔R-O, R-O↔O, O↔O-Y, ..., M-R↔R) by reading off
// angles. Uses HWB (sRGB hue) rendering.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1900, height: 360 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const stops = await page.evaluate(() => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setSpace("hwb");
  const out = [];
  for (let i = 0; i < 720; i++) {
    const h = i * 0.5;
    const rgb = D.atBary("hwb", h, 0, 0, 1);
    out.push(rgb.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)));
  }
  return out;
});
await page.close();

const W = 1800;
const STRIP_H = 100;
const TICK_H = 16;
const LABEL_H = 30;

const stripStops = stops.map((c, i) => {
  const pct = (i / stops.length) * 100;
  return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(2)}%`;
}).join(", ");

// Tick marks every 5°. Major labels every 10°.
const ticks = [];
for (let d = 0; d <= 360; d += 5) {
  const x = (d / 360) * W;
  const isMajor = d % 30 === 0;
  ticks.push(`<line x1="${x}" y1="0" x2="${x}" y2="${isMajor ? TICK_H : TICK_H * 0.5}" stroke="${isMajor ? '#ddd' : '#999'}" stroke-width="${isMajor ? 1.5 : 0.8}" />`);
  if (d % 30 === 0 && d < 360) {
    ticks.push(`<text x="${x + 3}" y="${TICK_H + 14}" font-size="13" font-family="monospace" fill="#ddd">${d}°</text>`);
  }
  if (d % 10 === 0 && d % 30 !== 0 && d < 360) {
    ticks.push(`<text x="${x + 3}" y="${TICK_H + 14}" font-size="11" font-family="monospace" fill="#888">${d}</text>`);
  }
}

// §14 prior boundaries (light reference, user is correcting these):
const PRIOR_BOUNDARIES = [
  { angle: 357, label: "M-R | R" },
  { angle:  22, label: "R-O | O" }, // approximate
  { angle:  46, label: "O-Y | Y" },
  { angle:  68, label: "Y | Y-G" },
  { angle:  80, label: "Y-G | G" },
  { angle: 145, label: "G | G-C" },
  { angle: 167, label: "G-C | C" },
  { angle: 193, label: "C | C-B" },
  { angle: 210, label: "C-B | B" },
  { angle: 238, label: "B | B-P" },
  { angle: 268, label: "B-P | P" },
  { angle: 295, label: "P | P-M" },
  { angle: 312, label: "P-M | M" },
  { angle: 328, label: "M | M-R" },
];
const priorMarkers = PRIOR_BOUNDARIES.map(b => {
  const x = (b.angle / 360) * W;
  return `
    <line x1="${x}" y1="${TICK_H}" x2="${x}" y2="${STRIP_H + TICK_H}" stroke="#fff" stroke-width="1" stroke-dasharray="3,3" opacity="0.5" />
    <text x="${x + 3}" y="${STRIP_H + TICK_H - 6}" font-size="9" font-family="monospace" fill="#fff" opacity="0.6">${b.angle}°</text>
  `;
}).join("");

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 13px monospace; color: #ddd;
         padding: 18px 30px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #888; font-size: 11px; margin-bottom: 14px; line-height: 1.5; }
  .strip { width: ${W}px; height: ${STRIP_H}px; }
  svg { display: block; }
  .axes { background: transparent; }
</style></head><body>
  <h1>Stage 1 — boundary calibration strip (HWB rendering, sRGB hue)</h1>
  <div class="sub">
    Major ticks every 30°, minor every 10° (labels), micro every 5° (just ticks).<br>
    White dashed lines = §14 prior boundary estimates (you're correcting these).<br>
    Tell me 16 angles where each transition sits. Categories are:
    <b>R, R-O, O, O-Y, Y, Y-G, G, G-C, C, C-B, B, B-P, P, P-M, M, M-R</b>.<br>
    Free-text format works: "R-O starts at 12, O at 24, O-Y at 38..." etc. Or list 16 boundary angles directly.
  </div>
  <svg class="axes" width="${W}" height="${TICK_H + LABEL_H}" viewBox="0 0 ${W} ${TICK_H + LABEL_H}">
    ${ticks}
  </svg>
  <div class="strip" style="background: linear-gradient(to right, ${stripStops})"></div>
  <svg width="${W}" height="${LABEL_H}" viewBox="0 0 ${W} ${LABEL_H}">
    ${priorMarkers.replace(/y2="[^"]+"/g, `y2="${LABEL_H}"`)}
  </svg>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1900, height: 280 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/calib_boundary_strip.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_boundary_strip.png");
