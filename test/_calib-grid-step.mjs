// Sample the B↔C and W↔B edges at the default grid resolution
// (N=10 → 11 stops per row), and report each step's perceptual
// progress in BOTH OKLrab Lr (current metric) AND OKLab L (after
// the user's eye-calibration swap).
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const HUE = 240;
const SPACES = ["hwb", "okhsv"];
const N = 10;

const result = await page.evaluate(({ HUE, SPACES, N }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setHue(HUE);

  function sampleEdge(space, A, B, n) {
    D.setSpace(space);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = (1 - t) * A[0] + t * B[0];
      const b = (1 - t) * A[1] + t * B[1];
      const c = (1 - t) * A[2] + t * B[2];
      const rgb = D.atBaryEased(HUE, w, b, c);
      pts.push({
        rgb,
        Lr: D.srgbToOklrab(rgb)[0],
        L:  D.srgbToOklab(rgb)[0],
      });
    }
    return pts;
  }

  const W = [1, 0, 0], Bk = [0, 1, 0], C = [0, 0, 1];
  const out = {};
  for (const sp of SPACES) {
    out[sp] = {
      bc: sampleEdge(sp, Bk, C, N),
      wb: sampleEdge(sp, W, Bk, N),
    };
  }
  return out;
}, { HUE, SPACES, N });

const fmt = (x, d = 2) => (typeof x === "number" ? x.toFixed(d) : "?");

for (const sp of SPACES) {
  console.log(`\n══ ${sp} at h=${HUE} ══════════════════════════════`);
  for (const edge of ["wb", "bc"]) {
    const pts = result[sp][edge];
    console.log(`${edge.toUpperCase()} edge:`);
    console.log("  Lr:", pts.map(p => fmt(p.Lr)).join(" "));
    console.log("  L: ", pts.map(p => fmt(p.L)).join(" "));
    // count stops below threshold for each metric
    const darkLr = pts.filter(p => p.Lr < 0.20).length;
    const darkL  = pts.filter(p => p.L  < 0.20).length;
    console.log(`  stops below 0.20:  Lr ${darkLr}/${pts.length}   L ${darkL}/${pts.length}`);
  }
}

await browser.close();
