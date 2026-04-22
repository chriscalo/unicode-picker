import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);

const sections = await page.$$("main > section");
for (let i = 0; i < sections.length; i++) {
  await sections[i].screenshot({ path: `/tmp/sec-${i + 1}.png` });
}
await browser.close();
console.log("saved four section shots");
