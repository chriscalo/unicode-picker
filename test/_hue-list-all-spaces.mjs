import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

const spaces = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
function rgbHslHue(r, g, b) {
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
  if (d < 1e-9) return 0;
  let h = mx === r ? ((g-b)/d)%6 : mx === g ? (b-r)/d+2 : (r-g)/d+4;
  h *= 60; return ((h % 360) + 360) % 360;
}
function parseRgb(s) {
  const m = s.match(/rgb\((\d+), ?(\d+), ?(\d+)/);
  return m ? [+m[1]/255, +m[2]/255, +m[3]/255] : null;
}
for (const sp of spaces) {
  await page.click(`[data-decision="space"] button[data-value="${sp}"]`);
  await page.waitForTimeout(250);
  const items = await page.evaluate(() => {
    return [...document.querySelectorAll("#hue-list .hue-list__item")].map(el => ({
      a: el.querySelector(".hue-list__angle")?.textContent.trim(),
      n: el.querySelector(".hue-list__name")?.textContent,
      bg: el.querySelector(".hue-list__swatch")?.style.background,
    }));
  });
  const counts = {};
  const rows = items.map(it => {
    const rgb = parseRgb(it.bg);
    const h = rgb ? rgbHslHue(...rgb).toFixed(1) : "-";
    counts[it.n] = (counts[it.n] || 0) + 1;
    return { ...it, h };
  });
  const dups = Object.entries(counts).filter(([, c]) => c > 1);
  const tag = dups.length
    ? dups.map(([n, c]) => `${n}×${c}`).join(", ")
    : "✓ all unique";
  console.log("\n" + sp, tag);
  if (dups.length) {
    for (const r of rows)
      console.log("  ", r.a.padStart(5),
        r.n.padEnd(10), "HSL", r.h,
        counts[r.n] > 1 ? " ← dup" : "");
  }
}
await browser.close();
