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
// Section 3b OKLCH picker — zoom on the ring.
const el = await page.$("#ok-stage");
await el.screenshot({ path: "/tmp/ring-oklch.png" });
await browser.close();
console.log("saved");
