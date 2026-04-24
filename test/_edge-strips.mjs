import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
const header = await page.$("header.workbench");
await header.screenshot({ path: "/tmp/edge-strips-default.png" });

// Shade slider to +0.5 (should warp the B↔C edge)
await page.$eval("#ease-b", (el, v) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, "0.5");
await page.waitForTimeout(400);
await header.screenshot({ path: "/tmp/edge-strips-shade.png" });

await browser.close();
console.log("saved");
