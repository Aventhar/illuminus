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

**The sandbox is on 30002, and 30000 is the desktop app's live world.** A one-off
script that hardcodes 30000 does not fail — it joins the live server as
Gamemaster and drives the user's real world, and nothing about the page it shows
says so. It happened here: three throwaway styles were created and deleted in a
live world before the port was noticed. The lock rule above is about a second
*server* on the same `dataPath`; this is the other way in, through the running
server's own API, and it is just as much "testing against a live world".
Anything driving the sandbox by hand must take the port from
`ILLUMINUS_TEST_PORT ?? 30002`, as `tools/test-in-app.mjs` does, and check
`game.world.id` before it writes anything.

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
- **Scroll bars are not worth offering, and this is why.** Foundry states
  `scrollbar-width: thin` and `scrollbar-color` on `*`, and Chromium answers a stated one
  by drawing the bar itself and ignoring every `::-webkit-scrollbar` rule — where a
  thickness, an edge and a corner live. A style could therefore only take the whole bar
  or leave it, never adjust it, and the bar it drew was a poor thing next to Foundry's.
  A Scroll Bars category was built behind a switch on that basis and taken out again as
  bad in use. Do not add it back without a better mechanism than a switch. Two facts
  worth keeping from it: those pseudo-element rules are still *there* while they are
  ignored, so reading `::-webkit-scrollbar-thumb` says a bar is painted when none is —
  read what the browser reserved (`offsetWidth - clientWidth`); and the mirror skips
  `::-webkit` selectors, so anything under one would want `noTwin`.
- **A page clips what scrolls inside it, so the Edit pencil cannot rise above it.**
  Foundry hangs the pencil inside the page's own `article`, which scrolls in a box with
  `overflow: hidden auto` — a Distance From Top that lifts it past that box's top still
  gives it a rectangle, and it is simply not drawn. Reaching the journal's name means
  hanging the container off `.journal-entry-content` instead, which `scripts/edit-button.mjs`
  does at render: nothing stored, undone before it is redone, and only where one page is
  on show, since a long scroll gives every page a pencil and a stack of them in one
  corner is worse. Moved there it must also be made visible and clickable outright —
  core reveals it when the *page* is hovered, and the page is no longer under it.
- **A control that answers a question no value can says `noCss`.** Where an element hangs
  is a move made at render, not a declaration, so such a field is drawn in the list like
  any other and exempted in `validate.mjs` from "every control produces a declaration" —
  the same exemption `chrome` fields get for driving the compiler.
- **A picture layer takes `position: relative` for its host,** which is not always the
  host's to give. The Edit pencil is `sticky` inside a container as tall as the page, and
  its own layer — and its pointed-at layer, whose host rule is the same button with the
  state stripped off — held it still, so a styled journal never had Foundry's behaviour
  and the pencil sat where the title is. Where a control decides an element's position,
  the layers must say `host: false` and leave it to the control.
- **Setting one of core's own variables is the same trap.** The tick box on the page
  editor is drawn by Foundry rather than by the browser — `appearance: none`, a glyph in
  `::before`, and a second one in `::after` once it is ticked, with every part fed
  through `--checkbox-…` properties. Writing those from unset controls
  (`--checkbox-checkmark-color: var(--ill-…)`) *defined* them as empty, so both glyph
  layers took the same inherited color and the tick disappeared into the box, which had
  lost its size with it. Paint the pseudo-elements instead, each falling back to the
  variable it stands in for: `color: var(--ill-…, var(--checkbox-checkmark-color))`.
  Note the tick is transparent by default — a cut-out through the box, not a mark on it.
- **An unset control is not neutral — it takes away what was there.** A rule
  reads `color: var(--ill-…)` with no fallback, and an unset control emits
  nothing, so the property is undefined. That does **not** make the declaration
  go away: it still wins the cascade over whatever core or the game system
  wrote, and *then* becomes invalid at computed-value time, which for an
  inherited property means `unset` — inherit. So a control nobody has touched
  strips the system's own value and makes the element inherit instead. It cost
  343 of 357 differences between a styled editor and an unstyled one, all of
  them the same pair: pf2e's `rgb(231, 209, 177)` becoming Foundry's
  `rgb(239, 230, 216)`. The fix is `var(--ill-…, revert-layer)`, which hands the
  element back to whoever painted it — measured, and it restores the system's
  value exactly. Three things to know about it:
  - **It works as a `var()` fallback**, and it is the *only* honest answer where
    the module has no business having an opinion. Prefer it to copying a value
    out of a running Foundry: a copied number is right in the world you measured
    and wrong in the next system along.
  - **Only for a declaration that is one `var()` on its own.** `border-radius`
    and `padding` read four custom properties each, and `revert-layer` is a
    CSS-wide keyword — it is the whole value or nothing. Those need defaults
    that match instead, which is why some do.
  - **A nested chain needs it on the innermost fallback.**
    `var(--a, var(--b))` with both unset is invalid exactly as a bare one is;
    it must read `var(--a, var(--b, revert-layer))`. Five rules were written the
    nested way and none of them was fixed by the first pass over the file —
    `CSS.getMatchedStylesForNode` is what found them, and reading the stylesheet
    would not have.
  - **It reverts to the previous *layer*, not to "what would have won without
    us"**, so it is not a general undo. Where it gives the wrong answer, the
    control wanted a default.
- **A control that defaults to a value cannot defer.** `revert-layer` fires only
  when the custom property is undefined, so a fill defaulting to `#00000000` or
  a corner defaulting to `0` overrides Foundry however the rule is written. Where
  Foundry paints one element two ways — the contents panel's Previous and Next
  are opaque and Create is at half strength, from one rule of ours — no default
  can be right, and the honest default is an empty one that lets each element
  keep its own.
- **An empty custom property is not an absent one.** `--x: ;` is a *defined*
  property whose value is the empty token stream, so `var(--x, fallback)`
  resolves to nothing rather than to the fallback — and the property it feeds
  becomes invalid at computed-value time and takes its initial value instead.
  A field with an `emit` that returned `""` for an unset choice therefore rubbed
  out whatever it fed the moment a pointer touched it: an unset hovered underline
  took the link's underline away, and an unset hovered spacing moved the thing
  under the pointer out from under it. `fieldToCss` returns null rather than an
  empty value, and the compiler skips one if it ever sees one.
- **A context menu is injected *inside* the thing it was opened on.** Core appends
  `#context-menu` to the target element and sets `position: relative` on it — so a
  listed page's menu lives inside that `li`. Every entry carries `isolation: isolate`
  so its background image blends with its own fill rather than with the panel, and that
  makes each entry a stacking context: the menu's `z-index` can no longer lift it out,
  and the entries *after* it paint over it in document order. The next page's name sat
  across the first menu item and swallowed the click. Core marks the open entry
  `context`, so the fix is to raise **the entry**, not the menu.
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
- **FontAwesome owns `::before`.** An icon is a glyph in that pseudo-element's `content`,
  so a background layer rule setting `content: ""` erases the icon on every button it
  touches — the button keeps its fill, which reads as "the icon color does not work"
  rather than as the icon being gone. Generated image layers therefore ride on `::after`,
  and so does the hand-written page layer, for one rule to remember.
- **Some core styling is fed through element-local custom properties.** A journal
  sheet's header buttons carry `--button-text-color` on themselves, which a generic
  `button { color: var(--button-text-color) }` then resolves. Setting `color` works, but
  set the variable too — the sidebar buttons are styled that way.
- **Buttons animate.** Reading a computed color or size straight after a render can
  return a value part-way through a transition (`14.0717px` rather than `14` or `22`).
  Freeze transitions before measuring:
  `* { transition: none !important; animation: none !important; }`. A test that
  mysteriously reads the old value is usually this, not a cascade problem.
- **Closing the style editor can now decline to close.** It prompts when there are
  unsaved changes, so any *programmatic* `close()` — the manager closing an editor whose
  style is being deleted, a test cleaning up — must pass `{ force: true }` or it will sit
  on a dialog forever. This is the trap it caused: every check that closed a dirty editor
  hung, and the suite stalled at an unrelated one.
