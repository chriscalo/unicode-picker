// Pairwise calibration screenshot helper. Uses identity curves on
// every space for reproducibility (the screenshot must reflect the
// same render the score sees).
//
// Usage: node test/_calib-shot.mjs <pair_id> <space_A> <space_B> <hue>
import { chromium } from "playwright";

const [, , pairId, spaceA, spaceB, hueStr] = process.argv;
if (!pairId || !spaceA || !spaceB || !hueStr) {
  console.error("usage: node test/_calib-shot.mjs <pair_id> <spaceA> <spaceB> <hue>");
  process.exit(2);
}
const hue = +hueStr;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});

async function shot(space, path) {
  const page = await ctx.newPage();
  // Wipe stored curves so identity is the starting point.
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (_) {}
  });
  await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => !!window.__diag);
  await page.evaluate(({ h, sp }) => {
    window.__diag.resetAllCurvesToIdentity();
    window.__diag.setSpace(sp);
    window.__diag.setHue(h);
  }, { h: hue, sp: space });
  await page.waitForTimeout(400);
  await page.screenshot({ path, fullPage: false });
  await page.close();
}

await shot(spaceA, `/tmp/calib_${pairId}_A_${spaceA}.png`);
await shot(spaceB, `/tmp/calib_${pairId}_B_${spaceB}.png`);

console.log(`A: /tmp/calib_${pairId}_A_${spaceA}.png`);
console.log(`B: /tmp/calib_${pairId}_B_${spaceB}.png`);
console.log(`(hue=${hue}, identity curves)`);
await browser.close();
