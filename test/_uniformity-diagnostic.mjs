// Diagnose perceived non-uniformity in the tonal grid.
// Print L (OKLab) and ΔE between adjacent cells along each of the
// three grid axes at a single hue. We'll see whether the spacing is
// uniform numerically or whether the geometry of the triangle in
// OKLab is the actual culprit.

import { exportGridSystem } from "../design/palette.js";

const HUE = 180;
const N = 10;
const sys = exportGridSystem({
  space: "oklch",
  hueCount: 24,
  N,
  scheme: "nbw",
  curves: { tint: 0, shade: 0, pure: 0, magnitude: 2 },
});

// We don't have direct OKLab L values in the export (only hex), so
// re-derive from the cusp formula used internally. The cusp LUT is
// not exported either; approximate from the rendered hex by computing
// Y luminance and inverting OKLab's L curve. Quick approach: do the
// math directly here using the same constants as palette.js.

import { readFileSync } from "node:fs";
const paletteSrc = readFileSync("design/palette.js", "utf8");
// Easier: import the cusp LUT directly. It's not exported, so re-run the math.

function findMaxSaturation(a, b) {
  function probe(S) {
    const sa = S * a, sb = S * b;
    const l_ = 1 + 0.3963377774 * sa + 0.2158037573 * sb;
    const m_ = 1 - 0.1055613458 * sa - 0.0638541728 * sb;
    const s_ = 1 - 0.0894841775 * sa - 1.2914855480 * sb;
    const l = l_**3, m = m_**3, s = s_**3;
    return [
      4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
      -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
      -0.0041960863*l - 0.7034186147*m + 1.7076147010*s,
    ];
  }
  let lo = 0, hi = 2.0;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const [r, g, b] = probe(mid);
    if (Math.min(r, g, b) >= 0) lo = mid;
    else hi = mid;
  }
  return lo;
}
function cusp(hue) {
  const h = hue * Math.PI / 180;
  const a = Math.cos(h), b = Math.sin(h);
  const S = findMaxSaturation(a, b);
  const k_l =  0.3963 * a + 0.2158 * b;
  const k_m = -0.1056 * a - 0.0639 * b;
  const k_s = -0.0895 * a - 1.2915 * b;
  const l_ = (1 + S*k_l)**3, m_ = (1 + S*k_m)**3, s_ = (1 + S*k_s)**3;
  const rgbMax = Math.max(
    4.0767*l_ - 3.3077*m_ + 0.2310*s_,
    -1.2684*l_ + 2.6098*m_ - 0.3413*s_,
    -0.0042*l_ - 0.7034*m_ + 1.7076*s_,
  );
  const Lc = Math.cbrt(1 / rgbMax);
  const Cc = Lc * S * 0.985;
  return [Lc, Cc];
}

const EQUI = process.argv.includes("--equi");
let [Lp, Cp] = cusp(HUE);
if (EQUI) Lp = 0.5;
console.log(`hue ${HUE}° (${EQUI ? "ΔE-equal mode" : "default"}): Lp=${Lp.toFixed(3)} Cp=${Cp.toFixed(3)}`);
console.log(`(in OKLab: W=(1,0), B=(0,0), C=(${Lp.toFixed(2)},${Cp.toFixed(2)}))`);
console.log("");

// Compute L, C, ΔE along each axis.
function dE(L1, C1, L2, C2) {
  // L and C only (single hue); ΔE = √(ΔL² + ΔC²) in OKLab.
  return Math.sqrt((L1-L2)**2 + (C1-C2)**2);
}

function walk(name, getCoord) {
  console.log(name);
  console.log("  step  L      C      ΔE-from-prev");
  let prevL = null, prevC = null;
  for (let i = 0; i <= N; i++) {
    const { w, c } = getCoord(i);
    const L = w + c * Lp;
    const C = c * Cp;
    const dEStr = prevL == null ? "—" : dE(L, C, prevL, prevC).toFixed(4);
    console.log(`  ${String(i).padStart(2)}    ${L.toFixed(3)}  ${C.toFixed(3)}  ${dEStr}`);
    prevL = L; prevC = C;
  }
  console.log("");
}

// Top row: 00b varying w 0..N (color → white)
walk("Top row 00b-{w}w (color → white):", i => ({ w: i/N, c: (N-i)/N }));

// Left column: 00w varying b 0..N (color → black)
walk("Left column {b}b-00w (color → black):", i => ({ w: 0, c: (N-i)/N }));

// Diagonal: increasing both w and b equally (color → grey midpoint, c shrinks)
// (b varies from 0 to N/2, w varies from 0 to N/2, c shrinks from 1 to 0)
walk("Diagonal bX-wX (color → grey midpoint):", i => {
  const k = N - 2*i;  // remaining chroma
  if (k < 0) return { w: 0.5, c: 0 };
  return { w: i/N, c: k/N };
});
