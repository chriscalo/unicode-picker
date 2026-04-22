import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1400 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);

// Scheme CL @ N=5
await page.screenshot({ path: "/tmp/quant-cl-n5.png", clip: await clip(page) });

// Scheme WB
await page.click('.scheme-tabs button[data-scheme="wb"]');
await page.waitForTimeout(100);
await page.screenshot({ path: "/tmp/quant-wb-n5.png", clip: await clip(page) });

// Scheme num
await page.click('.scheme-tabs button[data-scheme="num"]');
await page.waitForTimeout(100);
await page.screenshot({ path: "/tmp/quant-num-n5.png", clip: await clip(page) });

// Back to CL, N=6
await page.click('.scheme-tabs button[data-scheme="cl"]');
await page.selectOption("#quant-N", "6");
await page.waitForTimeout(150);
await page.screenshot({ path: "/tmp/quant-cl-n6.png", clip: await clip(page) });

await browser.close();
console.log("saved four variants to /tmp/quant-*.png");

async function clip(page) {
  await page.$eval(".token-grid", el => el.scrollIntoView({ block: "center" }));
  const box = await page.$eval(".token-grid", el => {
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - 40), y: Math.max(0, r.y - 140), width: Math.min(1400, r.width + 80), height: Math.min(1400, r.height + 160) };
  });
  return box;
}
