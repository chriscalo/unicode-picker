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
await page.waitForTimeout(400);

// Clear any stale saved state for this test, then reload fresh.
await page.evaluate(() => localStorage.removeItem("colorTriangle:curves:v2"));
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

// Add and drag a point on the Shade curve.
const canvas = await page.$("#curve-bc");
const box = await canvas.boundingBox();
const mx = box.x + box.width * 0.5;
const my = box.y + box.height * 0.25;
await page.mouse.move(mx, my);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(200);

// Read the stored state.
const saved = await page.evaluate(() =>
  localStorage.getItem("colorTriangle:curves:v2"));
if (!saved) {
  errs.push("no state in localStorage after drag");
} else {
  const parsed = JSON.parse(saved);
  if (!parsed.oklch || !parsed.oklch.bc || parsed.oklch.bc.xs.length !== 3) {
    errs.push("stored shade curve doesn't have the expected 3 knots: "
      + JSON.stringify(parsed.oklch));
  }
}

// Reload and confirm curve still has 3 knots.
await page.reload();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);
const restoredKnotCount = await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem("colorTriangle:curves:v2"));
  return saved.oklch.bc.xs.length;
});
if (restoredKnotCount !== 3) {
  errs.push("after reload, shade curve knot count = " + restoredKnotCount);
}

await browser.close();
if (errs.length) {
  for (const e of errs) console.log(e);
  process.exit(1);
}
console.log("ok");
