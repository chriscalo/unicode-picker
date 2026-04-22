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
// Switch to 8 hue steps.
await page.click('[data-decision="nHues"] button[data-value="8"]');
await page.waitForTimeout(200);
const sec2 = await page.$("main > section:nth-child(2)");
await sec2.screenshot({ path: "/tmp/sec-2-hue8.png" });
await browser.close();
console.log("saved /tmp/sec-2-hue8.png");