- **A secret passage is revealed by its id.** Foundry's Reveal button rewrites the
  page's *stored* markup, finding the passage with a regular expression that matches
  `id="…"` — so a `<section class="secret">` written without one can never be revealed
  and its button does nothing whatever when clicked. The editor gives each secret an
  id as a person makes one (`SecretNode.getAttrs`), and so does anything parsed through
  `foundry.prosemirror.dom.parseString`, which is why templates are safe. Markup turned
  straight into a page is not: `sampleMarkup()` stamps one per page, and a check clicks
  the button and reads what the page ends up holding.
- **A gamemaster is never shown less.** Hiding a passage changes what *players*
  are sent, never what the person running the game reads — the tint and the button are
  how they tell what the table has been shown. "The words are still there after I press
  Hide" is the feature working, and the only honest proof is to enrich the page both
  ways: `enrichHTML(content, {secrets: false})` is what a player receives, and a check
  asserts the hidden passage is missing from it and the revealed one is not.
- **What a reveal changes is 5% of an alpha.** Foundry paints an unrevealed passage
  `rgb(53 0 121 / 5%)` and a revealed one `rgb(0 53 0 / 5%)`, and a new style ships
  both — so "nothing happens when I click Reveal" is usually the toggle working and
  the difference being invisible. Measure the two fills before believing otherwise.
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
- **The menu bar renders drop-downs in the order of the config object's keys.**
  Assigning `config[MODULE_ID]` therefore puts one at the end, past the icon buttons;
  sitting next to Format means rebuilding the object with the key inserted after it.
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

## Templates

A template is stored markup, not styling. Two properties are load-bearing:

- **It is parsed, never injected.** `foundry.prosemirror.dom.parseString(markup, schema)`
  drops anything the editor does not recognise, so an imported template can carry no more
  than a person could have typed. Do not add a second sanitizer — two checks that can
  disagree are worse than one that cannot be bypassed.
- **It names keys, not colors.** `illuminus-box--box01`, never `background: #5e1914`.
  That is what lets one template work under every style, and a check asserts a bundled
  template carries no styling at all.

Insertion is `tr.replaceWith(from, to, doc.content)`; capture is
`dom.serializeString(state.doc.slice(from, to).content)`.

## Bundled assets

**There are none.** The module ships no artwork and no styles: the samples that will come
with it are being made, and what was here before was placeholder material of unclear
provenance. Two consequences worth keeping in mind.

The editor's sample picture and every texture the checks use point at Foundry's own icons
(`icons/svg/...`), which are always present and are not ours to redistribute or to lose.
`validate.mjs` still resolves every `modules/illuminus/assets/...` reference in the source
against the filesystem — so the moment something is bundled again, a wrong path or a
renamed folder fails there rather than 404ing in somebody's game, and the on-disk spelling
is checked too, since macOS forgives a wrong case and a Linux-hosted server does not.

And the checks no longer have a seeded style to lean on. `tools/fixtures/sample-style.mjs`
holds the style they work with, and section [2] creates it — so a run starts by making its
own world state rather than trusting what it finds. Anything bundled later is redistributed
under the repository's GPLv3 license, so only bundle art that may be licensed that
way — which is a narrower gate than MIT was, and rules out most "free for personal
use" art packs.

## Background images

Every fill color has a matching `<prefix>Texture` set — image, fit, position, blending,
strength — built by `imageFields()` and laid out by the `IMAGE_LAYERS` table in
`tools/generate-block-css.mjs`. Forty-odd near-identical rule sets are expanded from that
table rather than written by hand, so a renamed field is a generator error.

Each image rides on a `::before` layer at `z-index: -1` with `isolation: isolate` on the
host, not on the element's own `background-image`. That keeps its strength and blend mode
independent of the lettering in front of it, and keeps a blend mode mixing with that
element's own fill rather than with the page beneath. The host also takes
`position: relative` — **except where Foundry has already positioned it**, which the table
marks with `host: false`; forcing `relative` on a window root drops it into normal flow
and shoves the interface sideways.

Two fills deliberately have no image: the `<img>` fill on the Images tab, which sits
behind a picture rather than behind content and cannot host a layer, and table row and
stripe colors, where `tr` cannot host one reliably.

## Headings

Six levels, `heading1`..`heading6`, sharing one tab as the `headings` family. All six
rule sets are written by `tools/generate-block-css.mjs`; levels 4 to 6 used to borrow
level 3's rule wholesale.

**The tab strip's order comes from `GROUPS`, not from `FAMILIES`.** A group gets its own
tab where it is declared, a family gets one where its first member is declared, and
anything marked `strip: "end"` goes last however early it appears — which is how Sidebar
and Window sit together at the end while styling different things. `FAMILIES` supplies
only the icon, label, and whether members can be renamed (`renamable: false` for heading
levels, since the level is the name).

**Each level columns the text beneath it.** Columns are not a property of the page: a
chapter opening can run wide while the section under it sets in two, so every heading
level carries a Columns section. The text above the first heading belongs to **level 1**,
because the page's title *is* a level 1 heading — giving that run a level of its own left
the first and most obvious heading governing nothing, which is exactly how it was
reported. That needs an element to apply to, and "the paragraphs after this heading" is not
one — `scripts/heading-sections.mjs` wraps each heading's run at render, in the sheet, in
the editor's sample, and in an export. Four things are load-bearing:

- **Nothing is stored.** The wrappers live in what is on screen; the page keeps the markup
  a person typed. A check asserts the saved content has none.
- **Never inside the editor.** ProseMirror's content element carries the same class, and
  moving nodes out from under it breaks the selection it holds — which showed up as an
  inline tag refusing to wrap the selected words, three sections away from anything to do
  with columns. `wrapHeadingSections` skips anything inside a `prose-mirror` or
  contenteditable.
- **It undoes itself first**, because a sheet re-renders on every edit and wrapping a
  wrapper nests a column inside a column.
- **The opening paragraph moved.** `.journal-page-content > p:first-child` no longer finds
  it — anything looking for it must accept the wrapper in between.

**The opening capital is an element, not `::first-letter`.** A browser paints that
pseudo-element with a fixed list of properties, and an outline is not on it:
`-webkit-text-stroke-width` computes to `0px` there however it is written, while
`text-shadow` applies — so half the controls worked and half did nothing. `markDropCap`
wraps the page's first letter in a `span.illuminus-drop-cap` at render, beside the flow
wrappers and under the same rules: never stored, never inside an editor, and put back
before it is redone. Anything comparing rendered markup with a page's own content has to
unwrap it as well as the flows.

**Level 1 also styles the page title**, which the sheet renders in
`.journal-page-header` — *outside* `.journal-page-content`, so it needs naming
explicitly. Its three selectors sat at the head of level 1's selector list; moving the
rules into the generator by cutting from `.journal-page-content h1 {` left them orphaned
and the title unstyled, which is now covered by a check.

**A page rule reaches the editor's own furniture.** ProseMirror's content element
carries `journal-page-content` too, and the editing toolbar is built from
`<menu><ul><li>`. So the Default List rules — written for `.journal-page-content
ul` — matched every drop-down: core hides those entries with `display: none`
from its **compatibility** layer, and a module-layer rule beats that however it
is written, so every menu unfurled at once over the page with our bullets on
each entry. The list selectors carry `:not(menu *)` for this. Anything else
matching `ul`, `ol`, `li`, `button` or `input` under the page content wants the
same thought: the editor is inside the page, not beside it.

## Folding

A heading can fold the run of text beneath it, and a contents entry can fold the
entries under it. `scripts/collapsible.mjs` writes the markers at render, beside
the flow wrappers and under the same three rules: **nothing is stored**, **never
inside an editor**, and **it undoes itself first**.

- **A style says whether a marker can be seen, not whether one exists.** The
  marker goes into every heading that governs something, whatever the style, and
  `--ill-<group>-fold-shown` is what makes it visible. A style that could decide
  which headings get a button would be a style supplying rules, and the whole
  point of the compiler is that it cannot.
- **The glyph is `::before` content**, which is how FontAwesome draws every icon:
  the element the module writes carries the family, and a style names the
  character. That is the one place the "FontAwesome owns `::before`" trap is
  deliberately used rather than avoided.
