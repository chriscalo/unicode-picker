// OKLCH-triangle helpers ported verbatim from color-triangle.html.
// Exposes enough to enumerate every named color stop in a system
// (tonalarc or tonalgrid) at every hue, as hex strings.

// ─── OKLab / OKLCH math (ported verbatim from color-triangle.html) ─

// Generic OKLCH → linear sRGB.
function oklchToLinearRgb(L, C, H) {
  const hRad = H * Math.PI / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = lp * lp * lp;
  const m = mp * mp * mp;
  const s = sp * sp * sp;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// Saturation-probe variant: holds L=1, scales chroma direction by S.
// Used only by findMaxSaturation.
function oklabSatProbe(S, a, b) {
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
    const [r, g, bc] = oklabSatProbe(mid, a, b);
    if (Math.min(r, g, bc) >= 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

function oklchCuspRaw(hue) {
  const hRad = hue * Math.PI / 180;
  const a = Math.cos(hRad);
  const b = Math.sin(hRad);
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

function smoothLut(lut, sigma) {
  const n = lut.length;
  const half = Math.ceil(3 * sigma);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0, b = 0, wSum = 0;
    for (let j = -half; j <= half; j++) {
      const w = Math.exp(-(j * j) / (2 * sigma * sigma));
      const k = ((i + j) % (n - 1) + (n - 1)) % (n - 1);
      a += lut[k][0] * w;
      b += lut[k][1] * w;
      wSum += w;
    }
    out[i] = [a / wSum, b / wSum];
  }
  return out;
}

const OKLCH_CUSP = (() => {
  const lut = new Array(361);
  for (let h = 0; h <= 360; h++) lut[h] = oklchCuspRaw(h);
  return smoothLut(lut, 5);
})();

// Eased barycentric — applies per-axis easing then renormalises.
// Matches the designer's easeBary exactly.
function easedBary(w, b, c, curves, magnitude) {
  const m = magnitude;
  const gW = Math.pow(m, -(curves.tint  || 0));
  const gB = Math.pow(m, -(curves.shade || 0));
  const gC = Math.pow(m, -(curves.pure  || 0));
  let wE = Math.pow(Math.max(0, w), gW);
  let bE = Math.pow(Math.max(0, b), gB);
  let cE = Math.pow(Math.max(0, c), gC);
  const sum = wE + bE + cE;
  if (sum > 1e-9) { wE /= sum; bE /= sum; cE /= sum; }
  return [wE, bE, cE];
}

// OKLCH atBary (eased): returns [L, C, hue] in OKLCH coords.
function oklchAtBary(hue, w, c) {
  const h = ((hue % 360) + 360) % 360;
  const [Lp, Cp] = OKLCH_CUSP[Math.round(h)];
  return [w + c * Lp, c * Cp, h];
}

function linearToSrgb(x) {
  const v = Math.max(0, Math.min(1, x));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function rgbToHex(r, g, b) {
  const toHex = v =>
    Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// Full pipeline: hue + eased barycentric → sRGB hex.
function hexFromBary(hue, w, b, c, curves, magnitude) {
  const [wE, , cE] = easedBary(w, b, c, curves, magnitude);
  const [L, C, h] = oklchAtBary(hue, wE, cE);
  const [rL, gL, bL] = oklchToLinearRgb(L, C, h);
  return rgbToHex(linearToSrgb(rL), linearToSrgb(gL), linearToSrgb(bL));
}

// ─── Arc geometry (ported from color-triangle.html) ─────────────
function arcBary(t, peak) {
  const alpha = 2 - peak;
  const u = Math.abs(2 * t - 1);
  const c = peak * (1 - Math.pow(u, alpha));
  const w0 = (1 - peak) * t       + peak * Math.max(0, 2 * t - 1);
  const b0 = (1 - peak) * (1 - t) + peak * Math.max(0, 1 - 2 * t);
  const denom = w0 + b0;
  const scale = denom > 1e-10 ? (1 - c) / denom : 0;
  return [w0 * scale, b0 * scale, c];
}

function arcSamples(peak, stops) {
  const segs = 400;
  const pts = [];
  let len = 0;
  let prev = arcBary(0, peak);
  pts.push({ t: 0, s: 0, bary: prev });
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const cur = arcBary(t, peak);
    len += Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
    pts.push({ t, s: len, bary: cur });
    prev = cur;
  }
  const out = [];
  const divisor = Math.max(1, stops - 1);
  for (let i = 0; i < stops; i++) {
    const target = (i / divisor) * len;
    let j = 0;
    while (j < pts.length - 1 && pts[j + 1].s < target) j++;
    const a = pts[j], b = pts[Math.min(j + 1, pts.length - 1)];
    const frac = (b.s - a.s) > 0 ? (target - a.s) / (b.s - a.s) : 0;
    const t = a.t + (b.t - a.t) * frac;
    out.push({ t, bary: arcBary(t, peak) });
  }
  return out;
}

// ─── Naming helpers ────────────────────────────────────────────
// "00", "10", ... "100" — zero-pad single digits but not 100.
export function pctLabel(n) {
  const v = Math.round(n);
  return v < 10 ? "0" + v : String(v);
}

export function hueKey(angle) {
  return "h" + String(Math.round(angle)).padStart(3, "0");
}

// Arc stop suffix: c{peakPct}-{stepPct}.
export function arcSuffix(peakPct, stepPct) {
  return `c${pctLabel(peakPct)}-${pctLabel(stepPct)}`;
}
// Grid stop suffix: c{kPct}-l{iPct}  (c-l scheme; TODO: wb / num).
export function gridSuffix(kPct, iPct) {
  return `c${pctLabel(kPct)}-l${pctLabel(iPct)}`;
}

// Swap suffixes for dark-mode lookup (W ↔ B).
export function arcSuffixSwap(suffix) {
  const [cPart, stepPart] = suffix.split("-");
  return `${cPart}-${pctLabel(100 - Number(stepPart))}`;
}
export function gridSuffixSwap(suffix) {
  const [cPart, lPart] = suffix.split("-");
  const kPct = Number(cPart.slice(1));
  const iPct = Number(lPart.slice(1));
  return `c${pctLabel(kPct)}-l${pctLabel(100 - iPct - kPct)}`;
}

// Nearest-match: snap a desired percentage value to the closest one
// the candidate actually has. Used when the role map names a stop
// at e.g. 10% increments but the candidate only enumerates 20%.
export function nearestPct(target, available) {
  let best = available[0], bestD = Infinity;
  for (const a of available) {
    const d = Math.abs(a - target);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

export function nearestArcSuffix(suffix, meta) {
  const [cPart, stepPart] = suffix.split("-");
  const peakPct = Number(cPart.slice(1));
  const stepPct = Number(stepPart);
  return arcSuffix(
    nearestPct(peakPct, meta.peakPcts),
    nearestPct(stepPct, meta.stepPcts),
  );
}

export function nearestGridSuffix(suffix, meta) {
  const [cPart, lPart] = suffix.split("-");
  const kPct = Number(cPart.slice(1));
  const iPct = Number(lPart.slice(1));
  // Snap k first, then snap i within the constraint i + k ≤ 100.
  const k = nearestPct(kPct, meta.kPcts);
  const validI = meta.iPcts.filter(v => v + k <= 100);
  const i = nearestPct(iPct, validI.length ? validI : [0]);
  return gridSuffix(k, i);
}

// ─── System export — enumerate every stop at every hue ──────────
// Returns { meta, stops } where stops is a flat dict:
//   { "h180 c80-40": "#2ea292", ... }
export function exportArcSystem({
  space = "oklch",
  hueCount = 24,
  N,                 // stops per arc
  arcs,              // arc count
  curves = { tint: 0, shade: 0, pure: 0, magnitude: 2 },
}) {
  const stops = {};
  for (let h = 0; h < hueCount; h++) {
    const hue = (h * 360) / hueCount;
    const hk = hueKey(hue);
    for (let a = 0; a < arcs; a++) {
      const peak = arcs > 1 ? a / (arcs - 1) : 0;
      const peakPct = Math.round(peak * 100);
      const samples = arcSamples(peak, N);
      for (let j = 0; j < N; j++) {
        const stepPct = N > 1 ? Math.round((j / (N - 1)) * 100) : 0;
        const [w, b, c] = samples[j].bary;
        stops[`${hk} ${arcSuffix(peakPct, stepPct)}`] =
          hexFromBary(hue, w, b, c, curves, curves.magnitude ?? 2);
      }
    }
  }
  const peakPcts = Array.from({ length: arcs }, (_, a) =>
    Math.round((arcs > 1 ? a / (arcs - 1) : 0) * 100));
  const stepPcts = Array.from({ length: N }, (_, j) =>
    Math.round((N > 1 ? j / (N - 1) : 0) * 100));
  return {
    meta: { model: "tonalarc", space, hueCount, N, arcs, curves, peakPcts, stepPcts },
    stops,
  };
}

export function exportGridSystem({
  space = "oklch",
  hueCount = 24,
  N,                 // grid resolution
  scheme = "cl",
  curves = { tint: 0, shade: 0, pure: 0, magnitude: 2 },
}) {
  const stops = {};
  for (let h = 0; h < hueCount; h++) {
    const hue = (h * 360) / hueCount;
    const hk = hueKey(hue);
    for (let k = 0; k <= N; k++) {
      const kPct = Math.round((k / N) * 100);
      for (let i = 0; i + k <= N; i++) {
        const iPct = Math.round((i / N) * 100);
        const j = N - i - k;
        const w = i / N, b = j / N, c = k / N;
        stops[`${hk} ${gridSuffix(kPct, iPct)}`] =
          hexFromBary(hue, w, b, c, curves, curves.magnitude ?? 2);
      }
    }
  }
  const kPcts = Array.from({ length: N + 1 }, (_, k) => Math.round((k / N) * 100));
  const iPcts = Array.from({ length: N + 1 }, (_, i) => Math.round((i / N) * 100));
  return {
    meta: { model: "tonalgrid", space, hueCount, N, scheme, curves, kPcts, iPcts },
    stops,
  };
}
