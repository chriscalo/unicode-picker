// Open the studio, open the designer overlay, click "Save as tonalarc"
// in the designer (auto-accept the prompt), and verify a new candidate
// shows up in the gallery with non-default state (different space).
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

await page.goto("http://localhost:5173/design/palette-studio.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);

const startCount = await page.$$eval(".candidate", els => els.length);
console.log("starting candidate count:", startCount);

// Open the designer modal.
await page.click("#open-designer");
await page.waitForTimeout(1500);

// Inside the iframe, switch to OKHSL and trigger export.
const designerFrame = page.frameLocator("#designer-iframe");

// Switch space to "okhsl"
await designerFrame.locator('[data-decision="space"] button[data-value="okhsl"]').click();
await page.waitForTimeout(400);

// Stub prompt() inside the designer iframe so it doesn't open a dialog.
await designerFrame.locator("#save-tonalarc").evaluate((btn) => {
  btn.ownerDocument.defaultView.prompt = () => "scripted-test-export";
});
await designerFrame.locator("#save-tonalarc").click();
await page.waitForTimeout(2500);

const endCount = await page.$$eval(".candidate", els => els.length);
console.log("ending candidate count:", endCount);

// Inspect the new card's badges to confirm space=okhsl.
const lastCardText = await page.$$eval(
  ".candidate:last-of-type .badges",
  els => els.length ? els[els.length - 1].textContent : ""
);
console.log("last card badges:", lastCardText);

await page.screenshot({ path: "/tmp/studio-after-designer-export.png", fullPage: true });
await browser.close();
console.log("saved");
