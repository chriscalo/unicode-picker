import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function shoot(name, theme) {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 400 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/design/");
  await page.waitForLoadState("networkidle");
  await page.evaluate((theme) => {
    document.documentElement.dataset.theme = theme;
  }, theme);
  await page.evaluate(() => {
    const t = document.querySelector('[data-step="styling"]');
    t?.click();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/adapt-${name}.png`, clip: { x: 0, y: 0, width: 1400, height: 140 } });
  await ctx.close();
}

await shoot("light", "light");
await shoot("dark", "dark");

await browser.close();
console.log("saved");
