import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const sections = document.querySelectorAll("main > section");
  return Array.from(sections).map((sec, idx) => {
    const head = sec.querySelector(".section-head");
    const row = sec.querySelector(".tri-row, .arcs-layout, .grid-hex-row");
    const status = sec.querySelector(".tile-status");
    const stage = sec.querySelector(".tri-stage");
    const body = sec.querySelector("canvas.tri-body");
    return {
      idx: idx + 1,
      sec: sec.getBoundingClientRect().height,
      head: head ? head.getBoundingClientRect().height : null,
      row: row ? row.getBoundingClientRect().height : null,
      status: status ? status.getBoundingClientRect().height : null,
      stageW: stage ? stage.getBoundingClientRect().width : null,
      stageH: stage ? stage.getBoundingClientRect().height : null,
      bodyW: body ? body.getBoundingClientRect().width : null,
      bodyH: body ? body.getBoundingClientRect().height : null,
    };
  });
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
