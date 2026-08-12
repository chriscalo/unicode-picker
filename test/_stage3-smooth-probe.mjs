// Stage 3 smoothness eye-calibration probe.
//
// Protocol: render W→C edge strips where the C corner is the SAME
// sRGB color across all spaces. For each target hue (sRGB primaries
// and secondaries), find the per-space input angle that puts the C
// corner exactly on that target. Strips are numbered and shuffled;
// the mapping (number → space, target) is hidden until after.
//
// Usage: node test/_stage3-smooth-probe.mjs [seed]
import { chromium } from "playwright";
import fs from "fs";

const seed = process.argv[2] ? parseInt(process.argv[2], 10) : Date.now();
function rng(s) {
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rand = rng(seed);

const SPACES = ["hwb", "oklch", "okhsl", "okhsv", "lchab", "jzazbz"];
const TARGETS = [
  { name: "red",     rgb: [1, 0, 0] },
  { name: "yellow",  rgb: [1, 1, 0] },
  { name: "green",   rgb: [0, 1, 0] },
  { name: "cyan",    rgb: [0, 1, 1] },
  { name: "blue",    rgb: [0, 0, 1] },
  { name: "magenta", rgb: [1, 0, 1] },
];

const PAIRS = [];
for (const sp of SPACES) for (const t of TARGETS) PAIRS.push({ sp, t });
for (let i = PAIRS.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [PAIRS[i], PAIRS[j]] = [PAIRS[j], PAIRS[i]];
}

const N_PATH = 200;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1400 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
await page.goto("http://localhost:5173/design/color-triangle.html?ts=" + Date.now());
await page.waitForLoadState("networkidle");
await page.waitForFunction(() => !!window.__diag);

const strips = await page.evaluate(({ PAIRS, N_PATH }) => {
  const D = window.__diag;
  D.resetAllCurvesToIdentity();
  function chromaOf(lab) { return Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]); }
  function dE(a, b) {
    const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  }
  // For (space, targetRgb), search input hue for the angle that puts
  // C corner closest to targetRgb in OKLrab. Coarse-then-fine sweep.
  function findInputHue(sp, targetRgb) {
    D.setSpace(sp);
    const targetLab = D.srgbToOklrab(targetRgb);
    let best = 0, bestE = Infinity;
    for (let h = 0; h < 360; h += 0.5) {
      const rgb = D.atBary(sp, h, 0, 0, 1);
      const lab = D.srgbToOklrab(rgb);
      const e = dE(lab, targetLab);
      if (e < bestE) { bestE = e; best = h; }
    }
    for (let h = best - 0.5; h <= best + 0.5; h += 0.02) {
      const rgb = D.atBary(sp, h, 0, 0, 1);
      const lab = D.srgbToOklrab(rgb);
      const e = dE(lab, targetLab);
      if (e < bestE) { bestE = e; best = h; }
    }
    return { hue: best, cornerDE: bestE };
  }
  return PAIRS.map(({ sp, t }) => {
    const { hue, cornerDE } = findInputHue(sp, t.rgb);
    D.setSpace(sp);
    const colors = [];
    const labs = [];
    for (let i = 0; i < N_PATH; i++) {
      const t2 = i / (N_PATH - 1);
      const rgb = D.atBary(sp, hue, 1-t2, 0, t2);
      colors.push([
        Math.max(0, Math.min(255, Math.round(rgb[0]*255))),
        Math.max(0, Math.min(255, Math.round(rgb[1]*255))),
        Math.max(0, Math.min(255, Math.round(rgb[2]*255))),
      ]);
      labs.push(D.srgbToOklrab(rgb));
    }
    const steps = [];
    let total = 0;
    for (let i = 0; i < labs.length - 1; i++) {
      const d = dE(labs[i], labs[i+1]);
      steps.push(d);
      total += d;
    }
    const mean = total / steps.length;
    const max = Math.max(...steps);
    const stretch = mean > 1e-9 ? max / mean : 1;
    let v = 0;
    for (const d of steps) v += (d - mean) ** 2;
    const cv = mean > 1e-9 ? Math.sqrt(v / steps.length) / mean : 0;
    const mid = labs[Math.floor(N_PATH / 2)];
    const cMid = chromaOf(mid);
    const cMax = chromaOf(labs[N_PATH - 1]);
    const midRatio = cMax > 1e-6 ? cMid / cMax : 0.5;
    let kink = 0;
    for (let i = 1; i < steps.length; i++) {
      kink += Math.abs(steps[i] - steps[i-1]);
    }
    const roughness = total > 1e-9 ? kink / total : 0;
    return { sp, target: t.name, hue, cornerDE, colors,
             stretch, cv, midRatio, roughness };
  });
}, { PAIRS, N_PATH });

