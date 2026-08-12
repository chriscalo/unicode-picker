// Stage 3 — render painter's triangles with a per-pixel Lr
// correction applied to match the user's eye on neutral surround.
//
// Correction: Lr_corrected = Lr^(1/γ).
//   At γ=0.7, Lr=0.5 → 0.371 (matches user's perceptual halfway
//   point on neutral surround #767676).
//   At γ=1.0, no change.
//
// Renders 6 spaces × 4 hues, side-by-side comparison of UNCORRECTED
// (γ=1.0) vs CORRECTED (γ=0.7), all on neutral grey surround.
//
// Usage:
//   node test/_stage3-corrected.mjs [gamma]
//     gamma defaults to 0.7 (user's neutral-surround calibration)
import { chromium } from "playwright";

const GAMMA = parseFloat(process.argv[2] || "0.7");
const W_PEAK_LABEL = "(1-w)(1-b)(1-c)/(8/27)";
const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const HUES_TGT = [
  { name: "red",     rgb: [1,0,0] },
  { name: "green",   rgb: [0,1,0] },
  { name: "blue",    rgb: [0,0,1] },
  { name: "yellow",  rgb: [1,1,0] },
];
const TRI = 240;
const SURROUND = "#767676";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 2400, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const data = await page.evaluate(({ SPACES, HUES_TGT, TRI, GAMMA }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x*255))); }
  function dE(a, b) {
    const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  }
  function findHue(sp, target) {
    D.setSpace(sp);
    const tLab = D.srgbToOklrab(target);
    let bH = 0, bE = Infinity;
    for (let h = 0; h < 360; h += 0.5) {
      const e = dE(D.srgbToOklrab(D.atBary(sp, h, 0, 0, 1)), tLab);
      if (e < bE) { bE = e; bH = h; }
    }
    return bH;
  }
  // Proper OKLrab → sRGB inverse so we can modify Lr while
  // preserving the (a, b) chromaticity.
  const K1 = 0.206, K2 = 0.03, K3 = (1 + K1) / (1 + K2);
  function lrToL(Lr) {
    // Inverse of OKLrab toe. Given Lr, return OKLab L.
    const u = 2 * Lr + K1;
    const denom = 2 * (u - K1) + 4 * K2;
    if (Math.abs(denom) < 1e-12) return 0;
    return ((u - K1) * (u + K1) / denom) / K3;
  }
  function linearToSrgb(c) {
    const cc = Math.max(0, c);
    if (cc <= 0.0031308) return Math.min(1, 12.92 * cc);
    return Math.min(1, 1.055 * Math.pow(cc, 1/2.4) - 0.055);
  }
  function oklabToSrgb(L, a, b) {
    // M2_inv: cube-roots of cones from L,a,b
    const lp = L + 0.3963377774 * a + 0.2158037573 * b;
    const mp = L - 0.1055613458 * a - 0.0638541728 * b;
    const sp = L - 0.0894841775 * a - 1.2914855480 * b;
    const lc = lp*lp*lp, mc = mp*mp*mp, sc = sp*sp*sp;
    // M1_inv: cones to linear sRGB
    const r = +4.0767416621*lc - 3.3077115913*mc + 0.2309699292*sc;
    const g = -1.2684380046*lc + 2.6097574011*mc - 0.3413193965*sc;
    const bb= -0.0041960863*lc - 0.7034186147*mc + 1.7076147010*sc;
    return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bb)];
  }
  // Smooth barycentric weight: (1-w)(1-b)(1-c) is a C^∞ polynomial
  // that's zero at all 3 corners and peaks at the centroid (8/27).
  // No kinks (unlike 1 - max(w,b,c) which has discontinuous
  // derivative along the medians, producing a visible Y artifact).
  // Normalized so weight=1 at centroid.
  const W_PEAK = 8 / 27;
  function applyLrCorrection(rgb, gamma, w, b, c) {
    if (gamma === 1.0) return rgb;
    const weight = (1 - w) * (1 - b) * (1 - c) / W_PEAK;
    if (weight < 1e-6) return rgb;
    const lab = D.srgbToOklrab(rgb);
    const Lr = lab[0], aa = lab[1], bb = lab[2];
    const LrTarget = Math.pow(Lr, 1 / gamma);
    const LrNew = Lr * (1 - weight) + LrTarget * weight;
    if (Math.abs(LrNew - Lr) < 1e-6) return rgb;
    const Lnew = lrToL(LrNew);
    return oklabToSrgb(Lnew, aa, bb);
  }

  const out = {};
  for (const sp of SPACES) {
    out[sp] = {};
    for (const t of HUES_TGT) {
      const hue = findHue(sp, t.rgb);
      D.setSpace(sp);
      const pixels = { uncorrected: new Array(TRI*TRI*4).fill(0),
                       corrected:   new Array(TRI*TRI*4).fill(0) };
      for (let py = 0; py < TRI; py++) {
        for (let px = 0; px < TRI; px++) {
          const x = px / (TRI - 1);
          const y = py / (TRI - 1);
          const c = 1 - y;
          const halfW = y / 2;
          const xL = 0.5 - halfW;
          const xR = 0.5 + halfW;
          if (x < xL || x > xR) continue;
          const local = halfW > 1e-9 ? (x - xL) / (xR - xL) : 0;
          const b = y * local;
          const w = y * (1 - local);
          const rgb = D.atBary(sp, hue, w, b, c);
          const i = (py * TRI + px) * 4;
          pixels.uncorrected[i  ] = clamp(rgb[0]);
          pixels.uncorrected[i+1] = clamp(rgb[1]);
          pixels.uncorrected[i+2] = clamp(rgb[2]);
          pixels.uncorrected[i+3] = 255;
          const corrected = applyLrCorrection(rgb, GAMMA, w, b, c);
          pixels.corrected[i  ] = clamp(corrected[0]);
          pixels.corrected[i+1] = clamp(corrected[1]);
          pixels.corrected[i+2] = clamp(corrected[2]);
          pixels.corrected[i+3] = 255;
        }
      }
      // Verification probes — sample key barycentric points and
      // report what the correction did. Helps catch regressions
      // before the user has to look.
      function sampleBary(rgb, w, b, c) {
        const corrected = applyLrCorrection(rgb, GAMMA, w, b, c);
        const labO = D.srgbToOklrab(rgb);
        const labC = D.srgbToOklrab(corrected);
        const cO = Math.sqrt(labO[1]**2 + labO[2]**2);
        const cC = Math.sqrt(labC[1]**2 + labC[2]**2);
        return { lrO: labO[0], lrC: labC[0], cO, cC };
      }
      const probes = {};
      const corners = { W: [1,0,0], B: [0,1,0], C: [0,0,1] };
      for (const [k, v] of Object.entries(corners)) {
        const rgb = D.atBary(sp, hue, v[0], v[1], v[2]);
        probes[k] = sampleBary(rgb, v[0], v[1], v[2]);
      }
      const mids = { MWC:[0.5,0,0.5], MBC:[0,0.5,0.5], MWB:[0.5,0.5,0],
                     Z:[1/3,1/3,1/3] };
      for (const [k, v] of Object.entries(mids)) {
        const rgb = D.atBary(sp, hue, v[0], v[1], v[2]);
        probes[k] = sampleBary(rgb, v[0], v[1], v[2]);
      }
      // Region sizes: count pixels with Lr < 0.15 (near-black zone)
      // and Lr > 0.85 (near-white zone) for each variant.
      function countRegions(buf) {
        let nearB = 0, nearW = 0, total = 0;
        for (let py = 0; py < TRI; py++) {
          for (let px = 0; px < TRI; px++) {
            const i = (py * TRI + px) * 4;
            if (buf[i+3] !== 255) continue;
            total++;
            const r = buf[i] / 255, g = buf[i+1] / 255, bl = buf[i+2] / 255;
            const lab = D.srgbToOklrab([r, g, bl]);
            if (lab[0] < 0.15) nearB++;
            else if (lab[0] > 0.85) nearW++;
          }
        }
        return { nearB, nearW, total };
      }
      out[sp][t.name] = { hue, pixels, probes,
                          regionsO: countRegions(pixels.uncorrected),
                          regionsC: countRegions(pixels.corrected) };
    }
  }
  return out;
}, { SPACES, HUES_TGT, TRI, GAMMA });

