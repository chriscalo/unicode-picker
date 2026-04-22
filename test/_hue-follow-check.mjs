import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });

async function shoot(name, hueAttr, hueVal) {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 400 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:5173/design/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const t = document.querySelector('[data-step="styling"]');
    t?.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(({ hueAttr, hueVal }) => {
    const btn = document.querySelector(
      `[data-decision="${hueAttr}"] [data-value="${hueVal}"]`,
    );
    btn?.click();
  }, { hueAttr, hueVal });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/follow-${name}.png`, clip: { x: 0, y: 80, width: 1400, height: 200 } });
  await ctx.close();
}

await shoot("accent-red",    "accent-hue",  "red");
await shoot("accent-violet", "accent-hue",  "violet");
await shoot("surface-blue",  "surface-hue", "blue");

await browser.close();
console.log("saved");
