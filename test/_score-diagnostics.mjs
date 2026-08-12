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

const HUES = [0, 30, 60, 120, 180, 210, 240, 300];
const N = 81; // grid resolution
const stats = await page.evaluate(({ HUES, N }) => {
  const D = window.__diag;
  function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
  function pct(arr, p) {
    const a = arr.slice().sort((x, y) => x - y);
    const i = Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))));
    return a[i];
  }
  const out = {};
  for (const sp of D.spaces) {
    const all = []; // {w, b, c, lr, ch, hue}
    for (const h of HUES) {
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N - i; j++) {
          const w = i / N, b = j / N, c = 1 - w - b;
          if (c < -1e-9) continue;
          const rgb = D.atBary(sp, h, w, b, c);
          const lab = D.srgbToOklrab(rgb);
          all.push({ w, b, c, lr: lab[0], ch: Math.hypot(lab[1], lab[2]), hue: h });
        }
      }
    }
    // 10 uniform shells of width 0.1 along w_b — diffs are directly comparable
    const shells = [];
    for (let k = 0; k < 10; k++) shells.push([k / 10, (k + 1) / 10]);
    const ramp = shells.map(([lo, hi]) => {
      const sub = all.filter(p => p.b >= lo && p.b < hi + 1e-9);
      return sub.length ? mean(sub.map(p => p.lr)) : NaN;
    });
    // consecutive Lr drops between shells (9 values; positive = brightness decreases)
    const drops = [];
    for (let k = 0; k < ramp.length - 1; k++) drops.push(ramp[k] - ramp[k + 1]);
    // interior (each weight ≥ 0.15)
    const interior = all.filter(p => p.w >= 0.15 && p.b >= 0.15 && p.c >= 0.15);
    // dark zone: samples with Lr in [0.1, 0.4] — mid-dark range where saturation should still live
    const darkZone = all.filter(p => p.lr >= 0.1 && p.lr <= 0.4);
    // mid zone: Lr in [0.4, 0.7]
    const midZone = all.filter(p => p.lr >= 0.4 && p.lr <= 0.7);
    out[sp] = {
      n: all.length,
      ramp,
      drops,
      // problem 1: very little dark area
      darkAreaFrac: all.filter(p => p.lr < 0.4).length / all.length,
      veryDarkAreaFrac: all.filter(p => p.lr < 0.25).length / all.length,
      // problem 2: sharp drop at corner — last drop vs. the average of mid drops
      lastDrop: drops[drops.length - 1],
      midDropMean: mean(drops.slice(2, 7)),
      dropSharpness: drops[drops.length - 1] / mean(drops.slice(2, 7)),
      interiorMeanC: mean(interior.map(p => p.ch)),
      interiorMedC: pct(interior.map(p => p.ch), 0.5),
      interiorMeanLr: mean(interior.map(p => p.lr)),
      darkMeanC: darkZone.length ? mean(darkZone.map(p => p.ch)) : NaN,
      darkMedC: darkZone.length ? pct(darkZone.map(p => p.ch), 0.5) : NaN,
      midMeanC: midZone.length ? mean(midZone.map(p => p.ch)) : NaN,
    };
  }
  return out;
}, { HUES, N });

const fmt = (x, d = 3) => (typeof x === "number" && isFinite(x) ? x.toFixed(d) : "  -  ");
const pad = (s, n) => String(s).padEnd(n);

console.log("\nLr ramp — mean Lr in each w_b shell (uniform width 0.1):");
console.log("=".repeat(92));
console.log(pad("space", 8), "0-10  10-20  20-30  30-40  40-50  50-60  60-70  70-80  80-90  90-100");
for (const [sp, s] of Object.entries(stats)) {
  console.log(pad(sp, 8), s.ramp.map(v => fmt(v, 2).padStart(5)).join("  "));
}

console.log("\nLr drops between consecutive shells (smooth ramp = uniform; sharp = spikes at end):");
for (const [sp, s] of Object.entries(stats)) {
  console.log(pad(sp, 8), s.drops.map(v => fmt(v, 3).padStart(5)).join("  "));
}

console.log("\nProblem 1 — DARK AREA: % of triangle samples below Lr threshold");
console.log("(low = very little dark area available)");
console.log(pad("space", 8), pad("Lr<0.4", 8), pad("Lr<0.25", 9));
for (const [sp, s] of Object.entries(stats)) {
  console.log(pad(sp, 8),
    pad(fmt(s.darkAreaFrac * 100, 1) + "%", 8),
    pad(fmt(s.veryDarkAreaFrac * 100, 1) + "%", 9));
}

console.log("\nProblem 2 — SHARP DROP at corner: last shell drop vs mid-ramp drops");
console.log("(sharpness = lastDrop ÷ midDropAvg. ~1 = smooth ramp. >1.5 = cliff at corner)");
console.log(pad("space", 8), pad("lastDrop", 9), pad("midDropAvg", 11), pad("sharpness", 10));
for (const [sp, s] of Object.entries(stats)) {
  console.log(pad(sp, 8),
    pad(fmt(s.lastDrop, 3), 9),
    pad(fmt(s.midDropMean, 3), 11),
    pad(fmt(s.dropSharpness, 2), 10));
}

console.log("\nInterior (each barycentric weight ≥ 0.15):");
console.log(pad("space", 8), pad("meanC", 7), pad("medC", 7), pad("meanLr", 7));
console.log("(low meanC / medC = washed-out muted interior)");
for (const [sp, s] of Object.entries(stats)) {
  console.log(pad(sp, 8),
    pad(fmt(s.interiorMeanC, 3), 7),
    pad(fmt(s.interiorMedC, 3), 7),
    pad(fmt(s.interiorMeanLr, 3), 7));
}

console.log("\nChroma at dark / mid Lr levels:");
console.log(pad("space", 8), pad("dark meanC", 11), pad("dark medC", 10), pad("mid meanC", 10));
console.log("(low dark-meanC = no meaningful dark colors, just black/gray. Lr ∈ [0.1, 0.4])");
for (const [sp, s] of Object.entries(stats)) {
  console.log(pad(sp, 8),
    pad(fmt(s.darkMeanC, 3), 11),
    pad(fmt(s.darkMedC, 3), 10),
    pad(fmt(s.midMeanC, 3), 10));
}

await browser.close();
if (errs.length) { for (const e of errs) console.log(e); process.exit(1); }
