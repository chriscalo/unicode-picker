import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto("http://localhost:5173/design/");
await page.waitForLoadState("networkidle");
await page.evaluate(() => document.querySelector('[data-step="styling"]')?.click());
await page.waitForTimeout(200);
const info = await page.evaluate(() => {
  const seg = document.querySelector(".seg");
  const btn = seg?.querySelector("button");
  const sw = document.querySelector(".swatch");
  return {
    segHeight: seg?.getBoundingClientRect().height,
    btnHeight: btn?.getBoundingClientRect().height,
    swatchHeight: sw?.getBoundingClientRect().height,
  };
});
console.log(info);
await browser.close();