- **One glyph, turned.** Open is the ordinary glyph rotated by Marker Turn
  (90° by default, pointing a sideways arrow downwards); folded is the same glyph
  at rest. Two glyphs would be two controls saying one thing.
- **The page's title is a level 1 heading, and usually the only one.** Foundry
  renders it in `.journal-page-header`, outside the content, so it has no
  siblings to walk and `runAfter` finds nothing — `markTitle` marks it apart and
  gives it the whole content to fold. Without that, ticking Can Be Folded on
  Heading 1 did nothing on any ordinary page, which reads as the control being
  broken rather than as the title being out of reach.
- **What a heading governs is what follows it until a heading of its own level
  or shallower** — asked for on every click, because the flow wrappers are
  rebuilt on every render.
- **The contents panel's list is flat.** Core writes `li.heading.h2` and
  `li.heading.h3` as siblings, so "the entries under this one" is the run that
  follows it until an entry of its own depth. A page entry folds the whole
  `ol.headings` core appended to it.
- **Only what folding hid is unhidden.** Foundry hides a listed page from the
  players with the same `hidden` attribute, so unfolding stamps and reads
  `data-illuminus-folded` rather than clearing every `hidden` it finds.
- **Which sections are folded is remembered for the session, not stored.** A
  sheet re-renders on every edit and every style change; a reader who had folded
  three chapters away would otherwise fold them again each time. The key is the
  page and the heading's text, because the element does not survive the render
  that replaced it.
- Exports carry no markers. An exported page is a document rather than an
  application, and a button that did nothing would be worse than no button.

## Coverage

The set of things a journal page can hold is **Foundry's ProseMirror node and mark list**
(`nodes` / `marks` in `public/scripts/foundry.mjs`), not guesswork — anything there with
no rule is a gap. Two were worse than unstyled: `dt`/`dd` inherit core's near-white
lettering, and `mark` arrives yellow-on-black, both unreadable on a pale page.

Still uncovered on purpose: `fieldset`/`legend`, `ruby`, and `small`, which the editor
cannot produce without pasted HTML.

## Exporting journals as web pages

