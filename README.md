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
- **Everything is a GUI control.** 2,469 settings across 15 tabs and 380 collapsible
  sections, labeled in ordinary language — "Top Thickness", "Opening Capital",
  "Image Blending" — with a one-line explanation under each. No CSS is typed or shown.
  Controls that are always set together are one control: **Text Style** offers Normal,
  Bold, and Light with or without italics, rather than a thickness dropdown of nine
  numbers beside a separate slant.
- **Everything a page can hold.** Not just paragraphs and headings: definition lists,
  table captions, collapsible passages, code, embedded sound and video, and the marks the
  editor's own toolbar produces — highlighting, strike-through, underline, abbreviations,
  quotations. Two of those were not merely unstyled but unreadable: a definition's text
  inherited Foundry's near-white, and highlighting arrived as yellow on black.
- **Secret passages are styled too.** Foundry's GM-only blocks arrive tinted purple with
  a Reveal button inside, which fights any page you build. They get their own tab: a fill
  before revealing and a second one after, so a GM can see at a glance what the table has
  already been shown, plus the lettering, the edge, and the button itself.
- **The whole window, not just the page.** A Sidebar tab styles the contents panel —
  page entries, the current-page marker, page numbers, sub-headings, category rows, the
  search box, and its buttons — and a Window tab styles the frame, the title bar, its
  icon buttons, and the edit pencil that appears over a page.
- **Nothing is collapsed into one control.** Each of the four borders has its own
  thickness, style, and color; each corner its own rounding; each side its own padding
  and margin; each shadow its own offset, softness, size, and color. A **Match** button
  in each section copies one value across its siblings when you do want them the same.
- **Finding a setting.** A search box across the top narrows every tab at once and dims
  the ones with nothing in them, so the strip itself answers "which tab has the shadow
  settings?". Where a control has a pointed-at twin, the pair shares one switch instead
  of taking two rows — and a search still reaches the half that is folded away.
- **Saving sets the baseline.** Reset returns a setting, a section, or a whole tab to
  the values the style was last saved with, and the per-tab badges count what has changed
  since then.
- **Live sample.** The editor carries a miniature journal that repaints as you drag a
  slider, and any real journal already open repaints too. Drag the strip on its left edge
  to give it more room or hand the room back to the controls. The sample follows the tab:
  it reveals the sidebar while the Sidebar tab is open and gives the width back to the
  page otherwise, and Box Styles, Tag Styles, and Image Styles take the pane over
  entirely, showing what you are editing against the prose it would interrupt — the only
  way a half-width floated box reads as one. Nothing is written to the world until you
  press Save.
- **Its own color picker.** Clicking a swatch opens Illuminus's picker rather than the
  operating system's: a shade square and hue strip to pick by eye, RGB sliders and numeric
  boxes to be exact, opacity, and the hex including its alpha. Saved colors belong to the
  style and can be named — "Parchment", "Rust heading" — dragged into the order you want,
  and there is a row of the colors you last kept. It is free-floating and draggable, and
  only OK keeps a change.
- **Transparency is visible.** Color swatches are drawn over a checkerboard and show
  their alpha, with a fully transparent one labeled "None" — a native color input
  cannot show alpha and paints `#00000000` as solid black. Type an eight-digit hex such
  as `#00000000` for none, or `#ece0c680` for half strength.
- **Its own color picker.** Every color control can copy the color of anything in the
  Foundry window — fills, borders, and lettering. Point and click; a readout follows the
  cursor showing exactly what will be taken. Hold Option/Alt for lettering color.
  It reads colors out of the page rather than off the screen, so unlike the operating
  system's sampler and the browser's EyeDropper API it needs no screen-capture permission,
  and it keeps transparency.
- **An image behind anything.** Every fill color in the interface has a background
  image beside it — the window frame, the title bar, its buttons, sidebar entries and
  their hover states, headings, the journal title, link highlights, table headers, boxes,
  and every box and image style — each with its own fit, position, blending, and
  strength. The image rides on a layer behind the lettering, so turning its strength
  down fades the image and not the words.
- **Textures included.** Background images under `assets/samples/textures/`, reachable
  from the Background Image control's file browser. The SVG ones — parchment, paper
  fibres, linen, stone, grid, hatch — are grayscale on purpose: the texture supplies the
  grain and the Fill Color supplies the hue, so one file suits any palette under
  Multiply blending. The JPEG ones carry their own color, so set Fill Color to white
  and Image Blending to Normal to see them as they are. Your own art works just as
  well.
- **Tag styles for a few words at a time.** Ten of them, applied to a selection rather
  than a whole box: trait tags, rarity badges, and the rank at the end of a statblock
  title line — select the words, pick one from the same menu. Each has its own lettering,
  fill, image, border, corners, shadow, and spacing, and can be pushed to the right-hand
  end of the line it sits in, which is all a title line needs. A tag with nothing in it
  is not drawn, and a box can be set to disappear when left empty, so an unused slot in a
  template leaves no hole.
- **Box and image styles, from the editor.** Ten of each, styled on their own tabs and
  applied from an **Illuminus** menu in the journal page editor: put the cursor in a
  paragraph, pick a box, and it becomes a read-aloud panel, a sidebar, a stat block —
  whatever that style makes it. The menu lists them by the names the style gives them, so
  a style can call its first box "Read-aloud" and its second "Sidebar". "Remove Illuminus
  styling" takes it off again. No HTML is typed.
- **Page templates.** Ready-made structures — a stat block frame, a read-aloud box, a
  location entry, a player handout, a GM aside — dropped into a page from the same
  Illuminus menu. Select anything you have built and "Save selection as template" keeps
  it for next time. Templates carry *structure*, never colors or sizes, so the same
  template looks like a Pathfinder hazard under one style and a starship manifest under
  another. They import and export as JSON like styles do, and an imported one is parsed
  through Foundry's own editor rules, so it can carry no more than a person could type.
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

## Where things are

| I want to… | Go to |
|---|---|
| Build or edit a look | Journals sidebar → **Journal Styles** |
| Put a look on a journal | Right-click the journal → **Journal Style** |
| Drop a ready-made page structure in | The page editor's **Illuminus** menu → **Template** |
| Keep something you built for next time | Select it, then **Illuminus → Template → Save selection as template** |
| Tidy or share templates | Journals sidebar → **Templates** |
| Get a deleted sample back | Style library → **Restore Samples** |

## Finding your way around the editor

- **Search every setting** from the box at the top. It narrows every tab at once and
  dims the ones with nothing in them, so the tab strip tells you where to look.
- **Sections start closed.** Open the one you want; the editor remembers.
- **Reset** works at three sizes — one section, one tab, or the whole style — and always
  returns to what you last *saved*, not to the factory settings.
- **Nothing is written until you press Save**, and closing with unsaved changes asks first.

## For developers

How a style becomes CSS, the file layout, the checks, and the public API are in
[ARCHITECTURE.md](ARCHITECTURE.md).

## License

[MIT](LICENSE).
