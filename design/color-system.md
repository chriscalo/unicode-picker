# Color system — direction doc

A working document for evolving how we reason about color in this app.
Captures the current system, the mental model we want, and the open
questions.

## 1. Where we are today

### The model

Two **scales**, each parameterized by `(hue, chroma)`:

- `--surface-*` — paper/ink backbone
- `--accent-*` — brand color

Twelve **lightness steps** shared by both scales:

| step | dark L | light L | role hint |
|------|--------|---------|-----------|
| 1    | 10%    | 99%     | app bg |
| 2    | 14%    | 96%     | raised panel |
| 3    | 20%    | 92%     | panel / input bg |
| 4    | 26%    | 88%     | hover |
| 5    | 32%    | 82%     | subtle border |
| 6    | 40%    | 72%     |  |
| 7    | 50%    | 58%     | strong border |
| 8    | 62%    | 46%     |  |
| 9    | 72%    | 38%     | solid accent / tertiary text |
| 10   | 80%    | 28%     |  |
| 11   | 88%    | 20%     | secondary text |
| 12   | 95%    | 12%     | primary text |

Step 1 always means "furthest from content" and step 12 always means
"highest contrast against bg", regardless of theme.

> **Why 12?** Inherited from the Radix palette convention. It's not a
> property of the system — 10 (decimal) or 100 (percent-style) would
> read more naturally. Revisit once we know if colorfulness becomes
> an independent axis; if so, we may end up picking an L resolution
> that multiplies cleanly against a C resolution.

A **per-step chroma multiplier** (`--step-N-c`) runs over the scale's
base chroma: 0.30 at step 1, peaking at 1.00 around step 8-9, tapering
to 0.50 at step 12. Keeps near-paper and near-ink readings calm and the
mid-range rich.

**Swatch formula:**

```
--{scale}-{N} = oklch(
  var(--step-N),
  calc(var(--{scale}-chroma) * var(--step-N-c)),
  var(--{scale}-hue)
)
```

Every semantic token is a single `var(--{scale}-{step})` lookup
(`--color-bg-panel: var(--surface-3)`, `--color-accent: var(--accent-9)`,
etc.). The harness lets you re-pick the step per role.

### What the system is good at

- Consistent hue and cadence across the whole app.
- Theme flip is a single table of L values — semantic tokens don't move.
- Rebranding = change the four `(hue, chroma)` scale params.

### What it isn't

- Per-mark **colorfulness** isn't independently expressible. Chroma is
  set once per scale, then scaled by step. You can't say "this label
  should be the same lightness as the panel but more saturated."
- The step index bundles lightness and chroma together, which means
  "a little more contrast" is a single lever that changes two things.
- The mental model ("which scale, which step") doesn't match how we
  actually think about a mark in relation to its background.

---

## 2. Where we want to go

### The mental model

Every mark in the UI lives on top of a background that is either
**whiteish** or **blackish**. You get contrast in exactly two ways:

1. **Lightness** — go the opposite direction from the bg's L.
2. **Colorfulness** — become more saturated than the bg.

Those two axes are independent. A good palette lets you dial either one
for any mark, and the classic contrast pairs all fall out of the same
model:

- white on black / black on white
- color on white / color on black
- white on color / black on color

In other words, for any given hue you can form a **2D slice** of usable
colors. A clean way to draw that slice is the **HWB triangle** — fixed
hue, with vertices at white, black, and the pure hue. Every point in the
triangle is addressed by `(whiteness, blackness, colorfulness)` where
`W + B + C = 1`. That's only two degrees of freedom but our brains like
reading it as three.

Reference: <https://hugodaniel.com/posts/color-picker/>

### What we want to design

A color system where every mark is addressed by:

```
(scale, lightness-contrast, colorfulness)
```

- **scale** — which family: `surface` or `accent` (hue + character).
- **lightness-contrast** — how far, in L, from the bg the mark sits.
  Signed so the same token works in light and dark themes.
- **colorfulness** — how saturated the mark is, independent of lightness.

That's the minimum model that lets a designer say "give me a subtle
border — low lightness-contrast, medium colorfulness" and have it work
in both themes and across brand changes.

---

## 3. Open questions

**Q1. Is colorfulness a per-mark decision, or per-scale + per-role?**
Current system: per-scale, implicitly per-step. Proposed: per-mark.
Middle ground: pick from a small enumerated set (none / low / med /
high / vivid) that resolves to absolute chroma per scale.

**Q2. How does the triangle map to theme flip?**
In HWB, white and black are vertices — they flip role between themes.
"Lightness-contrast from bg" is the theme-invariant axis. Do we store
it signed (`+`/`−`) or always "toward ink"?

**Q3. Do we keep 12 named steps, or name the axes?**
A system named `(bg, +3 L-contrast, med chroma)` is more explicit but
more verbose than `--color-text-secondary`. Probably we keep semantic
aliases on top of a more explicit base layer.

