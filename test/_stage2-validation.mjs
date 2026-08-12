// Stage 2 eye-validation tile: render K-slot quantized hue rings
// for the 6 UI spaces side by side so the user can compare metric
// rankings against perception.
import { chromium } from "playwright";

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const KS     = [24, 32];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1900, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const slotsBySpace = await page.evaluate(({ SPACES, KS }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  const out = {};
  for (const sp of SPACES) {
    D.setSpace(sp);
    out[sp] = {};
    for (const K of KS) {
      const slots = [];
      for (let i = 0; i < K; i++) {
        const h = (i * 360) / K;
        const rgb = D.atBary(sp, h, 0, 0, 1);
        slots.push({
          h,
          rgb: rgb.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)),
        });
      }
      out[sp][K] = slots;
    }
  }
  return out;
}, { SPACES, KS });

await page.close();

function ringSvg(slots, size = 280) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.55;
  const K = slots.length;
  const seg = (i) => {
    const a0 = (i * 2 * Math.PI) / K - Math.PI / 2;
    const a1 = ((i + 1) * 2 * Math.PI) / K - Math.PI / 2;
    const x0o = cx + rOuter * Math.cos(a0);
    const y0o = cy + rOuter * Math.sin(a0);
    const x1o = cx + rOuter * Math.cos(a1);
    const y1o = cy + rOuter * Math.sin(a1);
    const x0i = cx + rInner * Math.cos(a0);
    const y0i = cy + rInner * Math.sin(a0);
    const x1i = cx + rInner * Math.cos(a1);
    const y1i = cy + rInner * Math.sin(a1);
    const c = slots[i].rgb;
    return `<path d="M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 0 0 ${x0i} ${y0i} Z" fill="rgb(${c[0]},${c[1]},${c[2]})" stroke="#000" stroke-width="0.5" />`;
  };
  const segs = [];
  for (let i = 0; i < K; i++) segs.push(seg(i));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segs.join("")}</svg>`;
}

const tiles = [];
for (const K of KS) {
  for (const sp of SPACES) {
    const slots = slotsBySpace[sp][K];
    tiles.push(`
      <div class="tile">
        <div class="label">${sp}, K=${K}</div>
        ${ringSvg(slots, 260)}
      </div>
    `);
  }
}

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 13px monospace; color: #ddd;
         padding: 20px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #888; font-size: 11px; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: repeat(6, auto); gap: 10px;
          justify-content: center; }
  .tile { display: flex; flex-direction: column; align-items: center; }
  .label { color: #ccc; font-size: 11px; margin-bottom: 4px; }
  svg { display: block; }
</style></head><body>
  <h1>Stage 2 — quantized hue rings, 6 UI spaces × ${KS.length} K values</h1>
  <div class="sub">Each ring shows K slots picked at uniform input-hue angles (0°, 360°/K, ...). Compare for: (a) any pair of slots that read as the same color, (b) any major hue family missing, (c) muted slots.</div>
  <div class="grid">${tiles.join("")}</div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: 1900, height: 720 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/stage2_rings.png", fullPage: true });
await browser.close();
console.log("wrote /tmp/stage2_rings.png");
