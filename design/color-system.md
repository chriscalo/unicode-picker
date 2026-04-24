# Color system — direction doc

Working document for evolving how we reason about color in this app.
This is a **handoff / orientation doc** for a fresh agent joining
mid-flight. Read the Quick Start first, then the current-state
inventory, then drop into whichever area the next task touches.

---

## 1. Quick start

### Repo context
- App is a Unicode Picker web component.
- `style.css` holds the production color tokens (2-scale, 12-step
  OKLCH system). That's the runtime palette.
- **`design/color-triangle.html` is the Color System Designer** —
  a single-page playground for prototyping the *next* color system.
  Not wired into the app. Served at `/design/color-triangle.html`.
- `design/index.html` is a separate, older design harness that
  mounts the real `<unicode-picker>`. Unrelated to the designer.

### Spin it up
- `vite` is expected to be running on `localhost:5173` (the user
  keeps it running). If not, start it from the repo root with the
  existing dev script.
- Visit `http://localhost:5173/design/color-triangle.html`.

### Screenshot-driven verification
There are Playwright helpers in `test/_*.mjs` (`_` = scratch,
local-only). Key ones:
- `node test/_triangle-shot.mjs` → full 1400×900 viewport shot at
  `/tmp/color-triangle.png`.
- `node test/_sec-zoom.mjs` → four individual tile shots at
  `/tmp/sec-{1..4}.png`.
- `node test/_spaces-shot.mjs` → full-page shot in each of the 8
  color spaces at `/tmp/space-{space}.png`.
- `node test/_fit-check.mjs` → dumps bounding-rect and scroll
  dimensions of every section to confirm no overflow.
- `node test/_ease-check.mjs`, `_peer-hover-check.mjs`,
  `_arc-peer-check.mjs`, `_quant-drag-check.mjs`, etc. — targeted
  regression scripts for specific features.
- `node test/_cusp-delta.mjs` → numeric walk of the OKLCH cusp
  measuring per-degree ΔE. Use this any time the ring looks jagged.

When changing anything visual, run the relevant screenshot test
and read the PNG before declaring done. The user has burned us on
"not checking work" before.

---

## 2. What the designer is for

Goal: pin down a color system with these properties —

1. A hue wheel quantized into K slices.
2. Per hue, a 2-D space that mixes **tint** (hue + white), **shade**
   (hue + black), and **tone** (hue + grey) plus pure hue.
3. A quantization strategy that names every cell with a consistent,
   human-readable label across hues.
4. A chosen color space that produces pleasing, perceptually-even
   scales.

The workbench lets you dial all of those in and see each facet at
once. Four tiles, all driven from a single shared `state` object.

---

## 3. Tile layout (2 × 2 quadrants, 100dvh, no page scroll)

```
┌──────────────────────────┬──────────────────────────┐
│ Continuous Color Picker  │ Tonal Arc Scales         │
│ (ring + triangle)        │ (fixed painter's tri +   │
│                          │  arc ramps on the right) │
├──────────────────────────┼──────────────────────────┤
│ Quantized Color Picker   │ Tonal Grid Scale         │
│ (ring + triangle +       │ (flat 2D grid of the     │
│  ternary-grid dots)      │  same ternary cells)     │
└──────────────────────────┴──────────────────────────┘
```

Tiles 3 and 4 **show the same data** (the ternary grid at
resolution N at the current hue), just laid out differently — dots
on the triangle vs. a rectangular labelled grid. Hovering a cell
in one highlights the matching cell in the other (see §7).

### Naming convention in the tiles
Uses proper color-theory terms throughout:
- **pure hue** — the C corner of the barycentric triangle.
- **tint** = hue + white — W corner.
- **shade** = hue + black — B corner.
- **tone** = hue + grey — any interior point.

---

## 4. Shared state (`const state = {...}`)

Everything tile-level reads from one object. Key fields:

```js
{
  space:    "oklch",       // one of 8 spaces, see §6
  hue:      180,           // 0..360°
  nHues:    24,            // quantized hue steps in tile 3
  N:        10,            // ternary resolution; tiles 3 + 4 share this
  arcN:     11,            // arc stop count per arc (tile 2)
  arcCount: 11,            // number of arcs in tile 2
  scheme:   "nbw",         // locked-in grid naming: "00b-00w"
  picker:   { w, b, geo }, // tile 1 continuous pick state
  quant:    { i, k, geo }, // tile 3 selected cell indices
  curves:   { <space>: { wb, bc, wc } }, // per-space per-edge curves
                           // each: { xs: [...], ys: [...] } knot list
}
```

### Per-control ownership
| Control | Lives in |
|---|---|
| Color space seg | header (global) |
| Tint / Shade / Pure curve editors (W↔B, B↔C, W↔C) | header (per-space, per-edge; §10) |
| Hue steps seg | tile 3 (Quantized Color Picker) |
| Ternary N seg | tile 4 (Tonal Grid Scale) — shared with tile 3 |
| Arc N seg + Arcs seg | tile 2 (Tonal Arc Scales) |
| Scale-quality score pills | tile 2 + tile 4 section heads (§13) |

Hue itself has no slider — tile 1 and tile 3 rings *are* the hue
picker.

---

## 5. Architecture — key files / functions

All lives in `design/color-triangle.html`. The `<script type=module>`
starts ~line 600. Roughly top-to-bottom:

1. **`state`** (§4).
2. **Curve helpers** (§10): `getCurves`, `precomputeCurve`,
   `evalPrecomputed`, `edgeRemap`, `atBaryEased`. Each edge curve
   is a cubic-Hermite remap of a 1-D edge parameter; `edgeRemap`
   applies the three curves as signed deltas on barycentric coords
   and renormalises to the simplex. Hot `paintBody` loop inlines
   the same math to avoid per-pixel function overhead.
3. **Score helpers** (§13): `srgbToOklab`, `deltaE_OKLab`,
   `scoreScale`, `scoreGrid`, `scoreArcSet`, `scoreGamutReach`,
   `combineScore`. Called from `renderGrid` and `renderArcs` after
   every paint; result drives the score pills in each tile's head.
4. **`quantizeHue`, `hueNameAt`** — hue snap + per-space color-name
   lookup (labels for the hue-step dots in tile 3).
5. **Color-space math** — one section per space. Each ends up
   exposing at least `<space>ToLinearRgb(...)`.
