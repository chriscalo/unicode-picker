import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => { errs.push("PAGE ERROR: " + e.message); });
page.on("console", (m) => {
  if (m.type() === "error") errs.push("CONSOLE: " + m.text());
});
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);

const header = await page.$("header.workbench");
await header.screenshot({ path: "/tmp/curve-default.png" });

// Programmatically drag the Shade middle point down.
const canvas = await page.$("#curve-bc");
const box = await canvas.boundingBox();
const mx = box.x + box.width * 0.5;
const topY = box.y + 2;
const midY = box.y + box.height * 0.5;
await page.mouse.move(mx, midY);
await page.mouse.down();
await page.mouse.move(mx, topY, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
await header.screenshot({ path: "/tmp/curve-dragged.png" });

const full = await page.$("body");
await full.screenshot({ path: "/tmp/curve-full.png" });

await browser.close();
if (errs.length) {
  console.log("ERRORS:");
  for (const e of errs) console.log("  " + e);
  process.exit(1);
}
console.log("ok");
