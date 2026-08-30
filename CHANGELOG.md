# Changelog

Everything notable that has happened to Illuminus, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Going forward, every commit that changes what a person can see or do gets a line
here, and every version bump gets a heading with the date it was cut.

Two conventions worth knowing before you read it:

- **A schema version is not the module version.** `SCHEMA_VERSION` in
  `scripts/constants.mjs` counts the times stored styles have had to be migrated,
  and it moves independently. Where a release changes it, the entry says so.
- **Nothing has been released yet.** There are no git tags, so every entry below
  sits under Unreleased. The first tagged build will take the whole of it.

## [Unreleased]

### Added

- **The color picker says a color both ways.** Hue, saturation and lightness by
  default — which is how a person thinks about a color — with a switch beside
  the sliders for red, green and blue, remembered per person. The color it keeps
  is the red-green-blue one and the other is worked out for the sliders, so
  going there and back cannot drift it; and the hue shown is the one kept beside
  the color rather than read back out of it, so draining a color of its color
  and bringing it back leaves you in the hue you were working in.
- **A link's icon can be colored.** Foundry puts a mark in front of a link to
  something in your world — a figure beside a character's name, dice beside a
  roll — and drags one in when you drop a record into a page. Links → Text now
  has an Icon Color for it, and a hovered one beside it. Left empty it takes the
  link's own color, as it always did.
- **US English throughout, which the module always said it used.** 2,072 British
  spellings had accumulated, 1,931 of them in wording a person reads — a file
  saying "colour" in one hint and "color" in the next, beside a CSS property
  spelled the American way regardless. A check now holds the line.
- **Every fill can graduate and frost.** 60 of the 70 fills in the schema now
  offer both, against 31 and 25 — the contents panel's entries, sub-headings,
  categories, search box and buttons; both window frames, their title bars and
  every button on them; the page editor's bar, its settings, its toolbar and
  drop-downs; a table's header row; highlighted and code text; a revealed
  secret and its Reveal button; a collapsible and the line that folds it; and
  the six heading levels, which had gradients and now frost too. The ten left
  are the hovered fills, which take theirs from the control they stand in for.
- **A gathered run says which kind it is.** Its name was worked out by taking
  the short label away from the long one, so a tab whose wording had not loaded
  showed every box shadow as a bare "Shadow" — two of them in any category
  holding an inner and an outer, with nothing to tell them apart. The kind is
  read from the control's own name now, so Inner, Outer and Text Shadow are
  distinct whatever the wording is doing.
- **No category holds two controls of one name.** A collapsible's disclosure
  line and the block it folds had two "Top Padding", two "Frosting" and two of
  each gradient control; a term and its definition had two "Text Style" and two
  "Italic" on six tabs. Where a category holds two of a thing, each control now
  says which it belongs to, in the same words that category already used for the
  ones it got right.
- **A lettering shadow says it is one.** It read "Shadow", which put it beside an
  Inner Shadow and an Outer Shadow with nothing to tell it from either — and
  where a tab letters several things, three runs answered to the one word. It
  reads "Text Shadow" now, with the part that casts it in front where a tab has
  more than one: the Tables tab reads Text Shadow, Header Text Shadow and
  Caption Text Shadow. Reported on Links, found on twelve tabs.
- **The Default Box and the Default Image are what their treatments are.** A
  plain box could not be given a width, floated, turned, or held in view while
  the page scrolled past, and a style could not reach a heading inside one —
  all of which any of its five treatments could do. A plain picture could not be
  floated, flipped, cropped to a shape, placed, frosted or given an inner
  shading. Both now have what their treatments have, and the treatments gained
  the caption capitals only the Default had. Three things are deliberately not
  shared, and say why in the schema: a plain picture aligns with the margins
  that tab already offers, states its width as a share of the column, and cannot
  carry a background picture, because its fill sits on the picture itself rather
  than behind content.
- **Gradients and frosting where they were promised and missing.** Five fill
  categories named a Gradient or a Frosting in their own layout order and never
  had one — a control named but never created is silently ignored, which is why
  nobody noticed. Links and the journal's Title gained both, secret passages a
  gradient, and the page surface and the Default Box a frosting. Frosting on a
  link is the one worth knowing about: a link sits *over* the page, so blurring
  what is behind it does something real.
- **Word Spacing wherever Letter Spacing already was.** Twenty-one lettering
  categories offered one without the other — the contents panel's category rows,
  both window title bars, links, secret passages, table headers, and every box
  and tag treatment. They are the same kind of control and are no use apart.
- **The editor can be read in CSS's own words.** Configure Settings → Illuminus
  → Setting Names switches every control from plain language to the property it
  writes — "Top Padding" to `padding-top`, "Top-Left Corner" to
  `border-top-left-radius` — for somebody who already writes stylesheets. Only
  the names change; the explanation under each control is the same either way,
  and it is per person rather than per world. Plain language stays the default.
  The wording is read out of the stylesheets rather than written by hand, so a
  rule that changes takes its wording with it.
