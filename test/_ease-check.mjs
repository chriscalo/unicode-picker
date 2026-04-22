import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

// Push "pure" easing to +0.6 (ease-out: pure hue dominates more of the triangle).
await page.$eval("#ease-c", (el, v) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, "0.6");
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/ease-c-pos.png", fullPage: false });

// Reset and push pure easing to -0.6 (ease-in: pure shrinks to the corner).
await page.$eval("#ease-c", (el, v) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, "-0.6");
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/ease-c-neg.png", fullPage: false });

await browser.close();
console.log("saved");
