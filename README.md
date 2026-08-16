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

## How this was made

Illuminus was built with the help of an AI assistant (Anthropic's Claude), working to my
direction. The idea, the design decisions, the priorities, and the artwork are mine; much
of the code, the tests, and this documentation were drafted by the assistant and shaped
over many rounds of use and correction.

I mention it because I think you deserve to know how the software you install was made,
and because the way it was made shows in the result: the module carries an automated
suite that drives a real Foundry instance and checks what the styling actually computes
to, rather than what it looks like it ought to do. That is what I lean on instead of
trusting either of us.

No artwork ships with the module today. The images that will — artwork, photography, and
textures alike — are being made by hand with digital tools, without generative AI, and
this note will say so plainly once they are here.

Bugs, misjudgements, and anything that misbehaves in your world are mine to answer for.
Please do [report them](https://github.com/Aventhar/illuminus/issues).

## What it does

- **Styles are per journal.** Assigning a style to one journal leaves every other journal
  untouched. A journal with no style looks exactly as Foundry draws it.
- **Everything is a GUI control.** 2,717 settings across 15 tabs and 381 collapsible
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
- **Everything has a hovered state.** Any lettering color, fill, or edge can be given a
  second value that takes over while the mouse is over it — headings, boxes, tags,
  pictures, table cells, links, sidebar entries. Each starts empty, meaning "leave it
  alone", so nothing changes until you say so. Sizes and spacing are deliberately not
  shadowed: changing those under the pointer makes the page slide out from under it.
- **Saving sets the baseline.** Reset returns a setting, a section, or a whole tab to
  the values the style was last saved with, and the per-tab badges count what has changed
  since then.
- **Live sample.** The editor carries a miniature journal that follows the tab you are
  on — open Tables and the table comes forward while the rest of the page steps back,
  dimmed rather than hidden, because a heading alone on a blank page tells you nothing
  about how it sits in the text. It repaints as you drag a
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
  style and can be named — "Parchment", "Rust heading" — dragged into the order you
  want, and there is a row of the colors you last kept. It is free-floating and
  draggable, and only OK keeps a change.
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
- **Background images from anywhere.** Point the Background Image control at any picture
  in your Foundry data — your own art, a system's, another module's. A grayscale texture
  is best combined with a Fill Color under Multiply blending, so the texture supplies the
  grain and the color supplies the hue; a picture carrying its own color wants Fill Color
  set to white and Image Blending set to Normal.
- **No artwork or styles included — yet.** The sample textures and the sample styles that
  will ship with the module are being made. Until then a world starts empty, and the style
  library is where you make your first one.

## Using it

Three ways in, all GM-only:

| Where | What it does |
|---|---|
| Journals sidebar → **Journal Styles** button | Opens the style library |
| Right-click a journal in the sidebar → **Journal Style** | Assigns a style to that journal |
| A journal's window header → palette icon | Assigns a style to that journal |
| Configure Settings → Illuminus → **Open Style Library** | Opens the style library |
| Style library → **Export Journals…** | Saves journals as web pages |
| Right-click a journal in the sidebar → **Export as Web Pages…** | The same, for that journal |

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