6. **Cusp LUTs**, smoothed with a σ=5° Gaussian to round off the
   real sRGB-gamut cube-corner kink at ~265° (see §9):
   - `OKLCH_CUSP` (raw + smoothed) — built once at load.
   - `HSLUV_CUSP_L`, `HPLUV_CUSP_L_RAW`, `LCHAB_CUSP`, `JZ_CUSP` —
     same pattern, per space.
7. **`STRATEGIES`** — one entry per space with `{ label, ringAt,
   atBary, readout }`. `strat()` resolves the active one from
   `state.space`.
8. **Geometry** — `geometry()` returns
   `{ cx, cy, ringInner, ringOuter, triR, verts }` with all layout
   constants scaled to canvas width (so the 2× ring canvas and 1×
   body canvas agree on where the ring band sits).
   - `flipped: true` swaps W and B angles (tile 2's painter's
     triangle: C at top, B bottom-left, W bottom-right).
   - `cyShift` nudges the triangle centroid down so its bbox is
     vertically centred in the stage.
9. **Paint** — `paintRing` (once per tile at load, using each
   strategy's `ringAt`); `paintBody` (per-hue repaint, with inline
   `edgeRemap`). Each tile has its own body canvas and is
   CSS-rotated by `-state.hue` for the ring tiles. Tile 2 is NOT
   rotated (fixed orientation).
10. **Section renderers**:
    - Tile 1 (`repaintPicker`, `updatePickerCursors`,
      `updatePickerReadout`).
    - Tile 2 (`renderArcs` — draws the triangle, SVG arc paths, and
      both HTML dots + ramp swatches; also wires the tile-2 peer
      hover; calls `scoreArcSet` and paints the score pill).
    - Tile 3 (`repaintQuant`, `renderQuantDots`, `updateQuantReadout`;
      includes `snapToNearestQuantDot` for drag-snap).
    - Tile 4 (`renderGrid` — flat CSS grid; also wires the tile
      3↔4 peer hover; calls `scoreGrid` and paints the score pill).
11. **Drag plumbing** — `attachDrag(stage, canvas, picker, hooks,
    dragKey)` for tile 1; tile 3 has its own inline pointerdown
    handler (slightly different hitTest — ring + triangle drag-snap).
12. **rAF-throttled dispatch + `activeDrag` flag** — during a ring
    drag, `onHueChanged()` only repaints the dragged tile; the
    other three tiles are deferred via `requestIdleCallback` and
    refreshed on `onDragEnd()`.
13. **Controls wiring** — one `document.querySelectorAll(...)` per
    seg / control, plus `setSegActive()` to paint the pressed state.

---

## 6. Color spaces

All eight go through the same `STRATEGIES` abstraction.

| Seg | Strategy | Notes |
|---|---|---|
| HWB ★ | `hwb` | **User-preferred** candidate. CSS-native `hwb()`; sRGB-HSV based. No cusp needed. |
| OKLCH ★ | `oklch` | **User-preferred** candidate. Björn Ottosson's OKLab. Ring + triangle use `OKLCH_CUSP` (smoothed). Default. |
| OKHSL | `okhsl` | OKLab-based HSL (ok_color.h). Uses `okhslCuspAtHue(hue)` which reads the OKLCH smoothed LUT — that's how we killed the 265° kink on OKHSL/OKHSV rings. |
| OKHSV ★ | `okhsv` | **User-preferred** candidate. OKLab-based HSV. Uses Björn's full toe + gamut-scale pipeline (ok_color.h). Was broken for weeks — the toe step is not the identity. |
| LCh(ab) | `lchab` | Classic CIE 1976 L*a*b* → LCh. D65 white, 6/29 split f. |
| Jzazbz | `jzazbz` | Safdar et al. 2017. **White Jz computed from sRGB D65 forward** — on normalised XYZ it's ~0.046, not the HDR 0.22. Cusp iteration scales to that. |
| HSLuv | `hsluv` | alexeiboronine CIELUV-based HSL. User called this one "muddy and gross, completely unusable." |
| HPLuv | `hpluv` | HSLuv's pastel-only sibling — hue-independent chroma ceiling. |

★ = preferred candidates for the final shipping space. Prioritise
side-by-side comparison work on HWB, OKLCH, and OKHSV.

Still open (per §8 TODO): **HCT** (Google Material CAM16-UCS).

---

## 7. Cross-tile peer hover

Two independent correlation systems:

- `setPeerHover(i, k)` — tile 3 ↔ tile 4. Every cell carries
  `data-cell-i` / `data-cell-k`; hover toggles
  `[data-peer-hover]` on all matches. Also driven by
  `snapToNearestQuantDot()` so drag-through in tile 3 keeps the
  tile 4 highlight in sync.
- `setArcPeerHover(a, j)` — tile 2 triangle dots ↔ ramp swatches.
  `data-arc-a` / `data-arc-j`, `[data-arc-peer-hover]`.

Selectors share one CSS block with two alternative attributes.

---

## 8. Performance — 60fps ring drag

`onHueChanged()` behaviour depends on `activeDrag`:
- `null` → full 4-tile repaint.
- `"picker"` → only tile 1 + `requestIdleCallback(refreshIdleTiles)`.
- `"quant"` → only tile 3 + same idle-queue.

`onDragEnd()` (called from the pointerup handlers on rings) clears
`activeDrag` and forces a full 4-tile repaint so everything
catches up.

This is what let Jzazbz and LCh(ab) — the slowest spaces — still
drag smoothly.

---

## 9. The 265° cube-corner kink (important)

sRGB gamut projected into OKLab has a cube corner that the cusp
path wraps around. Raw cusp at 264°→265° in OKLCH shows a
ΔE spike 7.9× the mean (`test/_cusp-delta.mjs` confirms). We don't
"fix" the geometry; we **Gaussian-smooth the cusp LUT with σ=5°**
and render from the smoothed table. Mean chroma is preserved
(0.221 → 0.221) while the ratio drops to ~2.6×.

Same pattern applied to `LCHAB_CUSP`, `JZ_CUSP`, and
`HSLUV_CUSP_L`. HPLuv's chroma is hue-independent so the issue
doesn't appear.

**Do not switch to raw cusps without replicating the smoothing** —
you'll re-introduce the visible jolt.

---

## 10. Per-edge curve controls (most recent)

