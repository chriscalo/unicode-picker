import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

const dot = await page.$('#arc-dots-overlay .quant-dot[data-arc-a="5"][data-arc-j="4"]');
if (dot) {
  await dot.hover();
  await page.waitForTimeout(200);
}
const tile2 = await page.$('main > section:nth-child(2)');
await tile2.screenshot({ path: "/tmp/arc-peer-from-triangle.png" });

// Move away and hover the corresponding ramp swatch.
await page.mouse.move(10, 10);
await page.waitForTimeout(100);
const sw = await page.$('.arc-swatch[data-arc-a="5"][data-arc-j="4"]');
if (sw) {
  await sw.hover();
  await page.waitForTimeout(200);
}
await tile2.screenshot({ path: "/tmp/arc-peer-from-ramp.png" });

await browser.close();
console.log("saved");
