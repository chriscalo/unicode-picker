// Compute v2 Reach measurement for a given (space, hue) at identity
// curves. Used to commit predictions before user judges a calibration
// pair.
//
// Usage: node test/_calib-predict.mjs <space> <hue>
//
// Reach reported as three numbers per the v2 framework:
//   white ΔE, black ΔE, C-chroma fraction of max sRGB chroma at hue.
import { chromium } from "playwright";

const [, , space, hueStr] = process.argv;
if (!space || !hueStr) {
  console.error("usage: node test/_calib-predict.mjs <space> <hue>");
  process.exit(2);
}
const hue = +hueStr;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.clear(); } catch (_) {}
});
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const result = await page.evaluate(({ space, hue }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setSpace(space);
  D.setHue(hue);

  // Build the gamut max-chroma table (1° bins).
  const HUE_BINS = 360;
  const maxC = new Float64Array(HUE_BINS);
  const FACES = [
    (s, t) => [0, s, t], (s, t) => [1, s, t],
    (s, t) => [s, 0, t], (s, t) => [s, 1, t],
    (s, t) => [s, t, 0], (s, t) => [s, t, 1],
  ];
  const STEP = 1 / 64;
  for (const f of FACES) {
    for (let s = 0; s <= 1 + 1e-9; s += STEP) {
      for (let t = 0; t <= 1 + 1e-9; t += STEP) {
        const rgb = f(Math.min(1, s), Math.min(1, t));
        const lab = D.srgbToOklrab(rgb);
        const c = Math.sqrt(lab[1] ** 2 + lab[2] ** 2);
        if (c < 1e-6) continue;
        let th = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
        if (th < 0) th += 360;
        const bin = Math.floor(th) % HUE_BINS;
        if (c > maxC[bin]) maxC[bin] = c;
      }
    }
  }
  for (let i = 0; i < HUE_BINS; i++) {
    if (maxC[i] === 0) {
      maxC[i] = (maxC[(i - 1 + HUE_BINS) % HUE_BINS]
                + maxC[(i + 1) % HUE_BINS]) / 2;
    }
  }

  const W = D.atBaryEased(hue, 1, 0, 0);
  const B = D.atBaryEased(hue, 0, 1, 0);
  const C = D.atBaryEased(hue, 0, 0, 1);
  const wLab = D.srgbToOklrab(W);
  const bLab = D.srgbToOklrab(B);
  const cLab = D.srgbToOklrab(C);
  const dW = D.deltaE(wLab, [1, 0, 0]);
  const dB = D.deltaE(bLab, [0, 0, 0]);
  const cChroma = Math.sqrt(cLab[1] ** 2 + cLab[2] ** 2);
  let cHue = Math.atan2(cLab[2], cLab[1]) * 180 / Math.PI;
  if (cHue < 0) cHue += 360;
  const cTarget = maxC[Math.floor(cHue) % 360];
  const cReachFrac = cTarget > 1e-6 ? Math.min(1, cChroma / cTarget) : 1;

  return {
    space, hue,
    W_rgb: W, B_rgb: B, C_rgb: C,
    whiteDE: dW, blackDE: dB,
    cChroma, cTarget, cReachFrac,
    cRenderedHue: cHue,
  };
}, { space, hue });

console.log(JSON.stringify(result, null, 2));
await browser.close();
