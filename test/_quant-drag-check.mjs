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
const stage = await page.$("#quant-stage");
const r = await stage.boundingBox();
// Drag from upper-left to lower-right of the triangle interior.
const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
// Triangle interior — move through various points
await page.mouse.move(cx - 50, cy - 40);
await page.mouse.down();
await page.waitForTimeout(100);
await page.mouse.move(cx + 30, cy + 20, { steps: 20 });
await page.waitForTimeout(100);
await page.mouse.move(cx - 10, cy + 40, { steps: 20 });
await page.waitForTimeout(100);
await page.mouse.up();
await page.waitForTimeout(200);
// Screenshot
await stage.screenshot({ path: "/tmp/quant-drag.png" });
await browser.close();
console.log("saved");