await page.close();

// Each triangle gets its own labeled card so labels are reachable
// without scrolling far. Cards arranged: rows = target, columns =
// space, each cell shows uncorrected + corrected stacked.
const cells = [];
for (const target of HUES_TGT.map(h => h.name)) {
  for (const sp of SPACES) {
    cells.push(`
      <div class="card">
        <div class="cardLbl">${sp} · ${target}</div>
        <div class="pair">
          <div class="tri">
            <div class="vlbl">UNCORRECTED (γ=1.0)</div>
            <canvas id="c-${sp}-${target}-uncorrected" width="${TRI}" height="${TRI}"></canvas>
          </div>
          <div class="tri">
            <div class="vlbl">CORRECTED (γ=${GAMMA})</div>
            <canvas id="c-${sp}-${target}-corrected" width="${TRI}" height="${TRI}"></canvas>
          </div>
        </div>
      </div>
    `);
  }
}
const dataJson = JSON.stringify(data);

const html = `<!doctype html><html><head><style>
  body { background:${SURROUND}; margin:0; font:12px monospace; color:#000;
         padding:18px; }
  h1 { font-size:14px; font-weight:normal; color:#222; margin:0 0 4px; }
  .sub { color:#444; font-size:11px; margin-bottom:14px; line-height:1.5; }
  .grid { display:grid; grid-template-columns:repeat(${SPACES.length}, auto); gap:14px; }
  .card { background:#5e5e5e; padding:8px; border:1px solid #555; }
  .cardLbl { color:#fff; font-size:13px; font-weight:bold; margin-bottom:6px;
             text-align:center; }
  .pair { display:flex; flex-direction:column; gap:8px; align-items:center; }
  .tri { display:flex; flex-direction:column; align-items:center; gap:2px; }
  .vlbl { color:#222; font-size:10px; background:#bababa; padding:2px 6px;
          border-radius:3px; }
  canvas { display:block; background:#888; }
</style></head><body>
  <h1>Stage 3 — γ=${GAMMA} Lr-corrected triangles vs uncorrected (neutral surround ${SURROUND})</h1>
  <div class="sub">
    Per-pixel correction: Lr ← Lr^(1/${GAMMA}) applied to every triangle pixel.<br>
    Each card: top = uncorrected (current rendering), bottom = corrected (γ=${GAMMA} applied).<br>
    Card label is directly above the pair so you can read while looking at one card at a time.
  </div>
  <div class="grid">${cells.join("")}</div>
  <script>
    const data = ${dataJson};
    const TRI = ${TRI};
    for (const sp of Object.keys(data)) {
      for (const target of Object.keys(data[sp])) {
        for (const variant of ["uncorrected", "corrected"]) {
          const cv = document.getElementById('c-' + sp + '-' + target + '-' + variant);
          const ctx = cv.getContext('2d');
          const img = ctx.createImageData(TRI, TRI);
          const px = data[sp][target].pixels[variant];
          for (let i = 0; i < px.length; i++) img.data[i] = px[i];
          ctx.putImageData(img, 0, 0);
        }
      }
    }
  </script>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: SPACES.length * (TRI + 36) + 80,
                                height: HUES_TGT.length * (TRI * 2 + 80) + 120 });
await newPage.setContent(html);
await newPage.waitForTimeout(800);
const out = `/tmp/stage3_corrected_g${GAMMA}.png`;
await newPage.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}  (γ=${GAMMA})`);

