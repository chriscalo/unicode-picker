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

const sec1Info = await page.$("main > section:nth-child(1) .info");
await sec1Info.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/tooltip-t1.png", fullPage: false });

// Move away and hover tile 2 info
await page.mouse.move(0, 0);
await page.waitForTimeout(150);
const sec2Info = await page.$("main > section:nth-child(2) .info");
await sec2Info.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/tooltip-t2.png", fullPage: false });

await browser.close();
console.log("saved");
