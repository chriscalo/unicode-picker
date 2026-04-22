import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);

for (const space of ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz", "hsluv", "hpluv"]) {
  await page.click(`[data-decision="space"] button[data-value="${space}"]`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/tmp/space-${space}.png`, fullPage: false });
}
await browser.close();
if (errors.length) {
  console.error("ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("saved space shots");
