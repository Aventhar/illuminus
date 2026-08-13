# Working on Illuminus

Illuminus is a Foundry VTT v14 module: per-journal decorative styling, configured
through a plain-language GUI. **Read [README.md](../README.md) first** — it covers what
the module does, the file layout, and the schema → compiler → stylesheet architecture.
This file covers only what that document does not: the workflow, and the traps that
cost time to rediscover.

## Non-negotiable

**Never run tests against a live world.** Foundry's desktop app may have the user's
world open, and a second server on the same `dataPath` contends for the LevelDB locks.
That has already triggered a database repair on a real world once. Use `tools/sandbox.sh`,
which builds a throwaway data directory that only symlinks the module and the game
system in.

## Verifying a change

Two layers. Both must pass before anything is committed.

```bash
node tools/validate.mjs        # static; no Foundry needed, ~1s
tools/sandbox.sh up            # throwaway Foundry + headless Chrome
node tools/test-in-app.mjs     # drives the real app over CDP
tools/sandbox.sh down
```

`validate.mjs` cross-checks things that silently rot: every CSS custom property is
emitted by the schema **and** consumed by the stylesheet (both directions), no two
fields emit the same property name, every field/section/choice has a label and a hint,
presets only reference real fields, and hostile values cannot escape a declaration.

`test-in-app.mjs` asserts on **computed styles in a running Foundry**, which is the only
way to catch what source review misses — a rule that parses but never applies, or one
core out-specifies. Its expected control counts come from the schema, so adding a
control cannot make it stale.

In a non-interactive runner, background `tools/sandbox.sh up`; it leaves long-lived
child processes, and a foreground pipe will appear to hang after the script has already
succeeded.

Tests share one browser session and one world, so a check that mutates a preset or
leaves a style behind will break a later one. Create what a check needs, then delete it.
`tools/sandbox.sh reset` wipes the world when state has drifted. Create fixtures inside
`try/finally` — a check that bails out early otherwise leaves a style behind and breaks
the next run's counts.

**Asset folder case is load-bearing.** macOS is case-insensitive, so a renamed folder
does not even show up in `git status`, and every path keeps working locally while
breaking on a Linux-hosted server. `validate.mjs` compares references against the on-disk
spelling; when it complains, record the rename with `git mv` through a temporary name,
since a direct `git mv` is a no-op here.

**`:hover` needs real input.** A synthetic `mouseover` does not make `:hover` match, so a
control revealed on hover cannot be tested with dispatched events — drive it with CDP
`Input.dispatchMouseEvent`, which produces genuine hover and clicks.

**`1fr` does not mean "a tenth of the width".** Grid tracks will not shrink below their
content's minimum, and a button's minimum width pushed a ten-column row past the edge of
its panel. Use `minmax(0, 1fr)` and give the items `min-width: 0`.

**Click the way a person does.** `element.click()` skips hit testing, so a control that
CSS has made unclickable still passes. Take the element's centre, ask
`document.elementFromPoint`, assert it is the control, and click what comes back. A dead
swatch shipped because a check called `.click()` directly.

Prefer adding a case to `test-in-app.mjs` over a one-off script. When a bug is found
visually, add the assertion that would have caught it — the preview-background and
drop-cap regressions both have one.

Screenshots are worth taking for anything visual: `Page.captureScreenshot` over CDP.
Two real bugs were found that way and by nothing else. Note that headless Chrome shows
a "no hardware acceleration" toast that overlays the top of the window — remove
`#notifications .notification` before capturing or it will look like a styling bug.

## Foundry v14 traps

These are all load-bearing and none are obvious from the code.

- **Module CSS lands in a `modules` cascade layer that comes after core's layers.**
  That is why `.illuminus-styled .journal-sidebar .toc li.page` overrides core's
  six-class rule despite being less specific. Do not "fix" a low-specificity selector by
  inflating it; verify with computed styles instead. Also: the stylesheet does not appear
  in `document.styleSheets` with an `href`, and walking `cssRules` will not find these
  rules either — `CSS.getMatchedStylesForNode` over CDP is the way to see which
  declaration actually wins, and it reports the layer.
- **`journal-entry-page` names two very different things.** It is the `<article>` for a
  page inside the journal sheet, and it is also a root class on the standalone page
  sheet — the window that Edit Page opens, which Foundry appends to `<body>` and
  positions itself. A rule written for the page area lands on that window too. Paint
  properties are fine there; layout properties are not. Setting `position: relative` on
  it dropped a 600px window into normal flow and shoved the whole interface sideways.
  The page surface therefore goes on that window's `.window-content`, not its root:
  the root is an `.application` as well, so the window's own background lands on the
  same element and wins on document order — which left the editor showing the page's
  ink over Foundry's frame color, unreadable.