`scripts/export-html.mjs` writes a folder of standalone pages. One decision carries the
whole feature: **the export mirrors Foundry's own markup** — `.sheet.journal-entry` with
a `.journal-sidebar` beside a `.journal-entry-content`, holding `article.journal-entry-page`
elements — so every rule in `illuminus.css` applies to it unchanged. There is no second
set of selectors to drift. When something looks wrong in an export, the fix almost always
belongs in `illuminus.css`, not in `styles/illuminus-export.css`, which holds only what
the application itself was providing (the ground behind the window, the flex row, the
panel entry's layout).

**Without a style, the export carries the CSS that is actually painting the page.**
`scripts/export-css.mjs` walks every loaded stylesheet and keeps the rules whose
selectors match the exported markup — a hundred-odd rules out of Foundry's tens of
thousands — which is what makes a game system's look travel. State pseudo-classes are
stripped for the *test* only, so `:hover` rules survive; anything unparseable is kept
rather than lost.

Traps found building it, all of which cost a round of debugging:

- **The export must mirror the app's *state*, not only its structure.** Core hides the
  contents panel's page titles unless the sheet root carries `expanded`, so an export
  without it lists page numbers and nothing else. Computed colors all matched while this
  was broken — only a screenshot showed it.
- **`display: flex` is not enough on the export root.** Core's `.application` sets
  `flex-flow: column`, which stacks the panel on top of the page; the shim states
  `flex-flow: row nowrap` in full.
- **Gathered CSS goes inside `@layer`, and the module's export rules stay outside it.**
  An unlayered rule beats a layered one however specific, which is the only way to win
  against selectors like `.sheet.journal-entry.application .journal-sidebar` without
  writing longer ones — the same mechanism Foundry uses to let modules override core.

- **`.sheet` is load-bearing on the export root.** Core hangs the sidebar width off
  `--sidebar-width-expanded`, and the module feeds the width control into it on
  `.illuminus-styled.sheet.journal-entry`. Drop `sheet` from the exported root's classes
  and the panel silently falls back to its default width.
- **Most text settings mean "use the journal's own"**, which resolves against *Foundry's*
  stylesheet. An export therefore has to carry the default typeface as well as the ones
  the style names, or every page comes out in the browser's default serif. Take the whole
  stack from `getComputedStyle(document.body).fontFamily` rather than naming a fallback,
  or the computed value will differ from the app's in the tail.
- **Foundry ships no zip library** — `scripts/zip.mjs` writes the format directly, using
  `CompressionStream("deflate-raw")` for method 8 and storing when it is missing.
  `validate.mjs` proves an archive by running the operating system's `unzip` over it,
  because our own reader agreeing with our own writer would prove nothing.
- **A non-ASCII filename makes `unzip` prompt** rather than fail, which hangs a
  non-interactive run. Asset names are slugified on the way in.
- `CONFIG.ux.TextEditor.enrichHTML(content, {secrets: false})` **drops unrevealed secret
  sections itself**, so "do not leak GM text" costs nothing.
- The in-app check renders the exported file in a second browser tab over CDP and
  compares computed styles against the live page. That is the only thing that proves the
  feature works, and it caught both the missing fonts and the panel width.

**Three formats, one pipeline.** A folder of pages, one self-contained page, and a page
opened for printing are the same build: `format: "file"` and `"print"` inline the assets
as `data:` URIs and put the stylesheet in a `<style>`, because neither an emailed file
nor a printer goes looking for a folder beside it. Printing is the whole of the PDF
export — every browser prints to PDF, and its dialog is where paper size, margins, and
background ink are chosen. Laying the pages out a second time in a second engine would
only get a worse answer.

- **A `data:` URI must not be made relative.** Stylesheet paths get `../` because the
  sheet lives in `styles/`; prefixing a data URI breaks the picture instead. The texture
  vanished from every printed page until a check compared what the document points at.
- **A printed document opens with a contents page**, because the panel is navigation and
  navigation does not print. Each entry is written as *the same heading tag as its
  target*, so the style paints it with no rule of its own and the tiers are the
  document's own. Every entry is a link, and a browser turns a link to an anchor into a
  real PDF link — which is most of what bookmarks would have been for. Bookmarks proper
  are out of reach: Chrome only writes an outline when `printToPDF` is asked with
  `generateDocumentOutline`, and its print dialog does not offer that.
- **A contents entry needs a long selector.** `.journal-page-content a` sets the link
  color and out-specifies anything shorter, which painted the entries as links rather
  than as the headings they stand in for.
- **`Page.printToPDF` over CDP proves printability** — same engine, same print
  stylesheet a person's Save as PDF uses. The check asserts the bytes start `%PDF-` and
  counts sheets, which is how the page-break rule is covered.
- **Foundry pins its own page open**, and an export carrying its CSS carries that: the
  body is `position: fixed`, full height, `overflow: hidden`, because the application
  scrolls its panels rather than the document. A fixed body is out of flow, so the
  exported page had nothing to scroll — the journal was clipped to one screenful and the
  printout stopped there too. `illuminus-export.css` states `position: static`, `height:
  auto`, and `overflow: visible` for `html, body`. Only a long journal shows this: every
  export in the checks fitted on one screen until one did not.
- **A picture opens in the document, not in a tab.** A link to the file works in a folder
  export and not in a single-file one, where the picture is a `data:` URI — browsers
  refuse to navigate to one at the top level and the tab opens blank. It is an anchor and
  `:target` instead, with the picture's own container becoming the overlay so nothing is
  duplicated; a second copy of an embedded picture would double the file. The link is
  `display: contents`, so it has no box: hit tests must aim at the picture.
- **Printing happens in a window opened on the click itself**, before the notice and
  before the build — a browser allows one while it can still see the gesture, and seconds
  later it cannot. Two things depend on printing a *top-level* document rather than a
  frame: the file is named after the document being printed (a frame gets Foundry's title
  instead), and the contents page's links survive. A frame is the fallback when a window
  is refused, and it lends `document.title` for the duration so the filename is still
  right.
- **The printable document is written into the window, not loaded from a URL.** A print
  preview is rendered by a *second* renderer that reads the page again, so a document
  living at a blob URL — which is revoked eventually, and which a browser may refuse to
  navigate a top-level window to — produces a PDF that will not open. `document.write`
  leaves nothing to lose. The sandbox's Chrome runs with `--disable-popup-blocking` so
  the window path can be checked at all; without it the check passes by skipping.
- **A browser's print dialog leaves "background graphics" off.** That drops every fill in
  the document — not the page's surface only, but the bar behind each heading and the
  panel behind each read-aloud box, leaving an outline of a document. `print-color-adjust:
  exact` is how a page says its colors are content. The checks print with
  `printBackground: false` for exactly this reason; passing `true` hides the bug.
- **Only `@page` gives a margin on every sheet.** Padding applies where a box starts and
  where it ends, so a page running over three sheets leaves the middle one with words
  against the paper's edge — first `@page { margin: 0 }` did that, and then per-page
  padding did it again for the same reason. Nothing paints into a printed margin either:
  the root element's background stops at the page area exactly as the page's own does, so
  a margin means a border of paper and the surface fills what is left.
- **Do not style a picture by asking who its parent is.** The default frame was written
  `:not(.illuminus-image) > img`, so anything between a figure and its picture — a link,
  which the editor can make and an export always makes — sent a treated picture back to
  the default frame, borders and all. It reads `img:not(.illuminus-image img)` now, which
  is what it always meant.
- **A Foundry id may start with a digit**, which is a valid HTML id and an invalid CSS
  identifier. Fragment links and `:target` do not care; `querySelector("#" + id)` throws.
  Exported anchors are prefixed with a letter, and anything looking one up uses
  `getElementById`.
- **Who writes the PDF decides whether its links survive.** Chromium writes its own from
  the print preview and keeps a document's internal links. Safari and Foundry's desktop
  application have none of their own: they hand the job to the operating system's print
  panel, whose Save as PDF flattens the links and will not let a filename be typed.
  Nothing in the document changes it — printing a written window and printing a loaded
  file produce identical annotations, so the difference is entirely downstream. The
  export says so unless it can see it is running in Chromium.
- **A PDF's internal links are named destinations**, and a name nothing defines is a link
  that does nothing. Counting `/Subtype /Link` is not enough; the check resolves every
  `/Dest` against the `/Dests` dictionary.
- **Do not judge a PDF by macOS's thumbnailer.** `qlmanage` rendered a heavy text-shadow
  as a grey box behind the title; Chrome's own viewer shows it correctly. Open the file
  in a browser before believing a rendering bug.

## Exporting a stylesheet on its own

The fourth export format is the look without the words: `format: "css"` returns the
stylesheet the single-file export would have carried, and nothing else. Three things make
it different from the others, and all three are about it landing in somebody *else's*
release rather than on their own shelf.

- **It is renamed on the way out.** A file still answering to `illuminus-styled` and
  `--ill-…` would collide with Illuminus the moment it sat beside it, so the export
  dialog asks for a Custom Descriptor and `rename()` rewrites both spellings — the
  classes and the short form the custom properties wear. The field is required for this
  format alone, and prefilled from the world's name, because a prefix somebody invents on
  the spot is a prefix called "test".
- **It carries no typefaces.** `buildStylesheet` takes `{ fonts: false }` and the gathered
  path strips `@font-face` — a font file is licensed to whoever installed it. The file
  names the faces and leaves finding them to whatever loads it, which the wording says.
- **Pictures still travel inside it**, as data URIs, because a lone `.css` has no folder
  beside it. Whoever exports it licenses those; the wording says that too.

**A `required` field that is hidden stops the whole form.** The export window shows the
Custom Descriptor only for the stylesheet format; marked `required`, it silently blocked
*every other* export — a browser will not submit a form holding an empty required control,
and cannot focus a hidden one to say so. Nothing happened when Export was pressed and
nothing was logged. Requirements that depend on what else is chosen belong in the submit
handler, which is where this one lives.

**`bringToFront()` answers with nothing.** An `open()` that returns it hands the caller
`undefined` whenever a window happens to be open already, which is indistinguishable from
"it did not open". Return the application itself, and re-render rather than hand back an
instance that is still registered but closing.

## The two library windows

The style library and the template library are the same window with different
contents, and are kept that way deliberately: same size, same tick boxes
(`input[name="pick"]`), same toolbar semantics, same empty state. **Selection is read
from the DOM when something asks for it, never mirrored in a field.** The style library
used to keep a `Set` and re-render on every tick to show a count in the button, which
threw away the scroll position and made ticking four styles in a row a fight. If a
count is ever wanted again, write it without re-rendering.

**The Sample badge is a fact about the record, not about the file.** Only
`seedPresetsIfEmpty` and `restorePresets` set `preset: true`, and the first returns
early the moment a world holds any style at all — so a world that already had one
never gets the bundled samples, and importing the very same JSON produces unbadged
styles, because `importStyles` deliberately drops the flag (a downloaded file must not
be able to claim it shipped with the module). "The red tags are missing" therefore
means "these are your imports, not the presets", and the fix is Restore Samples. The
badge itself is fine; nothing about it is worth investigating first.

The preset badge in the style library wore `illuminus-tag` — the same class a journal's
inline tag styles now write, which a style can paint. It is `illuminus-badge-text`, as
in the template library.

## Testing traps found the hard way

- **Turn Foundry's canvas off, or the sandbox strangles itself.** The sandbox
  browser has no GPU, so Foundry's render loop runs in SwiftShader — and it never
  stops: the GPU helper process sat at **811% CPU and 1.77GB** drawing five frames
  a second of a scene no check has ever read, with the machine's load average at
  19. `joinAndWait` sets `core.noCanvas` and reloads once per freshly built
  sandbox, which drops that process to about 15%. Everything timing-shaped in this
  file was tuned against the starved machine, so treat old timing notes with
  suspicion. Symptoms it caused, none of which pointed at it: the join form not
  appearing inside 60s, a closing window outlasting 30s of patience in check [37],
  and `Runtime.evaluate never answered: the devtools socket errored` at two
  different checks on two different runs.
- **The editor renders in about two and a half seconds, not thirty.** It lays out
  some 4,600 controls, and 25–35s was this project's most expensive wrong number:
  it is what `CALL_TIMEOUT` of 300s was set for, and why checks [53], [80] and
  [82] were split so one call would never open the editor *and* redraw it. On a
  machine that is not being starved by the canvas it is 2.2–2.4s, measured
  repeatedly. Splitting those calls is still tidy and the timeout is still a
  cheap safety net, but do not reason from the old figure — and before diagnosing
  any timeout, time the steps in isolation rather than believing a note.
- **A whole run is about fifteen minutes** (640 assertions, 15m25s), so budget
  for that rather than killing one that looks stuck.
- **No backticks in anything written into a template literal.** The checks and
  every one-off probe pass their work to the page as a template literal, so a
  backtick inside it — in a *comment* as readily as in code — ends the string,
  and node fails to parse the file with an error pointing at a line some way
  from the one at fault. It has cost four rounds in one sitting. Write the
  comment without them.
- **Pick a test value the browser would never pick.** A check asserting our
  bullet did not reach the editor's menus used `square` — and `disc, circle,
  square` is the sequence a browser walks for nested lists, which the menus are.
  It failed on the user agent's own styling while the module was behaving.
  `CSS.getMatchedStylesForNode` settled it in one call: `matches()` on the rule's
  own selector was already false.
- **The editor remembers how it was left, so a check must not inherit it.** The
  pane width, the zoom and the hover switch are kept per person now. The grip
  check began from a width a previous run had dragged to and had no room left to
  drag into. It clears `editorView` first, as the world fixtures clear the world.

- **A lost protocol call used to stop a run dead and quietly.** `tools/cdp.mjs` now
  rejects anything in flight when the socket closes, and times a call out at 90s, so the
  failure names the call instead of leaving "fewer checks passed, none failed" — which
  reads as a truncated file rather than a hang. `waitFor` swallows page errors but
  rethrows protocol ones, or a dead socket spends the whole timeout blaming whatever was
  being waited for.
- **`close({force: true})` is the rule, except where the prompt is the point.**
  Check [37] exists to exercise the unsaved-changes prompt; forcing its closes made it
  pass by skipping what it tests. Every *other* programmatic close needs the flag.
- **A Foundry update can look like a broken sandbox.** `sandbox.sh` writes the world's
  `coreVersion`, and a world built for an older build will not auto-launch after an
  update — it wants a migration nobody is there to confirm, and the join page reads
  "Critical Failure". The version is taken from the installed app now. Build 366 also
  replaced the join screen's user *list* with a *name field*, which `joinAndWait` handles
  both of.
- **The "no hardware acceleration" toast covers the top of the window**, and not
  only in screenshots: it is `permanent`, it sits exactly where a journal's name
  is, and a pointer sent to the title lands on the notice instead. Clear
  `#notifications .notification` before any hit test near the top of a sheet,
  not just before capturing.
- **Measure the spot on the click itself.** A page settles for a moment after it
  renders — a typeface arriving moves every line — so a pointer sent to a spot
  measured a second earlier lands beside a heading rather than on it. That is what
  "the hovered color never applied" turned out to be, twice. Re-measure, hit-test,
  and believe the read only once the element says it is hovered.
- **Foundry's tooltip outlives what asked for it.** One left showing over the
  contents panel covers whatever is under it, and a click aimed there lands on the
  tooltip. `game.tooltip.deactivate()` and remove `#tooltip` before a hit test,
  as with the hardware-acceleration notice.
- **Where geometry can decide the answer, compare against an unstyled journal.**
  A context menu that runs past the bottom of a short panel is clipped by the
  panel whatever a style says, so "every entry can be clicked" fails for reasons
  that have nothing to do with us. The honest assertion is that styling covers
  none of it that Foundry does not cover itself — the same shape as the
  hovered-state check, which asks that nothing changes under the pointer beyond
  what core changes.
- **A check that opens windows should close the ones already open.** Earlier
  checks leave sheets on screen, and a pointer sent at a window underneath one of
  them lands on the one on top — which reads as a styling failure three sections
  away from anything to do with windows.
- **Answer the prompt that carries the button.** An answered dialog stays in
  `foundry.applications.instances` for the length of its closing animation, so "the first
  application whose name has Dialog in it" can be the one on its way out — the click
  lands on nothing, the prompt still on screen goes unanswered, and the editor sitting
  there open reads as Discard declining to close. Find the dialog whose element holds the
  button about to be pressed, and report whether it was pressed.
- **A tab that vanishes mid-run was the print frames piling up.** After several
  long runs the page target dies: the run stops with `Runtime.evaluate never
  answered: the devtools socket errored`, and Foundry and Chrome are both still
  up. The cause was ours. `afterprint` never fires in a headless browser, so the
  frame `printDocument` writes into outlives its five-minute fallback and the run
  that made it — and a written `about:blank` frame reports its *parent's* URL, so
  each leftover is a page target sitting at `/game` that only its title tells apart
  from the real tab. Twenty-two of them and 275 workers had accumulated before a
  browser gave out. Two things follow, both now in `connect`: **pick the tab whose
  title is Foundry's**, since `targets.find(t => t.type === "page")` will happily
  attach a whole suite to a leftover print frame; and **close every other page
  target on connect**, so a run cannot inherit the last one's mess. A run that
  still dies this way wants `tools/sandbox.sh down && up`, and `curl :9222/json`
  will say whether targets are piling up again.
- **A crashed run leaves fixtures behind**, and a stray style breaks the seeded-style
  counts three checks in — which looks like a bug in those checks. When counts are wrong
  in section [2], the world is dirty: `tools/sandbox.sh reset`.
- **Never kill a run mid-flight** (a foreground timeout does exactly that). Run it in the
  background and wait, or it will die between creating a fixture and its `finally`.
- **And nothing else may touch the sandbox while it runs.** A one-off script that
  navigates the page pulls the world out from under the suite, which then fails with
  `foundry is not defined` in whatever check happened to be running — a confusing way to
  learn you were driving the same browser from two places.

## The documentation set

Four files, and they do not overlap:

- **`README.md`** is for somebody deciding whether to install it, and then using it. It
  opens by saying where the name comes from — the illuminated manuscripts of the medieval
  scriptorium — because that is the whole design argument in one sentence: how a page
  looks is part of what it says.
- **`ARCHITECTURE.md`** is for somebody changing it. It leads with the one rule everything
  hangs off (**a style supplies values, never rules**) and then says where things live,
  what the checks are, and what a schema change costs.
- **`CHANGELOG.md`** takes a line per commit that changes what a person can see or do, and
  a dated heading per version. Keep a Changelog format. Note the two conventions stated at
  its head: the schema version is not the module version, and nothing has been released
  yet, so everything sits under Unreleased.
- **`.claude/CLAUDE.md`** — this file — is the traps. Anything that cost a round of
  debugging to find out, so it is found out once.

**Screenshots live in `docs/images/` and are captured cropped to one element.** Never the
whole viewport: the sandbox world runs a published adventure, and its artwork and text
would otherwise land in a GPLv3 repository. `Page.captureScreenshot` takes a `clip` from
the element's own bounding rect — position the window first (`app.setPosition`), because a
window Foundry has placed can start off-screen and the clip will cut it. Build a journal
of your own words for anything showing page content, and delete it afterwards; the
editor's Live Sample is already the module's own text and is safe as it stands.

## Generated files — do not hand-edit

- **`SETTINGS.md`** is not kept in the repo — a list of two thousand controls is out
  of date by the end of the week. `node tools/generate-settings-doc.mjs` writes it when
  one is wanted: every tab, every category, and every setting, in the order the editor
  draws them, read from the sorted schema and `lang/en.json`, so it is the interface
  written down rather than a second description of it. A state's own controls get no row
  of their own — the editor draws them in place of the control they stand in for, so the
  row names the states instead.

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

## Boxes, image styles, and tag styles

Ten of each, keyed `box01`..`box10`, `image01`..`image10`, and `tag01`..`tag10`, in the
families `boxStyles`, `imageStyles`, and `tagStyles`. **The family id cannot match the
member word** — page groups already own `boxes` and `images` — and the *class* a member
writes is derived from its id (`box01` → `illuminus-box--box01`), so the stylesheet can
never name something the editor no longer writes. The keys are fixed;
their displayed names live on the style (`labels`) and are edited per style, so markup
and exported styles stay portable when someone renames one.

An inline style is a **mark**, not a node. `AttributeCapture` is applied to every node
*and mark* in Foundry's schema, so the `span` mark carries `classes` through a save just
as `blockquote` does — verified end to end, not assumed. Two consequences: it needs a
selection to attach to (the command returns `false` on an empty one, so the menu entry
simply does nothing), and it is laid out `inline-block`, because vertical padding on a
true inline box spills over the lines above and below rather than growing its own. That
is why a published adventure sets its trait tags as list items in a flex row;
`inline-block` gets the same
shape while still flowing inside a heading or a sentence.

**Anything that enumerates the families must be derived, not spelled out.** `cleanLabels`
matched `/^(block|picture)\d{2}$/` and silently discarded every tag name until it was
changed to check `GROUPS` instead. Renaming is per style, so the failure looked like the
menu ignoring a label rather than the store dropping it.

They share a tab each rather than taking thirty: `FAMILIES` in the editor, with a picker
choosing which member is built. Only the member on show is rendered, which is why the
editor draws ~4,200 controls rather than the schema's ~10,000.

Text and heading settings mean "use the page setting" by default — a size of 0
(`zeroAs: "inherit"`), an `inherit` choice, or an empty color, all of which emit either
the CSS keyword or nothing at all. `validate.mjs` knows a field may legitimately emit
nothing and checks it still compiles once given a value.

## The journal title is an `<input>`

Foundry renders a journal's name as `<input class="title">`, and a replaced element can
carry no `::before` — so the Title tab's Background Image had nowhere to paint and did
nothing at all. The picture now rides on `.journal-header` around it, which means the
input must carry no fill of its own or it covers what is behind it: the box (fill,
picture, edges, corners, spacing) is on the header, the lettering on the input. The
export writes `<header class="journal-header"><h1 class="title">`, so one rule serves
both.

The same reasoning covers the Page tab's Outer Shadow, which the window clips: it is
kept because an *export* shows it, and its hint says so. A section may name its own hint
key in the schema for cases like that.

## The sample, and the sample journal

The Live Sample's page contents live in **`templates/sample-page.hbs`**, not in the
editor's own template, because `scripts/sample-journal.mjs` builds a real journal out of
exactly that markup — a second copy would drift, and a sample journal that no longer
matches the editor is worse than none. Three things follow.

- **A partial referenced by path is not found unless it is named.** `PARTS.body.templates`
  in the editor is what registers it; leaving it out fails at render with "the partial …
  could not be found" and nothing else.
- **Two things are taken out on the way into a journal**: `data-part`, which is how the
  editor dims and scrolls to a piece and means nothing on a page, and the mock Reveal
  button, which Foundry's enricher supplies itself.
- **Compare what was stored, not what is on screen.** The enricher wraps a secret section
  in a `secret-block` and adds that Reveal button, so a rendered page and the sample
  differ by Foundry's own work. The check reads `page.text.content`.

Sample journals are numbered rather than reused, and land in a folder of their own, so
comparing two styles means two journals rather than one being overwritten.

## Editor chrome

**A tab can hold parts of its own, and `SPLIT` is where that is said.** The
contents panel and the page editor were one tab each holding seven and nine
hundred settings; each is now a tab keeping what is true of the whole of it,
with Page Entries, the Search Box, the Page Settings Bar and the rest lifted out
as parts. The split runs *after* the layout pass, because that is what settles
which category holds what, and **every setting keeps the name it had** — only
its tab changes — so `v10_to_v11` is that same table read backwards, from the
schema rather than repeated. Three things had to move with the settings, and
each was a silent failure until a check caught it:

- **`SELECTED_SECTIONS` is keyed `group.section`.** `sidebar.entries` became
  `sidebarEntries.entries`, and without that the current-page and chosen-heading
  states stop being derived at all — the controls simply vanish.
- **`HOVER_ON` names the tabs that ship real hovered colors**, and a part lifted
  out of one needs naming too, or every panel button quietly loses its hover.
- **`IMAGE_LAYERS` and `HOVER_TWIN_ELSEWHERE` name a group per element**, so an
  element whose settings moved must be repointed at the part that holds them.

A stylesheet sweep comes with it: derive the rename table from the schema's own
fields rather than from what the *defaults* emit — an unset color emits nothing,
so a list built from `compileBaseRule()` misses every inherited control.

**The window is a tree, a sample, and the settings, in that order across.** The
parts of a journal hold one another — the window holds the page, the page holds
its headings and its boxes — and a strip of tabs could not say so: a heading and
the window frame sat side by side as though they were the same kind of thing.
`HOLDS` in `scripts/apps/style-editor.mjs` is the one place that says what holds
what; everything else about the tree is read from the schema, and **a part named
nowhere in it sits at the root rather than vanishing**. Four things are
load-bearing:

- **Core's `changeTab` finds a pane through `.tabs [data-group][data-tab]`,** so
  the navigation must answer to that class — and core's styling for it is
  *unlayered*, so worn by the tree it reached every row and drew each one as a
  button that no module rule could quiet. The class lives on a hidden anchor
  holding one empty span per tab, and the tree is styled by this module alone.
- **Switching a tab does not re-render,** so the mark on the current part is
  moved by hand in `#markCurrentPart` — the same reason `changeTab` is
  overridden to move the sample's focus. It also opens every branch holding the
  part on show, so a tab reached from the sample or a search is not folded away.
- **A family's own entry is not the part being worked on.** One of its members
  is, and marking both says the tree cannot tell them apart.
- **Which branches are open lives on the window, not in the markup.** The tree is
  redrawn on every render, and a branch closing under somebody mid-edit reads as
  the tree losing its place.

Two consequences reach further than the tree. The settings sit against the
window's **right** edge now, so the color picker flips to the left of a swatch
far more often than not — it always could, and a check that assumed one side was
asserting the layout rather than the picker. And the drag grip sits on the
sample's right edge, so the settings width is measured from *its* right edge and
a drag leftwards widens the settings.

**A piece the focused one holds is lit with it.** The Page tab's piece is the surface
everything else sits on, so dimming everything that is not the focused part greyed the
whole sample out and left the one tab covering the page with nothing to look at. Neither
a part that holds the focused one nor a part it holds is dimmed — which also keeps a link
lit inside the paragraph it sits in.

The sample **follows the open tab**: pieces of it carry `data-part="<group id>"`, and
the editor dims the rest and scrolls the focused one into view. `changeTab` is overridden
to do it, because switching tabs does not re-render. A family tab focuses the member its
picker names, via `#activeGroupId()`, and a tab the sample has no piece for leaves it
alone.

The filter and the per-state switch are both **derived from what is already in the DOM**,
not from new schema. The filter reads each control's own label and hint text; the switch
pairs `buttonHoverBackground` with `buttonBackground` by name. Both spellings of the
hover half occur — `hoverBackground` as well as `buttonHoverBackground` — so the match is
case-insensitive, and a control whose twin lives in a *different section* is left alone
rather than half-hidden.

**Hovered controls are derived, not written.** Every control the schema declares gets a
state's own counterpart — a color, a size, a spacing, a tick box — and the generator
mirrors every rule under `:hover`, reading the twin first and falling back to the
ordinary value, so an unset hovered control changes nothing rather than resetting the
element. Every section of every tab takes part, the window frame and the contents panel
included: they were left out on the grounds that neither is hovered as an object, which
left most of their settings governing both states at once.

When a selector is a comma-joined list, `:hover` must be appended to **each** member —
`a, b:hover` hovers only `b`, which half-works in silence. **The same is true of
`::before`**, and it fails far worse: `a, b::before` attaches the pseudo-element to `b`
alone and applies the whole rule to `a` itself, so the links layer put `position:
absolute; inset: 0` on every content link in a styled journal and took them out of the
flow. `eachBefore()` in the generator exists for that.

**A hovered state is off until it is asked for.** Each tab holding anything hovered —
derived or written by hand — carries a `hoverOff` toggle, and the compiler emits none of
that tab's hovered values while it is on, so the `:hover` rules fall through to the
ordinary ones. That is what "nothing happens when you point at it" means in CSS, since a
rule cannot decline to apply. The control is `chrome: true`: stored and exported like any
other value, drawn beside the tab's name rather than in the list, and exempt from
`validate.mjs`'s "every field emits a property" checks because it drives the compiler
rather than the stylesheet.

**Two things make that harder than "emit nothing", and both were bugs.** The toggle
defaults to on (hovered state off) everywhere except the four tabs named in `HOVER_ON` —
the contents panel, the window, links, and secrets: those spell their hovered colors out
by hand and ship real values for them, so starting switched off would take away something
the style already does. They are also the four whose elements a reader points at on
purpose. And
where a hovered control ships a real default, staying quiet is not enough — the
*skeleton* paints that default for every style, and it went on painting it with the
switch on. `unhovered()` in the compiler therefore points such a control at the ordinary
one it stands in for (`--…-button-hover-color: var(--…-button-color)`), or at what the
ordinary element paints where there is no such control — `transparent`, `none`. It stays
quiet for the derived controls, whose defaults are empty, so a switched-off tab costs a
handful of declarations rather than a thousand. `ordinaryTwinFor` searches the control's
own section only, so a hovered *entry* fill cannot fall back to the fill of the *panel*
it sits in; `HOVER_TWIN_ELSEWHERE` names the one pair that genuinely spans two sections.

The switch offers **whatever states a section actually has**, from a `STATES` table
matched against field names. A section with no ordinary controls of its own offers only
the named ones — the sidebar's Entry States holds pointed-at and current-page controls,
because the ordinary entry is styled in the section above it, and offering it a "Normal"
that showed nothing would be a lie. A control with no counterpart in another state
belongs to all of them: a button's corner rounding does not change when pointed at.
Turning the hovered state off greys the *hovered* controls and that switch's hovered
choice only — greying the whole switch put the panel's current-page controls out of
reach, since that switch offers pointed-at and current-page and no ordinary state at all.

Filtering and the switch can hide the same control for different reasons, so they use
different classes: a filter hit un-hides a state-folded control (`is-state-suppressed`)
rather than the filter lying about what exists.

## The two windows, and the shadows

**The Journal Editor tab styles the window Edit Page opens**, and every rule it writes
out-specifies the Window tab's, which keeps the journal window. The two are separate
deliberately: they are different windows doing different jobs. What is written *on* is
still the page's own surface, painted by the Page tab, so what you type looks like what
you will read — that is the one thing the editor tab does not own.

**A shadow is derived from a picture.** A background picture and a shadow answer the same
question — this is a surface, and this is how it sits on the page — so the schema gives
every fill that can carry a picture a shadow and an inner shading beside it, and the
generator writes the rules from the same table the pictures come from. A new fill with a
picture gets both for free. A *state's* picture is skipped: its shadows come from the
hovered twins, or there would be two controls for one pointed-at shadow.

**The mirror runs once per state.** `pointedRules` in the generator takes the state's
twin table and a selector rewrite, so the same pass writes the `:hover` rules and the
rules for the contents panel's chosen row — `li.page.active` and
`li.heading.illuminus-current`, whose ordinary selectors are restated by the `CHOSEN`
table. That is what gives those two categories a Selected state in full rather than the
handful of hand-written colors they had, and what makes an unset Selected control fall
back to the ordinary value instead of painting nothing. A control that belongs to the
list rather than to a row in it says `noSelected: true` — the sub-headings' Indent is
the one.

**The contents panel's Selected heading is the module's own mark.** Foundry marks the page
being read and nothing finer, so `scripts/toc-current.mjs` marks the listed heading a
reader clicked — under the same three rules as the folding markers: nothing stored,
nothing inside an editor, re-applied on every render.

**A control belongs to the states that have no control of their own for it.** Every
control has a pointed-at twin now, so "this has more than one state" became true of all of
them — and choosing Selected hid a whole section but the handful of controls named for it,
which reads as the settings being missing. The rule is per state: show a control if it is
named for the chosen state, or if it is the ordinary control and the chosen state has none
of its own.

## A new style is a plain journal

**The shipped defaults are Foundry's own.** Opening a new style and looking at it
should show exactly what an unstyled journal shows, so that every control starts by
doing nothing. Two mechanisms carry that:

- **Anything inherited follows the journal.** An empty color, a size of 0
  (`zeroAs: "inherit"`), a lettering style of `inherit`, an alignment of `inherit` —
  all of them emit either nothing or the keyword, so the page's own value comes
  through whatever game system is painting it. `textFields()` defaults to that for
  every tab.
- **Anything not inherited is set to what Foundry paints**, measured rather than
  guessed: the page's dark ground, the heading scale and the rules under the first two
  levels, the link chip, the panel's dividers and page numbers. Those numbers come from
  a world running a game system, so they are Foundry-as-installed rather than
  Foundry-in-the-abstract — a system that restyles journals will differ, and the honest
  fix if that matters is to defer rather than to copy.

**`tools/sameness.mjs` is what measures it**, beside section [62]: it opens the journal
and the page editor twice each, once wearing a brand new style and once wearing none,
and compares every element property by property. Section [62] and the delta probe still
prove the ones a person cares about; this says how many are left. It went from 380
differences to 8, and the last of those are recorded above as decisions rather than
faults. Two things it had to learn before its answer could be believed, both of which
had it reporting differences that were not there:

- **Freeze transitions first.** A corner radius came back as `3.00706px` part way
  through an animation, so the same button differed in one run and not the next.
- **A difference nobody can see is not one.** The folding markers sit in every page
  whatever the style and are drawn in none of them, so their color and size wandered
  freely through the count. It asks whether an element has a box at all
  (`getClientRects()`), not whether its own `display` is `none` — the icon inside a
  hidden marker is not itself hidden.

**A hovered twin must be free to say nothing.** A twin holds 0 to mean "nothing to say",
and `cleanSettings` clamps a number into its control's range — so a twin that copied its
control's `min` emitted that minimum instead of silence. The panel-width twin came back
as 120px, and pointing anywhere in a styled journal shrank the contents panel from 300 to
120: every click target slid sideways, and a secret passage's Reveal button walked out
from under the pointer. A derived numeric twin gets `min: 0`.

**A fill painted over Foundry's goes on the layer, not on the element.** The window frame
and title bar were painted as a `linear-gradient` of one color so that None would leave
Foundry's own showing. That works for a background *color* and not for a background
*image*: it is one property, so the gradient replaced whatever texture Foundry paints
there. The fill goes on the `::after` layer that already carries the picture, which sits
above the element's own background and below its content.

**Never move a custom element.** `wrapFlows` used to sweep a `<secret-block>` into a
flow wrapper along with everything else; moving one disconnects and reconnects it, and it
came back with a Reveal button that did nothing. A custom element ends the run it is in
and stays where it is.

## Gathered runs in the editor

Three shapes repeat on every tab — a box (twelve edge controls, four corners, four
spacings), a shadow (five), and a picture (five) — and they are the greater part of the
4,200 controls. `boxRows()` in `scripts/apps/style-editor.mjs` gathers each into one run
at render, from the field's *name*, the way the generators read it. Four things are
load-bearing.

- **Every control is still its own `.illuminus-field[data-field]`.** The state switch, the
  filter, the changed markers, Match all sides and Reset all read the controls themselves;
  a widget that left one out would quietly take those with it. What changes is where a
  control is drawn, never whether it exists.
- **Both spellings of a family.** A family with no prefix is `borderTopWidth` and one with
  a prefix is `codeBorderTopWidth`. Matching only the second gathered a handful and left
  every plain family — which is most of them — spread down the tab as before.
- **A line belongs to the run it introduces, and only one draws it.** The schema's
  dividers sit on fields; a gathered field must give its own up or the line is drawn twice,
  once by the run and once by the control inside it. A family holds up to four runs and
  the schema draws a line before each, so a line goes to *the run it is the first control
  of* rather than to the family. A state's own run inherits the ordinary run's line, since
  dividers are declared for ordinary controls only.
- **Runs settle before lines are judged.** `#settleBoxes` hides a run whose controls have
  all gone, and the divider walk asks what follows a line — so the runs must settle first,
  once for the window rather than once per category.

**A run folds to what it says.** Each gathered run is a `<details>` whose summary is
built by `runSummary()` from the controls' own values — the set ones, in the order they
are drawn — so it needs no wording and cannot drift from what it describes. A run the
style says nothing about reads "Nothing set" and starts folded; one the style has set
starts open, so a tab opens showing what the style *does*.

**A box is drawn twice, as two pictures.** Spacing is one — the outer four around a
dashed ring, the inner four on the box, and no outer ring at all where a thing has no
space around it to set. Edges and corners are the other — a thickness on each edge, a
radius at each corner, the chosen side's style and colour beneath, and the corner shape
under it. Both merges happen in the schema, so a tab that kept Inner Spacing and Outer
Spacing (or Border and Corners) apart ends up with one category and both orders follow;
the tab maps did not have to be rewritten. **One family key per picture**: padding and
margin both key to `<prefix>Spacing`, border and corners both to `<prefix>Edges`. Keying
them apart is what produced two boxes per category, one holding nothing but corners.

**A part can say how it is laid out, not only how it is painted.** `layoutFields()`
gives a part a display, the row settings that follow from it, and how much room it may
take — all values, so the compiler is untouched. Which of them a part is offered is
decided per part: `position` is never offered on a window root, for the reason recorded
above. **`display` must fall back to what the skeleton lays that thing out as**
(`inline-block` for a tag, `block` for a block or picture): an unset control emits
nothing, and a `display` reading an unset property is invalid at computed-value time, so
it takes `inline` rather than leaving the element alone — which spilled every tag over
the lines around it the moment the control existed. That is the same trap as the tick box
and the scroll bars, and the rule it keeps teaching is: *where a control can override
something the skeleton deliberately sets, the fallback must name what the skeleton set.*

**A fill can graduate, and a picture can be worked.** A colour goes in
`background-color` and a gradient cannot — it is an image — so it goes on the element's
own `background-image`, which is free precisely because a background *picture* rides on a
layer of its own. Both ends start transparent, which is why it could be offered on all 35
fills without changing a style. The angle is **shown** as a degree sign and **written** as
`deg`: a gradient given "90°" is one a browser throws away, and the fill then paints
nothing at all. What is done to a picture — softness, brightness, contrast, colour, age —
is one `filter` on the layer, and **every part carries its own fallback**, because one
unset part makes the whole declaration invalid and a picture somebody had blurred would
come out sharp.

**A one-off script that opens a window must close it.** A screenshot script left a
style editor on screen, and check [37] — which opens one — clicked into the older
window and timed out with "the editor did not render its controls in forty
seconds", which reads exactly like the editor being broken. It was not. Anything
driving the sandbox by hand owes the suite the same `try/finally` a check does.

**Choice wording is shared across the whole schema, so a choice must be named
for what it means and not for what CSS calls it.** Hyphenation's `auto` would
have read "Let it scroll", which is what `auto` says on an overflow control. It
is `breakAsNeeded` in the schema and `auto` on the way out, the same shape the
picture shapes use. `emitWord` is only safe where a value's own name is already
unambiguous everywhere it appears.

**A control can emit its whole function, which is how two of them share one
property.** Turn and Size are one `transform`, and neither may force the other
into existence: each emits `rotate(…)` or `scale(…)` or nothing, and the rule
reads both with an *empty* fallback — `transform: var(--turn, ) var(--scale, )`.
One set is that one alone; neither set leaves the declaration holding nothing,
which is invalid at computed-value time and therefore `none`. That last part is
the whole reason for the shape, and it is the frosting's reason too: an identity
transform is not `none`, it makes the element a containing block. Note this is
the *opposite* of the empty-custom-property trap — an empty **fallback** is
deliberate and works; an empty **value** is what rubs a property out.

**Where a part is placed, only two answers are on offer.** A block and a picture
treatment can be held in view while the page scrolls past, or nudged from where
the page puts them — and nothing else. Both host a background picture layer,
which is placed against them, so a part put back into normal flow would send its
own picture to the corner of the page. `hostPosition()` in the generator writes
the layer host's position from the control where a part offers one, falling back
to `relative`, so one place decides it and an unset control changes nothing.
Reading it back: a relatively placed box reports the offset it *used*, so
`getComputedStyle().top` is `0px` and never `auto`.

**A frosting is one control because zero has to mean none.** A backdrop filter
set to anything at all — `blur(0px)`, an identity filter — starts a stacking
context, and a contents panel that quietly became one would take whatever
Foundry had put inside it with it. Three controls (blur, brightness, saturation)
could not stay silent together, since two of them default to 100%; one control
emitting nothing at zero leaves `backdrop-filter` invalid at computed-value
time, which is `none`. The same reasoning would apply to anything else whose
mere presence changes layout.

**A shape is named in words and written as a ratio.** `aspect-ratio` wants
`21 / 9`; nobody thinks in ratios, so the control says Panorama and `emitShape`
does the arithmetic — the same trick the gradient angle plays with `deg`. Two
fallbacks are load-bearing beside it: `aspect-ratio` falls back to `auto` (the
picture's own shape, which is what a journal does now) and `object-fit` to
`cover`, because a named shape the picture is squashed into was not what was
asked for. And a browser answers `object-position: top` as `50% 0%`, so a check
must read what it says rather than what was written.

**Anything added to a family must be added to the run that gathers it.** `clusterPartOf`
matched five picture parts by name; the five new ones fell outside it and were drawn as
loose rows under the picture with a line between them. A gathering pattern is a list that
has to be kept, and the symptom is cosmetic enough to miss.

**The editor wears Foundry's clothes.** Its own widgets take Foundry's variables —
`--color-cool-5-25/50` for raised surfaces, `--color-border` for hairlines,
`--color-warm-2` for a chosen control, `--font-monospace` for values, the `--font-size-*`
scale for sizes — and set no face of their own, so the window inherits Signika like the
rest of the interface. Colours invented for the editor date it against the app around it.

**A corner has a size and a shape.** `corner-shape` (Chromium 139+, and this is a
Chromium app) sits beside `border-radius` and reads the same four sizes, so a corner set
to 12 becomes a 12px bevel or scoop with no second measurement. It is a value like any
other — the compiler still emits nothing but custom properties. `round` is the browser's
own default, so a style that says nothing about a corner is unchanged, which check [69]
asserts against a category that sets only a radius. Adding it meant naming it in
thirty-one order lists, since a laid-out section must name every control it holds.

**Two marks, two questions.** `is-default` is "unchanged since this editor was opened",
which is what the changed counts and the fading are about. `is-unset` is "the style says
nothing here", which is what "Only what this style sets" filters on. Wiring the filter to
the first hid every value the style had saved.

**A control's name is two names.** The full one a crowded category gives it
("Inner Shadow Softness") and the plain one the schema declares ("Softness"). Both are in
the markup and only one is on screen: the short one inside a gathered run, where the run
says the rest. The run's own name is derived by subtracting the plain label from the full
one — no table, and where a category holds one shadow nothing is left over and no name is
drawn, which is right because the category has already said which shadow it is.

## Conventions worth keeping

- **A tab may lay itself out, and then it says so twice.** `SECTION_ORDER` and
  `FIELD_ORDER` sort every tab so they read alike; a tab that wants its own
  arrangement states `order` on the group (its sections) and `order` on a section
  (its controls), and the shared pass leaves it alone. `DIVIDER` — `"---"` — in a
  section's order draws a line before the control that follows it, which is how a
  long category reads in runs rather than as a list. The line belongs to the
  control it precedes, so it travels with that control when the state switch
  shuffles the rest, and it hides itself when the whole run it introduces is
  hidden. A section stating its own order must name every control it holds, or
  the schema throws at import — the same bargain `FIELD_ORDER` drives.
- **A shadow sharing a section says which shadow it is.** "Softness" is enough in
  a category called Inner Shadow and ambiguous in one holding a fill, a picture
  and two shadows. The qualifier is written as the *tab's* own wording rather
  than the control's, so the Page tab's own Outer Shadow category keeps the short
  labels while the Title tab, which holds both in one category, gets the long
  ones.
- **Where a control appears is decided in one place.** `SECTION_ORDER` and
  `FIELD_ORDER` at the foot of `style-schema.mjs` sort every tab after it is built,
  so each tab reads the same way: text, fill, inner spacing, border, corners, shadow,
  outer spacing, size, then the parts inside. A section the list does not name throws
  at import rather than falling quietly to the end. Hovered controls are moved to sit
  against the ordinary control they replace, which is what keeps the two states in the
  same order. Order the sections wherever it reads best in the source; the pass settles
  the rest.
- **A state's control is named for the thing it belongs to, never for the state
  alone.** A listed page's pointed-at fill was `hoverBackground`, and the panel's
  own fill is `background` in the same tab — so the mirror paired them and the
  pointed-at rule it wrote for the *panel* painted the whole panel with the
  *entry's* color the moment a pointer entered it. They are `entryBackground`,
  `entryHoverBackground`, and `entryActiveBackground` now. Field names share one
  namespace per tab, so a bare state word is a collision waiting to happen.
- **A derived hovered twin needs its own "Match all sides" key.** The twin is a
  copy of the control it stands in for, and copying its `link` too meant Match
  took the *ordinary* corner and wrote it across the hovered ones as well —
  which reads as the hovered settings not working at all rather than as Match
  overreaching.
- **Every schema change is three edits**: the field in `scripts/style-schema.mjs`, a rule
  in `styles/illuminus.css` consuming its custom property, and a re-run of the lang
  generator. `validate.mjs` fails if you miss any of them.
- **A style may only supply values, never rules.** The compiler emits custom properties
  and nothing else. Keep it that way — it is what makes importing a stranger's style file
  safe.
- **Renaming a *group* needs a migration too, and it reaches further than settings.**
  Per-style names for boxes and image styles are keyed by group id and live *outside*
  `settings`, so `migrateStyle` migrates `labels` as well — without that, `cleanLabels`
  drops every renamed key and the names silently vanish.
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
