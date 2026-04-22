import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });

// Start clean so we don't pollute with prior saved candidates.
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

await page.goto("http://localhost:5173/design/palette-studio.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);

// Simulate the designer posting a save (bypass the prompt + iframe).
await page.evaluate(() => {
  window.postMessage({
    type: "designer:save",
    name: "hue-30-test",
    state: { space: "oklch", hue: 30, easing: {}, easingMag: 2 },
  }, "*");
});
await page.waitForTimeout(1800);
await page.screenshot({ path: "/tmp/studio-after-save.png", fullPage: true });

// Second candidate with a cool hue.
await page.evaluate(() => {
  window.postMessage({
    type: "designer:save",
    name: "hue-260-test",
    state: { space: "oklch", hue: 260, easing: {}, easingMag: 2 },
  }, "*");
});
await page.waitForTimeout(1800);
await page.screenshot({ path: "/tmp/studio-two-candidates.png", fullPage: true });

// Count candidate cards.
const count = await page.$$eval(".candidate", (els) => els.length);
console.log("candidate count:", count);

// Delete the middle candidate.
await page.evaluate(() => {
  // Stub confirm to always return true.
  window.confirm = () => true;
  const card = document.querySelector('[id="c-c-" i]') ||
    Array.from(document.querySelectorAll(".candidate")).find(c => c.querySelector("h2").textContent === "hue-30-test");
  const btn = Array.from(card.querySelectorAll("button.ghost"))
    .find(b => b.textContent === "delete");
  btn.click();
});
await page.waitForTimeout(500);
const after = await page.$$eval(".candidate", (els) => els.length);
console.log("after delete:", after);

await page.screenshot({ path: "/tmp/studio-after-delete.png", fullPage: true });

await browser.close();
console.log("saved");