// Verification: print key probes for hwb red so we can confirm
// without showing the image yet.
const r = data.hwb.red;
const fmt = (v) => v.toFixed(3);
console.log(`\nVERIFICATION — hwb red (smooth-poly weight ${W_PEAK_LABEL}):`);
console.log(`  corners (should be unchanged):`);
for (const k of ["W", "B", "C"]) {
  const p = r.probes[k];
  const dLr = p.lrC - p.lrO;
  const dC  = p.cC - p.cO;
  console.log(`    ${k}: ΔLr=${fmt(dLr)} (was ${fmt(p.lrO)} → ${fmt(p.lrC)})  ΔChroma=${fmt(dC)} (was ${fmt(p.cO)} → ${fmt(p.cC)})`);
}
console.log(`  midpoints (correction expected here):`);
for (const k of ["MWC", "MBC", "MWB", "Z"]) {
  const p = r.probes[k];
  console.log(`    ${k}: Lr ${fmt(p.lrO)} → ${fmt(p.lrC)} (Δ=${fmt(p.lrC - p.lrO)})  C ${fmt(p.cO)} → ${fmt(p.cC)} (Δ=${fmt(p.cC - p.cO)})`);
}
console.log(`  region sizes (expect: nearW shrinks, nearB shrinks):`);
console.log(`    uncorrected: nearW=${r.regionsO.nearW}  nearB=${r.regionsO.nearB}  total=${r.regionsO.total}`);
console.log(`    corrected:   nearW=${r.regionsC.nearW}  nearB=${r.regionsC.nearB}  total=${r.regionsC.total}`);
console.log(`    Δ:           nearW ${r.regionsC.nearW - r.regionsO.nearW}  nearB ${r.regionsC.nearB - r.regionsO.nearB}`);
