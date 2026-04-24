import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGE ERROR: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errs.push("CONSOLE: " + m.text());
});
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(700);
await page.screenshot({ path: "/tmp/score-overview.png", fullPage: false });
const arcPill = await page.$eval("#arc-score", el => el.textContent);
const gridPill = await page.$eval("#grid-score", el => el.textContent);
await browser.close();
console.log("ARC:", arcPill);
console.log("GRID:", gridPill);
if (errs.length) { for (const e of errs) console.log(e); process.exit(1); }
