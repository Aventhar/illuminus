# Illuminus — how it is built

This is the developer's half of the documentation. [README.md](README.md) covers what the
module does and how to use it; this covers how it works, where things live, and the one
decision everything else hangs off.

## The idea it all rests on

**A style may only supply values, never rules.**

A style is a plain object of settings. The compiler turns it into CSS custom properties
and *nothing else* — no selectors, no declarations, no rules of its own. Every rule lives
in a stylesheet that ships with the module and reads those properties:

```text
scripts/style-schema.mjs      what a style may say          (the source of truth)
        ↓
scripts/style-compiler.mjs    settings → custom properties  (values only)
        ↓
styles/illuminus.css          rules that read them          (the skeleton)
styles/illuminus-generated.css   the repetitive ones, generated
```

Keep it that way. It is what makes importing a stranger's style file safe: the worst a
hostile style can do is set a colour you did not expect, because there is nowhere for it
to put a rule. It is also why every new capability has to be expressed as a *value* —
which is a real constraint, and most of the interesting problems in this codebase come
from working inside it.

A journal wearing a style gets a class and an attribute; the injector writes one `<style>`
block per style in use.

## Layout

| Path | What lives there |
| --- | --- |
| `scripts/style-schema.mjs` | Every control: its name, type, default, range, and how it emits. The single source of truth |
| `scripts/style-compiler.mjs` | Settings → custom properties. Emits values, never rules |
| `scripts/style-store.mjs` | Reading and writing styles in world settings |
| `scripts/style-injector.mjs` | Putting the compiled CSS into the document, and on the right journals |
| `scripts/migrations.mjs` | Forward migration of stored styles, one function per schema version |
| `scripts/apps/style-editor.mjs` | The three-column editor: the parts tree, the sample, the settings |
| `scripts/apps/style-manager.mjs` | The style library |
| `scripts/apps/color-picker.mjs` | The colour picker and its eyedropper |
| `scripts/editor-menu.mjs` | The **Illuminus** menu in the page editor: boxes, tags, pictures, lists, tables, templates |
| `scripts/export-html.mjs` | Journals out of Foundry: folder, one file, print, stylesheet |
| `scripts/export-css.mjs` | Gathering the CSS that is actually painting a page |
| `scripts/heading-sections.mjs`, `collapsible.mjs`, `toc-current.mjs`, `edit-button.mjs` | Render-time markup: column wrappers, folding markers, the chosen heading, the Edit pencil's home |
| `styles/illuminus.css` | The skeleton: every hand-written rule |
| `styles/illuminus-generated.css` | Written by `tools/generate-block-css.mjs` — do not hand-edit |
| `lang/en.json` | Written by `tools/generate-lang.mjs` — do not hand-edit |
| `tools/` | The checks, the generators, and the sandbox |

## Render-time markup

Four features need an element that the author's markup does not contain — a container for
a run of columned text, a fold marker, the current heading's mark, and a home for the Edit
pencil. All four are written **at render**, and all four obey the same three rules:

1. **Nothing is stored.** The page keeps the markup a person typed.
2. **Never inside an editor.** Moving nodes out from under ProseMirror breaks the
   selection it holds.
3. **It undoes itself first**, because a sheet re-renders on every edit.

## The checks

Two layers, and both must pass before anything is committed.

```bash
node tools/validate.mjs        # static; no Foundry needed, ~1s
tools/sandbox.sh up            # throwaway Foundry + headless Chrome
node tools/test-in-app.mjs     # drives the real app over CDP
tools/sandbox.sh down
```

**`validate.mjs`** cross-checks the things that rot silently: every custom property is
emitted by the schema *and* consumed by the stylesheet, in both directions; no two
controls in a tab share a name; every field, section and choice has a label and a hint;
presets reference only real fields; hostile values cannot escape a declaration; and an
exported archive really unzips, proved with the operating system's own `unzip` rather
than with our reader agreeing with our writer.

**`test-in-app.mjs`** asserts on **computed styles in a running Foundry** — over six
hundred assertions — because that is the only way to catch what source review misses: a
rule that parses but never applies, or one core out-specifies. Its expected control counts
come from the schema, so adding a control cannot make it stale.

**`tools/sameness.mjs`** answers one question the other two cannot: how far a brand
new style is from no style at all. It opens the journal and the page editor twice
each — once wearing a new style, once wearing none — and compares every element
property by property. The module's promise is that every control starts by doing
nothing, and this is what holds it to that.

