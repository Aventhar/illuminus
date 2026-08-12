# Illuminus

Decorative styling for [Foundry Virtual Tabletop](https://foundryvtt.com/) journals,
applied **per journal** and configured entirely through a plain-language GUI — no CSS
knowledge required.

The goal is the look of a professionally produced adventure: parchment pages, banner
headings, boxed read-aloud text, ruled tables, drop caps. Build a look once, then apply
it to whichever journals should wear it, and export it to carry into another world.

- **Foundry compatibility:** v14 (minimum `14`, verified `14.365`)
- **Game system:** system-agnostic — core Foundry APIs only
- **Build step:** none. Plain ES modules and CSS, loaded directly by Foundry.

## What it does

- **Styles are per journal.** Assigning a style to one journal leaves every other journal
  untouched. A journal with no style looks exactly as Foundry draws it.
- **Everything is a GUI control.** 120 settings across 11 tabs, labelled in ordinary
  language — "Inner Margin", "Opening Capital", "Which Edges Are Marked" — with a
  one-line explanation under each. No CSS is typed or shown.
- **Live sample.** The editor carries a miniature journal that repaints as you drag a
  slider, and any real journal already open repaints too. Nothing is written to the world
  until you press Save.
- **Portable.** Export all or selected styles to a JSON file and import them elsewhere.
- **Four styles included:** Aged Parchment, Midnight Codex, Clean Manuscript, Datapad.
  They are ordinary styles once seeded — edit or delete them freely.

## Using it

Three ways in, all GM-only:

| Where | What it does |
|---|---|
| Journals sidebar → **Journal Styles** button | Opens the style library |
| Right-click a journal in the sidebar → **Journal Style** | Assigns a style to that journal |
| A journal's window header → palette icon | Assigns a style to that journal |
| Configure Settings → Illuminus → **Open Style Library** | Opens the style library |

Adding fonts: Illuminus offers whatever font families Foundry knows about, so install
custom fonts through Foundry's **Configure Font Families** menu and they appear in every
Typeface dropdown.

## Layout

```
module.json                  Manifest — id, compatibility, entry points
lang/en.json                 Every user-facing string
scripts/module.mjs           Entry point; hooks and public API
scripts/constants.mjs        Module id, setting and flag keys, logger
scripts/settings.mjs         game.settings registration
scripts/style-schema.mjs     THE source of truth: every style property
scripts/style-compiler.mjs   Style data -> CSS custom properties
scripts/style-injector.mjs   Keeps the compiled sheet and sheet tagging in sync
scripts/style-store.mjs      CRUD over the world's styles; journal assignment
scripts/presets.mjs          The bundled styles
scripts/io.mjs               Export / import as JSON
scripts/apps/                The GUI (library, editor, assignment dialog)
styles/illuminus.css         Skeleton rules + GUI styling
templates/                   Handlebars templates
```

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

Both the compiler and the entire GUI are generated from `scripts/style-schema.mjs`.
Adding a new style property means adding one line there plus one rule in the stylesheet;
the tab, the control, and the export format follow automatically.

### Adding a property

```js
// in the relevant group's `fields` array in style-schema.mjs
color("footerColor", "#5a4326")
```

Then add `ILLUMINUS.Field.footerColor.label` / `.hint` to `lang/en.json`, and a rule in
`styles/illuminus.css` consuming `var(--ill-<group>-footer-color)`. A field may also
supply an `emit` function to drive several related properties from one control — see
how "Opening Capital" sets float, size, leading, and tint together.

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
```

## Conventions

- Never hard-code the module id — import `MODULE_ID` from `scripts/constants.mjs`.
- Never hard-code user-facing text — add a key to `lang/en.json` and localize it.
- Never write CSS jargon into a label. The GUI is for people who do not write CSS.
- Register settings in `init`, read world documents no earlier than `ready`.
- Prefix every CSS class with `illuminus-` so styles cannot leak into core UI.
