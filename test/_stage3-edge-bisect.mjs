// Stage 3 smoothness calibration — edge strips + bisection strips
// with bisection markers at 25/50/75%. Each row = (space, target);
// each row has 6 strips:
//   3 edge strips:       W↔C, B↔C, W↔B
//   3 bisection strips:  W↔mid(BC), B↔mid(WC), C↔mid(WB)
//                        (each passes through the centroid)
// Annotations show midpoint ΔE from corner-lerp ideal in OKLrab.
//
// Usage: node test/_stage3-edge-bisect.mjs [target]
//   target = red | yellow | green | cyan | blue | magenta  (default blue)
import { chromium } from "playwright";

const target = process.argv[2] || "blue";
const TARGETS = {
  red: [1,0,0], yellow: [1,1,0], green: [0,1,0],
  cyan: [0,1,1], blue: [0,0,1], magenta: [1,0,1],
};
if (!TARGETS[target]) {
  console.error(`unknown target ${target}`);
  process.exit(2);
}

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const N_PATH = 200;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 2400, height: 1400 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const data = await page.evaluate(({ SPACES, N_PATH, targetRgb }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  function dE(a, b) {
    const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  }
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x*255))); }

  function findHue(sp, target) {
    D.setSpace(sp);
    const tLab = D.srgbToOklrab(target);
    let bH = 0, bE = Infinity;
    for (let h = 0; h < 360; h += 0.5) {
      const e = dE(D.srgbToOklrab(D.atBary(sp, h, 0, 0, 1)), tLab);
      if (e < bE) { bE = e; bH = h; }
    }
    for (let h = bH - 0.5; h <= bH + 0.5; h += 0.02) {
      const e = dE(D.srgbToOklrab(D.atBary(sp, h, 0, 0, 1)), tLab);
      if (e < bE) { bE = e; bH = h; }
    }
    return { hue: bH, cornerDE: bE };
  }

  // Strip definitions — endpoints in barycentric (w, b, c).
  // Bisection strips: corner → mid of opposite edge.
  function strip(sp, hue, A, Z) {
    D.setSpace(sp);
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
    // Sample 3 bisection points: 25, 50, 75%
    const idx = (t) => Math.round(t * (N_PATH - 1));
    const q1 = labs[idx(0.25)];
    const mid = labs[idx(0.50)];
    const q3 = labs[idx(0.75)];
    const A_lab = labs[0], Z_lab = labs[N_PATH - 1];
    const lerp = (a, b, t) => [a[0]*(1-t)+b[0]*t, a[1]*(1-t)+b[1]*t, a[2]*(1-t)+b[2]*t];
    const dE25 = dE(q1, lerp(A_lab, Z_lab, 0.25));
    const dE50 = dE(mid, lerp(A_lab, Z_lab, 0.50));
    const dE75 = dE(q3, lerp(A_lab, Z_lab, 0.75));
    return { colors, dE25, dE50, dE75 };
  }

  const W = [1,0,0], B = [0,1,0], C = [0,0,1];
  const midBC = [0, 0.5, 0.5];
  const midWC = [0.5, 0, 0.5];
  const midWB = [0.5, 0.5, 0];

  const out = {};
  for (const sp of SPACES) {
    const { hue, cornerDE } = findHue(sp, targetRgb);
    out[sp] = { hue, cornerDE, strips: {} };
    out[sp].strips["W→C"]      = strip(sp, hue, W, C);
    out[sp].strips["B→C"]      = strip(sp, hue, B, C);
    out[sp].strips["W→B"]      = strip(sp, hue, W, B);
    out[sp].strips["W→midBC"]  = strip(sp, hue, W, midBC);
    out[sp].strips["B→midWC"]  = strip(sp, hue, B, midWC);
    out[sp].strips["C→midWB"]  = strip(sp, hue, C, midWB);
  }
  return out;
}, { SPACES, N_PATH, targetRgb: TARGETS[target] });

await page.close();

const STRIP_W = 280;
const STRIP_H = 36;
function gradient(colors) {
  return colors.map((c, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
  }).join(", ");
}
function tickSvg() {
  // Vertical ticks at 25, 50, 75%
  const w = STRIP_W, h = STRIP_H;
  return `<svg width="${w}" height="${h+8}" style="position:absolute;left:0;top:-4px;pointer-events:none;">
    ${[0.25, 0.5, 0.75].map(t => {
      const x = t * w;
      return `<line x1="${x}" y1="0" x2="${x}" y2="${h+8}" stroke="#fff" stroke-width="1" stroke-dasharray="2,2" opacity="0.55"/>`;
    }).join("")}
  </svg>`;
}

const STRIP_NAMES = ["W→C", "B→C", "W→B", "W→midBC", "B→midWC", "C→midWB"];
const rows = SPACES.map(sp => {
  const r = data[sp];
  const cells = [`<td class="lbl">${sp}<br><span class="hue">h=${r.hue.toFixed(1)}°</span></td>`];
  for (const name of STRIP_NAMES) {
    const s = r.strips[name];
    cells.push(`
      <td>
        <div class="stripWrap">
          ${tickSvg()}
          <div class="strip" style="background:linear-gradient(to right, ${gradient(s.colors)})"></div>
        </div>
        <div class="ann">25:${s.dE25.toFixed(3)} 50:${s.dE50.toFixed(3)} 75:${s.dE75.toFixed(3)}</div>
      </td>
    `);
  }
  return `<tr>${cells.join("")}</tr>`;
});

const html = `<!doctype html><html><head><style>
  body { background:#1a1a1a; margin:0; font:12px monospace; color:#ddd;
         padding:18px; }
  h1 { margin:0 0 6px; font-size:14px; font-weight:normal; color:#ccc; }
  .sub { color:#888; font-size:11px; margin-bottom:14px; line-height:1.5; }
  table { border-collapse: collapse; }
  td { padding:6px 4px; vertical-align:middle; }
  th { color:#aaa; text-align:center; font-weight:normal; padding:4px;
       font-size:11px; }
  td.lbl { color:#ccc; padding-right:14px; text-align:right;
           font-size:11px; min-width:80px; }
  .hue { color:#888; font-size:10px; }
  .stripWrap { position:relative; width:${STRIP_W}px; }
  .strip { width:${STRIP_W}px; height:${STRIP_H}px;
           border:1px solid #333; }
  .ann { color:#999; font-size:9px; margin-top:1px; line-height:1.0;
         text-align:center; }
</style></head><body>
  <h1>Stage 3 — edge + bisection strips, target = ${target}</h1>
  <div class="sub">
    Top 3 columns = edge strips (W↔C, B↔C, W↔B). Bottom 3 columns =
    bisection strips (corner → midpoint of opposite edge; passes
    through the centroid).<br>
    White dashed ticks mark the 25%, 50%, 75% bisection points.
    Annotations show ΔE_OKLrab between rendered point and the
    corner-lerp ideal at each tick (lower = more perceptually halfway).
  </div>
  <table>
    <thead><tr>
      <th></th>
      ${STRIP_NAMES.map(n => `<th>${n}</th>`).join("")}
    </tr></thead>
    <tbody>${rows.join("\n")}</tbody>
  </table>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: STRIP_NAMES.length * (STRIP_W + 14) + 140, height: SPACES.length * (STRIP_H + 32) + 120 });
await newPage.setContent(html);
await newPage.waitForTimeout(500);
const out = `/tmp/stage3_edge_bisect_${target}.png`;
await newPage.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`wrote ${out}`);