Three 2-D curve editors in the header — **Tint (W↔B)**,
**Shade (B↔C)**, **Pure (W↔C)** — one per triangle edge, plus an
edge-color strip underneath each editor that shows the edge blend
live.

Each editor hosts an arbitrary-length list of knots (default: two
endpoints at `(0,0)` and `(1,1)` — identity). Interactions:
- click empty area → insert a knot there and start dragging it
- drag a knot → 2-D move (x and y), clamped so neighbours can't
  cross (small `CURVE_MIN_GAP`)
- double-click a knot → remove it (endpoints can't be removed)
- the two endpoints are themselves draggable; the editor renders
  a padded margin so they can be pulled outside the `[0,1]` box
  (Levels-style black / white-point moves)
- the `reset` button per editor → back to identity

Knots are stored per color space in `state.curves[space] = {wb, bc, wc}`,
each `{ xs: [...], ys: [...] }`, and persisted to
`localStorage` under `colorTriangle:curves:v2` so both the
standalone designer and the studio-embedded iframe share state.

### Curve math

Between knots: cubic Hermite with finite-difference slopes; output
clamped to `[0, 1]`. Below the first knot's x or above the last,
output flat-clamps to that knot's y (matches photo-editing Levels
semantics and keeps the renderer stable).

### How curves are applied to the triangle (edge-delta composition)

Each curve is a **1-D remap** of position along its edge. For a
point `(w, b, c)` interior to the triangle we evaluate each curve
at the corresponding pairwise ratio and apply its **delta**
directly to the barycentric coordinates:

```
W↔B curve: t = b / (w + b); Δ = curve_wb(t) − t
  → b += Δ * (w+b);  w -= Δ * (w+b)
B↔C curve: t = c / (b + c); Δ = curve_bc(t) − t
  → c += Δ * (b+c);  b -= Δ * (b+c)
W↔C curve: t = c / (w + c); Δ = curve_wc(t) − t
  → c += Δ * (w+c);  w -= Δ * (w+c)
```

The three deltas sum to zero by construction so the simplex sum
stays at 1. On an edge, the two off-edge curves land on locked
endpoints (t = 0 or 1) and contribute zero; the on-edge curve
contributes its full remap. Corners are preserved for the same
reason. Interior points see all three edge remaps blended
smoothly — each scaled by the joint mass of the two corners it
spans, which fades naturally as you approach the opposite corner.

`edgeRemap(w, b, c, curves)` is the reference implementation; the
hot `paintBody` loop inlines it for speed. The three edge strips
under each editor visualise the corresponding edge at the current
hue so every curve tweak is immediately legible.

---

## 11. Known TODOs / loose threads

### Headline design questions (open)

1. **Tonal arc scales vs tonal grid scales — which works better
   for UI?** Both express the same colors; the question is purely
   ease of use for designers when authoring role maps and reasoning
   about palette tweaks. **Tentative: grid**, because direct
   `(b, w)` addressability matches the movement vocabulary
   ("toward white / black / pure") and the canonical 2D map is
   easier to hold in your head than a family of 1D arcs. Not yet
   committed; needs side-by-side use in the studio.

2. **Which color space produces the most versatile and useful
   color scales?** Six remain after dropping HSLuv/HPLuv (too
   low-chroma for accents): **HWB ★**, **OKLCH ★**, OKHSL,
   **OKHSV ★**, LCh(ab), Jzazbz. **User-preferred finalists: HWB,
   OKLCH, OKHSV** — start comparisons with those three. **Open.**
   Test: same model + role map across one candidate per space,
   compare side-by-side in the studio.

3. **How to fine-tune the blending between pure, white, and black
   so scales feel perceptually uniform?** Diagnosed (see
   `test/_uniformity-diagnostic.mjs`): the triangle in OKLab is
   not equilateral — at most hues the cusp's L is close to white,
   so steps toward black are ~5× the perceptual distance of steps
   toward white. **Big step forward shipped**: the per-edge curve
   model (§10) lets the designer directly sculpt the pace of each
   edge's transition; interior points blend the three edge deltas.
   The earlier "ΔE-equal triangle" pre-transform (α=0.25) is still
   available but the curves subsume most of that job.

---

### Task A — Scale-quality score (see §13)

Status: **v1 shipped.** Pills live on tiles 2 and 4 and update on
every curve / hue / space / N change. Full detail is in §13;
summary only here.

What the v1 measures, per tile — all four in `[0, 100]`, higher
= better:

- `Quality` — unweighted mean of the three sub-scores below.
- `Distinct` — `100 · (1 − nearIdentical / pairCount)`.
- `Smooth`   — `100 · (1 − min(1, meanCV / SCORE_CV_CEILING))`.
- `Reach`    — `100 · min(1, chromaC / SCORE_REFERENCE_CHROMA)`.

Distance metric is Euclidean ΔE in **OKLrab** (Ottosson 2023), a
perceptual-lightness refinement of OKLab. See §13.2 for why.

**Remaining open questions (tracked in §13.6):**
- Calibration: τ, `SCORE_CV_CEILING`, and the "95+ excellent /
  85+ ship-worthy / …" thresholds are all tentative until a
  labelled corpus of "good" / "bad" scales confirms them.
- Weighted (vs. unweighted) mean for Quality — currently equal
  weight; a small UI for per-sub-score weights is aspirational.
- Studio-side roll-up across all 24 quantized hues isn't wired
  yet — right now the pill is per-hue. Add an aggregate for the
  studio gallery later.
- Worst-pair highlight on the actual swatches (not just the pill)
  is aspirational.

### Task B — Hue-name vocabulary (see §14)

**Motivation**: the designer's hue readout and the studio's
role-map tooltips currently use a 12-name coarse vocabulary
(red / orange / yellow / chartreuse / green / teal / cyan / blue /
indigo / violet / magenta / rose). Finer names (lime vs hunter vs
forest; lemon vs mango vs banana; coral vs salmon; lavender vs
mauve) would make palette authoring readable.

**Non-negotiable constraint**: **names MUST be keyed by the pure
color's absolute sRGB hex value** (or equivalently linear sRGB),
not by color-space hue angle. OKLCH 180°, HSLuv 180°, and LCh(ab)
180° are different colors; a name table keyed on angle would be
wrong in five of the six spaces.

**Lookup signature**: `hueNameFromSrgbHex(hex: string) → string`.
For each space, resolve the pure-corner sRGB at the given hue
angle, then hand that hex to the lookup.

