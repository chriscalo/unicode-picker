import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("PAGE: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE: " + m.text()); });

await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const HUES = [0, 60, 120, 210, 300];
const rows = await page.evaluate(({ HUES }) => {
  const D = window.__diag;
  function aggregateShortfall(xs) {
    let s = 0; for (const x of xs) s += (100 - x) ** 2;
    return 100 - Math.sqrt(s / xs.length);
  }
  const out = [];
  for (const sp of D.spaces) {
    D.setSpace(sp);
    const sub = HUES.map(h => D.sampleSpaceMetrics(h));
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    // simulated curve smoothCurve = 90 (a typical user curve)
    const smoothCurveStub = 90;
    // per-hue smooth and reach
    const smoothPerHue = sub.map(m =>
      aggregateShortfall([
        smoothCurveStub,
        m.smoothLrRamp, m.smoothDarkArea, m.smoothInteriorC, m.smoothDarkC,
      ]));
    const reachPerHue = sub.map(m => m.reachPeak);
    out.push({
      sp,
      smoothQ: mean(smoothPerHue),
      reachQ:  mean(reachPerHue),
      lrRamp:    mean(sub.map(m => m.smoothLrRamp)),
      darkArea:  mean(sub.map(m => m.smoothDarkArea)),
      intC:      mean(sub.map(m => m.smoothInteriorC)),
      darkC:     mean(sub.map(m => m.smoothDarkC)),
      peakC:     mean(sub.map(m => m.peakC)),
    });
  }
  out.sort((a, b) => b.smoothQ - a.smoothQ);
  return out;
}, { HUES });

const fmt = (x, d = 1) => (typeof x === "number" ? x.toFixed(d) : "  -  ");
const pad = (s, n) => String(s).padEnd(n);

console.log("\nNew Smooth + Reach (Smooth aggregates: stub stepCV=90 + 4 space-level facets)");
console.log("=".repeat(96));
console.log(pad("space", 8),
  pad("Smooth", 8), pad("Reach", 7),
  "  facets:", pad("Ramp", 7), pad("DarkArea", 9), pad("IntC", 7), pad("DarkC", 7),
  pad("peakC", 7));
for (const r of rows) {
  console.log(
    pad(r.sp, 8),
    pad(fmt(r.smoothQ), 8),
    pad(fmt(r.reachQ), 7),
    "         ",
    pad(fmt(r.lrRamp), 7),
    pad(fmt(r.darkArea), 9),
    pad(fmt(r.intC), 7),
    pad(fmt(r.darkC), 7),
    pad(fmt(r.peakC, 3), 7),
  );
}

await browser.close();
if (errs.length) { for (const e of errs) console.log(e); process.exit(1); }