- **A parts tree in place of the tab strip.** The editor is three columns now —
  what a journal is made of down the left, what it looks like in the middle, and
  what can be said about the part you picked on the right. The tree nests by
  containment: the window holds the page, the page holds its headings and its
  boxes, and each treatment family sits under the plain thing it varies.
- **The contents panel and the page editor hold parts of their own.** Page
  Entries, Sub-headings, Category Rows, Search Box, Panel Buttons, Page Numbers,
  Page Settings Bar, Toolbar and Drop-downs each became a part with its own
  entry, changed-count, reset and hovered state. *(Schema 11.)*
- **Treatments for lists and tables.** A Default List and a Default Table for
  anything untreated, and five named treatments of each applied from the editor's
  Illuminus menu — because a stat block and a treasure table want to look
  different.
- **A Default Tag**, and a Default entry at the head of the Tag menu that applies
  it. Unlike a box or a picture, a plain tag cannot be reached by removing a
  treatment: a tag *is* the mark, and removing it leaves bare words.
- **Line Breaking and Hyphenation** on every lettering family. Two lines that come
  out very uneven can be evened up, a last line left carrying one word can be
  avoided, and a long word can be broken rather than open a gap in a narrow
  column.
- **Picture Shape.** A picture treatment can crop to a named shape — Square,
  Landscape, Widescreen, Panorama — and say how the picture fills it and which
  part is kept.
- **Frosting.** One control per fill blurring what is behind it, on both window
  frames, the contents panel, secret passages, and every box, tag and picture
  treatment.
- **Placing.** A block or a picture treatment can be held in view while the page
  scrolls past it, or nudged from where the page puts it.
- **Turn and Size.** A photograph pinned to the page at a slight angle, and a part
  drawn larger or smaller than the room it takes up.
- **Gradients on every fill**, and **worked pictures** — a background picture can
  be softened, brightened, drained of color, or aged before it is laid down.
- **Corner shapes.** A corner can be a bevel, a notch, a scoop or a squircle
  rather than a rounding, reading the same size `border-radius` does.
- **Layout controls** on the parts that can carry them: display, row direction and
  wrapping, alignment, gap, and the room a part may take.
- **Three sample styles**, seeded into a world on first run and restorable from the
  style library. They are built from exported style files by
  `tools/build-presets.mjs`, which keeps only what differs from the schema's own
  defaults — so a preset says what the style says rather than repeating every
  setting the schema has.
- **A zoom slider over the Live Sample**, and a switch to stop the sample
  answering the pointer while you work (on by default).
- **The settings pane names the part it belongs to**, in the same words the tree
  uses.
- **A changelog**, which is this file.

### Changed

- **Every treatment family holds five members rather than ten.** Ten meant eight
  nobody used and a full set of settings for each in every style file. Even with
  lists and tables added, the schema came out smaller than before: 8,983 fields
  against 10,118.
- **Boxes and Images became Default Box and Default Image**, which is what they
  always styled — the untreated thing, beside the named treatments of it.
- **Inner and outer spacing are one diagram**, and **borders and corners another**:
  eight inputs around a dashed ring, and a thickness on each edge with the chosen
  side's style and color beneath it.
- **Repeating runs of controls are gathered and folded.** A box, a shadow and a
  picture each fold to a line saying what they are set to, built from the values
  themselves, and a run the style says nothing about reads "Nothing set" and
  starts closed.
- **The editor wears Foundry's own clothes** — its variables, its type scale, its
  monospace face — so it dates with the application rather than against it.
- **Reset Tab and Reset All sit above the tab's own controls** rather than beside
  them.
- **The tree pane is sized to what it holds** rather than to a fixed width.
- **Licensed under the GNU GPL v3** rather than MIT, so the module cannot be
  folded into something closed. Anything bundled travels under the same terms,
  which is a narrower gate for artwork than MIT was.

### Fixed

- **A secret passage's Inner Shadow did nothing.** Its rule said `box-shadow`
  twice — the whole of it, and then an outer-only one further down that quietly
  replaced it. Legal CSS with no warning: the later declaration simply wins, and
  the inner-shading controls went on writing a value nothing read. Both
  stylesheets were swept for the same fault and this was the only one; a check
  now refuses any rule that states a property two ways.

- **Pointing at anything no longer changed it.** Every hovered and selected
  control is derived from an ordinary one and starts empty, meaning "leave it
  alone" — but an unset one was answering with a sensible default rather than
  with silence, and that answer then won the very fallback meant to reach past
  it. 276 controls did this. A background picture re-tiled itself, moved to the
  corner and then vanished the moment a pointer arrived; bold lettering came
  back at its ordinary weight; small caps fell away; a drop cap collapsed; a
  list took the browser's own bullet. Reported as an inner shadow looking
  different on hover, which it never did — the picture behind it had gone.
- **The editor opens when pressed as a window closes.** An application goes on
  saying it is on screen for a frame or two after it is asked to close, so
  opening one "already open" could hand back a window on its way out — and the
  editor then drew nothing at all.
