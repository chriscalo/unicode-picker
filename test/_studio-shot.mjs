import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });

await page.goto("http://localhost:5173/design/palette-studio.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/studio-initial.png", fullPage: false });

// Open the designer overlay
await page.click("#open-designer");
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/studio-overlay.png", fullPage: false });

// Close and toggle global hue
await page.click("#overlay-close");
await page.waitForTimeout(300);
await page.click("#global-hue-enabled");
await page.waitForTimeout(600);
await page.$eval("#global-surface-hue", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, "30");
await page.$eval("#global-accent-hue",  (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, "260");
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/studio-global-hue.png", fullPage: false });

await browser.close();
console.log("saved");
