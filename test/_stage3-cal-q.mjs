// Stage 3 smoothness calibration stimulus.
// Renders a triangle with all 7 anchors labeled (3 corners W/B/C,
// 3 edge midpoints MWC/MBC/MWB, 1 centroid Z) plus 6 strips:
//   3 edges:      W↔C, B↔C, W↔B
//   3 bisections: W↔MBC, B↔MWC, C↔MWB (all pass through Z)
//
// Usage:
//   node test/_stage3-cal-q.mjs <space> <target>
//     space  = hwb | oklch | okhsl | okhsv | lchab | jzazbz
//     target = red | yellow | green | cyan | blue | magenta
import { chromium } from "playwright";

const [, , sp, target] = process.argv;
if (!sp || !target) {
  console.error("usage: node test/_stage3-cal-q.mjs <space> <target>");
  process.exit(2);
}
const TARGETS = {
  red: [1,0,0], yellow: [1,1,0], green: [0,1,0],
  cyan: [0,1,1], blue: [0,0,1], magenta: [1,0,1],
};
if (!TARGETS[target]) {
  console.error(`unknown target ${target}`);
  process.exit(2);
}
const N_PATH = 200;
const TRI = 320;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1700, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ sp, targetRgb, N_PATH, TRI }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setSpace(sp);
  function dE(a, b) {
    const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  }
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x*255))); }

  const tLab = D.srgbToOklrab(targetRgb);
  let bH = 0, bE = Infinity;
  for (let h = 0; h < 360; h += 0.5) {
    const e = dE(D.srgbToOklrab(D.atBary(sp, h, 0, 0, 1)), tLab);
    if (e < bE) { bE = e; bH = h; }
  }
  for (let h = bH - 0.5; h <= bH + 0.5; h += 0.02) {
    const e = dE(D.srgbToOklrab(D.atBary(sp, h, 0, 0, 1)), tLab);
    if (e < bE) { bE = e; bH = h; }
  }
  const hue = bH;

  // γ-corrected perceptual halfway: perceived_L(Lr) = Lr^γ; γ from
  // user's W↔B halfway calibration (Lr ≈ 0.23 reads as 50/50).
  const GAMMA = 0.47;
  function percLerpL(la, lb) {
    // Inverse: Lr_mid = ((la^γ + lb^γ)/2)^(1/γ)
    return Math.pow((Math.pow(la, GAMMA) + Math.pow(lb, GAMMA)) / 2, 1 / GAMMA);
  }
  function strip(A, Z, lblA, lblZ) {
    const colors = [];
    const labs = [];
    for (let i = 0; i < N_PATH; i++) {
      const t = i / (N_PATH - 1);
      const w = A[0]*(1-t) + Z[0]*t;
      const b = A[1]*(1-t) + Z[1]*t;
      const c = A[2]*(1-t) + Z[2]*t;
      const rgb = D.atBary(sp, hue, w, b, c);
      colors.push([clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])]);
      labs.push(D.srgbToOklrab(rgb));
    }
    const aLab = labs[0], zLab = labs[N_PATH-1];
    const midLab = labs[Math.floor(N_PATH/2)];
    const idealLin = [(aLab[0]+zLab[0])/2,(aLab[1]+zLab[1])/2,(aLab[2]+zLab[2])/2];
    const idealPerc = [percLerpL(aLab[0], zLab[0]),
                       (aLab[1]+zLab[1])/2,
                       (aLab[2]+zLab[2])/2];
    const midDE_lin  = dE(midLab, idealLin);
    const midDE_perc = dE(midLab, idealPerc);
    const aRgb = D.atBary(sp, hue, A[0], A[1], A[2]);
    const zRgb = D.atBary(sp, hue, Z[0], Z[1], Z[2]);
    return { colors, midDE_lin, midDE_perc,
             aRgb: aRgb.map(clamp), zRgb: zRgb.map(clamp),
             lblA, lblZ };
  }

  const W = [1,0,0], B = [0,1,0], C = [0,0,1];
  const MWC = [0.5,0,0.5];
  const MBC = [0,0.5,0.5];
  const MWB = [0.5,0.5,0];

  const strips = {
    "W→C":   strip(W, C, "W", "C"),
    "B→C":   strip(B, C, "B", "C"),
    "W→B":   strip(W, B, "W", "B"),
    "W→MBC": strip(W, MBC, "W", "MBC"),
    "B→MWC": strip(B, MWC, "B", "MWC"),
    "C→MWB": strip(C, MWB, "C", "MWB"),
  };

  const triPixels = new Array(TRI * TRI * 4).fill(0);
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
      triPixels[i  ] = clamp(rgb[0]);
      triPixels[i+1] = clamp(rgb[1]);
      triPixels[i+2] = clamp(rgb[2]);
      triPixels[i+3] = 255;
    }
  }
  return { hue, cornerDE: bE, strips, triPixels };
}, { sp, targetRgb: TARGETS[target], N_PATH, TRI });

