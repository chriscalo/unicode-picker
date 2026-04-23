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
await page.waitForTimeout(800);

const tile4 = await page.$("main > section:nth-child(4)");
await tile4.screenshot({ path: "/tmp/l-warp-1.png" });

// Drag to 2.0 (strong dark stretch)
await page.$eval("#l-dark-gamma", (el, v) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, "2");
await page.waitForTimeout(600);
await tile4.screenshot({ path: "/tmp/l-warp-2.png" });

await browser.close();
console.log("saved");
