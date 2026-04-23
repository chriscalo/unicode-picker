import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

await page.goto("http://localhost:5173/design/palette-studio.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);

const sec = await page.$("#c-arc-11x11");
await sec.screenshot({ path: "/tmp/studio-arc11.png" });

await browser.close();
console.log("saved");