await page.close();

const STRIP_W = 320;
const STRIP_H = 36;
const COLS = 2;
function gradient(colors) {
  return colors.map((c, i) => {
    const pct = (i / (colors.length - 1)) * 100;
    return `rgb(${c[0]},${c[1]},${c[2]}) ${pct.toFixed(1)}%`;
  }).join(", ");
}
const cells = strips.map((s, i) => `
  <div class="cell">
    <div class="num">#${(i + 1).toString().padStart(2, "0")}</div>
    <div class="strip" style="background:linear-gradient(to right, ${gradient(s.colors)})"></div>
  </div>
`).join("");

const html = `<!doctype html><html><head><style>
  body { background: #1a1a1a; margin: 0; font: 13px monospace; color: #ddd;
         padding: 24px; }
  h1 { margin: 0 0 6px; font-size: 14px; font-weight: normal; color: #ccc; }
  .sub { color: #888; font-size: 12px; margin-bottom: 16px; line-height: 1.5; }
  .grid { display: grid; grid-template-columns: repeat(${COLS}, auto);
          column-gap: 28px; row-gap: 8px; }
  .cell { display: flex; align-items: center; gap: 12px; }
  .num { color: #aaa; font-size: 13px; min-width: 36px; text-align: right; }
  .strip { width: ${STRIP_W}px; height: ${STRIP_H}px;
           border: 1px solid #333; }
</style></head><body>
  <h1>Stage 3 — smoothness eye-calibration (${strips.length} W→C strips, sRGB-anchored C corner)</h1>
  <div class="sub">
    Each strip ends at the same sRGB primary or secondary (red/yellow/green/cyan/blue/magenta).
    Compare strips that share the same endpoint color to see how each space gets there.<br>
    Look at each strip left→right. Smooth = even fade; kinky = sudden
    jump or a stretch where color barely changes followed by a shift.
  </div>
  <div class="grid">${cells}</div>
</body></html>`;

const newPage = await ctx.newPage();
await newPage.setViewportSize({ width: COLS * (STRIP_W + 80) + 80, height: Math.ceil(strips.length / COLS) * (STRIP_H + 8) + 140 });
await newPage.setContent(html);
await newPage.waitForTimeout(400);
await newPage.screenshot({ path: "/tmp/stage3_smooth_probe.png", fullPage: true });
await browser.close();

console.log(`wrote /tmp/stage3_smooth_probe.png  (seed=${seed})`);
console.log(`HIDDEN mapping (do not consult before answering):`);
strips.forEach((s, i) => {
  console.log(`  #${(i+1).toString().padStart(2,"0")}  ${s.sp.padEnd(7)} target=${s.target.padEnd(8)} hue=${s.hue.toFixed(1)}°  cornerDE=${s.cornerDE.toFixed(3)}  midRatio=${s.midRatio.toFixed(3)}  mx/mn=${s.stretch.toFixed(2)}  cv=${s.cv.toFixed(3)}  rough=${s.roughness.toFixed(3)}`);
});
fs.writeFileSync("/tmp/stage3_smooth_probe.json",
  JSON.stringify({ seed, strips: strips.map(s => ({
    sp: s.sp, target: s.target, hue: s.hue, cornerDE: s.cornerDE,
    midRatio: s.midRatio, stretch: s.stretch, cv: s.cv, roughness: s.roughness,
  })) }, null, 2));
console.log(`mapping also written to /tmp/stage3_smooth_probe.json`);