- **A color of None must not erase what core paints.** The window frame and title bar
  default to `#00000000`, and applying that as a `background-color` took Foundry's own
  away: every styled journal window became see-through to the canvas — invisible on
  the journal sheet, whose contents cover the frame, and glaring on the page editor,
  whose title bar has nothing behind it. Paint those colors as a `linear-gradient`
  layer over core's instead, so None means "leave it as Foundry draws it". Core sets
  no `background-image` on either element, so the layer is free — and a test then has
  to read `backgroundImage`, not `backgroundColor`.
- Foundry's file picker hands back data-root-relative paths like
  `worlds/x/art/paper.webp`, which would be looked for under
  `modules/illuminus/styles/`. `sanitizePath` makes them root-relative through
  `foundry.utils.getRoute`, which also handles a server `routePrefix`. Any new
  path-valued field must go through it.
- **The native `<input type="color">` is display:none.** Illuminus supplies its own
  picker (`scripts/apps/color-picker.mjs`); the element stays only because it carries the
  field's name and value, and writing to `element.value` is still how a color reaches the
  form. Do not restore its visibility to "fix" anything — it opens the operating system's
  panel, which cannot express alpha.
- **A native `<input type="color">` cannot show alpha**, and its `::-webkit-color-swatch`
  resists styling even with `appearance: none`. The editor draws its own swatch over the
  input, which is made transparent but keeps its box so it still opens the browser
  picker. The overlay is positioned from the input's measured rect, because the color
  element's internal spacing is not ours to assume — aligning to the row's edge left it
  five pixels off its click target.
- **Some core styling is fed through element-local custom properties.** A journal
  sheet's header buttons carry `--button-text-color` on themselves, which a generic
  `button { color: var(--button-text-color) }` then resolves. Setting `color` works, but
  set the variable too — the sidebar buttons are styled that way.
- **Buttons animate.** Reading a computed color or size straight after a render can
  return a value part-way through a transition (`14.0717px` rather than `14` or `22`).
  Freeze transitions before measuring:
  `* { transition: none !important; animation: none !important; }`. A test that
  mysteriously reads the old value is usually this, not a cascade problem.
- **Render hooks fire for the whole inheritance chain.** `renderJournalEntrySheet` fires
  for system subclasses too, so hooking the core class is enough.
- **An ApplicationV2 part template must have exactly one root element.** More than one
  fails at render with a message that does not name the offending template.
- **Foundry's form elements** (`color-picker`, `file-picker`, `range-picker`) carry the
  `name`; their inner inputs do not. Assigning to `element.value` dispatches `input` and
  `change` from the element itself — that is how to drive them from a test. Dispatching
  an event on the inner input does nothing.
- **`selected` is not a Handlebars helper.** `checked` and `disabled` are. Use
  `{{#if}}` for option selection.
- **The editor's menu bar is rebuilt on every state change.** `ProseMirrorMenu.update()`
  calls `render()`, which replaces the whole `<menu>` — so a press and a release either
  side of a rebuild is not a click, and the drop-down silently fails to open. Clicking
  into the prose triggers one. A test must wait for the bar to stop churning before
  aiming at it (`watchMenu` / `menuAtRest` in `test-in-app.mjs`); a person never notices
  because they aim at what they can see.
- **Drop-down entries live in a detached `#prosemirror-dropdown` on `document.body`,**
  not inside the menu, and the child entries are revealed by `:hover` — which a scripted
  `MouseEvent` does not trigger. Only real CDP input events (`cdp.mouse` / `cdp.click`)
  can walk the menu.
- **`submit()` on a page editor does not close it.** Clicking Edit again then opens a
  *second* editor over the first, and clicks aimed at the newer one can land on the
  older. Close it explicitly, and resolve the sheet with `.pop()` rather than `.find()`.
- **Clicking an image inside the editor opens core's `ImagePopout`,** which then covers
  the menu bar. Aim at the caption to put the cursor inside a `figure`.
- **`:empty` cannot tell whether a block is empty.** The editor leaves a paragraph
  inside, so the block has a child. `:not(:has(<contentful>:not(:empty)))` can, and
  `:has()` is available. Two things follow: a paragraph holding only a space counts as
  content, and the rule must be scoped to `section.journal-page-content` so it never
  applies in the editor — the editor's content element is a `prose-mirror`, and a block
  that vanished while its author was typing in it could not be clicked back into.
- **Blocks and picture treatments ride on `blockquote` and `figure`.** Both already carry
  a `classes` attribute via core's AttributeCapture, so the classes survive a save and
  reload with no schema change of our own. `foundry.prosemirror.commands.wrapIn` takes
  the attributes to set.
- **Headless Chrome needs SwiftShader**: without `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`, PixiJS throws during init and the client never reaches
  the join screen.
- Core source is readable at
  `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app` — `client/` for
  application classes, `templates/` for Handlebars, `public/less2/` for styles. Check
  there rather than guessing at the API.

## Bundled assets

