import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 3600 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-scales.html");
await page.waitForLoadState("networkidle");
await page.screenshot({ path: "/tmp/color-scales.png", fullPage: true });
await browser.close();
console.log("saved /tmp/color-scales.png");
