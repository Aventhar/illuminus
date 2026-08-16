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
- **Closing the style editor can now decline to close.** It prompts when there are
  unsaved changes, so any *programmatic* `close()` — the manager closing an editor whose
  style is being deleted, a test cleaning up — must pass `{ force: true }` or it will sit
  on a dialog forever. This is the trap it caused: every check that closed a dirty editor
  hung, and the suite stalled at an unrelated one.
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

`assets/samples/textures/` and `assets/samples/images/` ship with the module and are
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

**Level 1 also styles the page title**, which the sheet renders in
`.journal-page-header` — *outside* `.journal-page-content`, so it needs naming
explicitly. Its three selectors sat at the head of level 1's selector list; moving the
rules into the generator by cutting from `.journal-page-content h1 {` left them orphaned
and the title unstyled, which is now covered by a check.

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

## The two library windows

The style library and the template library are the same window with different
contents, and are kept that way deliberately: same size, same tick boxes
(`input[name="pick"]`), same toolbar semantics, same empty state. **Selection is read
from the DOM when something asks for it, never mirrored in a field.** The style library
used to keep a `Set` and re-render on every tick to show a count in the button, which
threw away the scroll position and made ticking four styles in a row a fight. If a
count is ever wanted again, write it without re-rendering.

The preset badge in the style library wore `illuminus-tag` — the same class a journal's
inline tag styles now write, which a style can paint. It is `illuminus-badge-text`, as
in the template library.

## Testing traps found the hard way

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
- **A crashed run leaves fixtures behind**, and a stray style breaks the seeded-style
  counts three checks in — which looks like a bug in those checks. When counts are wrong
  in section [2], the world is dirty: `tools/sandbox.sh reset`.
- **Never kill a run mid-flight** (a foreground timeout does exactly that). Run it in the
  background and wait, or it will die between creating a fixture and its `finally`.
- **And nothing else may touch the sandbox while it runs.** A one-off script that
  navigates the page pulls the world out from under the suite, which then fails with
  `foundry is not defined` in whatever check happened to be running — a confusing way to
  learn you were driving the same browser from two places.

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
editor holds ~670 controls rather than the schema's 1,510.

Text and heading settings mean "use the page setting" by default — a size of 0
(`zeroAs: "inherit"`), an `inherit` choice, or an empty color, all of which emit either
the CSS keyword or nothing at all. `validate.mjs` knows a field may legitimately emit
nothing and checks it still compiles once given a value.

## Editor chrome

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

**Hovered controls are derived, not written.** `HOVERABLE` in the schema shadows every
lettering color, fill, and edge color with a `hover…` counterpart, and the generator
emits the matching `:hover` rule with the ordinary value as its fallback — so an unset
hovered color changes nothing rather than resetting the element. Paint only: shadowing a
size or a padding would reflow the page under the pointer. `NO_HOVER` skips the window
frame and the contents panel, which are not hovered as objects.

When a selector is a comma-joined list, `:hover` must be appended to **each** member —
`a, b:hover` hovers only `b`, which half-works in silence.

The switch offers **whatever states a section actually has**, from a `STATES` table
matched against field names. A section with no ordinary controls of its own offers only
the named ones — the sidebar's Entry States holds pointed-at and current-page controls,
because the ordinary entry is styled in the section above it, and offering it a "Normal"
that showed nothing would be a lie. A control with no counterpart in another state
belongs to all of them: a button's corner rounding does not change when pointed at.

Filtering and the switch can hide the same control for different reasons, so they use
different classes: a filter hit un-hides a state-folded control (`is-state-suppressed`)
rather than the filter lying about what exists.

## Conventions worth keeping

- **Where a control appears is decided in one place.** `SECTION_ORDER` and
  `FIELD_ORDER` at the foot of `style-schema.mjs` sort every tab after it is built,
  so each tab reads the same way: text, fill, inner spacing, border, corners, shadow,
  outer spacing, size, then the parts inside. A section the list does not name throws
  at import rather than falling quietly to the end. Hovered controls are moved to sit
  against the ordinary control they replace, which is what keeps the two states in the
  same order. Order the sections wherever it reads best in the source; the pass settles
  the rest.
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
