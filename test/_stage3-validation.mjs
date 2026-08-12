// Stage 3 eye-validation tile: render painter's triangles for each
// of the 6 UI spaces at calibration hues so the user can compare
// metric rankings against perception. Hues chosen to surface known
// failure modes: 220° (blue/purple bow), 130° (green plateau), 30°
// (orange — broad sRGB sweet spot), 0° (red — narrow gamut).
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const HUES   = [0, 30, 130, 220];
const TRI    = 220; // pixel size per triangle

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1900, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const tris = await page.evaluate(({ SPACES, HUES, TRI }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();

  // For each (space, hue), produce a 2D pixel grid of the triangle
  // rendered with C top, W bottom-left, B bottom-right.
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    out[sp] = {};
    for (const h of HUES) {
      const pixels = new Array(TRI * TRI * 4).fill(0);
      for (let py = 0; py < TRI; py++) {
        for (let px = 0; px < TRI; px++) {
          // map pixel to barycentric (w, b, c) with C at top
          // Triangle: top apex (px=TRI/2, py=0), bottom-left W (0, TRI-1),
          // bottom-right B (TRI-1, TRI-1)
          const x = px / (TRI - 1);
          const y = py / (TRI - 1);
          // top apex: (0.5, 0); BL: (0, 1); BR: (1, 1)
          // c = 1 - y
          // w = (1 - x) - (1 - y)/2  ... actually simpler:
          //   if y >= 0 and y <= 1, the row at height y has width y
          //   centered on x=0.5 (full width 1 at y=1).
          const c = 1 - y;
          const halfW = y / 2;
          const xL = 0.5 - halfW;
          const xR = 0.5 + halfW;
          if (x < xL || x > xR) continue;
          const local = halfW > 1e-9 ? (x - xL) / (xR - xL) : 0;
          const b = y * local;
          const w = y * (1 - local);
          const rgb = D.atBary(sp, h, w, b, c);
          const i = (py * TRI + px) * 4;
          pixels[i  ] = Math.max(0, Math.min(255, Math.round(rgb[0]*255)));
          pixels[i+1] = Math.max(0, Math.min(255, Math.round(rgb[1]*255)));
          pixels[i+2] = Math.max(0, Math.min(255, Math.round(rgb[2]*255)));
          pixels[i+3] = 255;
        }
      }
      out[sp][h] = pixels;
    }
  }
  return out;
}, { SPACES, HUES, TRI });

await page.close();

// Render each triangle to a canvas in a new HTML page.
const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 13px monospace; color: #ddd;
         padding: 20px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #888; font-size: 11px; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: 80px repeat(${SPACES.length}, ${TRI + 8}px);
          gap: 6px; align-items: center; }
  .colhead { color: #ccc; font-size: 11px; text-align: center; }
  .rowhead { color: #ccc; font-size: 11px; text-align: right; }
  canvas { display: block; background: #2a2a2a; }
</style></head><body>
  <h1>Stage 3 — painter's triangles, 6 spaces × 4 calibration hues</h1>
  <div class="sub">Apex = C (pure hue), bottom-left = W (white), bottom-right = B (black). Look for: hue drift through wrong family, pinched corners, grey middles, sharp slopes.</div>
  <div class="grid">
    <div></div>
    ${SPACES.map(sp => `<div class="colhead">${sp}</div>`).join("")}
    ${HUES.map(h => `
      <div class="rowhead">hue ${h}°</div>
      ${SPACES.map(sp => `<canvas id="c-${sp}-${h}" width="${TRI}" height="${TRI}"></canvas>`).join("")}
    `).join("")}
  </div>
  <script>
    const data = ${JSON.stringify(tris)};
    const TRI = ${TRI};
    for (const sp of Object.keys(data)) {
      for (const h of Object.keys(data[sp])) {
        const cv = document.getElementById('c-' + sp + '-' + h);
        const ctx = cv.getContext('2d');
        const img = ctx.createImageData(TRI, TRI);
        const pixels = data[sp][h];
        for (let i = 0; i < pixels.length; i++) img.data[i] = pixels[i];
        ctx.putImageData(img, 0, 0);
      }
    }
  </script>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: SPACES.length * (TRI + 8) + 140, height: HUES.length * (TRI + 12) + 100 });
await newPage.setContent(html);
await newPage.waitForTimeout(500);
await newPage.screenshot({ path: "/tmp/stage3_triangles.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/stage3_triangles.png");