**Never run either against a live world.** `tools/sandbox.sh` builds a throwaway data
directory that symlinks in only the module and the game system. The sandbox is on **30002**;
**30000 is the desktop application's live world**, and a script that hardcodes it does not
fail — it joins the real world as Gamemaster.

## Generated files

Three files are written by tools and must not be hand-edited:

| File | Written by | When to re-run |
| --- | --- | --- |
| `styles/illuminus-generated.css` | `tools/generate-block-css.mjs` | After any schema change touching a block, tag, picture, list, table or heading |
| `lang/en.json` | `tools/generate-lang.mjs` | After adding or renaming any control |
| `SETTINGS.md` | `tools/generate-settings-doc.mjs` | On demand; it is gitignored, because a list of nine thousand controls is out of date by the end of the week |

The generators fail loudly rather than guessing. If `generate-lang.mjs` has no wording for
a name, it says so and stops; add the wording to its tables and re-run.

## Adding a control

Every schema change is three edits and two commands:

1. The field in `scripts/style-schema.mjs`.
2. A rule in `styles/illuminus.css` consuming its custom property — or a line in
   `tools/generate-block-css.mjs` if it belongs to a family.
3. Name it in the tab's order list, if that tab states its own order.
4. `node tools/generate-lang.mjs` and, if needed, `node tools/generate-block-css.mjs`.
5. `node tools/validate.mjs`, which fails if you missed any of the above.

**Renaming a field needs a migration.** `cleanSettings` discards keys the schema does not
know, so without one, existing styles silently lose those values. Bump `SCHEMA_VERSION` in
`scripts/constants.mjs`, add the mapping to `scripts/migrations.mjs`, and cover it in the
checks. Renaming or splitting a *group* needs the same, and reaches further: per-style
names for treatments are keyed by group id and live outside `settings`.

## Schema versions

`SCHEMA_VERSION` counts the times stored styles have had to be migrated; it moves
independently of the module version. Migrations are applied in order for every version
between the stored one and the current, so a version 1 style loaded today passes through
all of them.

The most recent, version 11, is a good example of the shape they take: the contents panel
and the page editor each became a tab holding parts of its own, every setting keeping the
name it had, so the migration reads the split table backwards out of the schema rather
than repeating it — and a part added later cannot be forgotten.

## Public API

```js
const illuminus = game.modules.get("illuminus").api;

illuminus.openManager();                        // the style library
illuminus.openEditor(styleId);                  // the editor
illuminus.pickStyleFor(journalEntry);           // the assignment dialog
illuminus.listStyles();                         // every style, sorted by name
illuminus.assignStyle(journalEntry, styleId);   // apply ("" to clear)
illuminus.exportStyles([styleId]);              // download as JSON
illuminus.openExport({styleId, entryIds});      // the export dialog
illuminus.exportJournals({                      // build and hand it over
  styleId, entryIds, format: "print"            // "folder" | "file" | "print" | "css"
});
await illuminus.buildJournalExport({            // the archive itself, unsaved
  styleId, entryIds, secrets: false             // -> {blob, filename, report}
});
```

## Development

- **Data directory:** `~/Documents/FoundryVTT`, with `Data/modules/illuminus` symlinked to
  the repo. Edits are live; there is nothing to compile or copy.
- **`.mjs` changes need a browser refresh.** CSS, Handlebars and lang changes hot-reload
  if Hot Reload is enabled in Foundry's setup options — and are deliberately *not*
  hot-reloaded in the sandbox, so a run reads one consistent set of files.
- The traps that cost time to rediscover — Foundry's cascade layers, ProseMirror's
  schema, the ways a check can lie to you — are written down in
  [.claude/CLAUDE.md](.claude/CLAUDE.md). It is worth reading before changing anything
  structural.

## Conventions

- **Never hard-code the module id or a user-facing string.** Import `MODULE_ID` from
  `scripts/constants.mjs`; add a localization key.
- **No CSS jargon in anything a person reads.** "Top Thickness", not `border-top-width`.
  Choice wording is shared across the whole schema, so a value must be named for what it
  means everywhere it appears — which is why hyphenation's is `breakAsNeeded` rather than
  `auto`.
- **US English throughout** — strings, comments and identifiers alike. CSS property names
  are US spelling anyway, so a stray `colour` in an identifier reads as a typo beside
  `borderTopColor`.
- **Prefix every CSS class with `illuminus-`** so styles cannot leak into core UI.
- **Anything that enumerates the families must be derived, not spelled out.** A hand-kept
  list that falls out of date fails silently.

## License

[GNU General Public License v3.0 or later](LICENSE). Copyright (C) 2026 Aventhar.
