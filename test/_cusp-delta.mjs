// Walk the hue ring and compute ΔE (OKLab distance) between
// consecutive hues' cusp colors. A big jump anywhere on the ring
// tells us where the cusp function is discontinuous.

function oklabUnitToLinearRgb(S, a, b) {
  const sa = S * a, sb = S * b;
  const l_ = 1 + 0.3963377774 * sa + 0.2158037573 * sb;
  const m_ = 1 - 0.1055613458 * sa - 0.0638541728 * sb;
  const s_ = 1 - 0.0894841775 * sa - 1.2914855480 * sb;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function findMaxSaturation(a, b) {
  let lo = 0, hi = 2.0;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const [r, g, bc] = oklabUnitToLinearRgb(mid, a, b);
    if (Math.min(r, g, bc) >= 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

function cuspForHue(hue) {
  const h = hue * Math.PI / 180;
  const a = Math.cos(h), b = Math.sin(h);
  const S = findMaxSaturation(a, b);
  const k_l =  0.3963377774 * a + 0.2158037573 * b;
  const k_m = -0.1055613458 * a - 0.0638541728 * b;
  const k_s = -0.0894841775 * a - 1.2914855480 * b;
  const l_ = 1 + S * k_l;
  const m_ = 1 + S * k_m;
  const s_ = 1 + S * k_s;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const rgbMax = Math.max(
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  );
  const L_cusp = Math.cbrt(1 / rgbMax);
  const C_cusp = L_cusp * S * 0.985;
  return [L_cusp, C_cusp];
}

// Compute OKLab (L, a, b) for each hue in 1° steps using cusp.
const step = 1;
const samples = [];
for (let h = 0; h < 360; h += step) {
  const [L, C] = cuspForHue(h);
  const rad = h * Math.PI / 180;
  samples.push({ h, L, a: C * Math.cos(rad), b: C * Math.sin(rad) });
}

// ΔE between consecutive samples.
let maxDE = 0, maxHue = -1;
const deltas = [];
for (let i = 0; i < samples.length; i++) {
  const a = samples[i];
  const b = samples[(i + 1) % samples.length];
  const dE = Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
  deltas.push({ from: a.h, to: b.h, dE });
  if (dE > maxDE) { maxDE = dE; maxHue = a.h; }
}

// Summary
const meanDE = deltas.reduce((s, d) => s + d.dE, 0) / deltas.length;
console.log(`samples: ${samples.length}  step: ${step}°`);
console.log(`mean ΔE: ${meanDE.toFixed(5)}`);
console.log(`max  ΔE: ${maxDE.toFixed(5)}  @ hue ${maxHue}°→${(maxHue + step) % 360}°`);
console.log(`ratio max/mean: ${(maxDE / meanDE).toFixed(1)}×`);

// Top 10 offenders
deltas.sort((a, b) => b.dE - a.dE);
console.log(`\ntop 10 ΔE jumps:`);
for (const d of deltas.slice(0, 10)) {
  console.log(`  ${d.from}°→${d.to}°: ΔE=${d.dE.toFixed(5)}`);
}

// Full L, C trace around 260°–275°
console.log(`\nL, C around 260°–275°:`);
for (let h = 258; h <= 276; h++) {
  const [L, C] = cuspForHue(h);
  console.log(`  h=${h}°  L=${L.toFixed(5)}  C=${C.toFixed(5)}`);
}

// Also test: max C at fixed L, across hues.
function inGamut(L, C, H) {
  const hRad = H * Math.PI / 180;
  const a = C * Math.cos(hRad), b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return r >= 0 && r <= 1 && g >= 0 && g <= 1 && bl >= 0 && bl <= 1;
}
function maxCAtL(L, hue) {
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(L, mid, hue)) lo = mid;
    else hi = mid;
  }
  return lo;
}

for (const Ltest of [0.5, 0.6, 0.7, 0.8]) {
  const samples2 = [];
  for (let h = 0; h < 360; h += step) {
    const C = maxCAtL(Ltest, h);
    const rad = h * Math.PI / 180;
    samples2.push({ h, L: Ltest, a: C * Math.cos(rad), b: C * Math.sin(rad) });
  }
  let mx = 0, mxH = -1, sum = 0;
  for (let i = 0; i < samples2.length; i++) {
    const A = samples2[i], B = samples2[(i + 1) % samples2.length];
    const dE = Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b);
    sum += dE;
    if (dE > mx) { mx = dE; mxH = A.h; }
  }
  const mean = sum / samples2.length;
  console.log(`\nfixed L=${Ltest}:  mean ΔE=${mean.toFixed(5)}  max ΔE=${mx.toFixed(5)} @ ${mxH}°  ratio=${(mx/mean).toFixed(1)}×`);
}
