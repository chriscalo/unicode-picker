import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
const names = await page.evaluate(() => {
  const items = document.querySelectorAll("#hue-list .hue-list__item");
  return [...items].map(el => {
    const a = el.querySelector(".hue-list__angle")?.textContent;
    const n = el.querySelector(".hue-list__name")?.textContent;
    const swatch = el.querySelector(".hue-list__swatch")?.style.background;
    return { a: a.trim(), n, swatch };
  });
});
// Compute HSL hue of each swatch
function parseRgb(s) {
  const m = s.match(/rgb\((\d+), ?(\d+), ?(\d+)/);
  return m ? [+m[1]/255, +m[2]/255, +m[3]/255] : null;
}
function rgbHslHue(r, g, b) {
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
  if (d < 1e-9) return 0;
  let h = mx === r ? ((g-b)/d) % 6 : mx === g ? (b-r)/d + 2 : (r-g)/d + 4;
  h *= 60;
  return ((h % 360) + 360) % 360;
}
for (const x of names) {
  const rgb = parseRgb(x.swatch);
  const hslH = rgb ? rgbHslHue(...rgb) : null;
  console.log(x.a.padStart(4), x.n.padEnd(10),
    "HSL", hslH !== null ? hslH.toFixed(1).padStart(6) : "-");
}
await browser.close();