**Candidate datasets / approaches** (research open):
- **xkcd color survey** — 954 curated names from a 222k-response
  survey; CC0 / public domain. Probably best single source.
- **CSS named colors** (148) — coarse but lingua-franca.
- **NBS/ISCC color-name dictionary** — boundaries over CIELAB;
  dated but systematic.
- **Material Design hue labels** (red / pink / purple / deep-purple /
  indigo / blue / light-blue / cyan / teal / green / light-green /
  lime / yellow / amber / orange / deep-orange / brown) — useful
  as a design-vocabulary baseline.
- **xkcd + tie-break** — xkcd for primary name, CSS for
  fallback when confidence is low.
- **Cluster-based generation** — collapse a corpus of named
  sRGB points into regions of OKLab space; pick the modal name
  per region. Risk: modal names can be dataset-biased.

**Algorithm**:
1. Pick a dataset (or merge).
2. For every 1° of pure-hue sample, compute sRGB at the C corner
   in a chosen reference space (e.g. HWB, which is CSS-native for
   pure hues).
3. Nearest-neighbour in OKLab against the dataset entries; return
   that name.
4. Optional: post-process to deduplicate adjacent angles that map
   to the same name.

**Output target**: single function in `color-triangle.html`, plus
a precomputed 360-entry table baked into the file so there's no
runtime lookup cost. Studio iframes reuse it via postMessage.

**Open questions**:
- At what granularity does naming stop carrying information?
  (Is "tealish-blue" useful or just noise?)
- How to handle muddy / desaturated points? (These aren't "pure"
  hues so they probably don't need names, but the studio might
  want names on non-pure stops too.)
- Should the table expose hue-family + modifier separately
  (family = "green", modifier = "lime") so consumers can combine?

---

### Other open items (aspirational)
- Add **HCT** (CAM16-UCS). ~300+ lines of math; haven't prioritised.
- Replace the current 12-step token scale in `style.css` with the
  winning designer output once we commit to a scheme.

### Deferred but resolved in spirit
- OKHSL/OKHSV: **done and both cleaned up.** OKHSV had a bad port
  (toeInv(toe(x)) is the identity) that the user caught.
- Hue-angle names per color space: **done** via `HUE_ANCHORS`.
- Drag-snap in tile 3: **done**.
- Peer hover in tiles 2 and 3/4: **done**.
- Filled loupes: **done** — every dot / cursor / swatch paints the
  exact color it represents.
- Tooltips: **done** as CSS `::after` on `.info` with
  `data-tooltip`. Info icon is a filled white circle with an
  upright monospaced lowercase `i` (not italic, line-height 16px
  vertically centres the glyph).

### Cosmetic / future polish
- Ramp-swatch text contrast flips on `luma > 0.55`; fine in
  practice but not always great on extremely saturated mid-range
  colors.

---

## 12. Where to look when you need…

- *"why is there an 265° kink?"* — §9 + `test/_cusp-delta.mjs`.
- *"why is OKHSV washed out at some hues?"* — historical bug in
  the port; search for `okhsvToLinearRgb` and compare against
  Björn's `ok_color.h` (it does NOT use `toeInv(toe(x))`).
- *"how do peer-hover links work?"* — §7, `setPeerHover`,
  `setArcPeerHover`, `data-cell-i / -k`, `data-arc-a / -j`.
- *"how does the quant picker drag-snap?"* — `snapToNearestQuantDot`
  iterates all `(i, k)` grid cells by screen distance.
- *"why does tile 2 look different from the others?"* — it's the
  only tile with `flipped: true` geometry; the triangle is pinned
  (painter's triangle, C at top, B bottom-left, W bottom-right)
  and doesn't rotate with hue. The `cyShift` centres the bbox.
- *"fit-check fails / something overflows"* — `test/_fit-check.mjs`.
  Sections are `overflow: visible` so tooltips escape, but grid
  rows need `minmax(0, 1fr)` so they actually shrink to fit. Every
  trouble spot so far has been a missing `minmax(0, ...)` or a
  rogue `aspect-ratio: 1`.

---

## 13. Task A detail — scale-quality score

Status: **v1 shipped.** Lives in `design/color-triangle.html`
alongside the other render helpers. Score pills in the tile 2 and
tile 4 section heads update on every render.

### 13.1 Goals — why we measure

The per-edge curves (§10) let you sculpt how each triangle edge
paces its transition. Before the score existed, "is this better?"
was a visual judgment — fine for an A vs. B but terrible for
A/B/C/D comparison, for tuning curve weights, or for deciding
which color space to ship. The score turns the question into a
number that updates live as you drag a knot.

Three qualities we care about in any scale. Each is expressed as
a 0-to-100 sub-score (higher = better) against an explicit
ceiling, so the number reads as "how close to perfect":

1. **Distinct (100 = every slot pulls its weight).** Adjacent
   swatches that look identical are duplicates dressed up as
   variety — they waste a name in the role map and make the
   scale feel padded. `100 · (1 − nearIdentical / pairCount)`:
   100 means zero near-identical pairs, 0 means every adjacent
   pair is a duplicate.
2. **Smooth (100 = perfectly even pacing).** If the jump from
   `c50` to `c60` is twice the jump from `c60` to `c70`, the
   scale reads as broken even when every step is distinguishable.
   `100 · (1 − min(1, meanCV / CV_CEILING))`: 100 means the
   adjacent-pair ΔEs all match their mean; 0 means CV hit
   `SCORE_CV_CEILING` (stddev half the mean — clearly uneven).
3. **Reach (100 = saturated pure corner).** A scale that's
   technically even but sits in a muddy low-chroma band (HPLuv
   at most hues) isn't useful for UI — the pure corner is
   supposed to be the *pure* corner. `100 · min(1, chromaC /
   SCORE_REFERENCE_CHROMA)`: 100 means the pure-corner chroma
   hits the p95 of what sRGB can reach, 0 means pure-corner is
   on the L axis.

Combined **Quality** is the unweighted mean of the three.
Everything is bounded `[0, 100]`, so the pill reads like a grade
rather than an abstract score: higher is better, and 100 has a
concrete meaning (hit every sub-ceiling).

Suggested threshold reading:

| Range | Read as |
|---|---|
| 95–100 | excellent |
| 85–95  | ship-worthy |
| 70–85  | workable, needs polish |
| 50–70  | rough |
| < 50   | broken |

These are calibration-TBD — the corpus check in §13.6 will tell
us whether they match human judgement. The ceilings
(`SCORE_CV_CEILING = 0.5`, `SCORE_REFERENCE_CHROMA = 0.22`) are
the only knobs once τ is fixed.

### 13.2 How — decomposition

**Distance metric — and why OKLrab.** The score only makes sense
if "close in the metric" means "looks close to a human". Every
sub-score collapses to arithmetic on adjacent ΔEs, so the choice
of ΔE *is* the choice of "what counts as a visible difference".

We use **Euclidean ΔE in OKLrab** (Ottosson 2023) — OKLab with
its lightness term `L` replaced by a perceptual-lightness estimator
`Lr`, so Euclidean distance tracks *perceived* lightness in the
dark region instead of the raw OKLab L. Every scale sample is
converted through sRGB → linear sRGB → OKLab → OKLrab, then
`ΔE = ||Lrab_b − Lrab_a||`. The a and b channels are unchanged
between OKLab and OKLrab, so chroma (`√(a²+b²)`) is identical —
OKLrab only re-paces the lightness axis.

Why not the obvious alternatives:

- **sRGB Euclidean** — flatly wrong. Equal byte-steps in sRGB
  correspond to wildly unequal perceived steps: a 10-unit jump in
  the blue channel is much less visible than a 10-unit jump in
  green. Scoring with sRGB distance would reward scales that
  carefully spaced their bytes and punish scales that carefully
  spaced their *colours*.
- **HSV / HSL Euclidean** — even worse, because hue is a cyclic
  axis and HSV doesn't model lightness perception at all.
- **CIELab Euclidean** — getting warmer, but CIELab (1976)
  underestimates differences in the blue/purple region. Fixing it
  requires CIEDE2000, whose full formula is hundreds of lines
  including hue-rotation and chroma-weighting terms. That's a lot
  of surface area for a score we want to call on every render.
- **HCT / CAM16-UCS** — decent, but 300+ lines of math and a
  bigger perceptual model than this problem needs.

OKLab (Björn Ottosson, 2020) was designed specifically so
Euclidean distance matches perceived distance across the whole
gamut, including the blue region CIELab gets wrong — at a
fraction of the code. No ΔE2000-style correction terms; just
vector math. OKLrab (2023) is Ottosson's own follow-up that fixes
OKLab's remaining lightness-uniformity weakness (OKLab's `L` is
mathematically convenient but a perceived "middle grey" does not
land at `L = 0.5`; `Lr` is derived so it does). Picking Lr over L
is ~10 lines of toe-function math and is unambiguously a better
fit for this job — we ship OKLrab, not OKLab.

