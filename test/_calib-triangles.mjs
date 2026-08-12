// Render each space's full triangle as a smooth gradient image,
// all aligned so the C corner = sRGB pure blue. Each triangle is
// 280×260 pixels. Layout: W at top-left, C at top-right, B at bottom.
// All 6 stacked in a 2x3 grid.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const TRI_W = 280;
const TRI_H = 260;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

// Find each space's hue that puts C corner closest to sRGB pure blue,
// and render the full triangle as a 2D pixel array.
const triangles = await page.evaluate(({ SPACES, TRI_W, TRI_H }) => {
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

    // Render triangle. Vertices in pixel coords:
    //   W = (0, 0) — top-left
    //   C = (TRI_W, 0) — top-right
    //   B = (TRI_W/2, TRI_H) — bottom
    const W = [0, 0];
    const Cv = [TRI_W, 0];
    const Bv = [TRI_W / 2, TRI_H];
    const denom = (Bv[1] - Cv[1]) * (W[0] - Cv[0]) + (Cv[0] - Bv[0]) * (W[1] - Cv[1]);

    const pixels = new Uint8ClampedArray(TRI_W * TRI_H * 4);
    for (let y = 0; y < TRI_H; y++) {
      for (let x = 0; x < TRI_W; x++) {
        // Barycentric: lambda_W, lambda_B, lambda_C
        const lW = ((Bv[1] - Cv[1]) * (x - Cv[0]) + (Cv[0] - Bv[0]) * (y - Cv[1])) / denom;
        const lB = ((Cv[1] - W[1]) * (x - Cv[0]) + (W[0] - Cv[0]) * (y - Cv[1])) / denom;
        const lC = 1 - lW - lB;
        const idx = (y * TRI_W + x) * 4;
        if (lW < -1e-3 || lB < -1e-3 || lC < -1e-3) {
          pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255;
          pixels[idx+3] = 0;
          continue;
        }
        const rgb = D.atBaryEased(bestH, Math.max(0, lW), Math.max(0, lB), Math.max(0, lC));
        pixels[idx]     = Math.max(0, Math.min(255, Math.round(rgb[0] * 255)));
        pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(rgb[1] * 255)));
        pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(rgb[2] * 255)));
        pixels[idx + 3] = 255;
      }
    }
    out[sp] = { hue: bestH, pixels: Array.from(pixels) };
  }
  return out;
}, { SPACES, TRI_W, TRI_H });
await page.close();

// Build the visualization: 2 rows × 3 cols of triangles via canvas imageData.
const cells = SPACES.map(sp => {
  const tri = triangles[sp];
  return `
    <div class="cell">
      <div class="label">${sp} <small>(h=${tri.hue.toFixed(1)}°)</small></div>
      <canvas id="c-${sp}" width="${TRI_W}" height="${TRI_H}"></canvas>
    </div>
  `;
}).join("");

const dataInjection = `
<script>
const data = ${JSON.stringify(Object.fromEntries(SPACES.map(sp => [sp, triangles[sp].pixels])))};
for (const sp of ${JSON.stringify(SPACES)}) {
  const c = document.getElementById("c-" + sp);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(${TRI_W}, ${TRI_H});
  const arr = data[sp];
  for (let i = 0; i < arr.length; i++) img.data[i] = arr[i];
  ctx.putImageData(img, 0, 0);
}
</script>
`;

const html = `<!doctype html><html><head><style>
  body { background: #ffffff; margin: 0; font: 14px monospace; color: #222;
         padding: 24px; }
  h1 { margin: 0 0 14px; font-size: 14px; font-weight: normal; color: #333; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cell { display: flex; flex-direction: column; align-items: center; }
  canvas { display: block; }
  .label { padding-bottom: 6px; font-size: 13px; color: #333; }
  .label small { color: #888; }
</style></head><body>
  <h1>All 6 spaces, hue chosen per space so C corner = sRGB pure blue. Identity curves. Triangle: W = top-left, C = top-right, B = bottom.</h1>
  <div class="grid">${cells}</div>
${dataInjection}
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1100, height: 720 });
await newPage.setContent(html);
await newPage.waitForTimeout(300);
await newPage.screenshot({ path: "/tmp/calib_triangles.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/calib_triangles.png");