`assets/samples/textures/` and `assets/samples/pictures/` ship with the module and are
referenced by path from `scripts/presets.mjs` (the seeded style's texture) and
`templates/style-editor.hbs` (the picture in the sample). Those paths are strings, so
moving a file breaks them silently — `validate.mjs` resolves every
`modules/illuminus/assets/...` reference found in the source against the filesystem, and
also checks the spelling matches on-disk case, since macOS forgives a wrong case and a
Linux-hosted server does not.

Grayscale SVG textures are meant to be combined with a Fill Color under Multiply
blending; the color JPEGs are meant to be used as they are. A texture that is not
grayscale will tint twice.

Anything added here is redistributed under the repository's MIT license, so only bundle
art that may be licensed that way.

## Generated files — do not hand-edit

- **`styles/illuminus-generated.css`** is written by `node tools/generate-block-css.mjs`.
  The ten blocks and ten picture treatments are identical rule sets apart from which
  custom properties they read, and CSS cannot say that once. Property names come from
  `cssVarFor`, so a renamed field breaks the generator rather than silently breaking a
  rule. Re-run it after any schema change touching a block or picture field.
- **`lang/en.json`** is written by `node tools/generate-lang.mjs`. Side, corner, and
  shadow label families are derived from the schema by naming pattern, so a new prefix
  like `entryBorder` needs no edits; anything the generator has no wording for makes it
  fail loudly. Add new wording to the tables inside the generator, then re-run it.
- **`scripts/presets.mjs`** was generated by running the previous schema version's data
  through `scripts/migrations.mjs`. If a future schema change renames fields, regenerate
  the presets the same way rather than hand-porting them — it exercises the migration at
  the same time.

## Blocks, picture treatments, and inline styles

Ten of each, keyed `block01`..`block10`, `picture01`..`picture10`, and
`tag01`..`tag10`. The keys are fixed;
their displayed names live on the style (`labels`) and are edited per style, so markup
and exported styles stay portable when someone renames one.

An inline style is a **mark**, not a node. `AttributeCapture` is applied to every node
*and mark* in Foundry's schema, so the `span` mark carries `classes` through a save just
as `blockquote` does — verified end to end, not assumed. Two consequences: it needs a
selection to attach to (the command returns `false` on an empty one, so the menu entry
simply does nothing), and it is laid out `inline-block`, because vertical padding on a
true inline box spills over the lines above and below rather than growing its own. That
is why Paizo's trait tags are list items in a flex row; `inline-block` gets the same
shape while still flowing inside a heading or a sentence.

**Anything that enumerates the families must be derived, not spelled out.** `cleanLabels`
matched `/^(block|picture)\d{2}$/` and silently discarded every tag name until it was
changed to check `GROUPS` instead. Renaming is per style, so the failure looked like the
menu ignoring a label rather than the store dropping it.

They share a tab each rather than taking thirty: `FAMILIES` in the editor, with a picker
choosing which member is built. Only the member on show is rendered, which is why the
editor holds ~670 controls rather than the schema's 1,510.

Text and heading settings mean "use the page setting" by default — a size of 0
(`zeroAs: "inherit"`), an `inherit` choice, or an empty color, all of which emit either
the CSS keyword or nothing at all. `validate.mjs` knows a field may legitimately emit
nothing and checks it still compiles once given a value.

## Conventions worth keeping

- **Every schema change is three edits**: the field in `scripts/style-schema.mjs`, a rule
  in `styles/illuminus.css` consuming its custom property, and a re-run of the lang
  generator. `validate.mjs` fails if you miss any of them.
- **A style may only supply values, never rules.** The compiler emits custom properties
  and nothing else. Keep it that way — it is what makes importing a stranger's style file
  safe.
- **Renaming a field needs a migration.** `cleanSettings` discards unknown keys, so
  without one, existing styles silently lose those values. Bump `SCHEMA_VERSION`, add the
  mapping to `scripts/migrations.mjs`, and cover it in the tests. **Merging two fields
  into one needs the same treatment plus a decision about what is lost**: Thickness and
  Slant became one Text Style choice in v3, which collapses nine numeric weights to
  three, so the migration maps 600-and-over to bold and 300-and-under to light rather
  than dropping the value. Regenerate `scripts/presets.mjs` by running it through the
  migration (`migrateSettings(preset.settings, <previous version>)`) rather than editing
  it by hand — that exercises the migration on real data.
- **US English throughout** — strings, comments, and identifiers alike: color, center,
  gray, license, recognize. CSS property names are US spelling anyway, so a stray
  `colour` in an identifier reads as a typo next to `borderTopColor`.
- **No CSS jargon in any user-facing string.** "Top Thickness", not "border-top-width".
  The GUI is for people who do not write CSS.
- Never hard-code the module id or a user-facing string; import `MODULE_ID` and add a
  localization key.

## Environment

- Data directory: `~/Documents/FoundryVTT`, with `Data/modules/illuminus` symlinked to
  this repo — edits are live, no build step.
- The repo is the module; there is nothing to compile or copy.
- `.mjs` changes need a browser refresh. CSS, Handlebars, and lang changes hot-reload if
  Hot Reload is enabled in Foundry's setup options.
- GitHub remote is `Aventhar/illuminus`. Commit and push only when asked.