Lr is computed from L as

```
k1 = 0.206, k2 = 0.03, k3 = (1 + k1) / (1 + k2) ≈ 1.17087
Lr = ½ · (k3·L − k1 + √((k3·L − k1)² + 4·k2·k3·L))
```

with `toe(0) = 0` and `toe(1) = 1`. The effect is mostly felt in
the dark region: adjacent-pair ΔEs near pure black get stretched,
exposing unevenness that raw OKLab was flattening. (Empirically,
moving from OKLab to OKLrab bumped the identity-curve grid's
`meanCV` from `0.00` to `0.04` at OKLCH hue 180, which is exactly
the kind of dark-region pacing the per-edge curves are meant to
sculpt.)

What "good enough" means, precisely. The score's job in this tool
is **directional** — "does dragging this knot make the scale
better or worse?" — not absolute psychophysical certification.
For directional feedback the metric only has to move in the right
direction when the scale changes; the differences we actually
care about (non-smooth scales, wasted slots, pure-corner
collapse) are much bigger than OKLrab's residual error.

OKLrab still is not perfect:

- **Near-neutrals.** The underlying OKLab fit used mostly
  chromatic stimuli (Munsell + IPT). Grey-axis pacing is improved
  by Lr but not guaranteed perfect.
- **Hue-direction bias.** Constant-Lr constant-C rings aren't
  exactly iso-perceptually-spaced; a small residual skew remains.
- **Phenomena no fixed-formula metric captures.** Helmholtz-
  Kohlrausch (chromatic colours look brighter than equal-luminance
  greys), Bezold-Brücke (hue appearance shifts with luminance),
  viewing-condition adaptation. These need CAM-class models.

Where "good enough" stops being good enough: *certifying* a
shipped palette against a human panel. No ΔE metric — including
CIEDE2000 or CAM16-UCS — agrees with untrained observers better
than roughly ±20%. For that we'd need a user study, not a formula.

The assumption we have not yet validated is that "moves in the
right direction" actually holds on this codebase. The §13.6
calibration bullet is the real check: hand-label a small corpus
of scales, assert the score ranks them as expected. If it
doesn't, the specific failure mode determines the upgrade.

**What about CAM16-UCS?** It's the next step up in sophistication
— a full color-appearance model with viewing-condition inputs —
and is what Material 3 / HCT build on. But sophisticated is not
the same as better for this job:

- On standard color-difference datasets (COMBVD and friends,
  scored with STRESS), OKLab performs *at or above* CIELab and
  within a percent or two of CAM16-UCS. For uniform spacing
  rather than difference prediction, the gap is smaller still.
- CAM16's theoretical advantages mostly live in scenarios we
  don't have: varying viewing conditions, HDR, dim-room
  adaptation, chromatic-contrast experiments.
- The cost ratio is brutal: OKLrab is ~10 lines over OKLab;
  CAM16-UCS is 300+ lines with a half-dozen viewing-condition
  parameters that *have to be set correctly* (get `La` or the
  surround factor wrong and your "more accurate" metric is less
  accurate than plain OKLab).

Don't switch based on theoretical priority. Switch only if
calibration shows OKLrab ranking scales wrong in a specific way
CAM16-UCS would fix. Until calibration exists, treat "good
enough" as a working assumption, not a proven claim.

Two other properties matter for *this* tool specifically:

1. **Space-independent.** We compare scales produced by six
   different color spaces (HWB / OKLCH / OKHSL / OKHSV / LCh(ab) /
   Jzazbz). The metric has to be neutral — otherwise a candidate
   in LCh(ab) would score differently from a candidate in OKLCH
   just because the ruler happened to match one of them. Measuring
   in OKLab keeps the ruler *outside* every candidate.
