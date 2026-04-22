import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.click('[data-decision="space"] button[data-value="okhsv"]');
await page.waitForTimeout(500);
const stage = await page.$("#picker-stage");
await stage.screenshot({ path: "/tmp/okhsv-ring.png" });
await browser.close();
console.log("saved");
