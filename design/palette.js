// Minimal OKLCH-triangle helpers extracted from color-triangle.html.
// Exposes enough to take a grid (i, k) coordinate at resolution N and
// render it as an oklch() CSS color for a given hue.

// ─── OKLab / OKLCH math ──────────────────────────────────────────
function oklabUnitToLinearRgb(L, a, b) {
  const l_ = L + a *  0.3963377774 + b *  0.2158037573;
  const m_ = L + a * -0.1055613458 + b * -0.0638541728;
  const s_ = L + a * -0.0894841775 + b * -1.2914855480;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
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

// ─── Grid + barycentric + color-emission ─────────────────────────

// Grid (i, k) at resolution N → barycentric (w, b, c). j = N - i - k.
//   w = i/N  (tint / white fraction)
//   b = j/N  (shade / black fraction)
//   c = k/N  (pure-color fraction)
// Valid cells satisfy i + k <= N.
export function gridToBary(i, k, N) {
  const j = N - i - k;
  return { w: i / N, b: j / N, c: k / N };
}

// Inverse on the light ↔ dark mirror (swap w and b, keep c).
// Grid form: dark(i, k) == light(N - i - k, k).
export function invertGrid(i, k, N) {
  return { i: N - i - k, k };
}

// OKLCH barycentric evaluation. Returns {L, C, hue} in OKLCH.
export function oklchAtBary(hue, w, c) {
  const h = ((hue % 360) + 360) % 360;
  const [Lp, Cp] = OKLCH_CUSP[Math.round(h)];
  return { L: w + c * Lp, C: c * Cp, hue: h };
}

// Emit a CSS `oklch()` color, optionally with an alpha channel.
export function oklchCss({ L, C, hue }, alpha) {
  const core = `${(L * 100).toFixed(2)}% ${C.toFixed(4)} ${hue.toFixed(1)}`;
  return alpha == null || alpha >= 1
    ? `oklch(${core})`
    : `oklch(${core} / ${alpha.toFixed(3)})`;
}

// Compose everything: grid (i, k) at N + hue → CSS string.
export function cssAtGrid({ i, k, N, hue, alpha }) {
  const { w, c } = gridToBary(i, k, N);
  return oklchCss(oklchAtBary(hue, w, c), alpha);
}

// Dark-mode variant: swap W and B (which is swapping i and j), keep k.
export function cssAtGridDark({ i, k, N, hue, alpha }) {
  const { i: iD, k: kD } = invertGrid(i, k, N);
  return cssAtGrid({ i: iD, k: kD, N, hue, alpha });
}
