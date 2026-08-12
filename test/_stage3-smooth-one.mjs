// Render a single W→C strip from the probe by index.
// Usage: node test/_stage3-smooth-one.mjs <index>
import { chromium } from "playwright";
import fs from "fs";

const idx = parseInt(process.argv[2], 10);
if (!idx || idx < 1) {
  console.error("usage: node test/_stage3-smooth-one.mjs <1-30>");
  process.exit(2);
}
const probe = JSON.parse(fs.readFileSync("/tmp/stage3_smooth_probe.json", "utf8"));
const strip = probe.strips[idx - 1];
if (!strip) {
  console.error(`no strip at index ${idx} (range 1..${probe.strips.length})`);
  process.exit(2);
}

const N_PATH = 200;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 900, height: 200 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const colors = await page.evaluate(({ sp, hue, N_PATH }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  D.setSpace(sp);
  const out = [];
  for (let i = 0; i < N_PATH; i++) {
    const t = i / (N_PATH - 1);
    const rgb = D.atBary(sp, hue, 1-t, 0, t);
    out.push([
      Math.max(0, Math.min(255, Math.round(rgb[0]*255))),
      Math.max(0, Math.min(255, Math.round(rgb[1]*255))),
      Math.max(0, Math.min(255, Math.round(rgb[2]*255))),
    ]);
  }
  return out;
}, { sp: strip.sp, hue: strip.hue, N_PATH });
await page.close();

const stops = colors.map((c, i) => {
  const pct = (i / (colors.length - 1)) * 100;
  return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
}).join(", ");
const html = `<!doctype html><html><head><style>
  body { background:#1a1a1a; margin:0; font:14px monospace; color:#ddd;
         padding:24px; }
  h1 { font-size:14px; font-weight:normal; color:#ccc; margin:0 0 4px; }
  .sub { color:#888; font-size:11px; margin-bottom:14px; }
  .strip { width:780px; height:80px; border:1px solid #333; }
</style></head><body>
  <h1>Strip #${idx.toString().padStart(2,"0")} — W → C</h1>
  <div class="sub">Smooth or kinky?</div>
  <div class="strip" style="background:linear-gradient(to right, ${stops})"></div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 850, height: 180 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: `/tmp/stage3_smooth_${idx.toString().padStart(2,"0")}.png`, fullPage: true });
await browser.close();
console.log(`wrote /tmp/stage3_smooth_${idx.toString().padStart(2,"0")}.png`);
console.log(`HIDDEN: ${strip.sp} target=${strip.target} hue=${strip.hue.toFixed(1)}°  midRatio=${strip.midRatio.toFixed(3)}  mx/mn=${strip.stretch.toFixed(2)}  cv=${strip.cv.toFixed(3)}`);
