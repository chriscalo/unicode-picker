import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);

const tile4 = await page.$("main > section:nth-child(4)");
await tile4.screenshot({ path: "/tmp/smooth-l-off.png" });

await page.click("#smooth-l-on");
await page.waitForTimeout(800);
await tile4.screenshot({ path: "/tmp/smooth-l-on.png" });
await page.screenshot({ path: "/tmp/smooth-l-fullpage.png", fullPage: false });

await browser.close();
console.log("saved");