2. **It's what the curves already speak.** Three of our
   candidate spaces (OKLCH / OKHSL / OKHSV) are OKLab derivatives.
   The per-edge curves (§10) reshape paths through OKLab-adjacent
   space. A ΔE in OKLab is literally the length of those paths.

Scale of values: OKLab ΔE for "just noticeable" is ~0.01, "clearly
different" is ~0.05, "obvious step" is ~0.1. Our threshold
`SCORE_NEAR_IDENT_TAU = 0.01` sits at the JND. This is why it
looks nothing like the 0–100 range CIELab conditioned us to —
and why `τ = 2`, which I tried first, flagged *every* pair as
near-identical.

**Per-scale sub-scores.** For an ordered 1-D scale of N sRGB
colors, compute the N-1 adjacent ΔEs `d_0 … d_{N-2}`:

- *Near-identical count* — `count(d_i < τ)` where `τ = 0.01`
  (roughly the OKLab just-noticeable threshold).
- *Smoothness (CV)* — `stddev(d_i) / mean(d_i)`. Low = even paces.
- *End truncation* — for **arcs only**, the first and last pair
  are dropped before CV because every arc compresses toward pure
  black / white at the ends (unavoidable in every space). The
  near-identical count still uses the full range — a wasted slot
  near the end is still wasted.

**Grid aggregation.** The tonal grid is a triangular array with
`b_idx + w_idx ≤ N`. We walk it along three adjacency directions,
each producing a family of 1-D scales:

- *Rows* — fix `b_idx`, vary `w_idx`: 11 rows at `N=10`, lengths
  11 → 1, contributing 55 pairs.
- *Cols* — fix `w_idx`, vary `b_idx`: same count, **55 pairs**.
- *Diagonals* — fix `c_idx = N − i − j`, vary the white-vs-black
  split at that chroma: another **55 pairs**.

**165 pairs total** at `N=10`. Each sub-scale is scored
independently via `scoreScale`; the grid-level `meanCV` is the
arithmetic mean of every sub-scale's CV, and `nearIdentical` +
`pairCount` are summed across all sub-scales.

**Arc aggregation.** `arcCount` arcs × `arcN` stops per arc →
`arcCount × (arcN − 1)` adjacent pairs total (**110 at defaults**,
`11 × 10`). Each arc is scored via `scoreScale` with
`truncateEnds: true`, so CV sees `arcCount × (arcN − 3) = 88`
pairs; near-identical still sees all 110.

**Gamut reach.** Independent of any scale — a per-hue measurement
of how colorful the pure corner actually renders in the current
space.

- Render C in the active strategy: `atBary(hue, 0, 0, 1) → sRGB`.
- Convert to OKLab; `chromaC = √(a² + b²)`.
- Normalise: `reach_norm = min(1, chromaC / 0.22)` where `0.22`
  is an empirical p95 of chroma reachable in sRGB.
- Because W (1,0,0) and B (0,0,0) both sit on the L axis in
  OKLab, the user-described "W/B/C triangle area" reduces to
  `0.5 · chromaC` — chroma *is* the area measure we want.

**Combined Quality.** Three sub-scores, each in `[0, 100]`,
averaged:

```
distinctQ = 100 · (1 − nearIdentical / pairCount)
smoothQ   = 100 · (1 − min(1, meanCV / SCORE_CV_CEILING))
reachQ    = 100 · min(1, chromaC / SCORE_REFERENCE_CHROMA)
Quality   = (distinctQ + smoothQ + reachQ) / 3
```

All in `[0, 100]`. Higher = better. Sub-score ceilings have
concrete semantics (zero duplicates, CV at "clearly broken"
threshold, p95 sRGB chroma), so `Quality = 100` is a literal
statement — "hit every sub-ceiling" — not an arbitrary anchor.

Measured baseline (OKLCH identity curves, hue 180°):
- Grid: Quality 89, Distinct 100, Smooth 93, Reach 73.
- Arcs: Quality 66, Distinct 100, Smooth 26, Reach 73 — arcs
  sample a curved path through the triangle, so their
  adjacent-ΔEs have more natural variance than the grid.

Equal weighting is a choice, not a conclusion. Weight sliders
are in the §13.6 open-work list.

### 13.3 How — code (the shipped v1)

**Color-math helpers** (used by the score, written once):

```js
function srgbToLinear(c) {
  const cc = Math.max(0, Math.min(1, c));
  return cc <= 0.04045 ? cc / 12.92 : Math.pow((cc + 0.055) / 1.055, 2.4);
}

function linearRgbToOklab(r, g, b) {
  const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
  const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
  const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_,
  ];
}

function srgbToOklab(rgb) {
  return linearRgbToOklab(
    srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2]),
  );
}

function deltaE_OKLab(a, b) {
  const dL = a[0]-b[0], da = a[1]-b[1], db = a[2]-b[2];
  return Math.sqrt(dL*dL + da*da + db*db);
}
```

**Tuning knobs** (kept together so calibration is one edit):

```js
const SCORE_NEAR_IDENT_TAU = 0.01;      // OKLrab JND
const SCORE_REFERENCE_CHROMA = 0.22;    // p95 sRGB chroma → Reach 100
const SCORE_CV_CEILING = 0.5;           // CV here → Smooth 0
```

**Per-scale scoring** (single 1-D scale):

```js
function scoreScale(rgbs, { truncateEnds = false, isArc = false } = {}) {
  const labs = rgbs.map(srgbToOklab);
  const d = [];
  for (let i = 0; i < labs.length - 1; i++) {
    d.push(deltaE_OKLab(labs[i], labs[i + 1]));
  }
  if (d.length === 0) return { d: [], mean: 0, cv: 0,
    nearIdentical: 0, reversals: 0, worst: null };
  // Drop the leading / trailing pair for arcs — ends always compress.
  const useRange = truncateEnds && d.length > 2 ? d.slice(1, -1) : d;
  const mean = useRange.reduce((a, b) => a + b, 0) / useRange.length;
  let variance = 0;
  for (const x of useRange) variance += (x - mean) * (x - mean);
  variance /= useRange.length;
  const cv = mean > 1e-9 ? Math.sqrt(variance) / mean : 0;
  const nearIdentical = d.filter(x => x < SCORE_NEAR_IDENT_TAU).length;
  // worst-pair tracking (for future UI highlight)
  let worstIdx = 0, worstD = -1;
  for (let i = 0; i < d.length; i++)
    if (d[i] > worstD) { worstD = d[i]; worstIdx = i; }
  return { d, mean, cv, nearIdentical, reversals: 0,
    worst: { i: worstIdx, deltaE: worstD, reason: "max jump" } };
}
```

