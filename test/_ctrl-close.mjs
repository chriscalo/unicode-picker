import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 300 },
  deviceScaleFactor: 2,
  colorScheme: "light",
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/");
await page.waitForLoadState("networkidle");
await page.evaluate(() => {
  document.querySelector('[data-step="styling"]')?.click();
});
await page.waitForTimeout(300);

// Dump computed widths of a few controls.
const info = await page.evaluate(() => {
  const controls = [...document.querySelectorAll(".control")];
  return controls.map(c => {
    const label = c.querySelector(".control__label");
    const seg = c.querySelector(".seg, .swatches");
    const cs = getComputedStyle(c);
    return {
      label: label?.textContent?.trim(),
      controlWidth: c.getBoundingClientRect().width,
      labelWidth: label?.getBoundingClientRect().width,
      segWidth: seg?.getBoundingClientRect().width,
      display: cs.display,
      cssWidth: cs.width,
    };
  });
});
console.log(JSON.stringify(info, null, 2));

await page.screenshot({ path: "/tmp/ctrl-close.png", clip: { x: 0, y: 140, width: 1600, height: 140 } });
await ctx.close();
await browser.close();