await page.close();

function gradient(colors) {
  return colors.map((c, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
  }).join(", ");
}
function stripBlock(name, s) {
  return `
    <div class="block">
      <div class="stripLbl">${name}</div>
      <div class="strip" style="background:linear-gradient(to right, ${gradient(s.colors)})"></div>
      <div class="pair">
        <div class="sw" style="background:rgb(${s.aRgb[0]},${s.aRgb[1]},${s.aRgb[2]})"></div>
        <div class="lblrow"><span>${s.lblA}</span><span class="arrow">→</span><span>${s.lblZ}</span></div>
        <div class="sw" style="background:rgb(${s.zRgb[0]},${s.zRgb[1]},${s.zRgb[2]})"></div>
      </div>
    </div>
  `;
}

// Triangle anchor positions in canvas pixel coords.
// Top apex = C (px = TRI/2, py = 0)
// Bottom-left = W (px = 0, py = TRI-1)
// Bottom-right = B (px = TRI-1, py = TRI-1)
const ANCHORS = [
  { id: "C",   x: 0.5, y: 0.0  },
  { id: "W",   x: 0.0, y: 1.0  },
  { id: "B",   x: 1.0, y: 1.0  },
  { id: "MWC", x: 0.25, y: 0.5 }, // midpoint of edge from W to C
  { id: "MBC", x: 0.75, y: 0.5 }, // midpoint of edge from B to C
  { id: "MWB", x: 0.5, y: 1.0  }, // midpoint of bottom edge W↔B
  { id: "Z",   x: 0.5, y: 2/3  }, // centroid
];

// SVG overlay extends beyond the canvas so labels can sit outside
// the triangle. PAD is the space added on each side.
const PAD = 36;
const labelMarks = ANCHORS.map(a => {
  const cx = a.x * TRI;
  const cy = a.y * TRI;
  let lx = cx, ly = cy;
  let anchor = "middle", baseline = "central";
  if (a.id === "C")   { ly = -10; anchor = "middle"; baseline = "alphabetic"; }
  else if (a.id === "W") { lx = -8;  ly = TRI + 6;  anchor = "end";    baseline = "hanging"; }
  else if (a.id === "B") { lx = TRI + 8; ly = TRI + 6; anchor = "start"; baseline = "hanging"; }
  else if (a.id === "MWC") { lx = cx - 14; ly = cy;  anchor = "end"; baseline = "central"; }
  else if (a.id === "MBC") { lx = cx + 14; ly = cy;  anchor = "start"; baseline = "central"; }
  else if (a.id === "MWB") { lx = cx;     ly = TRI + 22; anchor = "middle"; baseline = "hanging"; }
  else if (a.id === "Z")   { lx = cx + 10; ly = cy;     anchor = "start"; baseline = "central"; }
  return `
    <circle cx="${cx}" cy="${cy}" r="3.5" fill="#fff" stroke="#000" stroke-width="1.5"/>
    <text x="${lx}" y="${ly}" font-family="monospace" font-size="14" font-weight="bold" fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round" paint-order="stroke" text-anchor="${anchor}" dominant-baseline="${baseline}">${a.id}</text>
  `;
}).join("");

function panel(idSuffix) {
  return `
    <div class="triWrap">
      <canvas id="tri-${idSuffix}" width="${TRI}" height="${TRI}"></canvas>
      <svg class="overlay" width="${TRI}" height="${TRI}" viewBox="0 0 ${TRI} ${TRI}" style="overflow:visible;">${labelMarks}</svg>
    </div>
    <div class="stripGrid">
      ${stripBlock("W → C",   result.strips["W→C"])}
      ${stripBlock("W → MBC", result.strips["W→MBC"])}
      ${stripBlock("B → C",   result.strips["B→C"])}
      ${stripBlock("B → MWC", result.strips["B→MWC"])}
      ${stripBlock("W → B",   result.strips["W→B"])}
      ${stripBlock("C → MWB", result.strips["C→MWB"])}
    </div>
  `;
}