**Gamut reach** (per-hue, per-space):

```js
function scoreGamutReach(hue) {
  const s = strat();
  const rgb = s.atBary(hue, 0, 0, 1);   // C corner in sRGB
  const lab = srgbToOklab(rgb);
  const chromaC = Math.sqrt(lab[1]*lab[1] + lab[2]*lab[2]);
  return { chromaC, area: 0.5 * chromaC };
}
```

**Combine** — three sub-scores, each in `[0, 100]`:

```js
function combineScore({ cv, nearIdentical, pairCount, reach }) {
  const distinctQ = pairCount > 0
    ? 100 * (1 - nearIdentical / pairCount)
    : 100;
  const smoothQ   = 100 * (1 - Math.min(1, cv / SCORE_CV_CEILING));
  const reachQ    = 100 * Math.min(1,
    (reach.chromaC || 0) / SCORE_REFERENCE_CHROMA);
  const quality   = (distinctQ + smoothQ + reachQ) / 3;
  return { quality, distinctQ, smoothQ, reachQ };
}
```

**Grid roll-up** (rows, cols, diagonals) — spreads the
`combineScore` result fields into the return so callers can read
`result.quality / distinctQ / smoothQ / reachQ` directly:

```js
function scoreGrid(gridRgbs, N, { hue }) {
  const rows = [], cols = [], diag = [];

  // rows: fix b_idx, vary w_idx
  for (let j = 0; j <= N; j++) {
    const row = [];
    for (let i = 0; i <= N - j; i++) row.push(gridRgbs[j][i]);
    if (row.length >= 2) rows.push(scoreScale(row));
  }
  // cols: fix w_idx, vary b_idx
  for (let i = 0; i <= N; i++) {
    const col = [];
    for (let j = 0; j <= N - i; j++) col.push(gridRgbs[j][i]);
    if (col.length >= 2) cols.push(scoreScale(col));
  }
  // diagonals: fix c_idx (= i+j constant)
  for (let k = 0; k <= N; k++) {
    const line = [];
    for (let j = 0; j <= k; j++) {
      const i = k - j;
      if (i <= N && j <= N && gridRgbs[j][i]) line.push(gridRgbs[j][i]);
    }
    if (line.length >= 2) diag.push(scoreScale(line));
  }

  const all = [...rows, ...cols, ...diag];
  const meanCV = all.length
    ? all.reduce((s, r) => s + r.cv, 0) / all.length : 0;
  const nearIdentical = all.reduce((s, r) => s + r.nearIdentical, 0);
  const pairCount     = all.reduce((s, r) => s + r.d.length, 0);
  const reach = scoreGamutReach(hue);
  const q = combineScore({ cv: meanCV, nearIdentical, pairCount, reach });
  return { rows, cols, diag, meanCV, nearIdentical, pairCount,
    reach, ...q };
}
```

**Arc roll-up**:

```js
function scoreArcSet(arcRgbs, { hue }) {
  const perArc = arcRgbs.map(rgbs =>
    scoreScale(rgbs, { truncateEnds: true, isArc: true }));
  const meanCV = perArc.length
    ? perArc.reduce((s, r) => s + r.cv, 0) / perArc.length : 0;
  const nearIdentical = perArc.reduce((s, r) => s + r.nearIdentical, 0);
  const pairCount     = perArc.reduce((s, r) => s + r.d.length, 0);
  const reach = scoreGamutReach(hue);
  const q = combineScore({ cv: meanCV, nearIdentical, pairCount, reach });
  return { perArc, meanCV, nearIdentical, pairCount, reach, ...q };
}
```

**Pill rendering** (both tiles use the same helper; each field is
rounded to an integer `0..100`):

```js
function updateScorePill(el, result) {
  const fmt = n => Math.round(n).toString().padStart(2, " ");
  el.innerHTML =
    `<span class="score-pill__key">Quality</span>` +
    `<span class="score-pill__value">${fmt(result.quality)}</span>` +
    `<span class="score-pill__key">Distinct</span>` +
    `<span class="score-pill__value">${fmt(result.distinctQ)}</span>` +
    `<span class="score-pill__key">Smooth</span>` +
    `<span class="score-pill__value">${fmt(result.smoothQ)}</span>` +
    `<span class="score-pill__key">Reach</span>` +
    `<span class="score-pill__value">${fmt(result.reachQ)}</span>`;
}
```

`renderGrid` calls `scoreGrid(gridRgbs, N, { hue })` after
populating the cells; `renderArcs` calls `scoreArcSet(arcRgbs,
{ hue: state.hue })` after laying out the ramps. Each passes the
result to `updateScorePill` with the right element.

### 13.4 What the pill shows

`Quality NN · Distinct NN · Smooth NN · Reach NN` — all four in
`[0, 100]`, higher = better.

- **Quality** — the unweighted mean of the other three.
- **Distinct** — `100 · (1 − nearIdentical / pairCount)`. 100 =
  zero duplicate pairs; 0 = every pair is a duplicate.
- **Smooth** — `100 · (1 − min(1, meanCV / SCORE_CV_CEILING))`.
  100 = adjacent-pair ΔEs all equal their mean (perfect pacing);
  0 = CV hit the "clearly broken" ceiling.
- **Reach** — `100 · min(1, chromaC / SCORE_REFERENCE_CHROMA)`.
  100 = pure corner sits at the p95 of sRGB-reachable chroma; 0
  = pure corner collapses onto the L axis.

The breakdown is deliberate — each sub-score moves independently
so a single number isn't hiding which quality regressed when you
dragged a knot.

### 13.5 What every pair analyses, spelled out

See "13.2 How — decomposition" above for counts. Walking it in
plain English:

- **Grid rows** (constant black level): "given this amount of
  black in the mix, how evenly does the scale walk from pure
  hue toward white?"
- **Grid cols** (constant white level): "given this amount of
  white in the mix, how evenly does the scale walk from pure
  hue toward black?"
- **Grid diagonals** (constant c_idx): "at this chroma level,
  does the white-vs-black transition pace evenly?"
- **Arcs**: "does this arc's black → midpoint → white pacing
  behave, with end-compression excluded?"

