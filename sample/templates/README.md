# Sample templates

Exported template files kept here so the bundled ones can be rebuilt from
something a person edited in Foundry, the way the sample styles are.

Nothing reads this folder yet. The templates that ship today are written by hand
in [`scripts/template-presets.mjs`](../../scripts/template-presets.mjs); when
there are enough of them to be worth authoring in the editor instead, a
`tools/build-template-presets.mjs` will read this folder the way
[`tools/build-presets.mjs`](../../tools/build-presets.mjs) reads
[`../styles`](../styles).

To put one here: build the page structure you want in a journal, select it, and
choose **Illuminus → Template → Save selection as template**, then export it from
the template library.

Two things any template kept here has to hold to, whether hand-written or
exported:

- **It names keys, never colors.** `illuminus-box--box01`, not
  `background: #5e1914`. That is what lets one template look like a dungeon
  hazard under one style and a starship manifest under another — and a check
  asserts a bundled template carries no styling at all.
- **It is parsed, never injected.** The markup goes through Foundry's own editor
  schema on the way in, so anything the editor could not have produced is
  dropped rather than trusted.
