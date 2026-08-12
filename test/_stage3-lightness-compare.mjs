// Compare W→B ramps under different lightness models and show
// each ramp's midpoint as a swatch, so the user can see which
// model's "midpoint" reads as actually halfway to their eye.
//
// Models compared:
//   1. sRGB-uniform    — linear interpolation in sRGB code (gamma-encoded)
//   2. Linear Y        — uniform in linear luminance
//   3. CIE L* uniform  — chroma.js correctLightness (Lab L*)
//   4. OKLrab Lr       — what our metric currently uses
import { chromium } from "playwright";

const N_PATH = 200;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 800 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

// Inject chroma.js from CDN.
await page.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/chroma-js@2.4.2/chroma.min.js" });
await page.waitForFunction(() => !!window.chroma);

const data = await page.evaluate(({ N_PATH }) => {
  const D = window.__diag;
  const chroma = window.chroma;
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x*255))); }
  function clampI(x) { return Math.max(0, Math.min(255, Math.round(x))); }

  // 1. sRGB-uniform: linear interp in sRGB code
  const srgbColors = [];
  for (let i = 0; i < N_PATH; i++) {
    const t = i / (N_PATH - 1);
    const g = (1 - t) * 255;
    srgbColors.push([clampI(g), clampI(g), clampI(g)]);
  }
  const srgbMid = srgbColors[Math.floor(N_PATH / 2)];

  // 2. Linear Y uniform: rendered Y = 1 - t, then sRGB-encode
  function srgbEnc(linear) {
    if (linear <= 0.0031308) return 12.92 * linear;
    return 1.055 * Math.pow(linear, 1/2.4) - 0.055;
  }
  const yColors = [];
  for (let i = 0; i < N_PATH; i++) {
    const t = i / (N_PATH - 1);
    const y = 1 - t;
    const g = srgbEnc(y);
    yColors.push([clamp(g), clamp(g), clamp(g)]);
  }
  const yMid = yColors[Math.floor(N_PATH / 2)];

  // 3. chroma.js correctLightness — Lab L* uniform
  const scaleCJ = chroma.scale(["white", "black"]).mode("lab").correctLightness();
  const cjColors = [];
  for (let i = 0; i < N_PATH; i++) {
    const t = i / (N_PATH - 1);
    const rgb = scaleCJ(t).rgb();
    cjColors.push([clampI(rgb[0]), clampI(rgb[1]), clampI(rgb[2])]);
  }
  const cjMid = cjColors[Math.floor(N_PATH / 2)];
  // Also get the actual L* of the chroma.js midpoint
  const cjMidLstar = chroma(cjMid).get("lab.l");

  // 4. OKLrab Lr uniform: bisect to find sRGB grey g such that Lr=L
  function greyForLr(L) {
    let lo = 0, hi = 1;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      const lr = D.srgbToOklrab([mid, mid, mid])[0];
      if (lr < L) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const lrColors = [];
  for (let i = 0; i < N_PATH; i++) {
    const t = i / (N_PATH - 1);
    const g = greyForLr(1 - t);
    lrColors.push([clamp(g), clamp(g), clamp(g)]);
  }
  const lrMid = lrColors[Math.floor(N_PATH / 2)];

  // sRGB hex helpers
  const hex = (rgb) => "#" + rgb.map(c => c.toString(16).padStart(2,"0")).join("");
  return {
    strips: {
      srgb:  { colors: srgbColors, mid: srgbMid, hex: hex(srgbMid) },
      Y:     { colors: yColors,    mid: yMid,    hex: hex(yMid) },
      lstar: { colors: cjColors,   mid: cjMid,   hex: hex(cjMid), Lstar: cjMidLstar },
      Lr:    { colors: lrColors,   mid: lrMid,   hex: hex(lrMid) },
    },
  };
}, { N_PATH });

await page.close();

function gradient(colors) {
  return colors.map((c, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
  }).join(", ");
}
const labels = {
  srgb:  "1. sRGB-uniform (linear interp in sRGB code)",
  Y:     "2. Linear luminance Y uniform",
  lstar: "3. CIE L* uniform (chroma.js correctLightness)",
  Lr:    "4. OKLrab Lr uniform (current metric)",
};
const order = ["srgb", "Y", "lstar", "Lr"];
const blocks = order.map(k => {
  const s = data.strips[k];
  return `
    <div class="block">
      <div class="lbl">${labels[k]}</div>
      <div class="row">
        <div class="strip" style="background:linear-gradient(to right, ${gradient(s.colors)})"></div>
        <div class="midSw" style="background:rgb(${s.mid[0]},${s.mid[1]},${s.mid[2]})"></div>
        <div class="midHex">${s.hex}</div>
      </div>
    </div>
  `;
}).join("");

const html = `<!doctype html><html><head><style>
  body { background:#1a1a1a; margin:0; font:13px monospace; color:#ddd;
         padding:24px; }
  h1 { font-size:14px; font-weight:normal; color:#ccc; margin:0 0 4px; }
  .sub { color:#888; font-size:11px; margin-bottom:14px; line-height:1.5; }
  .block { margin-bottom:16px; }
  .lbl { color:#ccc; font-size:12px; margin-bottom:4px; }
  .row { display:flex; align-items:center; gap:10px; }
  .strip { width:1100px; height:60px; border:1px solid #333; }
  .midSw { width:120px; height:60px; border:1px solid #333; }
  .midHex { color:#bbb; font-size:11px; min-width:80px; }
</style></head><body>
  <h1>W↔B ramps under 4 lightness models</h1>
  <div class="sub">
    Each strip is a continuous W→B ramp uniform under the named model.<br>
    The square next to it is the strip's <b>midpoint</b> color (t=0.5).<br>
    Your reported perceptual halfway = #353535.
  </div>
  ${blocks}
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1400, height: 480 });
await newPage.setContent(html);
await newPage.waitForTimeout(500);
await newPage.screenshot({ path: "/tmp/stage3_lightness_compare.png", fullPage: true });
await browser.close();
console.log(`wrote /tmp/stage3_lightness_compare.png`);
console.log(`Midpoints:`);
for (const k of order) {
  const s = data.strips[k];
  console.log(`  ${labels[k]}: ${s.hex}`);
}