The three grid directions map 1-to-1 onto the three edges of the
barycentric triangle, which is also what the three per-edge
curves (§10) control. So every curve edit shifts the ΔEs along
*exactly* one of the three scored directions.

### 13.6 Open / future work

- **Calibration.** Save a tiny labelled corpus of 3–5 "good" and
  "bad" scales to `test/_score-calibration.json`, assert that
  Quality (and each sub-score) falls in the expected bands, and
  retune the three knobs (`SCORE_NEAR_IDENT_TAU`,
  `SCORE_CV_CEILING`, `SCORE_REFERENCE_CHROMA`) plus the quality-
  band thresholds until the numbers match intuition on all
  examples.
- **Worst-pair highlight.** The `worst` field is computed but not
  yet surfaced; light up the two offending swatches in tile 2 /
  tile 4 when the pill is hovered.
- **Studio roll-up.** Aggregate across all 24 quantized hues
  (mean, or min if we want to penalise spaces that collapse at
  any hue) so the studio gallery can rank candidates by Quality,
  not just per-hue.
- **Per-sub-score weights.** Replace the unweighted mean in
  `combineScore` with a weighted one, and expose sliders so the
  designer can say "I care about Reach twice as much as Smooth
  for this candidate."
- **Monotone penalty.** Re-examine whether arcs want a reversal
  penalty. The scaffolding is in `scoreScale` but the rule isn't
  currently applied; not clear it adds signal over CV alone.

---

## 14. Task B detail — hue-name vocabulary

Status: **not started**. Referenced from §11 Task B.

### 14.1 Hard constraint

Names are a function of **sRGB hex**, not of color-space hue
angle. Every consumer resolves its hue angle to pure-corner sRGB
*first*, then calls the name lookup. Anything else is wrong.

### 14.2 Candidate data sources

| Source | Entries | Notes |
|---|---|---|
| CSS named colors | 148 | Universal, coarse, already-known vocabulary. Good fallback. |
| xkcd color survey | 954 | CC0. Curated names from a 222k-response public survey. Probably best single source for expressive names. |
| Material Design hue labels | ~17 | Design lingua franca; good for family-level names. |
| NBS/ISCC | 267 | Systematic boundaries over CIELAB; dated but well-defined. |
| Wikipedia "List of colors" | ~1000 | Long-tail; watch for duplicates and Pantone-derived entries. |
| Pantone | ~2000 | Proprietary; likely out-of-scope. |

### 14.3 Algorithm sketch

1. Build a lookup table: `[{ name, lab, srgb }]`, converting every
   dataset entry to OKLab once at build time.
2. For a query hex, convert to OKLab; find the nearest entry by
   Euclidean distance.
3. Optional post-processing:
   - **Family + modifier**: derive family (red / orange / … /
     green / teal / blue / purple / pink) from a coarse ring
     partition; use the fine name as a modifier.
   - **Confidence threshold**: if the nearest-neighbour distance
     is above X, fall back to the CSS-level coarse family name.

### 14.4 Where it lives

A new module (inline into `color-triangle.html` or a separate
`design/hue-names.js`) exposing:

```js
hueNameFromSrgbHex(hex: string): string
hueNameFromLinearRgb(r, g, b: number): string
```

Baked-in table: 360 entries for the pure-hue ring (one per
degree) so designer callers pay no cost. Studio role-map tooltips
can call the generic function for any color.

### 14.5 Baseline for this app

Since our immediate need is **hue-ring labels** (not general color
names across the whole triangle), start narrow:

- 360 pure-hue samples in HWB (`hwb(h 0% 0%)` → sRGB).
- For each, the nearest xkcd name (plus its hex).
- Dedup runs of identical names → one anchor per hue region.
- Replace `HUE_ANCHORS` with that table.

Later, extend to label non-pure stops if tooltips request it.

### 14.6 Open questions

- Granularity ceiling: at what level do names start to feel noisy
  (e.g. "tealish-blue")?
- Localisation: English only for now, but keep the structure
  translatable.
- Consistency across muddy / grey points: the xkcd dataset is
  mostly saturated hues; for low-chroma interior points we may
  need a grey-aware secondary table.

---

## 15. Interaction conventions (user-stated, don't lose)

- **Proper terminology**: tint / shade / tone / pure hue. "Shade"
  means hue+black specifically; don't use it casually for "any
  variant." Readouts read `tint / shade / pure`; tooltips spell it
  out.
- **Loupes are filled**: every dot / cursor carries the exact
  color it represents.
- **"Check your work before declaring done"**: always run the
  screenshot tests (§1) and verify.
- Tiles should all be visible at once, no page scroll. Triangle
  tiles fill their height; tile-4 grid fills with `minmax(0, 1fr)`.
- Info-icon tooltips use a CSS popover (not the browser's native
  `title`), with `data-tooltip` and `::after` on `.info`.

---

## 16. Quick file map

```
design/
  color-triangle.html   # the workbench (2500 LOC, one HTML file)
  color-system.md       # this doc
  color-scales.html     # earlier scale/plane visualizer, still useful
  index.html            # separate app-mounted design harness
  style-tiles.html      # not used by the workbench

test/
  _triangle-shot.mjs    # full workbench screenshot
  _sec-zoom.mjs         # per-tile screenshot
  _spaces-shot.mjs      # one per color space
  _fit-check.mjs        # overflow audit
  _cusp-delta.mjs       # ΔE cusp walk
  _peer-hover-check.mjs # tile-3↔4 correlation
  _arc-peer-check.mjs   # tile-2 correlation
  _quant-drag-check.mjs # tile-3 drag-snap
  _ease-check.mjs       # curve-slider behaviour
  _okhsv-ring-zoom.mjs  # the recurring OKHSV ring smoothness check
  _tooltip-*.mjs        # tooltip visibility probes
  _tile4-dims.mjs       # measures tile-4 internal dimensions

style.css               # app tokens (surface + accent scales)
```

---

## 17. One-line summary

`design/color-triangle.html` is an 8-color-space, 4-tile,
2×2-grid playground for authoring a tint/shade/tone color system.
Per-edge 2-D remap curves (per space) reshape how each triangle
edge advances; Gaussian-smoothed cusp LUTs hide the sRGB cube
corner; rAF-async drag holds 60fps; peer-hover makes the tile
correspondences obvious. Next decisions: pick a space + a
quantization + a naming scheme, add a scale-quality score to
measure progress, then translate to real tokens in `style.css`.
