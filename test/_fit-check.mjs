import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto("http://localhost:5173/design/color-triangle.html");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);

const report = await page.evaluate(() => {
  const html = document.documentElement;
  const body = document.body;
  const main = document.querySelector("main");
  const sections = [...main.querySelectorAll("section")];
  function dims(el) {
    const r = el.getBoundingClientRect();
    return {
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      scroll: { w: el.scrollWidth, h: el.scrollHeight },
      overflows: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    };
  }
  const report = {
    viewport: { w: innerWidth, h: innerHeight },
    htmlOverflow: { x: html.scrollWidth > html.clientWidth, y: html.scrollHeight > html.clientHeight },
    body: dims(body),
    main: dims(main),
    sections: sections.map((s, i) => {
      const d = dims(s);
      const children = [...s.children].map(c => ({
        tag: c.tagName,
        cls: c.className,
        ...dims(c),
      }));
      return { n: i + 1, ...d, children };
    }),
  };
  return report;
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
