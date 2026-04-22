import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 1400 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
const el = await page.$("#hsluv-stage");
await el.screenshot({ path: "/tmp/ring-hsluv.png" });
await browser.close();
console.log("saved");
