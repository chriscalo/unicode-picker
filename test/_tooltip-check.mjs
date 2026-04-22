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

// Hover the tile 3 info icon.
const info3 = await page.$("main > section:nth-child(3) .info");
await info3.hover();
await page.waitForTimeout(200);
await page.screenshot({ path: "/tmp/tooltip-tile3.png", fullPage: false });

// Hover the tile 4 info icon.
const info4 = await page.$("main > section:nth-child(4) .info");
await info4.hover();
await page.waitForTimeout(200);
await page.screenshot({ path: "/tmp/tooltip-tile4.png", fullPage: false });

await browser.close();
console.log("saved tooltip shots");
