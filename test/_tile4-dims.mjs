import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(300);

const dims = await page.evaluate(() => {
  const sec = document.querySelectorAll("main > section")[3];
  const head = sec.querySelector(".section-head");
  const layout = sec.querySelector(".arcs-layout");
  const stage = sec.querySelector("#arc-stage");
  const canvas = sec.querySelector("#arc-body");
  const scales = sec.querySelector("#arc-scales");
  const r = el => el?.getBoundingClientRect();
  return {
    section: r(sec),
    head: r(head),
    layout: r(layout),
    stage: r(stage),
    canvas: r(canvas),
    scales: r(scales),
  };
});
console.log(JSON.stringify(dims, null, 2));
await browser.close();