- **A new style now looks like an unstyled journal**, which is what it always
  claimed to do. Measured across every element of the journal and the page
  editor, a brand new style differed from a plain Foundry in 380 places; it
  differs in 8, and each of those is a decision written down rather than an
  oversight. Two things got it there. Where a rule can carry it, an unset
  control now hands the element back to whoever painted it — Foundry, the game
  system, or another module — rather than quietly taking that painting away;
  and where it cannot, because four controls share one declaration, the default
  is now the value Foundry actually paints, measured rather than guessed.
- **An unstyled journal showed a folding marker beside every heading.** The
  markers are written into every page the module renders, so that a page gaining
  a style needs no re-render — but the rule that hides an unwanted one was
  written for styled journals alone. Installing Illuminus and assigning nothing
  now leaves a journal exactly as Foundry drew it.
- **The Category and Level icons in the page editor** came out as an empty box.
  Foundry hangs the FontAwesome classes on the label itself, so a typeface set
  for the page's own settings landed on the element the icon font was named on.
  The words beside those controls still take the style's lettering; the icons
  keep their own face — and the fill, edges and spacing now go to the control
  rather than to the caption beside it, which is where Foundry puts them.
- **The page editor's drop-downs all unfurled at once**, over the page, with
  bullets on every entry. The Default List rules reached `.journal-page-content
  ul`, and ProseMirror's content element carries that class while the toolbar is
  built from `<menu><ul>` — so they beat core's `display: none` from a later
  cascade layer. The list rules now stay out of menus.
- **Folding did nothing on Heading 1.** A page's title is its level 1 heading and
  lives outside the page content, so it never got a marker — which is why
  Heading 2 worked and Heading 1 appeared broken. The title now folds the page.
- **A derived hovered control spoke at zero.** A field's own `emit` ran before
  "nothing to say at zero", so a hovered Size twin emitted `scale(0)` and would
  have collapsed whatever was pointed at.

- **The Selected state survived the panel split.** It is keyed `group.section`,
  so the current-page and chosen-heading controls would have silently stopped
  being derived.
- **Panel buttons kept their hover** through the same split, which needed the new
  parts naming in the list of tabs that ship real hovered colors.
- **Two controls no longer write one setting.** Tag treatments had a Least Width
  from two different places; `validate.mjs` now refuses any group that declares a
  name twice.
- **A tick box shows its tick again.** Writing Foundry's own `--checkbox-…`
  variables from unset controls *defined* them as empty, and both glyph layers
  took the same color.
- **An unset control cannot rub out what it feeds.** A field emitting an empty
  value defines a custom property as empty rather than leaving it absent, which
  made `var(--x, fallback)` resolve to nothing.

### Removed

- **The Disable Hovered State switch.** An unset hovered control already changes
  nothing, so it only ever did something on the four tabs that ship real hovered
  colors — and those are meant to answer the pointer.

- **Scroll bar controls.** Foundry states `scrollbar-width` and `scrollbar-color`
  on `*`, and Chromium answers a stated one by drawing the bar itself and ignoring
  every `::-webkit-scrollbar` rule — so a style could only take the whole bar or
  leave it, and the bar it drew was a poor thing beside Foundry's.

## Earlier work, before the changelog began

Kept in outline, since the commits carry the detail.

### 2026-08-25 to 2026-08-27 — the editor overhaul

The compact box and edges diagrams, gathered runs, the parts tree, the
three-column window, corner shapes, layout and placing controls, gradients,
frosting, picture work and shapes, line breaking and hyphenation, list and table
treatments, and the split of the contents panel and the page editor into parts.

### 2026-08-22 to 2026-08-24 — the page editor, and a false start

Named the bars, icons and rows of the editing window so a style could reach them,
painted the parts it could not, put the tick back in the tick box, and let the
Edit pencil rise to the journal's title. Scroll bar controls were built and then
taken out again as bad in use.

### 2026-08-17 to 2026-08-19 — states, headings, and the sample

Hovered states everywhere, left off until asked for; heading levels drawn at one
size with level 1 painting the page title; columns per heading level; a sample
journal built from the same markup as the editor's own sample; and five passes
over the editor for order, sections, hints, hovering and the Page tab.

### 2026-08-15 to 2026-08-16 — exporting

A styled journal leaves Foundry as a folder of web pages, one self-contained
file, a printable document, or a stylesheet on its own. Printing gained a
contents page, real margins, color, and an honest note about which browsers
write a PDF whose links survive.

### 2026-08-11 to 2026-08-14 — the module

Per-journal styling through a plain-language GUI; every compound property split
into independent controls; tabs for the contents panel, the window, secrets, and
everything else a page can hold; ten content blocks, picture treatments and
inline tags with an Illuminus menu in the page editor; page templates; a color
picker with a shade ramp, named colors and an eyedropper that reads the page
rather than the screen; and a search across every setting.

### 2026-08-16 — the artwork was removed

The placeholder textures and the sample styles that used them were deleted: their
provenance could not be stated honestly in the README. The module ships no
artwork and no styles, and a world starts empty until its first style is made.
