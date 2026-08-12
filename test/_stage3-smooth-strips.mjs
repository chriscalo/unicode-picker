// Stage 3 smoothness calibration: render the 3 corner-to-corner
// paths (W↔C, B↔C, W↔B) as horizontal gradient strips for each
// (space, hue), so the user can identify which paths read as
// kinky vs smooth. Each strip is annotated with candidate metric
// scores so we can fit the metric to the user's eye.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const HUES   = [0, 60, 130, 220, 300]; // red, yellow, green, blue, purple
const N_PATH = 200;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1900, height: 1400 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const data = await page.evaluate(({ SPACES, HUES, N_PATH }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();

  const PATHS = [
    { name: "W→C", a: [1,0,0], b: [0,0,1] },
    { name: "B→C", a: [0,1,0], b: [0,0,1] },
    { name: "W→B", a: [1,0,0], b: [0,1,0] },
  ];

  function chromaOf(lab) { return Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]); }
  function dE(a, b) {
    const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  }

  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    out[sp] = {};
    for (const hue of HUES) {
      out[sp][hue] = {};
      for (const p of PATHS) {
        const colors = [];
        const labs = [];
        for (let i = 0; i < N_PATH; i++) {
          const t = i / (N_PATH - 1);
          const w = p.a[0]*(1-t) + p.b[0]*t;
          const b = p.a[1]*(1-t) + p.b[1]*t;
          const c = p.a[2]*(1-t) + p.b[2]*t;
          const rgb = D.atBary(sp, hue, w, b, c);
          colors.push([
            Math.max(0, Math.min(255, Math.round(rgb[0]*255))),
            Math.max(0, Math.min(255, Math.round(rgb[1]*255))),
            Math.max(0, Math.min(255, Math.round(rgb[2]*255))),
          ]);
          labs.push(D.srgbToOklrab(rgb));
        }
        const steps = [];
        let total = 0;
        for (let i = 0; i < labs.length - 1; i++) {
          const d = dE(labs[i], labs[i+1]);
          steps.push(d);
          total += d;
        }
        const mean = total / steps.length;
        const max = Math.max(...steps);
        const stretch = mean > 1e-9 ? max / mean : 1;
        let v = 0;
        for (const d of steps) v += (d - mean) ** 2;
        const cv = mean > 1e-9 ? Math.sqrt(v / steps.length) / mean : 0;
        // midRatio: chroma at midpoint vs chroma at the chromatic endpoint
        const cEnd = p.b[2] === 1 ? labs[N_PATH-1] : (p.a[2] === 1 ? labs[0] : null);
        let midRatio = null;
        if (cEnd) {
          const mid = labs[Math.floor(N_PATH / 2)];
          const cMid = chromaOf(mid);
          const cMax = chromaOf(cEnd);
          midRatio = cMax > 1e-6 ? cMid / cMax : 0.5;
        }
        out[sp][hue][p.name] = { colors, stretch, cv, midRatio, mean, max };
      }
    }
  }
  return out;
}, { SPACES, HUES, N_PATH });

await page.close();

const STRIP_W = 200;
const STRIP_H = 28;

function stripGradient(colors) {
  return colors.map((c, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
  }).join(", ");
}

const rows = [];
for (const hue of HUES) {
  for (const sp of SPACES) {
    const cells = [`<td class="lbl">${sp} h=${hue}°</td>`];
    for (const pathName of ["W→C", "B→C", "W→B"]) {
      const m = data[sp][hue][pathName];
      const ann = m.midRatio != null
        ? `mid=${m.midRatio.toFixed(2)} mx/mn=${m.stretch.toFixed(1)} cv=${m.cv.toFixed(2)}`
        : `mx/mn=${m.stretch.toFixed(1)} cv=${m.cv.toFixed(2)}`;
      cells.push(`
        <td>
          <div class="strip" style="background:linear-gradient(to right, ${stripGradient(m.colors)})"></div>
          <div class="ann">${ann}</div>
        </td>
      `);
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  rows.push(`<tr><td colspan="4" style="height:8px;"></td></tr>`);
}

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 12px monospace; color: #ddd;
         padding: 18px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #888; font-size: 11px; margin-bottom: 12px; line-height: 1.5; }
  table { border-collapse: collapse; }
  td { padding: 2px 6px; vertical-align: middle; }
  td.lbl { color: #ccc; text-align: right; padding-right: 12px;
           font-size: 11px; min-width: 130px; }
  th { color: #aaa; text-align: center; font-weight: normal;
       padding: 4px 6px; font-size: 11px; }
  .strip { width: ${STRIP_W}px; height: ${STRIP_H}px;
           border: 1px solid #333; }
  .ann { color: #999; font-size: 9px; margin-top: 1px;
         font-family: monospace; line-height: 1.0; }
</style></head><body>
  <h1>Stage 3 — corner-to-corner edge strips for smoothness eye-calibration</h1>
  <div class="sub">
    Each strip is one corner-to-corner path. Annotations show 3 candidate
    smoothness metrics: <b>mid</b> = chroma at midpoint / chroma at C
    endpoint (ideal 0.50); <b>mx/mn</b> = max step / mean step (ideal 1.0);
    <b>cv</b> = stdev / mean of step sizes (ideal 0.0).<br>
    Look at each strip — does the gradient feel smooth or do you see a
    kink / sudden jump? Tell me which strips read as kinky.
  </div>
  <table>
    <thead><tr>
      <th></th><th>W → C</th><th>B → C</th><th>W → B</th>
    </tr></thead>
    <tbody>${rows.join("\n")}</tbody>
  </table>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1100, height: 1500 });
await newPage.setContent(html);
await newPage.waitForTimeout(500);
await newPage.screenshot({ path: "/tmp/stage3_smoothness_strips.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/stage3_smoothness_strips.png");
