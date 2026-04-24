import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1800 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGE ERROR: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errs.push("CONSOLE: " + m.text());
});
await page.goto("http://localhost:5173/design/hue-name-survey.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/hue-survey.png", fullPage: true });
const count = await page.evaluate(() =>
  document.querySelectorAll("#strips .strip-row").length);
console.log("strip rows:", count);
await browser.close();
if (errs.length) { for (const e of errs) console.log(e); process.exit(1); }
