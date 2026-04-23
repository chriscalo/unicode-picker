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
  scheme:   "cl",          // naming scheme in tile 4: cl / wb / num
  picker:   { w, b, geo }, // tile 1 continuous pick state
  quant:    { i, k, geo }, // tile 3 selected cell indices
  easing:   { <space>: { w, b, c } }, // per-space curve values
  easingMag: 2,            // γ base for easing; γ = mag^(-v)
}
```

### Per-control ownership
| Control | Lives in |
|---|---|
| Color space seg | header (global) |
| Tint / Shade / Pure curve sliders | header (per-space values) |
| Curve magnitude seg | header (global) |
| Hue steps seg | tile 3 (Quantized Color Picker) |
| Ternary N seg | tile 4 (Tonal Grid Scale) — shared with tile 3 |
| Naming seg | tile 4 |
| Arc N seg + Arcs seg | tile 2 (Tonal Arc Scales) |

Hue itself has no slider — tile 1 and tile 3 rings *are* the hue
picker.

---

## 5. Architecture — key files / functions

All lives in `design/color-triangle.html`. The `<script type=module>`
starts ~line 600. Roughly top-to-bottom:

1. **`state`** (§4).
2. **Easing helpers**: `getEasing`, `easeBary`, `atBaryEased`.
   `γ = state.easingMag^(-v)`. Applied to `(w, b, c)` before any
   strategy computes color, then renormalised so `w+b+c=1`. The hot
   `paintBody` loop inlines the same math instead of calling
   `atBaryEased` to avoid per-pixel function overhead.
3. **`quantizeHue`, `hueNameAt`** — hue snap + per-space color-name
   lookup (labels for the hue-step dots in tile 3).
4. **Color-space math** — one section per space. Each ends up
   exposing at least `<space>ToLinearRgb(...)`.
5. **Cusp LUTs**, smoothed with a σ=5° Gaussian to round off the
   real sRGB-gamut cube-corner kink at ~265° (see §9):
   - `OKLCH_CUSP` (raw + smoothed) — built once at load.
   - `HSLUV_CUSP_L`, `HPLUV_CUSP_L_RAW`, `LCHAB_CUSP`, `JZ_CUSP` —
     same pattern, per space.
6. **`STRATEGIES`** — one entry per space with `{ label, ringAt,
   atBary, readout }`. `strat()` resolves the active one from
   `state.space`.
7. **Geometry** — `geometry()` returns
   `{ cx, cy, ringInner, ringOuter, triR, verts }` with all layout
   constants scaled to canvas width (so the 2× ring canvas and 1×
   body canvas agree on where the ring band sits).
   - `flipped: true` swaps W and B angles (tile 2's painter's
     triangle: C at top, B bottom-left, W bottom-right).
   - `cyShift` nudges the triangle centroid down so its bbox is
     vertically centred in the stage.
8. **Paint** — `paintRing` (once per tile at load, using each
   strategy's `ringAt`); `paintBody` (per-hue repaint, with inline
   easing gamma). Each tile has its own body canvas and is
   CSS-rotated by `-state.hue` for the ring tiles. Tile 2 is NOT
   rotated (fixed orientation).
9. **Section renderers**:
   - Tile 1 (`repaintPicker`, `updatePickerCursors`,
     `updatePickerReadout`).
   - Tile 2 (`renderArcs` — draws the triangle, SVG arc paths, and
     both HTML dots + ramp swatches; also wires the tile-2 peer
     hover).
   - Tile 3 (`repaintQuant`, `renderQuantDots`, `updateQuantReadout`;
     includes `snapToNearestQuantDot` for drag-snap).
   - Tile 4 (`renderGrid` — flat CSS grid; also wires the tile
     3↔4 peer hover).
10. **Drag plumbing** — `attachDrag(stage, canvas, picker, hooks,
    dragKey)` for tile 1; tile 3 has its own inline pointerdown
    handler (slightly different hitTest — ring + triangle drag-snap).
11. **rAF-throttled dispatch + `activeDrag` flag** — during a ring
    drag, `onHueChanged()` only repaints the dragged tile; the
    other three tiles are deferred via `requestIdleCallback` and
    refreshed on `onDragEnd()`.
12. **Controls wiring** — one `document.querySelectorAll(...)` per
    seg / slider, plus `setSegActive()` to paint the pressed state.

---

## 6. Color spaces

All eight go through the same `STRATEGIES` abstraction.

| Seg | Strategy | Notes |
|---|---|---|
| HWB | `hwb` | CSS-native `hwb()`; sRGB-HSV based. No cusp needed. |
| OKLCH | `oklch` | Björn Ottosson's OKLab. Ring + triangle use `OKLCH_CUSP` (smoothed). Default. |
| OKHSL | `okhsl` | OKLab-based HSL (ok_color.h). Uses `okhslCuspAtHue(hue)` which reads the OKLCH smoothed LUT — that's how we killed the 265° kink on OKHSL/OKHSV rings. |
| OKHSV | `okhsv` | OKLab-based HSV. Uses Björn's full toe + gamut-scale pipeline (ok_color.h). Was broken for weeks — the toe step is not the identity. |
| LCh(ab) | `lchab` | Classic CIE 1976 L*a*b* → LCh. D65 white, 6/29 split f. |
| Jzazbz | `jzazbz` | Safdar et al. 2017. **White Jz computed from sRGB D65 forward** — on normalised XYZ it's ~0.046, not the HDR 0.22. Cusp iteration scales to that. |
| HSLuv | `hsluv` | alexeiboronine CIELUV-based HSL. User called this one "muddy and gross, completely unusable." |
| HPLuv | `hpluv` | HSLuv's pastel-only sibling — hue-independent chroma ceiling. |

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

## 10. Easing / curve controls (most recent)

Three sliders in the header: **Tint curve**, **Shade curve**,
**Pure curve**, each in `[-1, 1]`.

- Positive = ease-out (fast toward the corner, slow settle).
- Negative = ease-in.
- Mapping: `γ = state.easingMag ^ (-v)`, where `easingMag` is the
  new `Curve magnitude` seg in the header (`2 / 4 / 8`, default
  **2** — so `v=+1 → γ=0.5`, `v=-1 → γ=2`).

Values are stored per-space on `state.easing[space]` — switching
spaces syncs the sliders to remembered values. Every paint path
applies easing (tile 1 cursor fill, tile 3 dot fills, tile 4 grid
cells, tile 2 arc dots + ramps, continuous picker sample swatch).
The inline paintBody loop pre-computes the three gammas once per
paint to stay tight.

---

## 11. Known TODOs / loose threads

### Three open design questions (these are the headline)

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
   low-chroma for accents): HWB, OKLCH, OKHSL, OKHSV, LCh(ab),
   Jzazbz. **Open.** Test: same model + role map across one
   candidate per space, compare side-by-side in the studio.

3. **How to fine-tune the blending between pure, white, and black
   so scales feel perceptually uniform?** Diagnosed (see
   `test/_uniformity-diagnostic.mjs`): the triangle in OKLab is
   not equilateral — at most hues the cusp's L is close to white,
   so steps toward black are ~5× the perceptual distance of steps
   toward white. Easing curves redistribute *within* an axis but
   can't fix this geometric asymmetry. **Partial fix shipped**: a
   "ΔE-equal triangle" toggle in the designer header pulls the
   pure-C corner toward the centroid by α=0.25 (space-agnostic
   barycentric pre-transform). Result: all three triangle edges
   come closer to equal length, at the cost of a less-saturated
   pure-color. Not truly equilateral — full equilateral requires
   α≈0.45 (pure-C nearly grey) or moving outside the gamut. Open
   question: is the chosen α the right tradeoff, or should it be
   a slider?

### Open in §12 of this doc (most are aspirational)
- Add **HCT** (CAM16-UCS). ~300+ lines of math; haven't prioritised.
- Replace the current 12-step token scale in `style.css` with the
  winning designer output once we commit to a scheme.
- **Hue-name vocabulary**. The current `HUE_ANCHORS` only carry
  coarse names (red / orange / yellow / chartreuse / green / teal /
  cyan / blue / indigo / violet / magenta / rose). Need finer
  nuance — distinguish lime vs hunter vs forest in the green band,
  lemon vs mango vs banana in the yellow band, etc. Open questions:
  - **CRITICAL: hue angles do NOT agree across color spaces.** OKLCH
    hue 180° is not the same color as HSLuv hue 180° or LCh(ab) hue
    180°. Any naming dataset must be keyed by a canonical, space-
    independent representation — sRGB hex or sRGB linear (r, g, b).
    Then for each space, we look up the name by converting the
    color back to sRGB first.
  - Is there a public dataset that maps sRGB color → curated English
    name with finer-than-coarse granularity? (xkcd color survey,
    Wikipedia color lists, Pantone, NBS/ISCC come to mind.)
  - Could we *generate* a mapping by clustering color-name corpora
    against sRGB and picking the modal name per fine-grained
    region of color space?
  - At what granularity does naming stop carrying information —
    e.g., is "tealish-blue" useful or just noise?
  - Output target: a function `colorName(srgbHex) → string` that
    the studio can use in tooltips and in role-map authoring. Spaces
    convert to sRGB first.

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
- Curve-magnitude seg is temporary — user wants to pick one and
  drop the seg. Don't remove it on your own.
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

## 13. Interaction conventions (user-stated, don't lose)

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

## 14. Quick file map

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

## 15. One-line summary

`design/color-triangle.html` is an 8-color-space, 4-tile,
2×2-grid playground for authoring a tint/shade/tone color system.
Easing gammas on each barycentric axis (per space), Gaussian-
smoothed cusp LUTs to hide the sRGB cube corner, rAF-async drag
to stay at 60fps, peer-hover to make the tile correspondences
obvious. Next decision: pick a space + a quantization + a naming
scheme, then translate to real tokens in `style.css`.
