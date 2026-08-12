// Stage 3 smoothness probe (revised):
//   smoothness = "midpoints look perceptually halfway."
//
// For one (space, target hue) at a time, render the W↔C edge with
// the midpoint marked. The user judges whether the marked color
// looks halfway between the two endpoint colors. Repeat for B↔C
// and W↔B. Then a separate probe for the triangle centroid.
//
// Black-compartment is a separate probe.
//
// Usage:
//   node test/_stage3-mid-probe.mjs <edge> <space> <target>
//     edge   = wc | bc | wb | centroid
//     space  = hwb | oklch | okhsl | okhsv | lchab | jzazbz
//     target = red | yellow | green | cyan | blue | magenta
import { chromium } from "playwright";

const [, , edge, sp, target] = process.argv;
if (!edge || !sp || !target) {
  console.error("usage: node test/_stage3-mid-probe.mjs <edge> <space> <target>");
  console.error("  edge   = wc | bc | wb | centroid");
  console.error("  space  = hwb | oklch | okhsl | okhsv | lchab | jzazbz");
  console.error("  target = red | yellow | green | cyan | blue | magenta");
  process.exit(2);
}

const TARGETS = {
  red: [1, 0, 0], yellow: [1, 1, 0], green: [0, 1, 0],
  cyan: [0, 1, 1], blue: [0, 0, 1], magenta: [1, 0, 1],
};
if (!TARGETS[target]) {
  console.error(`unknown target ${target}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 600 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ edge, sp, targetRgb }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setSpace(sp);
  function dE(a, b) {
    const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  }
  // Find input hue that puts C corner on targetRgb.
  const targetLab = D.srgbToOklrab(targetRgb);
  let bestH = 0, bestE = Infinity;
  for (let h = 0; h < 360; h += 0.5) {
    const rgb = D.atBary(sp, h, 0, 0, 1);
    const e = dE(D.srgbToOklrab(rgb), targetLab);
    if (e < bestE) { bestE = e; bestH = h; }
  }
  for (let h = bestH - 0.5; h <= bestH + 0.5; h += 0.02) {
    const rgb = D.atBary(sp, h, 0, 0, 1);
    const e = dE(D.srgbToOklrab(rgb), targetLab);
    if (e < bestE) { bestE = e; bestH = h; }
  }

  function bary(w, b, c) {
    const rgb = D.atBary(sp, bestH, w, b, c);
    return {
      rgb: rgb.map(x => Math.max(0, Math.min(1, x))),
      lab: D.srgbToOklrab(rgb),
    };
  }
  const W = bary(1, 0, 0);
  const B = bary(0, 1, 0);
  const C = bary(0, 0, 1);

  // Pick endpoints and ideal midpoint per probe type.
  let A, Bb, midActual, idealLab;
  if (edge === "wc") { A = W; Bb = C; midActual = bary(0.5, 0, 0.5); }
  else if (edge === "bc") { A = B; Bb = C; midActual = bary(0, 0.5, 0.5); }
  else if (edge === "wb") { A = W; Bb = B; midActual = bary(0.5, 0.5, 0); }
  else if (edge === "centroid") {
    A = W; Bb = C;
    midActual = bary(1/3, 1/3, 1/3);
    // For centroid, ideal is mean of all 3 corners.
    idealLab = [(W.lab[0]+B.lab[0]+C.lab[0])/3,
                (W.lab[1]+B.lab[1]+C.lab[1])/3,
                (W.lab[2]+B.lab[2]+C.lab[2])/3];
  } else {
    throw new Error("bad edge");
  }
  if (!idealLab) {
    idealLab = [(A.lab[0]+Bb.lab[0])/2,
                (A.lab[1]+Bb.lab[1])/2,
                (A.lab[2]+Bb.lab[2])/2];
  }
  const midDE = dE(midActual.lab, idealLab);

  // For rendering: a strip A→Bb plus a separate "ideal midpoint" swatch
  // we cannot render directly (it's an OKLrab synthesized value), so we
  // approximate by inverting Lr→sRGB. Just show the actual midpoint color
  // labeled "rendered midpoint" so the user can compare.
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x*255))); }
  const N_PATH = 200;
  const colors = [];
  for (let i = 0; i < N_PATH; i++) {
    const t = i / (N_PATH - 1);
    const w = A === W ? 1-t : (A === B ? 0 : 0);
    const b = Bb === B ? t : (A === B ? 1-t : 0);
    let c, ww, bb;
    if (edge === "wc") { ww = 1-t; bb = 0; c = t; }
    else if (edge === "bc") { ww = 0; bb = 1-t; c = t; }
    else if (edge === "wb") { ww = 1-t; bb = t; c = 0; }
    else { ww = 1/3; bb = 1/3; c = 1/3; } // centroid: just one point
    if (edge === "centroid") {
      colors.push([clamp(midActual.rgb[0]), clamp(midActual.rgb[1]), clamp(midActual.rgb[2])]);
    } else {
      const r = D.atBary(sp, bestH, ww, bb, c);
      colors.push([clamp(r[0]), clamp(r[1]), clamp(r[2])]);
    }
  }

  return {
    bestH, cornerDE: bestE, midDE,
    A_rgb: A.rgb.map(clamp),
    B_rgb: Bb.rgb.map(clamp),
    midActual_rgb: midActual.rgb.map(clamp),
    colors,
    edgeName: edge,
  };
}, { edge, sp, targetRgb: TARGETS[target] });

await page.close();

function gradient(colors) {
  return colors.map((c, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
  }).join(", ");
}

const A = result.A_rgb;
const B = result.B_rgb;
const M = result.midActual_rgb;
const stripBG = `linear-gradient(to right, ${gradient(result.colors)})`;
const isCentroid = edge === "centroid";

const html = `<!doctype html><html><head><style>
  body { background:#1a1a1a; margin:0; font:13px monospace; color:#ddd;
         padding:24px; }
  h1 { font-size:14px; font-weight:normal; color:#ccc; margin:0 0 4px; }
  .sub { color:#888; font-size:11px; margin-bottom:14px; line-height:1.5; }
  .stripWrap { position:relative; width:780px; }
  .strip { width:780px; height:80px; border:1px solid #333; }
  .tick { position:absolute; top:0; height:90px; border-left:2px solid #fff; opacity:0.7; }
  .lbl { position:absolute; top:-18px; color:#fff; font-size:11px; transform:translateX(-50%); }
  .swatches { display:flex; gap:18px; margin-top:24px; align-items:center; }
  .sw { width:120px; height:80px; border:1px solid #333; }
  .swlbl { color:#bbb; font-size:11px; text-align:center; margin-top:4px; }
</style></head><body>
  <h1>Stage 3 midpoint probe — edge ${edge.toUpperCase()} (target ${target})</h1>
  <div class="sub">
    ${isCentroid
      ? "The middle swatch is the rendered triangle <b>centroid</b>. Compare it to the W, B, C corners. Does it look like a balanced mix of the three?"
      : `The strip is one edge. The white tick marks the <b>rendered midpoint</b>. Cover up either end with your thumb and ask: does the color at the tick look <b>perceptually halfway</b> between the two endpoints? Or is it shifted toward one side?`}
  </div>
  ${isCentroid ? "" : `
  <div class="stripWrap">
    <div class="lbl" style="left:50%;">midpoint</div>
    <div class="tick" style="left:50%;"></div>
    <div class="strip" style="background:${stripBG}"></div>
  </div>`}
  <div class="swatches">
    <div>
      <div class="sw" style="background:rgb(${A[0]},${A[1]},${A[2]})"></div>
      <div class="swlbl">${edge==="bc"?"B":edge==="wb"?"W":edge==="centroid"?"W":"W"} corner</div>
    </div>
    <div>
      <div class="sw" style="background:rgb(${M[0]},${M[1]},${M[2]})"></div>
      <div class="swlbl">rendered midpoint${isCentroid?" (centroid)":""}</div>
    </div>
    <div>
      <div class="sw" style="background:rgb(${B[0]},${B[1]},${B[2]})"></div>
      <div class="swlbl">${edge==="wb"?"B":edge==="centroid"?"C":"C"} corner</div>
    </div>
    ${isCentroid ? `
    <div>
      <div class="sw" style="background:black"></div>
      <div class="swlbl">B corner</div>
    </div>` : ""}
  </div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 850, height: isCentroid ? 220 : 280 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
const out = `/tmp/stage3_mid_${edge}_${sp}_${target}.png`;
await newPage.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
console.log(`HIDDEN: ${sp} target=${target} hue=${result.bestH.toFixed(1)}°  cornerDE=${result.cornerDE.toFixed(3)}  midDE=${result.midDE.toFixed(3)}`);
