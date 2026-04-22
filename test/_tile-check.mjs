import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function shoot(name, theme) {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
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
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/rename-${name}.png` });
  await ctx.close();
}

await shoot("dark", "dark");
await shoot("light", "light");

await browser.close();
console.log("saved");