const html = `<!doctype html><html><head><style>
  body { margin:0; font:13px monospace; padding:0; }
  .pane { padding:24px; }
  .pane.dark { background:#1a1a1a; color:#ddd; }
  .pane.light { background:#f4f4f4; color:#222; border-top:1px solid #ccc; }
  h1 { font-size:14px; font-weight:normal; margin:0 0 4px; }
  .pane.dark h1 { color:#ccc; }
  .pane.light h1 { color:#333; }
  .sub { font-size:11px; margin-bottom:14px; line-height:1.5; }
  .pane.dark .sub { color:#888; }
  .pane.light .sub { color:#666; }
  .row { display:flex; gap:24px; align-items:flex-start; }
  .triWrap { position:relative; width:${TRI + 80}px; height:${TRI + 60}px;
             padding:10px 40px 40px 40px; box-sizing:content-box; }
  canvas { display:block; position:absolute; left:40px; top:10px; }
  .pane.dark canvas { background:#2a2a2a; }
  .pane.light canvas { background:#e0e0e0; }
  svg.overlay { position:absolute; left:40px; top:10px; pointer-events:none;
                overflow:visible; }
  .stripGrid { display:grid; grid-template-columns:1fr 1fr; gap:14px 24px;
               width:1080px; }
  .block { display:flex; flex-direction:column; gap:4px; }
  .stripLbl { font-size:11px; }
  .pane.dark .stripLbl { color:#bbb; }
  .pane.light .stripLbl { color:#444; }
  .strip { width:520px; height:48px; }
  .pane.dark .strip { border:1px solid #333; }
  .pane.light .strip { border:1px solid #999; }
  .pair { display:grid; grid-template-columns:48px 1fr 48px;
          align-items:center; gap:8px; width:520px; }
  .sw { width:48px; height:30px; }
  .pane.dark .sw { border:1px solid #333; }
  .pane.light .sw { border:1px solid #999; }
  .lblrow { display:flex; justify-content:space-between; align-items:center;
            font-size:11px; padding:0 8px; }
  .pane.dark .lblrow { color:#bbb; }
  .pane.light .lblrow { color:#444; }
  .arrow { opacity:0.6; }
  .pane.dark text { fill:#fff !important; stroke:#000 !important; }
  .pane.light text { fill:#000 !important; stroke:#fff !important; }
  .pane.dark circle { fill:#fff; stroke:#000; }
  .pane.light circle { fill:#000; stroke:#fff; }
</style></head><body>
  <div class="pane dark">
    <h1>${sp}, target = ${target} — DARK surround</h1>
    <div class="sub">
      Anchors: W=white, B=black, C=hue. MWC/MBC/MWB=edge midpoints.
      Z=centroid. Left col = edges; right col = bisection lines through Z.
    </div>
    <div class="row">${panel("dark")}</div>
  </div>
  <div class="pane light">
    <h1>${sp}, target = ${target} — LIGHT surround</h1>
    <div class="sub">Same content, light surround for comparison.</div>
    <div class="row">${panel("light")}</div>
  </div>
  <script>
    const px = ${JSON.stringify(result.triPixels)};
    function paint(id) {
      const cv = document.getElementById(id);
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(${TRI}, ${TRI});
      for (let i = 0; i < px.length; i++) img.data[i] = px[i];
      ctx.putImageData(img, 0, 0);
    }
    paint('tri-dark'); paint('tri-light');
  </script>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1500, height: 960 });
await newPage.setContent(html);
await newPage.waitForTimeout(500);
const out = `/tmp/stage3_q_${sp}_${target}.png`;
await newPage.screenshot({ path: out, fullPage: true });
await browser.close();

const m = result.strips;
console.log(`wrote ${out}`);
console.log(`HIDDEN: ${sp} target=${target} hue=${result.hue.toFixed(1)}°  cornerDE=${result.cornerDE.toFixed(3)}`);
const fmt = (v) => v.toFixed(3);
console.log(`HIDDEN midDEs (linear-Lr / perceptual-Lr γ=0.47):`);
for (const [k, s] of Object.entries(m)) {
  console.log(`  ${k.padEnd(8)}  lin=${fmt(s.midDE_lin)}  perc=${fmt(s.midDE_perc)}`);
}
