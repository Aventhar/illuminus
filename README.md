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
- **Everything is a GUI control.** 570 settings across 13 tabs and 83 collapsible
  sections, labelled in ordinary language — "Top Thickness", "Opening Capital",
  "Picture Blending" — with a one-line explanation under each. No CSS is typed or shown.
- **The whole window, not just the page.** A Sidebar tab styles the contents panel —
  page entries, the current-page marker, page numbers, sub-headings, category rows, the
  search box, and its buttons — and a Window tab styles the frame, the title bar, its
  icon buttons, and the edit pencil that appears over a page.
- **Nothing is collapsed into one control.** Each of the four borders has its own
  thickness, style, and colour; each corner its own rounding; each side its own padding
  and margin; each shadow its own offset, softness, size, and colour. A **Match** button
  in each section copies one value across its siblings when you do want them the same.
- **Live sample.** The editor carries a miniature journal that repaints as you drag a
  slider, and any real journal already open repaints too. The sample reveals the sidebar
  while the Sidebar tab is open, and gives the width back to the page otherwise. Nothing
  is written to the world until you press Save.
- **Transparency is visible.** Colour swatches are drawn over a chequerboard and show
  their alpha, with a fully transparent one labelled "None" — a native colour input
  cannot show alpha and paints `#00000000` as solid black. Type an eight-digit hex such
  as `#00000000` for none, or `#ece0c680` for half strength.
- **Its own colour picker.** Every colour control can copy the colour of anything in the
  Foundry window — fills, borders, and lettering. Point and click; a readout follows the
  cursor showing exactly what will be taken. Hold Option/Alt for lettering colour.
  It reads colours out of the page rather than off the screen, so unlike the operating
  system's sampler and the browser's EyeDropper API it needs no screen-capture permission,
  and it keeps transparency.
- **Textures included.** Background pictures under `assets/Samples/textures/`, reachable
  from the Background Picture control's file browser. The SVG ones — parchment, paper
  fibres, linen, stone, grid, hatch — are greyscale on purpose: the texture supplies the
  grain and the Fill Colour supplies the hue, so one file suits any palette under
  Multiply blending. The JPEG ones carry their own colour, so set Fill Colour to white
  and Picture Blending to Normal to see them as they are. Your own art works just as
  well.
- **Portable.** Export all or selected styles to a JSON file and import them elsewhere.
- **One style included:** Aged Parchment, seeded the first time the module runs in a
  world. It is an ordinary style once seeded — edit, duplicate, or delete it freely.

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
scripts/migrations.mjs       Forward migration of styles saved by older versions
scripts/style-compiler.mjs   Style data -> CSS custom properties
scripts/style-injector.mjs   Keeps the compiled sheet and sheet tagging in sync
scripts/style-store.mjs      CRUD over the world's styles; journal assignment
scripts/presets.mjs          The bundled styles
scripts/io.mjs               Export / import as JSON
scripts/apps/                The GUI (library, editor, assignment dialog)
assets/Samples/textures/     Bundled background pictures
assets/Samples/Pictures/     Bundled artwork, and the sample shown in the editor
styles/illuminus.css         Skeleton rules + GUI styling
templates/                   Handlebars templates
tools/                       Validation, string generation, and the test sandbox
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

Both the compiler and the entire GUI are generated from `scripts/style-schema.mjs`.
Adding a new style property means adding one line there plus one rule in the stylesheet;
the tab, the section, the control, and the export format follow automatically.

The schema is organised as **groups → sections → fields**. A group is a tab, a section
is a collapsible block, a field is one control. Since every side and corner is its own
field, the stylesheet reads them back through CSS shorthands, so one declaration consumes
four variables:

```css
border-width: var(--ill-page-border-top-width) var(--ill-page-border-right-width)
              var(--ill-page-border-bottom-width) var(--ill-page-border-left-width);
```

### Schema versions

Splitting a compound property renames it, and `cleanSettings` discards anything it does
not recognise — so a style saved under an older schema would silently lose those values.
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
```

## Conventions

- Never hard-code the module id — import `MODULE_ID` from `scripts/constants.mjs`.
- Never hard-code user-facing text — add a key to `lang/en.json` and localize it.
- Never write CSS jargon into a label. The GUI is for people who do not write CSS.
- Register settings in `init`, read world documents no earlier than `ready`.
- Prefix every CSS class with `illuminus-` so styles cannot leak into core UI.

## License

[MIT](LICENSE).
