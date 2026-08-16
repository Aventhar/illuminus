# Illuminus — how it is built

The end-user guide is [README.md](README.md). This file is for anyone changing the
module: its layout, how a style becomes CSS, how to run the checks, and the public API.

For the workflow and the Foundry v14 traps that cost real time to rediscover, read
[.claude/CLAUDE.md](.claude/CLAUDE.md) as well.

## Layout

```
module.json                  Manifest — id, compatibility, entry points
lang/en.json                 Every user-facing string
scripts/module.mjs           Entry point; hooks and public API
scripts/constants.mjs        Module id, setting and flag keys, logger
scripts/settings.mjs         game.settings registration
scripts/style-schema.mjs     THE source of truth: every style property
scripts/migrations.mjs       Forward migration of styles saved by older versions
scripts/style-compiler.mjs   Style data -> CSS custom properties
scripts/style-injector.mjs   Keeps the compiled sheet and sheet tagging in sync
scripts/style-store.mjs      CRUD over the world's styles; journal assignment
scripts/presets.mjs          The bundled styles (none yet)
scripts/io.mjs               Export / import as JSON
scripts/export-html.mjs      Journals -> a folder of standalone web pages
scripts/zip.mjs              A zip writer, since Foundry ships no archiver
scripts/export-css.mjs       The CSS actually painting a page, for style-less exports
scripts/export-terms.mjs     The personal-use notice shown before an export
scripts/color-tools.mjs      Color conversion, and sampling colors from the page
scripts/editor-menu.mjs      The Illuminus menu in the journal page editor
scripts/template-store.mjs   CRUD over the world's page templates
scripts/template-presets.mjs The bundled templates
scripts/apps/template-manager.mjs  The template library window
scripts/apps/                The GUI (library, editor, color picker, assignment dialog)
styles/illuminus.css         Skeleton rules + GUI styling
styles/illuminus-generated.css  Heading, box, tag, and image rules; from a generator
styles/illuminus-export.css  The little Foundry provides that an exported page needs
templates/                   Handlebars templates
tools/                       Validation, string generation, and the test sandbox
tools/fixtures/              Test data, including the style the checks work with
```

## Checks

```bash
node tools/validate.mjs        # static cross-checks; no Foundry needed
tools/sandbox.sh up            # throwaway Foundry + headless Chrome
node tools/test-in-app.mjs     # drives the real app and asserts computed styles
tools/sandbox.sh down
```

The sandbox builds its own data directory so tests never touch a live world. See
[.claude/CLAUDE.md](.claude/CLAUDE.md) for the workflow and the Foundry v14 API traps.

## How it works

A style is stored as plain data, never as CSS text. Two pieces do the work:

1. **The compiler** turns a style into CSS custom properties only —
   `--ill-page-background: #ece0c6` and so on — scoped to
   `.illuminus-styled[data-illuminus-style="<id>"]`.
2. **The skeleton stylesheet** (`styles/illuminus.css`) holds every actual rule, written
   once against those properties: `.illuminus-styled .journal-entry-content {
   background-color: var(--ill-page-background) }`.

A style therefore supplies *values* to rules the module already ships; it can never
introduce a rule of its own. That is what makes importing a style file from a stranger
safe, and it is why applying, changing, or clearing a style needs no re-render — only a
class and a data attribute change on the sheet root.

Six heading levels, ten box styles, ten tag styles, ten image styles, and a background
image layer behind every fill color are all sets of near-identical rules, which CSS
cannot express once. They live in `styles/illuminus-generated.css`, written by `node
tools/generate-block-css.mjs` from templates with every property name taken from the
schema — so a renamed field is a generator error rather than a rule that quietly stops
working. Do not hand-edit that file.

Both the compiler and the entire GUI are generated from `scripts/style-schema.mjs`.
Adding a new style property means adding one line there plus one rule in the stylesheet;
the tab, the section, the control, and the export format follow automatically.

The schema is organized as **groups → sections → fields**. A group is a tab, a section
is a collapsible block, a field is one control. Since every side and corner is its own
field, the stylesheet reads them back through CSS shorthands, so one declaration consumes
four variables:

```css
border-width: var(--ill-page-border-top-width) var(--ill-page-border-right-width)
              var(--ill-page-border-bottom-width) var(--ill-page-border-left-width);
```

### Schema versions

Splitting a compound property renames it, and `cleanSettings` discards anything it does
not recognize — so a style saved under an older schema would silently lose those values.
`scripts/migrations.mjs` translates old keys into new ones on the way out of the store,
before that filter runs. Migration is not written back on read, only when the style is
next saved, so opening a world never rewrites data on its own.

### Adding a property

```js
// in the relevant section's `fields` array in style-schema.mjs
col("footerColor", "#5a4326")
```

Then add `ILLUMINUS.Field.footerColor.label` / `.hint` to `lang/en.json`, and a rule in
`styles/illuminus.css` consuming `var(--ill-<group>-footer-color)`. A field may also
supply an `emit` function to drive several related properties from one control — see
how "Opening Capital" sets float, size, leading, weight, and tint together. Builders
already exist for the repeating families: `borderFields`, `cornerFields`,
`spacingFields`, `shadowFields`, `textShadowFields`, and `textFields`.

## Development

The Foundry data directory contains a symlink:

```
/Users/sean/Documents/FoundryVTT/Data/modules/illuminus -> /Users/sean/Local/Development/Illuminus
```

Edit files here and they are live in Foundry immediately. `module.json` declares hot
reload for `styles/`, `templates/`, and `lang/`, so CSS, Handlebars, and localization
changes apply without a refresh once **Hot Reload** is enabled in Foundry's setup
options. Changes to `.mjs` files need a browser refresh (F5).

Enable **Debug Logging** in the module settings for `illuminus |` console messages.

## Public API

```js
const illuminus = game.modules.get("illuminus").api;

illuminus.openManager();                        // the style library
illuminus.openEditor(styleId);                  // the tabbed editor
illuminus.pickStyleFor(journalEntry);           // the assignment dialog
illuminus.listStyles();                         // every style, sorted by name
illuminus.assignStyle(journalEntry, styleId);   // apply ("" to clear)
illuminus.exportStyles([styleId]);              // download as JSON
illuminus.openExport({styleId, entryIds});      // the web-page export dialog
illuminus.exportJournals({                      // build and hand it over
  styleId, entryIds, format: "print"            // "folder" | "file" | "print"
});
await illuminus.buildJournalExport({            // the archive itself, unsaved
  styleId, entryIds, secrets: false             // -> {blob, filename, report}
});
```

## Conventions

- Never hard-code the module id — import `MODULE_ID` from `scripts/constants.mjs`.
- Never hard-code user-facing text — add a key to `lang/en.json` and localize it.
- Never write CSS jargon into a label. The GUI is for people who do not write CSS.
- Register settings in `init`, read world documents no earlier than `ready`.
- Prefix every CSS class with `illuminus-` so styles cannot leak into core UI.

## License

[MIT](LICENSE).
