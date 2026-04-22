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

// Hover a dot in tile 3 (Quantized Color Picker).
const dot = await page.$('.quant-dot[data-cell-i="5"][data-cell-k="3"]');
if (dot) {
  await dot.hover();
  await page.waitForTimeout(200);
}
await page.screenshot({ path: "/tmp/peer-hover-from-tile3.png", fullPage: false });

// Hover matching cell in tile 4.
await page.mouse.move(10, 10);
await page.waitForTimeout(100);
const cell = await page.$('.token-grid .cell[data-cell-i="5"][data-cell-k="3"]');
if (cell) {
  await cell.hover();
  await page.waitForTimeout(200);
}
await page.screenshot({ path: "/tmp/peer-hover-from-tile4.png", fullPage: false });

await browser.close();
console.log("saved");
