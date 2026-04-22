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

const dot = await page.$('.quant-dot[data-cell-i="5"][data-cell-k="3"]');
await dot.hover();
await page.waitForTimeout(200);

// Zoom on tile 3 (quant picker) and tile 4 (grid)
const tile3 = await page.$('main > section:nth-child(3)');
await tile3.screenshot({ path: "/tmp/peer-t3.png" });
const tile4 = await page.$('main > section:nth-child(4)');
await tile4.screenshot({ path: "/tmp/peer-t4.png" });

await browser.close();
console.log("saved");
