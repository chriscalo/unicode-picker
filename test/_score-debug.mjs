import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const g = window.__lastGridScore;
  return {
    combined: g.combined,
    meanCV: g.meanCV,
    nearIdentical: g.nearIdentical,
    pairCount: g.pairCount,
    reach: g.reach,
    rowCVs: g.rows.map(r => +r.cv.toFixed(4)),
    rowMeans: g.rows.map(r => +r.mean.toFixed(4)),
    colCVs: g.cols.map(c => +c.cv.toFixed(4)),
    diagCVs: g.diag.map(d => +d.cv.toFixed(4)),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