**Q4. Does `(scale, L-contrast, C)` collapse back into a single step
number in practice?**
If every mark's colorfulness ends up being a function of its L-contrast
(like today's per-step chroma curve), the "independent" axis is
illusory. We need to check: are there real UI marks where we want the
*same* L-contrast at *different* chroma?

Candidates to prove the axis is real:
- secondary text (low C) vs. link/accent text at same L (high C)
- hover background (low C tint) vs. accent-active background at same L
- subtle border (med C) vs. focus ring at same L (high C, accent scale)

**Q5. How does the harness show this?**
Today the design harness gives you step pickers per role. A better UI
might show the WB/C triangle for the active hue and let you drop each
mark onto it, with background anchors visible.

**Q6. Gamut and perceptual uniformity.**
OKLCH gives us perceptually uniform L and C, but OKLCH chroma is
unbounded; real displays clip it. The HWB triangle has bounded vertices
by construction. Do we parameterize in HWB directly, or keep OKLCH for
math and HWB as the authoring surface?

---

## 4. Implementation directions to evaluate

**Option A — Add a per-mark chroma lever.**
Keep the 12 steps for L, but expose an independent chroma choice per
role. Concretely: each mark gets `(scale, step, chroma-level)` where
`chroma-level` is a small enum that overrides the step's default
chroma multiplier.

Minimal disruption. Makes the second contrast axis explicit without
rewriting the scale model.

**Option B — Reparameterize in HWB per scale.**
Each scale is a hue. Each mark is `(scale, W, B, C)` (only two of three
are independent). Backgrounds are pinned at `(high W, 0, 0)` or
`(0, high B, 0)` per theme. Colors on color are `(0, 0, high C)`.
Classic contrast pairs become geometric rules on the triangle.

More honest to the mental model, bigger refactor, harder to keep a
readable semantic-token layer.

**Option C — Keep 12 steps but visualize as a triangle.**
Plot all 12 steps on the HWB triangle for each scale. Use it as a
design/review tool without changing tokens. If patterns emerge (steps
that cluster at the same L but differ in C), they become evidence for
Option A.

Cheap to try. Builds intuition before we commit to a refactor.

---

## 5. Confirmed from the first pass

- **Inverting the L table for the theme flip works.** Step 1 is "app
  bg" in both themes without moving any semantic token. Keep.
- **Colorfulness is missing as an independent axis.** Seeing the 12
  steps laid out side-by-side makes it obvious that every swatch on
  a given scale collapses onto one (L, C) curve. There's no cell of
  the (L × C) plane that says "same L as panel, more saturated" or
  "text-primary L, but calmer than the step's default chroma."
- **Step count (12) is arbitrary.** Borrowed from Radix; not a
  property of the system. 10 or 100 would read more naturally. Park
  this until we know whether the model becomes (scale, L, C) — the
  right L resolution depends on whether C is a second axis.

## 6. Color-space assessment for a UI color system

We've built three triangle pickers at `design/color-triangle.html` —
HWB (sRGB), OKLCH (smoothed cusp), and HSLuv. With the explicit goal
being **lightness perceptual uniformity** plus a coherent palette
system, here's how they score.

### Criteria

1. **Lightness is perceptually uniform.** Equal ΔL looks equally
   different in brightness — required.
2. **Smooth across hues.** Max-saturation sweeps (e.g. the hue
   ring) have no visible kinks; adjacent hues don't suddenly jump
   in lightness or chroma.
3. **Cross-hue saturation consistency.** "Saturation N at hue A"
   looks as saturated as "saturation N at hue B" — critical for a
   palette where you pick, say, S=80 accents across all brand hues.
4. **Reach.** You can address near-gamut colors without the space
   clipping or muting them.
5. **Authoring model.** The (H, X, Y) tuple maps cleanly to the
   way designers think about color (hue, how light, how colorful).

### Scorecard

| Criterion                 | HWB                     | OKLCH (cusp)              | HSLuv                 |
|---------------------------|-------------------------|---------------------------|-----------------------|
| L perceptual uniformity   | ✗ (HSV V, not L\*)      | ✓ (CAM-derived L)         | ✓ (CIE L\*)           |
| Smooth ring               | ✓ (by HSV construction) | ✗ raw / ✓ smoothed σ=5°   | ✓ (by normalisation)  |
| Cross-hue sat consistency | ✗ (C varies with hue)   | ✗ (C varies with hue)     | ✓ (S normalised)      |
| Gamut reach               | ✓ full sRGB             | ~ (smoothing costs ~0%)   | ✓ full sRGB (on face) |
| Authoring model           | ~ (non-uniform L)       | ~ (unbounded C is weird)  | ✓ (HSL, bounded)      |

### Verdict

**For UI color-system authoring: HSLuv.**

- It's *lightness-uniform* (CIE L\*), which is the stated requirement.
- Saturation is *normalised per hue* — `S = 80` is equally "far toward
  the gamut" at any hue, so your palette reads consistently across brand
  hues without a chroma table per hue.
- The ring is smooth by construction; no cube-corner artefacts to
  smooth away after the fact.
- `(H, S, L)` matches what designers already type.
- You give up perfect `a*/b*` perceptual uniformity (OKLab beats
  CIELUV there), but that mainly matters for *gradients* and *color-
  difference metrics*, not for picking a coherent UI palette.

**Keep OKLCH around for:**

- Color gradients where the perceived rate of change matters.
- Algorithmic color math (mixing, contrast ratios, accessibility
  scoring) — OKLab's `ΔE = √(ΔL² + Δa² + Δb²)` is the modern default.
- Places where you need the actual gamut cusp (e.g. "the most
  saturated blue possible on this display"); HSLuv can't express
  that directly because its `L=60` is a fixed slice, not the cusp
  L for the hue.

**Don't use HWB for system construction.** It's useful only as a
writing syntax for designers who already know their hue/whiteness/
blackness mental model — the underlying math is HSV-derived and
fails the lightness-uniformity test.

### Practical recipe for this app

1. Author tokens in HSLuv `(H, S, L)`. One lightness ladder (say
   `L ∈ {12, 20, 28, 38, 50, 62, 72, 80, 88, 92, 96, 99}`) works at
   any hue because L is uniform.
2. For each role, pick `(S, L)`. The scale token is `(scale-hue, S, L)`.
3. At compile / render time, HSLuv → sRGB. Optionally round-trip
   through OKLab to compute contrast ratios when needed.
4. Keep the ternary-grid naming from §2 of the triangle doc —
   `(i, j, k)` maps cleanly onto HSLuv's `(L, S)` ramp.

## 7. Open questions

- **Evaluate more color spaces in the workbench.** OKLCH reads nicely
  muted; HWB is vibrant when you want that; HSLuv came out muddy and
  unusable. Candidates to add to the color-space seg:
  - **OKHSL / OKHSV** (Björn Ottosson) — HSL/HSV-shaped interfaces
    on top of OKLab. Direct replacement for HSLuv with a better
    perceptual basis; likely cleaner than HSLuv.
  - **HCT** (Hue-Chroma-Tone; Google Material You) — already
    battle-tested for UI tokens, specifically tuned for
    lightness-uniform palettes.
  - **Jzazbz / JzCzHz** — perceptually uniform HDR-ready space
    (Safdar et al.); known to have good hue linearity.
  - **CIELCH(ab)** — the classic LCh on Lab (vs. HSLuv's LCh on
    Luv). Often looks closer to OKLCH in character.
  - **HPLuv** — HSLuv's pastel-only sibling (guaranteed
    perceptual uniformity but lower chroma ceiling).
- **Hue-angle names in the quantized picker.** Each color space's
  0° is a different colour (HSL red, OKLCH reddish-pink, HSLuv
  its own offset). Generate per-space hue-name labels at each
  quantized step — e.g. "red 0°", "orange 22°", "yellow 60°" —
  rather than just a bare degree reading.
- **Info tooltips aren't firing.** The ⓘ spans use `title=""` but
  tooltips are slow / inconsistent across browsers. Replace with
  a CSS-only hover popover (absolute-positioned div revealed on
  :hover/:focus-within) so the explanation text shows up
  reliably.

## 8. Task list



- [x] **Visualizer: named + numbered scales per theme.**
  `design/color-scales.html`, both scales × both themes, with step
  number, OKLCH breakdown, and role hint per swatch.
- [x] **Visualizer: (L × C) plane per scale / theme.** Rows = L steps,
  cols = chroma levels. Outlines mark the 12 current tokens.
- [x] **BWC triangle exploration page.** `design/color-triangle.html`
  — walks the math (HWB, barycentric coords, sRGB vs OKLCH),
  proposes two naming schemes against the triangle, adds an
  interactive general picker, and plots our 12 tokens per scale on
  a constrained triangle.
- [ ] **Revisit Q4 with the grid in hand.** For each real UI mark,
  ask: does it want an L that's off the current curve's default C?
  Log the answers — that's the evidence base for Option A vs B.
  - candidates: secondary text vs link/accent text at same L
  - hover bg vs accent-active bg at same L
  - subtle border vs focus ring at same L
- [ ] **Prototype Option A (per-mark chroma lever).** Add a
  `--{role}-c` knob that overrides the step's default chroma per
  role. Ship behind the harness first; see if it changes the way we
  reason about marks.
- [ ] **Prototype Option B (HWB authoring surface).** Spike the
  triangle picker on one scale; decide whether it's worth the
  refactor. Depends on Option A's answer.
- [ ] **Decide A vs B.** Based on the previous two spikes + Q4.
- [ ] **Revisit step count (12 vs 10 vs 100).** Park until the
  (scale, L, C) model is settled.
