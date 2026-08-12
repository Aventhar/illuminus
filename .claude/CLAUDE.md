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
`tools/sandbox.sh reset` wipes the world when state has drifted.

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
- **A relative `url()` in a stylesheet resolves against the stylesheet, not the page.**
  Foundry's file picker hands back data-root-relative paths like
  `worlds/x/art/paper.webp`, which would be looked for under
  `modules/illuminus/styles/`. `sanitizePath` makes them root-relative through
  `foundry.utils.getRoute`, which also handles a server `routePrefix`. Any new
  path-valued field must go through it.
- **Some core styling is fed through element-local custom properties.** A journal
  sheet's header buttons carry `--button-text-color` on themselves, which a generic
  `button { color: var(--button-text-color) }` then resolves. Setting `color` works, but
  set the variable too — the sidebar buttons are styled that way.
- **Buttons animate.** Reading a computed colour or size straight after a render can
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
- **Headless Chrome needs SwiftShader**: without `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`, PixiJS throws during init and the client never reaches
  the join screen.
- Core source is readable at
  `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app` — `client/` for
  application classes, `templates/` for Handlebars, `public/less2/` for styles. Check
  there rather than guessing at the API.

## Generated files — do not hand-edit

- **`lang/en.json`** is written by `node tools/generate-lang.mjs`. Side, corner, and
  shadow label families are derived from the schema by naming pattern, so a new prefix
  like `entryBorder` needs no edits; anything the generator has no wording for makes it
  fail loudly. Add new wording to the tables inside the generator, then re-run it.
- **`scripts/presets.mjs`** was generated by running the previous schema version's data
  through `scripts/migrations.mjs`. If a future schema change renames fields, regenerate
  the presets the same way rather than hand-porting them — it exercises the migration at
  the same time.

## Conventions worth keeping

- **Every schema change is three edits**: the field in `scripts/style-schema.mjs`, a rule
  in `styles/illuminus.css` consuming its custom property, and a re-run of the lang
  generator. `validate.mjs` fails if you miss any of them.
- **A style may only supply values, never rules.** The compiler emits custom properties
  and nothing else. Keep it that way — it is what makes importing a stranger's style file
  safe.
- **Renaming a field needs a migration.** `cleanSettings` discards unknown keys, so
  without one, existing styles silently lose those values. Bump `SCHEMA_VERSION`, add the
  mapping to `scripts/migrations.mjs`, and cover it in the tests.
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
