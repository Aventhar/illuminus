import { wrapHeadingSections } from "../heading-sections.mjs";
import { markFolds } from "../collapsible.mjs";
import { MODULE_ID, STYLED_CLASS, STYLE_ATTR, SETTINGS, getSetting, setSetting, log } from "../constants.mjs";
import { GROUPS, defaultSettings, cleanSettings, groupFields } from "../style-schema.mjs";
import { getStyle, updateStyle } from "../style-store.mjs";
import { setPreview, clearPreview, refreshStyles } from "../style-injector.mjs";
import { openColorPicker, closeColorPicker } from "./color-picker.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * The tabbed editor for a single journal style.
 *
 * Every control on every tab is generated from `style-schema.mjs`, so the GUI
 * never needs touching when a style property is added. Only the family member
 * on show is built, which is why the window holds a few hundred controls rather
 * than the schema's two thousand.
 *
 * Edits are held in a working copy and pushed straight to the live preview, so
 * open journals and the sample pane restyle as the user drags a slider. Nothing
 * is written to the world until Save, and closing without saving discards.
 */
/**
 * The states a control can belong to, in the order they are offered.
 *
 * A section declares its states simply by what its controls are called, so
 * `buttonHoverBackground` and `activeColor` need no registration beyond the
 * word itself.
 */
const STATES = [
  { id: "normal", label: "ILLUMINUS.Editor.StateNormal" },
  { id: "hover", label: "ILLUMINUS.Editor.StateHover", match: /hover/i },
  { id: "active", label: "ILLUMINUS.Editor.StateActive", match: /^active|Active/ }
];

/** Which state a control belongs to. Anything unmarked is the ordinary one. */
function stateOf(name) {
  return STATES.find((state) => state.match?.test(name))?.id ?? "normal";
}

/**
 * A field name with its state word removed, so counterparts can be matched.
 *
 * Both spellings occur — `buttonHoverBackground` and `hoverBackground` — so the
 * match is case-insensitive and the leading capital it leaves behind is put
 * back down.
 * @param {string} name
 * @returns {string} The shared stem, or the name itself when it has no state.
 */
function stateBase(name) {
  const state = STATES.find((entry) => entry.match?.test(name));
  if (!state) return name;
  const stripped = name.replace(state.match, "");
  if (!stripped) return name;
  return /[a-z]/.test(name[0]) ? stripped[0].toLowerCase() + stripped.slice(1) : stripped;
}

/**
 * The four sides, four corners, and the parts an edge is made of, as the schema
 * names them. Everything that reads a box family reads it from here.
 */
const BOX_SIDES = ["Top", "Right", "Bottom", "Left"];
const BOX_CORNERS = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"];
const BOX_PARTS = ["Width", "Style", "Color"];

/**
 * What a control is, within a box: which family it belongs to and which part of
 * it, or nothing where it is an ordinary control.
 *
 * Read from the name, as the generators read it. A section holds at most one
 * family per prefix, and a state's own controls carry the state in the name, so
 * `hoverEntryBorderTopWidth` is the pointed-at entry's family rather than the
 * ordinary one — which is what lets the switch above the section change which
 * family the widget is editing without the widget knowing anything about states.
 */
/**
 * The other two shapes a section repeats: a shadow, and a picture.
 *
 * Five controls each — a shadow is two offsets, a softness, a size and a color;
 * a picture is the file, how it fits, where it sits, how it mixes and how
 * strongly it shows — and most categories carry a picture and two shadows, so
 * fifteen of the rows on a tab are these three shapes over and over.
 *
 * Gathered they keep every word they had: laid out with the name above the
 * control rather than beside it, five rows become one wrapped row, and the
 * search box still reads exactly what it read before.
 */
function clusterPartOf(name) {
  let m;
  if ((m = name.match(/^(.*?)([Tt]ext[Ss]hadow|[Ii]nner[Ss]hadow|[Ss]hadow)(OffsetX|OffsetY|Blur|Spread|Color)$/))) {
    return { family: `${m[1]}${m[2]}`, kind: "shadow" };
  }
  // Everything a picture is given, including what is done to it before it is
  // laid down: they are one run, and the five worked out of the picture were
  // being drawn as loose rows under it.
  if ((m = name.match(
    /^(.*?)[Tt]exture(Fit|Position|Blend|Opacity|Blur|Brightness|Contrast|Saturation|Age)?$/))) {
    return { family: `${m[1]}Texture`, kind: "picture" };
  }
  return null;
}

function boxPartOf(name) {
  const sides = BOX_SIDES.join("|");
  // Both spellings of the word: a family with no prefix is `borderTopWidth`,
  // and one with a prefix is `codeBorderTopWidth`. Matching only the second
  // gathered the handful of prefixed families and left every plain one — which
  // is most of them — spread down the tab as before.
  let m;
  // An edge and the corners it turns are one family, so they are drawn as one
  // box: two families meant two boxes, one of them holding nothing but corners.
  if ((m = name.match(new RegExp(`^(.*?)[Bb]order(${sides})(${BOX_PARTS.join("|")})$`)))) {
    return { family: `${m[1]}Edges`, kind: "border", side: m[2], part: m[3] };
  }
  if ((m = name.match(new RegExp(`^(.*?)[Cc]orner(${BOX_CORNERS.join("|")})$`)))) {
    return { family: `${m[1]}Edges`, kind: "corner", corner: m[2] };
  }
  // What those four corners are cut to belongs with them: it reads their sizes,
  // and on its own after the run it read as a control about nothing.
  if ((m = name.match(/^(.*?)[Cc]ornerShape$/))) {
    return { family: `${m[1]}Edges`, kind: "cornerShape" };
  }
  if ((m = name.match(new RegExp(`^(.*?)([Pp]adding|[Mm]argin)(${sides})$`)))) {
    // Both rings belong to one family, so the inner four and the outer four are
    // gathered into the same run and drawn as one box.
    return { family: `${m[1]}Spacing`, kind: m[2].toLowerCase(), side: m[3] };
  }
  return null;
}

/**
 * A section's controls, with each box family gathered into one widget.
 *
 * Twelve edge controls, four corners and four spacings each, on forty-odd
 * categories: box families are the greater part of every tab and the least
 * interesting part of any of them. Gathered, a family reads as four rows —
 * inner spacing, outer spacing, corners, and an edge with a side to choose —
 * instead of twenty-four.
 *
 * Every control is still here, and still its own `.illuminus-field`: the state
 * switch, the filter, the changed markers, Match all sides and Reset all read
 * the controls themselves, and a widget that left any of them out would quietly
 * take those with it. What changes is where they are drawn.
 *
 * Rows come out in the order the schema laid them, with a family standing where
 * its first control stood — so a tab that was laid out by hand still reads the
 * way it was written.
 * @param {object[]} fields  Field contexts, in order.
 * @returns {object[]}       Rows: a control, or a box family holding several.
 */
/**
 * What a run says when it is folded away, and whether it says anything at all.
 *
 * A run the style has nothing to say about is a run nobody needs open: it sits
 * closed, showing the one line that says so, and opens on a click. A run the
 * style *has* set opens by itself, so a tab starts by showing what the style
 * does rather than what it could do.
 *
 * The summary is read from the controls rather than written: their values, in
 * the order they are drawn, with the ones still at their default left out. It
 * therefore needs no wording of its own and cannot fall out of step with what
 * the controls hold.
 */
function runSummary(fields) {
  const set = fields.filter((field) => field.isSet);
  if (!set.length) return { summary: null, open: false };
  const said = set.slice(0, 4).map((field) => {
    const value = field.type === "select"
      ? field.choices?.find((choice) => choice.selected)?.label ?? field.value
      : field.value;
    return `${field.short ?? field.plain ?? field.label}: ${value}${field.unit ?? ""}`;
  });
  return { summary: said.join(" · ") + (set.length > 4 ? " …" : ""), open: true };
}

function boxRows(fields) {
  const rows = [];
  const families = new Map();
  const clusters = new Map();
  for (const field of fields) {
    const cluster = boxPartOf(field.name) ? null : clusterPartOf(field.name);
    if (cluster) {
      let held = clusters.get(cluster.family);
      if (!held) {
        held = { family: cluster.family, kind: cluster.kind, divider: field.divider, fields: [] };
        clusters.set(cluster.family, held);
        rows.push({ cluster: held });
      }
      // Where a category holds one of them there is no qualifier to take, and
      // the run says plainly what it is instead.
      held.plainName ??= game.i18n.localize(cluster.kind === "picture"
        ? "ILLUMINUS.Box.Picture" : "ILLUMINUS.Box.Shadow");
      // The run takes the qualifier the controls give up, which is the whole of
      // what a qualified label adds: "Inner Shadow Softness" less "Softness" is
      // the run's own name. Where a category holds one shadow the two labels
      // are the same and nothing is left over — and there the category has
      // already said which shadow it is.
      if (!held.name && field.label !== field.plain && field.label.endsWith(field.plain)) {
        held.name = field.label.slice(0, -field.plain.length).trim();
      }
      held.fields.push({ ...field, divider: false, short: field.plain });
      continue;
    }
    const part = boxPartOf(field.name);
    if (!part) {
      rows.push({ field });
      continue;
    }
    let box = families.get(part.family);
    if (!box) {
      box = {
        family: part.family,
        // The line the schema drew before this run stays with the family that
        // replaced it, since the run is what it was introducing.
        divider: field.divider,
        // Two pictures of a box: one for the space inside it and around it, and
        // one for the edge it is drawn with and the corners that edge turns.
        border: [], corners: [], spacing: []
      };
      families.set(part.family, box);
      rows.push({ box });
    }
    // A line before any run of the family introduces that run: the corners get
    // the one the schema drew before them, not the family as a whole. The run
    // it belongs to is the one it is the first control of.
    const holds = { border: "border", corner: "corners", cornerShape: "corners",
      padding: "spacing", margin: "spacing" };
    const held = box[holds[part.kind]];
    const already = box.border.length + box.corners.length + box.spacing.length;
    if (field.divider && held.length === 0 && already > 0) {
      box.lines ??= {};
      box.lines[part.kind] = true;
    }
    if (part.kind === "border") {
      const side = `${part.side} `;
      box.border.push({
        ...field,
        // The thickness of a side is drawn on that side of the box; its style
        // and colour are shown for whichever side is chosen.
        onEdge: part.part === "Width",
        // The line above this run is the run's now: left on the control as
        // well, it was drawn twice.
        divider: false,
        short: field.plain?.startsWith(side) ? field.plain.slice(side.length) : field.plain,
        side: part.side,
        part: part.part
      });
    }
    else if (part.kind === "corner") {
      box.corners.push({ ...field, divider: false, corner: part.corner });
    } else if (part.kind === "cornerShape") {
      box.cornerShape = { ...field, divider: false, short: field.plain };
    } else box.spacing.push({ ...field, divider: false, side: part.side, ring: part.kind });
  }
  // A line introduces a run, and a state's own run is the same run in another
  // state — so it is introduced by the same line. The schema draws dividers
  // before ordinary controls, so without this the pointed-at half of a section
  // lost every line it had.
  for (const { box, cluster } of rows) {
    const run = box ?? cluster;
    if (!run || run.divider) continue;
    const stem = stateBase(run.family);
    if (stem === run.family) continue;
    const ordinary = rows.find(({ box: b, cluster: c }) => (b ?? c)?.family === stem);
    if (ordinary) run.divider = Boolean((ordinary.box ?? ordinary.cluster).divider);
  }
  for (const { box, cluster } of rows) {
    if (cluster) Object.assign(cluster, runSummary(cluster.fields));
    if (!box) continue;
    // A box holds up to four runs, and each answers for itself: an edge nobody
    // has set stays closed while the corners beside it are open.
    // The edge, its corners and their shape are one run and answer as one.
    box.edges = [...box.border, ...box.corners, ...(box.cornerShape ? [box.cornerShape] : [])];
    box.spacingSays = runSummary(box.spacing);
    box.edgesSays = runSummary(box.edges);
    box.open = box.spacingSays.open || box.edgesSays.open;
  }
  return rows;
}

export class IlluminusStyleEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Give each editor window an id derived from the style it edits, so `open()`
   * can find an already-open editor instead of stacking duplicates.
   * @override
   */
  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    initialized.uniqueId = options.styleId;
    return initialized;
  }

  /** The style being edited. */
  get #styleId() {
    return this.options.styleId;
  }

  /** The working copy of the style's settings, including defaults for unset fields. */
  #working;

  /**
   * What Reset returns to, and what the changed-count badges measure against.
   * Starts as the stored style and moves forward on every save, so saving
   * establishes the new baseline.
   */
  #baseline;

  /** Whether the working copy differs from what is stored. */
  #dirty = false;

  /**
   * Sections the user has opened, so a re-render does not close them again.
   * Everything starts collapsed: a tab holds up to nine sections and a hundred
   * controls, and opening the one you came for beats scrolling past the rest.
   */
  #expanded = new Set();

  /** Width the user has dragged the sample pane to, in pixels. */
  #previewWidth;

  /**
   * How large the sample is drawn, as a percentage.
   *
   * Held on the window rather than in the markup for the same reason the open
   * branches are: the editor re-renders on every change, and a sample that
   * snapped back to full size mid-edit would be worse than no zoom at all.
   */
  #sampleZoom = 100;

  /**
   * Whether the sample is deaf to the pointer.
   *
   * On by default. The sample answers a pointer exactly as a real journal does,
   * which is how a hovered colour is judged — and a nuisance every other minute,
   * since merely crossing the pane repaints whatever the mouse passed over.
   */
  #quietSample = true;

  /** Set once the stored view has been read, so a re-render does not re-read it. */
  #viewLoaded = false;

  /**
   * How this person last left the editor, remembered across openings.
   *
   * None of it belongs to a style: it is how somebody likes to work, so it is
   * kept per person and written as it changes rather than on save. Read once
   * when the window is built, so a second editor opened later starts where the
   * last one was left rather than at the defaults.
   */
  #loadView() {
    // Once per window. The editor re-renders on every change, and reading the
    // stored view again each time would race a write that has not landed yet —
    // a slider would jump back to where it was a moment ago.
    if (this.#viewLoaded) return;
    this.#viewLoaded = true;
    const view = getSetting(SETTINGS.editorView) ?? {};
    if (Number.isFinite(view.zoom)) this.#sampleZoom = view.zoom;
    if (typeof view.quiet === "boolean") this.#quietSample = view.quiet;
    if (Number.isFinite(view.settingsWidth)) this.#previewWidth = view.settingsWidth;
  }

  /** Keep how it is being used now, for the next time it is opened. */
  #keepView() {
    setSetting(SETTINGS.editorView, {
      zoom: this.#sampleZoom,
      quiet: this.#quietSample,
      settingsWidth: this.#previewWidth
    }).catch((error) => log.debug(`could not keep the editor's view: ${error?.message}`));
  }

  /** What the filter box holds, kept across re-renders. */
  /**
   * Show only the controls this style has something to say about.
   *
   * A control still holding its default already says so — it is drawn faded and
   * carries `is-default`, which is kept in step as values change — so this is a
   * question the tab can answer without asking the store anything.
   */
  #onlySet = false;

  #filter = "";

  /** Which state each section is showing: "normal" or "hover". */
  #states = new Map();

  /**
   * Which member of each family is on show. Ten blocks and ten picture
   * treatments would be twenty more tabs; instead each family gets one tab with
   * a picker, and only the chosen member's controls are built.
   */
  #showing = { headings: "heading1", boxStyles: "box01", tagStyles: "tag01", imageStyles: "image01" };

  static DEFAULT_OPTIONS = {
    id: "illuminus-style-editor-{id}",
    classes: ["illuminus", "illuminus-editor"],
    tag: "form",
    window: {
      title: "ILLUMINUS.Editor.Title",
      icon: "fa-solid fa-palette",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    // 300 for the settings and 800 for the sample, plus the 12px between them
    // and the 34 Foundry's own window padding takes. The sample is the point of
    // the window, so it gets the room: a page of prose at something near its
    // real width says more than a wider column of controls does.
    // Wide enough for five hundred pixels of settings and the sample beside
    // them; the pane's own width is dragged from the grip between the two.
    position: { width: 1200, height: 780 },
    form: {
      handler: IlluminusStyleEditor.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    actions: {
      matchSides: IlluminusStyleEditor.#onMatchSides,
      resetSection: IlluminusStyleEditor.#onResetSection,
      resetGroup: IlluminusStyleEditor.#onResetGroup,
      resetAll: IlluminusStyleEditor.#onResetAll,
      revert: IlluminusStyleEditor.#onRevert,
      toggleSection: IlluminusStyleEditor.#onToggleSection,
      pickColor: IlluminusStyleEditor.#onPickColor,
      renameMember: IlluminusStyleEditor.#onRenameMember,
      copyFromAbove: IlluminusStyleEditor.#onCopyFromAbove,
      foundryDefault: IlluminusStyleEditor.#onFoundryDefault,
      openColorPicker: IlluminusStyleEditor.#onOpenColorPicker,
      showHint: IlluminusStyleEditor.#onShowHint,
      showPart: IlluminusStyleEditor.#onShowPart,
      twistBranch: IlluminusStyleEditor.#onTwistBranch
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/style-editor.hbs`,
      // Registered as partials: the controls, so the page tabs and the block and
      // picture tabs render from one copy, and the sample page, which the
      // sample journal is also built from. A partial referenced by path is not
      // found unless it is named here.
      templates: [
        `modules/${MODULE_ID}/templates/style-field.hbs`,
        `modules/${MODULE_ID}/templates/style-box.hbs`,
        `modules/${MODULE_ID}/templates/style-box-cell.hbs`,
        `modules/${MODULE_ID}/templates/style-cluster.hbs`,
        `modules/${MODULE_ID}/templates/style-run-says.hbs`,
        `modules/${MODULE_ID}/templates/style-tree-branch.hbs`,
        `modules/${MODULE_ID}/templates/sample-page.hbs`
      ],
      classes: ["illuminus-editor__body"],
      scrollable: [".illuminus-fields"]
    },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /**
   * Families, each shown as a single tab with a picker. Order comes from the
   * schema, not from this list — a family's tab sits where its first member
   * does, so six heading levels take one slot in the middle of the strip rather
   * than six at the end.
   */
  static FAMILIES = [
    { id: "headings", icon: "fa-solid fa-heading", label: "ILLUMINUS.Families.headings", renamable: false },
    { id: "boxStyles", icon: "fa-solid fa-comment-dots", label: "ILLUMINUS.Families.boxStyles" },
    { id: "tagStyles", icon: "fa-solid fa-tag", label: "ILLUMINUS.Families.tagStyles" },
    { id: "imageStyles", icon: "fa-solid fa-images", label: "ILLUMINUS.Families.imageStyles" },
    { id: "listStyles", icon: "fa-solid fa-list", label: "ILLUMINUS.Families.listStyles" },
    { id: "tableStyles", icon: "fa-solid fa-table", label: "ILLUMINUS.Families.tableStyles" }
  ];

  /**
   * Which part holds which, for the tree down the left of the window.
   *
   * A journal's parts nest, and the strip could not say so: a heading and the
   * window frame sat side by side as though they were the same kind of thing.
   * This is the one place that says what holds what, and everything else about
   * the tree — its order, its names, its counts — is read from the schema.
   *
   * A part named nowhere here sits at the root rather than vanishing, which is
   * what keeps a new tab from being invisible until somebody remembers this
   * table.
   */
  static HOLDS = {
    sidebar: "window", page: "window", editor: "window",
    title: "page", headings: "page", body: "page", links: "page", lists: "page",
    tables: "page", secrets: "page", boxes: "page", tags: "page", images: "page",
    // The ten treatments of a thing are held by the untreated one: a box style
    // is a box, and the tree says so rather than listing them alongside.
    boxStyles: "boxes", tagStyles: "tags", imageStyles: "images",
    listStyles: "lists", tableStyles: "tables",
    // The contents panel and the page editor hold parts of their own, the way
    // the page does.
    sidebarEntries: "sidebar", sidebarHeadings: "sidebar", sidebarCategories: "sidebar",
    sidebarSearch: "sidebar", sidebarButtons: "sidebar", sidebarNumbers: "sidebar",
    editorSettingsBar: "editor", editorDropdowns: "editor", editorToolbar: "editor"
  };

  /**
   * The tree, in schema order within each parent.
   *
   * Built from the same strip the tabs were built from, so a family is one
   * entry where its first member is declared and a tab the strip sends to the
   * end still goes there. What changes is only that an entry can hold others.
   */
  static #buildTree() {
    const strip = IlluminusStyleEditor.#buildStrip();
    const nodes = new Map(strip.map((entry) => [entry.id, { ...entry, children: [] }]));
    const roots = [];
    for (const entry of strip) {
      const parent = nodes.get(IlluminusStyleEditor.HOLDS[entry.id]);
      (parent ? parent.children : roots).push(nodes.get(entry.id));
    }
    return roots;
  }

  /** Groups that get a tab of their own, in strip order. */
  static get pageGroups() {
    return GROUPS.filter((group) => !group.family);
  }

  /** One entry in the tab strip. */
  static #tabFor(group) {
    return { id: group.id, icon: group.icon, label: `ILLUMINUS.Groups.${group.id}.label` };
  }

  /**
   * The tab strip, in schema order: a group gets its own tab, and a family gets
   * one where its first member appears. Anything marked `strip: "end"` goes
   * last however early it is declared — the Window tab styles the frame rather
   * than the page, so it sits after the rest.
   */
  static #buildStrip() {
    const seen = new Set();
    const strip = [];
    for (const group of GROUPS) {
      if (group.strip === "end") continue;
      if (!group.family) {
        strip.push(IlluminusStyleEditor.#tabFor(group));
        continue;
      }
      if (seen.has(group.family)) continue;
      seen.add(group.family);
      const family = IlluminusStyleEditor.FAMILIES.find((f) => f.id === group.family);
      if (family) strip.push({ id: family.id, icon: family.icon, label: family.label });
    }
    return strip.concat(GROUPS.filter((g) => g.strip === "end").map(IlluminusStyleEditor.#tabFor));
  }

  static TABS = {
    sheet: {
      tabs: IlluminusStyleEditor.#buildStrip(),
      // Named rather than taken from the first tab, so the strip can be
      // reordered without changing where the editor opens.
      initial: "page"
    }
  };

  /**
   * The group the strip is currently showing: a page tab is its own group, and
   * a family tab is whichever member its picker names.
   */
  #activeGroupId() {
    const tab = this.tabGroups.sheet;
    return this.#showing[tab] ?? tab;
  }

  /** The display name a style gives a block or picture treatment. */
  #labelFor(groupId) {
    return this.style?.labels?.[groupId] || game.i18n.localize(`ILLUMINUS.Groups.${groupId}.label`);
  }

  /** The stored style record. */
  get style() {
    return getStyle(this.#styleId);
  }

  /** @override */
  get title() {
    return game.i18n.format("ILLUMINUS.Editor.TitleNamed", { name: this.style?.name ?? "" });
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** Merge stored settings over schema defaults so every control has a value. */
  #loadWorking() {
    this.#working = foundry.utils.mergeObject(defaultSettings(), this.style?.settings ?? {}, { inplace: false });
    this.#baseline = foundry.utils.deepClone(this.#working);
    this.#dirty = false;
  }

  /** The value Reset restores for one field. */
  #baselineFor(groupId, field) {
    const value = this.#baseline?.[groupId]?.[field.name];
    return value === undefined ? field.default : value;
  }

  /** Font family choices offered by Foundry, plus a "use the sheet default" entry. */
  #fontChoices() {
    const choices = { "": game.i18n.localize("ILLUMINUS.Field.font.inherit") };
    return Object.assign(choices, foundry.applications.settings.menus.FontConfig.getAvailableFontChoices());
  }

  /**
   * Label for a select option. Most choices read the same wherever they appear
   * ("Bold", "Centered"), but a few need wording specific to their control. A
   * field-specific key wins when one exists; otherwise the shared label is used.
   */
  #choiceLabel(fieldName, choice) {
    const specific = `ILLUMINUS.Choices.${fieldName}.${choice}`;
    if (game.i18n.has(specific)) return game.i18n.localize(specific);
    return game.i18n.localize(`ILLUMINUS.Choices.${choice}`);
  }

  /** @override */
  async _prepareContext(options) {
    if (!this.#working) this.#loadWorking();
    const context = await super._prepareContext(options);
    const fonts = this.#fontChoices();

    context.styleId = this.#styleId;
    context.style = this.style;
    context.styledClass = STYLED_CLASS;
    context.styleAttr = STYLE_ATTR;
    context.families = IlluminusStyleEditor.FAMILIES.map((family) => {
      const members = GROUPS.filter((group) => group.family === family.id);
      const current = members.find((m) => m.id === this.#showing[family.id]) ?? members[0];
      return {
        id: family.id,
        active: this.tabGroups.sheet === family.id,
        hint: game.i18n.localize(`ILLUMINUS.Families.${family.id}Hint`),
        nameLabel: game.i18n.localize(`ILLUMINUS.Families.${family.id}Name`),
        renamable: family.renamable !== false,
        members: members.map((m) => ({ id: m.id, label: this.#labelFor(m.id), selected: m.id === current.id })),
        // The member one place above this one in its own list, offered as
        // something to copy. Setting six heading levels by hand means setting
        // the same twenty values six times; most styles want each level to be
        // the one above it with a smaller size or a lighter weight.
        copyFrom: (() => {
          const at = members.findIndex((m) => m.id === current.id);
          const above = at > 0 ? members[at - 1] : null;
          return above ? { id: above.id, label: this.#labelFor(above.id) } : null;
        })(),
        current: { ...this.#groupContext(current, fonts), label: this.#labelFor(current.id) }
      };
    });

    // Which member each family's own preview panel is built for. Taken from
    // the same resolution as the tab above, so the panel can never end up
    // showing a different block from the one whose controls are on screen.
    context.preview = Object.fromEntries(context.families.map((family) =>
      [family.id, { id: family.current.id, label: family.current.label }]));

    // The tree down the left of the window. Its counts are the badges the strip
    // used to carry, and a family entry holds its members so a heading level is
    // reached by opening Headings rather than by a picker inside a tab.
    const treeNode = (node) => {
      const family = IlluminusStyleEditor.FAMILIES.find((one) => one.id === node.id);
      const members = family ? GROUPS.filter((group) => group.family === family.id) : [];
      // Which member the family is showing, resolved the same way the tab's own
      // picker resolves it — an unset family shows its first member, so the
      // tree must mark that one rather than none.
      const current = members.find((one) => one.id === this.#showing[node.id]) ?? members[0];
      const group = GROUPS.find((one) => one.id === node.id);
      const children = node.children.map(treeNode);
      return {
        id: node.id,
        icon: node.icon,
        label: family
          ? game.i18n.localize(family.label)
          : game.i18n.localize(`ILLUMINUS.Groups.${node.id}.label`),
        active: this.tabGroups.sheet === node.id,
        // Held open while what it holds is being looked at, so the tree does
        // not close the branch a person is working in.
        open: this.#openBranches.has(node.id)
          || children.some((child) => child.active || child.open)
          || this.tabGroups.sheet === node.id,
        count: group ? this.#changedCount(group)
          : members.reduce((sum, member) => sum + this.#changedCount(member), 0),
        members: members.map((member) => ({
          id: member.id, family: family.id, label: this.#labelFor(member.id),
          active: member.id === current?.id && this.tabGroups.sheet === family.id,
          count: this.#changedCount(member)
        })),
        children
      };
    };
    context.tree = IlluminusStyleEditor.#buildTree().map(treeNode);
    // Every tab id, for the anchor core looks a pane up through.
    context.tabIds = IlluminusStyleEditor.#buildStrip().map((entry) => entry.id);

    context.groups = IlluminusStyleEditor.pageGroups.map((group) => ({
      id: group.id,
      label: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.label`),
      hint: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.hint`),
      active: this.tabGroups.sheet === group.id,
      changedCount: this.#changedCount(group),
      // The window's defaults are all "leave it as Foundry draws it", so
      // clearing the tab is exactly that — said in those words on the one tab
      // where "Reset Tab" does not convey it.
      plainReset: group.id === "window",
      sections: group.sections.map((section) => ({
        id: section.id,
        label: game.i18n.localize(section.label ?? `ILLUMINUS.Sections.${section.id}.label`),
        // A section may name its own wording, for the rare case where the same
        // section means something different on one tab — the page's shadow,
        // which Foundry's window clips and only an export ever shows.
        hint: game.i18n.localize(section.hint ?? `ILLUMINUS.Sections.${section.id}.hint`),
        open: this.#expanded.has(`${group.id}.${section.id}`),
        // Only sections whose fields repeat one property across sides or
        // corners can offer to match them.
        matchable: section.fields.some((field) => field.link),
        rows: boxRows(section.fields
          .filter((field) => !field.chrome)
          .map((field) => ({
            ...this.#fieldContext(group, field, fonts),
            // A line across the tab before this control, where the section has
            // laid its own controls out in runs.
            divider: Boolean(section.dividers?.has(field.name))
          })))
      }))
    }));
    context.buttons = [
      { type: "submit", icon: "fa-solid fa-floppy-disk", label: "ILLUMINUS.Buttons.Save" },
      { type: "button", action: "revert", icon: "fa-solid fa-rotate-left", label: "ILLUMINUS.Buttons.Revert" }
    ];
    return context;
  }

  /** Sections and controls for one group, shared by page tabs and family tabs. */
  #groupContext(group, fonts) {
    return {
      id: group.id,
      hint: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.hint`),
      sections: group.sections.map((section) => ({
        id: section.id,
        label: game.i18n.localize(section.label ?? `ILLUMINUS.Sections.${section.id}.label`),
        // A section may name its own wording, for the rare case where the same
        // section means something different on one tab — the page's shadow,
        // which Foundry's window clips and only an export ever shows.
        hint: game.i18n.localize(section.hint ?? `ILLUMINUS.Sections.${section.id}.hint`),
        open: this.#expanded.has(`${group.id}.${section.id}`),
        matchable: section.fields.some((field) => field.link),
        rows: boxRows(section.fields
          .filter((field) => !field.chrome)
          .map((field) => ({
            ...this.#fieldContext(group, field, fonts),
            // A line across the tab before this control, where the section has
            // laid its own controls out in runs.
            divider: Boolean(section.dividers?.has(field.name))
          })))
      }))
    };
  }

  /** How many controls in a group differ from their default, for the tab badge. */
  #changedCount(group) {
    return groupFields(group)
      .filter((field) => this.#working?.[group.id]?.[field.name] !== this.#baselineFor(group.id, field)).length;
  }

  /**
   * Wording for a control. Labels are shared by field name, but a field can
   * mean something different in a family — an empty color on the page is "no
   * color", while in a block it is "follow the page" — so a family-specific key
   * wins when one exists.
   */
  #fieldText(group, field, part, { translate = true } = {}) {
    // Names in CSS's own words for somebody who asked for them, and only the
    // names: a hint says what a control does, which is the same thing whichever
    // vocabulary names it. A control with nothing to say in CSS — where an
    // element hangs, which member a family is showing — keeps its plain name
    // rather than showing nothing. Asked with `translate: false` for the plain
    // name itself, which the hint's own heading names whichever words the rest
    // of the editor is wearing.
    if (translate && part === "label" && this.#wording() === "css") {
      const said = this.#fieldText(group, field, "css");
      if (said) return said;
    }
    const specific = `ILLUMINUS.Field.${group.family ?? group.id}.${field.name}.${part}`;
    if (game.i18n.has(specific)) return game.i18n.localize(specific);
    const shared = `ILLUMINUS.Field.${field.name}.${part}`;
    if (part === "css" && !game.i18n.has(shared)) return "";
    return game.i18n.localize(shared);
  }

  /**
   * A control named both ways, for the head of its hint: "Layout (display)".
   *
   * A control that writes no CSS — where an element hangs, which member a
   * family is showing — has only the one name, and says it without empty
   * parentheses after it.
   */
  #heading(group, field) {
    const plain = this.#fieldText(group, field, "label", { translate: false });
    const css = this.#fieldText(group, field, "css");
    return css ? `${plain} (${css})` : plain;
  }

  /** Which vocabulary this person reads the editor in. */
  #wording() {
    return getSetting(SETTINGS.wording) ?? "plain";
  }

  /** Build the template data for one control. */
  #fieldContext(group, field, fonts) {
    const value = this.#working?.[group.id]?.[field.name] ?? field.default;
    const context = {
      path: `${group.id}.${field.name}`,
      // Kept beside the path: what a control is within a box family is read
      // from its name, and the path carries the tab's name in front of it.
      name: field.name,
      type: field.type,
      label: this.#fieldText(group, field, "label"),
      // The same control's name without the qualifier a crowded category gives
      // it: "Inner Shadow Softness" is "Softness" once the run it sits in is
      // the inner shadow. Both are in the markup — the search box reads what it
      // always read, and a gathered run shows the shorter one.
      plain: this.#wording() === "css"
        ? this.#fieldText(group, field, "label")
        : game.i18n.localize(`ILLUMINUS.Field.${field.name}.label`),
      // A heading naming the control, above what it says. Both words for it,
      // whichever the editor is wearing: somebody reading in plain language
      // can see which property it writes without changing a setting, and
      // somebody reading in CSS can see what it is called. It goes in the
      // hint's own text rather than beside it, so the search box finds a
      // control by its property name as readily as by its name.
      hint: `${this.#heading(group, field)}\n\n${this.#fieldText(group, field, "hint")}`,
      value,
      isDefault: value === this.#baselineFor(group.id, field),
      // Two different questions, and only one of them is what the fading marks.
      // `isDefault` is "unchanged since this editor was opened", which is what
      // the changed counts are about; this is "does the style say anything at
      // all here", which is what somebody reading a style back wants.
      isSet: value !== field.default
    };
    if (field.type === "number") Object.assign(context, {
      min: field.min, max: field.max, step: field.step, unit: field.unit
    });
    if (field.type === "select") context.choices = field.choices.map((choice) => ({
      value: choice,
      label: this.#choiceLabel(field.name, choice),
      selected: choice === value
    }));
    if (field.type === "font") context.choices = Object.entries(fonts).map(([choice, label]) => ({
      value: choice, label, selected: choice === value
    }));
    if (field.type === "toggle") context.checked = Boolean(value);
    return context;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Bring the part of the sample the open tab styles forward, and let the rest
   * fall back.
   *
   * Dimmed rather than hidden: a heading alone on a blank page says nothing
   * about whether it sits well against the text around it, and the sample is
   * worth having precisely because it is a whole page. A tab the sample has no
   * piece for — the families, which take the pane over entirely — leaves it be.
   */
/**
   * Let the sample be the way in.
   *
   * The editor already drives the sample from the open tab, dimming everything
   * the tab does not paint. This turns that arrow round: point at the opening
   * capital in the sample, click it, and the tab that sets it opens. With two
   * thousand controls behind sixteen tabs, "where is that setting?" is the
   * question the editor is worst at answering, and the sample is the one place
   * where a person can see the thing they mean.
   *
   * A piece belonging to a family opens the family's tab and asks its picker
   * for that member, since `boxStyles` has one tab for ten of them.
   */
  #activateSampleParts() {
    const frame = this.element.querySelector(".illuminus-preview__frame");
    if (!frame) return;
    const family = (groupId) => IlluminusStyleEditor.FAMILIES.find(
      (one) => GROUPS.some((group) => group.id === groupId && (group.family ?? group.id) === one.id));
    for (const part of frame.querySelectorAll("[data-part]")) {
      part.classList.add("illuminus-preview__part");
      part.addEventListener("click", (event) => {
        const groupId = part.dataset.part;
        if (!GROUPS.some((group) => group.id === groupId)) return;
        // The innermost piece under the pointer wins: a link sits inside a
        // paragraph, which sits on the page, and the one meant is the link.
        event.stopPropagation();
        const owner = family(groupId);
        if (owner) {
          this.#showing[owner.id] = groupId;
          this.render();
          this.changeTab(owner.id, "sheet");
          return;
        }
        this.changeTab(groupId, "sheet");
      });
    }
  }

  #focusSample() {
    const frame = this.element.querySelector(".illuminus-preview__frame");
    if (!frame) return;
    const parts = [...frame.querySelectorAll("[data-part]")];
    if (!parts.length) return;

    // A family tab focuses the member its picker names, not the family itself.
    const active = this.#activeGroupId();
    const target = parts.find((part) => part.dataset.part === active);
    for (const part of parts) {
      // Neither what holds the focused piece nor what it holds. A wrapper that
      // dimmed would dim what is inside it however brightly the inside is
      // marked — and the Page tab's piece is the surface everything else sits
      // on, so dimming its contents greyed the whole sample out and left the
      // one tab whose setting covers the page with nothing to look at.
      part.classList.toggle("is-dimmed", Boolean(target) && part.dataset.part !== active
        && !part.contains(target) && !target.contains(part));
    }
    if (target) this.#scrollSampleTo(target, frame);
  }

  /**
   * Put the focused piece of the sample where it can be seen.
   *
   * Dimming the rest is no help if the piece in question is below the fold —
   * the Tables tab would show a greyed page and no table. The frame is scrolled
   * by hand rather than with `scrollIntoView`, which would scroll the editor
   * window as well.
   */
  #scrollSampleTo(part, frame) {
    if (!part) return;
    // Measured on the next frame: switching tabs is what asks for this, and a
    // pane that was hidden a moment ago has no size yet — every rectangle
    // reads as zero, and scrolling to zero is scrolling nowhere.
    requestAnimationFrame(() => {
      const target = part.getBoundingClientRect();
      const view = frame.getBoundingClientRect();
      if (!view.height) return;
      if (target.top >= view.top && target.bottom <= view.bottom) return;
      const offset = target.top - view.top + frame.scrollTop;
      frame.scrollTo({ top: Math.max(0, offset - 16), behavior: "smooth" });
    });
  }

  /**
   * Fold each "when pointed at" control behind a switch.
   *
   * A button's ordinary colors and its hover colors sit side by side in the
   * same section, which is most of why the Window and Sidebar tabs are the
   * heaviest in the editor. The pairs are found by name — `buttonHoverBackground`
   * beside `buttonBackground` — so no schema change is needed and a new pair
   * gets the switch for free.
   */
  #activateStates() {
    for (const section of this.element.querySelectorAll(".illuminus-section")) {
      const present = this.#statesIn(section);
      if (present.length < 2) continue;

      const key = section.querySelector("summary")?.dataset;
      const id = key ? `${key.group}.${key.section}` : section.dataset.section;
      const tools = section.querySelector(".illuminus-section__tools");
      if (!tools || tools.querySelector(".illuminus-state")) continue;

      const wrap = document.createElement("div");
      wrap.className = "illuminus-state";
      for (const state of present) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "illuminus-state__option";
        button.dataset.state = state.id;
        button.textContent = game.i18n.localize(state.label);
        button.addEventListener("click", () => {
          this.#states.set(id, state.id);
          this.#applyStates();
          this.#applyFilter();
        });
        wrap.append(button);
      }
      // Setting a hovered color usually means "the ordinary one, but darker",
      // and typing every value twice is how a state ends up half-set. The
      // button sits with the switch and only shows while a state other than
      // the ordinary one is on.
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "illuminus-reset illuminus-state__copy";
      copy.innerHTML = `<i class="fa-solid fa-copy"></i> `
        + game.i18n.localize("ILLUMINUS.Buttons.CopyNormal");
      copy.dataset.tooltip = game.i18n.localize("ILLUMINUS.Buttons.CopyNormalTooltip");
      copy.addEventListener("click", () => this.#copyStateFromNormal(section));
      wrap.append(copy);

      tools.prepend(wrap);
    }
    this.#applyStates();
  }

  /**
   * The controls a Copy Normal would actually change.
   *
   * Only the ones with an ordinary counterpart move — a thickness with no
   * hovered twin is already shared — and only where the two differ, which is
   * what lets the button say whether pressing it would do anything. Nothing in
   * another section is considered: the sidebar keeps its hovered entry colors
   * beside the entry they belong to, and copying one section should not reach
   * into another.
   */
  #pendingCopies(groupId, sectionId, chosen) {
    if (!groupId || !sectionId || !chosen || chosen === "normal") return [];
    const group = GROUPS.find((candidate) => candidate.id === groupId);
    const section = group?.sections.find((candidate) => candidate.id === sectionId);
    if (!section) return [];
    const names = new Set(section.fields.map((field) => field.name));
    const settings = this.#working[groupId] ?? {};
    return section.fields.filter((field) => {
      if (stateOf(field.name) !== chosen) return false;
      const ordinary = stateBase(field.name);
      if (ordinary === field.name || !names.has(ordinary)) return false;
      return settings[field.name] !== settings[ordinary];
    });
  }

  /**
   * Fill a section's controls for the state on show from the ordinary ones.
   *
   * Only the controls that have an ordinary counterpart move: a thickness with
   * no hovered twin is already shared, and nothing in another section is
   * touched — the sidebar keeps its hovered entry colors beside the entry they
   * belong to, and copying one section should not reach into another.
   */
  #copyStateFromNormal(sectionElement) {
    const key = sectionElement.querySelector("summary")?.dataset;
    if (!key) return;
    const group = GROUPS.find((candidate) => candidate.id === key.group);
    const section = group?.sections.find((candidate) => candidate.id === key.section);
    if (!section) return;

    const chosen = this.#states.get(`${key.group}.${key.section}`) ?? "normal";
    if (chosen === "normal") return;

    const pending = this.#pendingCopies(key.group, key.section, chosen);
    if (!pending.length) return;
    for (const field of pending) {
      this.#working[key.group][field.name] = this.#working[key.group][stateBase(field.name)];
    }

    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /**
   * The states one section actually offers.
   *
   * A control belongs to a state either by being named for one or by having a
   * counterpart that is. The ordinary state only counts when something in the
   * section belongs to it — the sidebar's Entry States section holds nothing
   * but pointed-at and current-page controls, because the ordinary entry is
   * styled in the section above it.
   */
  #statesIn(section) {
    const fields = [...section.querySelectorAll(".illuminus-field[data-field]")];
    const named = (field) => field.dataset.field.split(".")[1] ?? "";
    const bases = new Map();
    for (const field of fields) {
      const base = stateBase(named(field));
      bases.set(base, (bases.get(base) ?? new Set()).add(stateOf(named(field))));
    }
    const found = new Set();
    for (const states of bases.values()) {
      for (const state of states) if (states.size > 1 || state !== "normal") found.add(state);
    }
    return STATES.filter((state) => found.has(state.id));
  }

  
/**
   * Let an edge show one side at a time.
   *
   * Four sides times a thickness, a style and a color is twelve controls for
   * one edge, and a person sets one side or all four — so the side is chosen
   * here and the rest are left in the markup, where the search box still reads
   * them. Nothing is stored: which side is on show is a question about looking
   * at the tab, not about the style.
   */
  #activateBoxes() {
    for (const run of this.element.querySelectorAll('.illuminus-box__run[data-run="edges"]')) {
      run.dataset.side ||= "Top";
      for (const button of run.querySelectorAll(".illuminus-box__side")) {
        button.addEventListener("click", () => {
          run.dataset.side = button.dataset.side;
          for (const other of run.querySelectorAll(".illuminus-box__side")) {
            other.classList.toggle("is-on", other === button);
          }
          this.#applyFilter();
        });
      }
    }
  }

  /**
   * A gathered family goes with what it holds.
   *
   * The state switch and the filter both work by hiding controls, and a family
   * whose controls have all gone would otherwise leave an empty cross and a row
   * of side buttons that set nothing — the same way a line between two runs is
   * left stranded, and taken away for the same reason.
   */
  #settleBoxes() {
    const gone = (field) => field.classList.contains("is-state-hidden")
      || field.classList.contains("is-filtered-out");
    for (const run of this.element.querySelectorAll(".illuminus-box__run")) {
      const fields = [...run.querySelectorAll(".illuminus-field[data-field]")];
      run.classList.toggle("is-state-hidden", fields.length > 0 && fields.every(gone));
    }
    for (const box of this.element.querySelectorAll(".illuminus-box")) {
      const runs = [...box.querySelectorAll(".illuminus-box__run")];
      box.classList.toggle("is-state-hidden", runs.length > 0
        && runs.every((run) => run.classList.contains("is-state-hidden")));
    }
    for (const cluster of this.element.querySelectorAll(".illuminus-cluster")) {
      const fields = [...cluster.querySelectorAll(".illuminus-field[data-field]")];
      cluster.classList.toggle("is-state-hidden", fields.length > 0 && fields.every(gone));
    }
  }

  /** Show one state's controls per section, hiding the other's. */
  #applyStates() {
    for (const section of this.element.querySelectorAll(".illuminus-section")) {
      const wrap = section.querySelector(".illuminus-state");
      if (!wrap) continue;
      const key = section.querySelector("summary")?.dataset;
      const id = key ? `${key.group}.${key.section}` : section.dataset.section;
      const present = this.#statesIn(section);
      const chosen = this.#states.get(id)
        ?? (present.some((state) => state.id === "normal") ? "normal" : present[0]?.id);

      for (const option of wrap.querySelectorAll(".illuminus-state__option")) {
        option.classList.toggle("is-on", option.dataset.state === chosen);
      }

      // Nothing to copy from while the ordinary controls are the ones on show,
      // and nothing to copy into where a state's controls have no ordinary
      // counterpart in this section — the sidebar's Entry States is all of one
      // and none of the other.
      const copy = wrap.querySelector(".illuminus-state__copy");
      if (copy) {
        const twinned = present.some((state) => state.id === "normal") && chosen !== "normal";
        copy.classList.toggle("is-hidden", !twinned);
        // Greyed where every control already holds what it would be given, so
        // the button says whether pressing it would change anything rather than
        // looking the same either way.
        copy.disabled = twinned && key
          && this.#pendingCopies(key.group, key.section, chosen).length === 0;
      }

      const fields = [...section.querySelectorAll(".illuminus-field[data-field]")];
      const named = (field) => field.dataset.field.split(".")[1] ?? "";
      const kinds = new Map();
      for (const field of fields) {
        const base = stateBase(named(field));
        kinds.set(base, (kinds.get(base) ?? new Set()).add(stateOf(named(field))));
      }
      for (const field of fields) {
        const name = named(field);
        const state = stateOf(name);
        // A control belongs to the state it is named for, and an ordinary
        // control belongs to every state that has no control of its own for it:
        // a listed page's corner rounding does not change because the page is
        // the one being read. Asked per state rather than once — every control
        // has a pointed-at twin now, so "this has more than one state" had
        // become true of all of them, and choosing Selected hid the whole
        // section but the handful of controls named for it.
        const others = kinds.get(stateBase(name));
        const shared = state === "normal" && !others?.has(chosen);
        field.classList.toggle("is-state-hidden", !shared && state !== chosen);
      }
    }

    // The runs first, and once for the window rather than once for each of a
    // hundred categories: a line is judged by what follows it, and a gathered
    // run that has just lost its last control has to know that before the line
    // above it is asked whether anything is left.
    this.#settleBoxes();

    // A line with nothing under it says nothing. A divider is written before
    // the ordinary control of a run, so switching to a state would leave it
    // stranded above that state's controls — it goes where the whole run it
    // introduces has gone.
    for (const line of this.element.querySelectorAll(".illuminus-divider:not(.illuminus-divider--edge)")) {
      let showing = false;
      for (let next = line.nextElementSibling; next; next = next.nextElementSibling) {
        if (next.classList.contains("illuminus-divider")) break;
        // A gathered run is content the same way a control is: the line
        // introducing one has nothing under it once that run has gone.
        const run = next.classList.contains("illuminus-box")
          || next.classList.contains("illuminus-cluster");
        if (!run && !next.classList.contains("illuminus-field")) continue;
        if (!next.classList.contains("is-state-hidden")) { showing = true; break; }
      }
      line.classList.toggle("is-state-hidden", !showing);
    }
  }

  /**
   * A filter across every control in every tab.
   *
   * With well over two thousand settings, "where is the drop shadow for a
   * heading?" is the question the editor is worst at answering. Typing narrows
   * the open tab to matching controls and dims the tabs that have none, so the
   * strip itself says where to look.
   */
  #activateFilter() {
    const onlySet = this.element.querySelector(".illuminus-filter__set-box");
    if (onlySet) {
      onlySet.checked = this.#onlySet;
      onlySet.addEventListener("change", () => {
        this.#onlySet = onlySet.checked;
        this.#applyFilter();
      });
    }
    const box = this.element.querySelector(".illuminus-filter__input");
    if (!box) return;
    box.value = this.#filter;
    this.#applyFilter();
    box.addEventListener("input", () => {
      this.#filter = box.value;
      this.#applyFilter();
    });
    // Escape clears rather than closing the window, which is what a search box
    // in a dialog is expected to do.
    box.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (!box.value) return;
      event.preventDefault();
      box.value = "";
      this.#filter = "";
      this.#applyFilter();
    });
  }

  /**
   * Stop Enter from saving the style.
   *
   * The editor is a form, and a form submits when Enter is pressed in a field —
   * so typing a size and pressing Enter saved the whole style, silently and
   * some way from the Save button. Saving is a deliberate act here: nothing is
   * written to the world until that button is clicked, which is what makes
   * Undo Changes mean anything.
   *
   * Enter still does whatever the control it is pressed in does: it commits a
   * renamed block or picture treatment, as a person naturally expects, and it
   * still works on the Save button itself, which is a real click rather than an
   * implicit submission.
   */
  #holdEnter() {
    this.element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      // A button pressed with Enter is a button being clicked, textareas take
      // the newline, and anything editable keeps its own behaviour.
      if (field.matches("button, textarea") || field.isContentEditable) return;

      event.preventDefault();
      const renaming = field.dataset?.rename;
      if (!renaming) return;
      this.element.querySelector(`[data-action="renameMember"][data-group="${renaming}"]`)?.click();
    });
  }

  /** Show only the controls matching the filter, and say where the rest are. */
  #applyFilter() {
    const term = this.#filter.trim().toLowerCase();
    const root = this.element;
    const counts = new Map();

    // Searching for a hover color and being shown nothing because the section
    // is set to Normal would be the filter lying about what exists.
    for (const field of root.querySelectorAll(".illuminus-field.is-state-hidden")) {
      field.classList.toggle("is-state-suppressed", Boolean(term));
    }

    for (const tab of root.querySelectorAll(".illuminus-tab")) {
      let tabMatches = 0;
      for (const section of tab.querySelectorAll(".illuminus-section")) {
        let sectionMatches = 0;
        // A section whose own name matches shows everything in it. Searching
        // "shadow" should find Inner Shadow, whose controls are worded
        // "shading" and would otherwise all miss.
        const summary = section.querySelector("summary")?.textContent.toLowerCase() ?? "";
        const wholeSection = Boolean(term) && summary.includes(term);
        for (const field of section.querySelectorAll(".illuminus-field")) {
          const set = !this.#onlySet || !field.classList.contains("is-unset");
          const hit = set
            && (!term || wholeSection || field.textContent.toLowerCase().includes(term));
          field.classList.toggle("is-filtered-out", !hit);
          // An edge shows one side at a time, so a search for "Left Thickness"
          // would find a control the tab is not showing. A hit brings its own
          // side out from behind whichever side is chosen.
          field.closest(".illuminus-box__part")?.classList.toggle("is-found", hit && Boolean(term));
          if (hit) sectionMatches += 1;
        }
        section.classList.toggle("is-filtered-out",
          (Boolean(term) || this.#onlySet) && !sectionMatches);
        // Open what matched, and hand the author's own open/closed state back
        // when the box is cleared.
        const key = section.querySelector("summary")?.dataset;
        const wasOpen = key ? this.#expanded.has(`${key.group}.${key.section}`) : false;
        section.open = term || this.#onlySet ? sectionMatches > 0 : wasOpen;
        tabMatches += sectionMatches;
      }
      counts.set(tab.dataset.tab, tabMatches);
    }

    // The tree dims what has nothing in it, so the tree itself answers "which
    // part has the shadow settings?". A family entry follows the member on
    // show, because a filter can only see the controls that are rendered.
    for (const item of root.querySelectorAll(".illuminus-tree__part[data-tab]")) {
      const hits = counts.get(item.dataset.tab) ?? 0;
      item.classList.toggle("is-filtered-out", (Boolean(term) || this.#onlySet) && hits === 0);
    }

    this.#settleBoxes();

    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const readout = root.querySelector(".illuminus-filter__count");
    if (readout) {
      readout.textContent = term || this.#onlySet
        ? game.i18n.format("ILLUMINUS.Editor.FilterCount", { count: total })
        : "";
    }
  }

  /**
   * Let the sample pane be resized by dragging the strip on its left edge.
   *
   * Pointer capture rather than document listeners: the pointer leaves the
   * 11px strip on the first move otherwise, and the drag stops dead. The width
   * is held on the instance so a re-render — which happens on every field
   * change — does not snap the pane back.
   */
  /**
   * The switch that stops the sample answering the pointer.
   *
   * Nothing inside the sample takes the pointer while it is on, so no `:hover`
   * rule inside can match — which is the only way to say it, since CSS has no
   * way to decline a rule. The frame itself still takes the pointer, so the pane
   * still scrolls, and a click is answered by lifting this for an instant and
   * asking what sits underneath.
   */
  #activateQuiet() {
    const box = this.element.querySelector(".illuminus-preview__quiet-box");
    const frame = this.element.querySelector(".illuminus-preview__frame");
    if (!box || !frame) return;
    const show = (quiet) => {
      this.#quietSample = quiet;
      box.checked = quiet;
      frame.classList.toggle("is-quiet", quiet);
    };
    show(this.#quietSample);
    box.addEventListener("change", () => { show(box.checked); this.#keepView(); });

    // A part is still clickable: the sample is how a person reaches a part they
    // can see but cannot name.
    frame.addEventListener("click", (event) => {
      if (!this.#quietSample) return;
      const window_ = frame.querySelector(".illuminus-preview__window");
      if (!window_) return;
      window_.style.pointerEvents = "auto";
      const under = document.elementFromPoint(event.clientX, event.clientY);
      window_.style.pointerEvents = "";
      under?.closest("[data-part]")?.click();
    });
  }

  /** The magnifying glass over the sample. */
  #activateZoom() {
    const slider = this.element.querySelector('.illuminus-preview__zoom input[type="range"]');
    const frame = this.element.querySelector(".illuminus-preview__frame");
    if (!slider || !frame) return;
    const readout = this.element.querySelector(".illuminus-preview__zoom-read");
    const show = (percent) => {
      this.#sampleZoom = percent;
      slider.value = String(percent);
      if (readout) readout.textContent = `${percent}%`;
      frame.style.setProperty("--illuminus-sample-zoom", String(percent / 100));
    };
    show(this.#sampleZoom);
    slider.addEventListener("input", () => show(Number(slider.value)));
    slider.addEventListener("change", () => this.#keepView());
  }

  #activateGrip() {
    const pane = this.element.querySelector(".illuminus-preview");
    const grip = this.element.querySelector(".illuminus-preview__grip");
    if (!pane || !grip) return;
    // The settings column is the sized one and the sample takes the rest, so
    // the grip writes the settings width — dragging left widens the sample.
    const columns = this.element.querySelector(".illuminus-editor__columns");
    if (this.#previewWidth) columns.style.setProperty("--illuminus-settings-width", `${this.#previewWidth}px`);

    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      grip.classList.add("is-dragging");


      const right = this.element.querySelector(".illuminus-tab.active")?.getBoundingClientRect().right
        ?? this.element.getBoundingClientRect().right;
      const onMove = (move) => {
        // Measured from the settings column's right edge, which does not move,
        // so the split follows the pointer exactly however the window is laid
        // out. The column sits on the right of the sample, so a drag to the
        // left widens it.
        const width = Math.round(Math.min(Math.max(right - move.clientX, 260), 900));
        this.#previewWidth = width;
        columns.style.setProperty("--illuminus-settings-width", `${width}px`);
      };
      const onUp = () => {
        this.#keepView();
        grip.classList.remove("is-dragging");
        grip.releasePointerCapture(event.pointerId);
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
      };
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
    });
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const onChange = this.#onFieldChange.bind(this);
    this.element.addEventListener("change", onChange);
    this.element.addEventListener("input", onChange);

    for (const picker of this.element.querySelectorAll("[data-family-picker]")) {
      picker.addEventListener("change", () => {
        this.#showing[picker.dataset.familyPicker] = picker.value;
        this.render();
      });
    }
    this.#holdEnter();
    // The sample is a picture of a page, so it gets what a page gets: each
    // heading's run of text wrapped, or the Columns settings would show nothing
    // here and everything in a journal.
    wrapHeadingSections(this.element.querySelector(".illuminus-preview"));
    // The sample folds as a page does, so the Folding controls show what they
    // do rather than being taken on trust.
    markFolds(this.element.querySelector(".illuminus-preview"));
    this.#loadView();
    this.#activateGrip();
    this.#activateZoom();
    this.#activateQuiet();
    this.#activateBoxes();
    this.#activateSampleParts();
    this.#focusSample();
    this.#activateStates();
    this.#activateFilter();
    this.#markCurrentPart();
    this.#renderTabBadges();
    for (const row of this.element.querySelectorAll('.illuminus-field[data-field]')) {
      const [groupId, fieldName] = row.dataset.field.split(".");
      const value = this.#working?.[groupId]?.[fieldName];
      if (typeof value === "string" && value.startsWith("#")) this.#showSwatch(row, value);
    }
    this.#applyPreview();
  }

  /**
   * Paint the true color, alpha included, behind the native color input.
   *
   * A native `<input type="color">` cannot represent alpha: it renders
   * `#00000000` as solid black, so a transparent setting looks like an opaque
   * one. The real color is drawn over a checkerboard instead, and a fully
   * transparent value is spelled out.
   * @param {HTMLElement} row
   * @param {string} value
   */
  #showSwatch(row, value) {
    row.style.setProperty("--illuminus-swatch", value);
    row.classList.toggle("is-transparent", /^#[0-9a-f]{6}00$/i.test(value));
  }

  /**
   * Add a count of changed controls to each tab. Foundry's shared tab template
   * has no slot for one, so it is appended after the fact rather than forking
   * the template.
   */
  #renderTabBadges() {
    for (const group of GROUPS) this.#updateTabBadge(group.id);
  }

  /**
   * Showing a part, from the tree.
   *
   * A family entry names the member as well as the tab, so opening Heading 3
   * both switches to the Headings tab and sets its picker — one click where the
   * strip took two.
   * @this {IlluminusStyleEditor}
   */
  static #onShowPart(event, target) {
    const tab = target.dataset.tab;
    const member = target.dataset.member;
    this.#openBranches.add(tab);
    target.closest(".illuminus-tree__item")?.classList.add("is-open");
    if (member && this.#showing[tab] !== member) {
      this.#showing[tab] = member;
      this.render();
    }
    this.changeTab(tab, "sheet");
    this.#markCurrentPart();
  }

  /**
   * Opening or closing a branch.
   *
   * Kept on the window rather than in the markup: the tree is redrawn on every
   * render, and a branch closing under somebody mid-edit reads as the tree
   * losing its place.
   * @this {IlluminusStyleEditor}
   */
  static #onTwistBranch(event, target) {
    const branch = target.dataset.branch;
    const item = target.closest(".illuminus-tree__item");
    const open = !item.classList.contains("is-open");
    item.classList.toggle("is-open", open);
    target.setAttribute("aria-expanded", String(open));
    if (open) this.#openBranches.add(branch);
    else this.#openBranches.delete(branch);
  }

  /**
   * Mark the tree entry for the part on show.
   *
   * Switching a tab does not re-render, so the mark has to be moved by hand —
   * the same reason `changeTab` is overridden to move the sample's focus.
   */
  #markCurrentPart() {
    const showing = this.#activeGroupId();
    const tab = this.tabGroups.sheet;
    let current = null;
    for (const part of this.element?.querySelectorAll(".illuminus-tree__part") ?? []) {
      // A family's own entry is not the part being worked on — one of its
      // members is, and marking both says the tree cannot tell them apart.
      const family = IlluminusStyleEditor.FAMILIES.some((one) => one.id === part.dataset.tab);
      const mine = part.dataset.member
        ? part.dataset.member === showing && part.dataset.tab === tab
        : !family && part.dataset.tab === tab;
      part.classList.toggle("is-current", mine);
      if (mine) {
        part.setAttribute("aria-current", "true");
        current = part;
      } else part.removeAttribute("aria-current");
    }
    // Everything holding the part on show is opened, so a tab reached any other
    // way — the sample, a search — is visible in the tree rather than folded
    // away inside a branch.
    for (let item = current?.closest(".illuminus-tree__item"); item;
      item = item.parentElement?.closest(".illuminus-tree__item")) {
      item.classList.add("is-open");
      const branch = item.querySelector(".illuminus-tree__twist[data-branch]")?.dataset.branch;
      if (branch) this.#openBranches.add(branch);
    }
  }

  /**
   * Following the strip, which switches tabs without a re-render.
   * @override
   */
  changeTab(...args) {
    const result = super.changeTab(...args);
    this.#focusSample();
    this.#markCurrentPart();
    return result;
  }

  /**
   * Closing with unsaved work asks first.
   *
   * The editor holds every change in a working copy until Save, so closing the
   * window is the one way to lose an afternoon's styling in a single click.
   * `close()` rather than `_onClose`, because only this can decline to close;
   * `force` still closes without asking, which is what Foundry uses when the
   * world shuts down.
   * @override
   */
  async close(options = {}) {
    if (!this.#dirty || options.force) return super.close(options);

    const choice = await DialogV2.wait({
      window: { title: game.i18n.localize("ILLUMINUS.Editor.UnsavedTitle") },
      content: `<p>${game.i18n.format("ILLUMINUS.Editor.UnsavedBody", { name: this.style?.name ?? "" })}</p>`,
      buttons: [
        { action: "save", icon: "fa-solid fa-floppy-disk", label: "ILLUMINUS.Buttons.SaveAndClose", default: true },
        { action: "discard", icon: "fa-solid fa-trash", label: "ILLUMINUS.Buttons.Discard" },
        { action: "cancel", icon: "fa-solid fa-xmark", label: "ILLUMINUS.Buttons.KeepEditing" }
      ],
      // Dismissing the prompt is not a decision to throw the work away.
      rejectClose: false,
      close: () => "cancel"
    });

    if (choice === "cancel" || choice === null) return this;
    if (choice === "save") await this.#save();
    return super.close(options);
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    closeColorPicker();
    clearPreview(this.#styleId);
  }

  /**
   * Open Illuminus's color picker for one control.
   *
   * The picker edits through the same element the rest of the editor watches,
   * so its changes travel the ordinary path: live sample, changed marker, and
   * tab badge all follow without special casing. Only OK keeps the result —
   * anything else puts back the value the picker opened with.
   */
  static #onOpenColorPicker(_event, target) {
    const path = target.dataset.path;
    const picker = this.element.querySelector(`[data-field="${path}"] color-picker`);
    if (!picker) return;

    openColorPicker({
      anchor: target,
      value: picker.value,
      onChange: (hex) => { picker.value = hex; },
      swatches: this.style?.swatches ?? [],
      onSwatches: (swatches) => updateStyle(this.#styleId, { swatches })
    });
  }

  /**
   * Read the form into the working copy and repaint.
   *
   * With ~400 controls this runs on every frame of a slider drag, so it updates
   * only the field that changed and only that field's row, rather than
   * re-reading the whole form and re-marking every row.
   */
  #onFieldChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLElement)) return;
    // The name is on Foundry's own element — range-picker, color-picker,
    // file-picker — and not on the input inside it. The inside one is what
    // fires while somebody is still dragging or still typing, so reading only
    // named events meant the sample waited until the control was let go of.
    // The row knows which setting it is, which is enough to act on every
    // keystroke and every step of a drag.
    const path = input.getAttribute("name")
      || input.closest(".illuminus-field[data-field]")?.dataset.field;
    if (!path) return;
    const [groupId, fieldName] = path.split(".");
    const field = GROUPS.find((g) => g.id === groupId)?.sections
      .flatMap((s) => s.fields).find((f) => f.name === fieldName);
    if (!field) return;

    const raw = input.type === "checkbox" ? input.checked : input.value;
    const coerced = cleanSettings({ [groupId]: { [fieldName]: raw } })?.[groupId]?.[fieldName];
    if (coerced === undefined) return;

    this.#working[groupId][fieldName] = coerced;
    this.#dirty = true;
    // Once a frame rather than once an event: a drag fires input events faster
    // than a stylesheet of two thousand declarations can be rebuilt, and the
    // sample only has to be right by the time it is next drawn.
    this.#previewSoon();

    const row = this.element.querySelector(`[data-field="${groupId}.${fieldName}"]`);
    row?.classList.toggle("is-default", coerced === this.#baselineFor(groupId, field));
    row?.classList.toggle("is-unset", coerced === field.default);
    if (row && field.type === "color") this.#showSwatch(row, String(coerced));
    this.#updateTabBadge(groupId);
  }

  /**
   * Branches of the tree opened by hand.
   *
   * Held on the window rather than in the markup, because the tree is redrawn
   * on every render and a branch closing under somebody mid-edit reads as the
   * tree losing its place.
   */
  #openBranches = new Set(["window", "page"]);

  /** Set while a repaint of the sample is already booked. */
  #previewPending = false;

  /**
   * Repaint the sample once the current burst of events has been handled.
   *
   * A timer rather than an animation frame: a frame is only offered to a window
   * that is being drawn, so an editor in a background tab — or in a browser
   * driven by a test — would sit there holding a repaint that never came. A
   * zero delay still folds a burst of keystrokes into one repaint.
   */
  #previewSoon() {
    if (this.#previewPending) return;
    this.#previewPending = true;
    setTimeout(() => {
      this.#previewPending = false;
      if (this.element) this.#applyPreview();
    }, 0);
  }

  /** Refresh the "n changed" badge on a tab without re-rendering. */
  #updateTabBadge(groupId) {
    const group = GROUPS.find((g) => g.id === groupId);
    if (!group || !this.element) return;
    const count = this.#changedCount(group);
    // A member's own entry, and the family entry above it, which counts every
    // member it holds.
    const own = this.element.querySelector(
      `.illuminus-tree__part[data-member="${groupId}"] .illuminus-tree__count`)
      ?? this.element.querySelector(
        `.illuminus-tree__part[data-tab="${groupId}"]:not([data-member]) .illuminus-tree__count`);
    if (own) {
      own.textContent = count || "";
      own.classList.toggle("is-empty", !count);
    }
    if (!group.family) return;
    const members = GROUPS.filter((one) => one.family === group.family);
    const total = members.reduce((sum, one) => sum + this.#changedCount(one), 0);
    const family = this.element.querySelector(
      `.illuminus-tree__part[data-tab="${group.family}"]:not([data-member]) .illuminus-tree__count`);
    if (!family) return;
    family.textContent = total || "";
    family.classList.toggle("is-empty", !total);
  }

  /**
   * Re-mark every control against the baseline, in place.
   *
   * Saving moves the baseline, so everything becomes "unchanged" again. Doing
   * it without a re-render keeps the scroll position, the open sections, and
   * the focused control where the user left them.
   */
  #refreshBaselineMarkers() {
    // Saving can happen on the way out, when there is no longer a window to
    // mark up: the markers are for the person still looking at it.
    if (!this.element) return;
    for (const group of GROUPS) {
      for (const field of groupFields(group)) {
        const row = this.element.querySelector(`[data-field="${group.id}.${field.name}"]`);
        row?.classList.toggle("is-default",
          this.#working?.[group.id]?.[field.name] === this.#baselineFor(group.id, field));
        row?.classList.toggle("is-unset",
          this.#working?.[group.id]?.[field.name] === field.default);
      }
      this.#updateTabBadge(group.id);
    }
  }

  /** Push the working copy to the live stylesheet. */
  #applyPreview() {
    setPreview(this.#styleId, this.#working);
  }

  /** Look up a section definition from a clicked control. */
  static #sectionFrom(target) {
    const groupId = target.dataset.group;
    const sectionId = target.dataset.section;
    const group = GROUPS.find((g) => g.id === groupId);
    return { group, section: group?.sections.find((s) => s.id === sectionId) };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Save the working copy to the world. */
  static async #onSubmit() {
    await this.#save();
  }

  /**
   * Write the working copy to the style.
   *
   * Separate from the form handler because the form is not where the values
   * live — every control writes into the working copy as it changes, and this
   * only stores it. Going through `submit()` would make Foundry serialize a few
   * thousand fields to reach the same result, and serializing a form while a
   * re-render is in flight can throw on a field that has just been replaced.
   */
  async #save() {
    await updateStyle(this.#styleId, { settings: this.#working });
    this.#baseline = foundry.utils.deepClone(this.#working);
    this.#dirty = false;
    this.#refreshBaselineMarkers();
    clearPreview(this.#styleId);
    refreshStyles();
    ui.notifications.info(game.i18n.format("ILLUMINUS.Notifications.Saved", { name: this.style?.name ?? "" }));
    log.debug("saved style", this.#styleId);
  }

  /**
   * Copy the first value of each repeated property across its siblings, so
   * "all four sides the same" stays a one-click job even though every side is
   * independently settable.
   */
  static async #onMatchSides(_event, target) {
    const { group, section } = IlluminusStyleEditor.#sectionFrom(target);
    if (!group || !section) return;

    const seen = new Set();
    for (const field of section.fields) {
      if (!field.link || seen.has(field.link)) continue;
      seen.add(field.link);
      const source = this.#working[group.id][field.name];
      for (const sibling of section.fields) {
        if (sibling.link === field.link) this.#working[group.id][sibling.name] = source;
      }
    }

    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /**
   * Take every setting from the member above this one.
   *
   * Copied rather than linked, deliberately: the point is a starting place to
   * change, not a level that follows another one about. Nothing is saved by
   * this — it lands in the working copy like any other edit, so Undo Changes
   * still puts it back.
   */
  static #onCopyFromAbove(_event, target) {
    const { group: from } = target.dataset;
    const to = target.dataset.into;
    if (!from || !to || !this.#working[from]) return;
    this.#working[to] = foundry.utils.deepClone(this.#working[from]);
    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /**
   * Sample a color by pointing at anything in the Foundry window.
   *
   * Neither the operating system's color panel nor the browser's EyeDropper
   * API sample reliably on every machine — both go through screen capture,
   * and when that is unavailable they return one fixed color wherever you
   * point. This reads the color out of the page instead, which needs no
   * capture permission at all and, unlike either of those, keeps transparency.
   *
   * The trade-off is that it samples elements rather than raw pixels: colors
   * from a background picture are not available this way.
   */
  static async #onPickColor(event, target) {
    const path = target.dataset.path;
    const picker = this.element.querySelector(`[data-field="${path}"] color-picker`);
    if (!picker) return;
    // The setting says which one is ordinary; holding Shift asks for the other,
    // so whichever a person keeps is one key away from the one they keep for
    // the odd occasion — a picture's colour, or a reference open beside Foundry.
    const screen = (getSetting(SETTINGS.eyedropper) === "screen") !== Boolean(event?.shiftKey);
    const hex = screen
      ? await IlluminusStyleEditor.#pickFromScreen()
      : await IlluminusStyleEditor.#pickFromWindow();
    if (hex) picker.value = hex;
  }

  /**
   * The browser's own eyedropper, which can take any pixel on the screen.
   *
   * Offered because reading out of the page cannot see a background picture, or
   * anything outside the Foundry window — a reference image open beside it, say.
   * What it gives back is an opaque sRGB color: the API has no way to express
   * transparency, so an alpha a person wanted has to be set afterwards.
   *
   * It needs the click that asked for it to still count as a gesture, so it is
   * opened straight from the handler rather than after any awaiting. Where the
   * browser does not provide it — or the person dismisses it — nothing is
   * changed and the reason is said out loud rather than swallowed.
   * @returns {Promise<string|null>}
   */
  static async #pickFromScreen() {
    if (typeof EyeDropper !== "function") {
      ui.notifications.warn(game.i18n.localize("ILLUMINUS.Notifications.NoScreenPicker"));
      return null;
    }
    try {
      const { sRGBHex } = await new EyeDropper().open();
      return sRGBHex ?? null;
    } catch (error) {
      // Dismissing it throws, which is not a failure worth reporting.
      log.debug(`screen eyedropper closed without a color: ${error?.message}`);
      return null;
    }
  }

  /**
   * Enter pointing mode until the user clicks or presses Escape.
   * @returns {Promise<string|null>} The chosen color, or null if canceled.
   */
  static #pickFromWindow() {
    return new Promise((resolve) => {
      const readout = document.createElement("div");
      readout.className = "illuminus-picker-readout";
      document.body.append(readout);
      document.documentElement.classList.add("illuminus-picking");

      // Pointing reads what is under the cursor with `elementFromPoint`, and
      // the sample is deaf to the pointer while its own switch is on — so it
      // would answer with the frame behind it rather than the page. The guard
      // is lifted for as long as the eyedropper is out, and put back after.
      const quiet = [...document.querySelectorAll(".illuminus-preview__frame.is-quiet")];
      for (const frame of quiet) frame.classList.remove("is-quiet");

      let current = null;
      let wantText = false;
      let lastX = 0;
      let lastY = 0;

      const MODE_LABEL = {
        border: "ILLUMINUS.Picker.BorderMode",
        text: "ILLUMINUS.Picker.TextMode",
        fill: "ILLUMINUS.Picker.BackgroundMode"
      };

      const update = () => {
        const sample = IlluminusStyleEditor.#sampleAt(lastX, lastY, wantText);
        current = sample?.hex ?? null;
        readout.style.left = `${lastX + 16}px`;
        readout.style.top = `${lastY + 16}px`;
        readout.innerHTML = `<span class="illuminus-picker-swatch" style="background:${current ?? "transparent"}"></span>`
          + `<span>${current ?? "—"}</span>`
          + `<span class="illuminus-picker-mode">${sample
            ? game.i18n.localize(MODE_LABEL[sample.mode]) : ""}</span>`;
      };

      const onMove = (event) => {
        lastX = event.clientX;
        lastY = event.clientY;
        wantText = event.altKey;
        update();
      };

      // Capture phase, so pointing at a button samples it rather than pressing it.
      const onClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        finish(current);
      };

      const onKey = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        } else if (event.key === "Alt") {
          wantText = true;
          update();
        }
      };

      const onKeyUp = (event) => {
        if (event.key === "Alt") {
          wantText = false;
          update();
        }
      };

      function finish(value) {
        document.removeEventListener("mousemove", onMove, true);
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("keyup", onKeyUp, true);
        document.documentElement.classList.remove("illuminus-picking");
        for (const frame of quiet) frame.classList.add("is-quiet");
        readout.remove();
        resolve(value);
      }

      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("keyup", onKeyUp, true);
      update();
    });
  }

  /**
   * The color under a point, and what kind of color it is.
   *
   * Order matters: a border is painted inside the element's border box, so
   * pointing at the line itself must yield the border color rather than the
   * fill behind it. Only when the point is not on a border does this fall back
   * to the nearest ancestor that actually paints a background.
   *
   * @param {number} x
   * @param {number} y
   * @param {boolean} wantText  Take the lettering color instead.
   * @returns {{hex: string, mode: "border"|"text"|"fill"}|null}
   */
  static #sampleAt(x, y, wantText) {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;

    if (wantText) {
      const hex = IlluminusStyleEditor.#toHex(getComputedStyle(element).color);
      return hex ? { hex, mode: "text" } : null;
    }

    const border = IlluminusStyleEditor.#borderAt(element, x, y);
    if (border) return border;

    for (let node = element; node instanceof Element; node = node.parentElement) {
      const hex = IlluminusStyleEditor.#toHex(getComputedStyle(node).backgroundColor);
      if (hex && !IlluminusStyleEditor.#isInvisible(hex)) return { hex, mode: "fill" };
    }
    return null;
  }

  /**
   * Whether a sampled color paints nothing, so sampling should keep looking.
   *
   * Only an eight-digit value carries alpha: `#ff0000` is opaque red, while
   * `#ff000000` is fully transparent. Testing the last two characters without
   * checking the length treats every blue-free color as invisible.
   */
  static #isInvisible(hex) {
    return hex.length === 9 && hex.endsWith("00");
  }

  /**
   * Whether a point falls on one of an element's borders, and that border's
   * color. Hit testing already guarantees the point is inside the border box,
   * so this only has to work out which band it lands in.
   * @returns {{hex: string, mode: "border"}|null}
   */
  static #borderAt(element, x, y) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const sides = {
      Top: y <= rect.top + parseFloat(style.borderTopWidth),
      Right: x >= rect.right - parseFloat(style.borderRightWidth),
      Bottom: y >= rect.bottom - parseFloat(style.borderBottomWidth),
      Left: x <= rect.left + parseFloat(style.borderLeftWidth)
    };
    for (const [side, isOn] of Object.entries(sides)) {
      if (!isOn) continue;
      if (parseFloat(style[`border${side}Width`]) <= 0) continue;
      if (style[`border${side}Style`] === "none") continue;
      const hex = IlluminusStyleEditor.#toHex(style[`border${side}Color`]);
      if (hex && !IlluminusStyleEditor.#isInvisible(hex)) return { hex, mode: "border" };
    }
    return null;
  }

  /** Convert a computed `rgb()` / `rgba()` color to hex, keeping any alpha. */
  static #toHex(value) {
    const parts = String(value).match(/[\d.]+/g);
    if (!parts || parts.length < 3) return null;
    const [r, g, b, a = 1] = parts.map(Number);
    const pair = (n) => Math.round(n).toString(16).padStart(2, "0");
    const rgb = `#${pair(r)}${pair(g)}${pair(b)}`;
    return a >= 1 ? rgb : `${rgb}${pair(a * 255)}`;
  }

  /** Rename the block or picture treatment on show, for this style only. */
  static async #onRenameMember(_event, target) {
    const groupId = target.dataset.group;
    const input = this.element.querySelector(`[data-rename="${groupId}"]`);
    const labels = { ...(this.style?.labels ?? {}) };
    const name = String(input?.value ?? "").trim();
    if (name) labels[groupId] = name;
    else delete labels[groupId];
    await updateStyle(this.#styleId, { labels });
    this.render();
  }

  /**
   * Say what a control or a section is for, on the click that asks.
   *
   * The wording used to sit under every label, which is a paragraph of grey text
   * beside every one of six hundred controls — the tab you were reading became
   * mostly explanation. It is still in the markup, and still what the search box
   * searches; it is shown when somebody wants it.
   */
  static #onShowHint(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const hint = target.closest(".illuminus-field, .illuminus-section, .illuminus-tab__head")
      ?.querySelector(".illuminus-field__hint, .illuminus-section__hint, .illuminus-tab__hint")
      ?.textContent?.trim();
    if (!hint) return;
    // A second click on the same icon puts it away, which is what a person
    // expects of something they opened by clicking.
    if (game.tooltip.element === target) return game.tooltip.deactivate();
    game.tooltip.deactivate();
    game.tooltip.activate(target, { text: hint, direction: "LEFT", cssClass: "illuminus-hint-tooltip" });
  }

  /** Collapse or expand a section, remembering the choice across re-renders. */
  static #onToggleSection(_event, target) {
    const key = `${target.dataset.group}.${target.dataset.section}`;
    if (this.#expanded.has(key)) this.#expanded.delete(key);
    else this.#expanded.add(key);
  }

  /** Restore one section's controls to their schema defaults. */
  static async #onResetSection(_event, target) {
    const { group, section } = IlluminusStyleEditor.#sectionFrom(target);
    if (!group || !section) return;
    for (const field of section.fields) this.#working[group.id][field.name] = this.#baselineFor(group.id, field);
    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /** Restore the current tab's controls to their schema defaults. */
  static async #onResetGroup(_event, target) {
    // The button sits above the sample rather than inside the tab it resets, so
    // it names no group and the current one is worked out on the click.
    const group = GROUPS.find((g) => g.id === (target.dataset.group ?? this.#activeGroupId()));
    if (!group) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "ILLUMINUS.Confirm.ResetGroupTitle" },
      content: `<p>${game.i18n.format("ILLUMINUS.Confirm.ResetGroup", {
        group: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.label`)
      })}</p>`
    });
    if (!confirmed) return;
    for (const field of groupFields(group)) this.#working[group.id][field.name] = this.#baselineFor(group.id, field);
    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /**
   * Hand the window back to Foundry.
   *
   * Not the same as resetting the tab, which restores the values this style was
   * last *saved* with — a style whose saved window is bright red resets to
   * bright red. This puts the schema's own values back, and those are all
   * "leave it as Foundry draws it": no fill, no picture, no edges of ours.
   */
  static async #onFoundryDefault() {
    const group = GROUPS.find((candidate) => candidate.id === "window");
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("ILLUMINUS.Buttons.FoundryDefault") },
      content: `<p>${game.i18n.localize("ILLUMINUS.Confirm.FoundryDefault")}</p>`
    });
    if (!confirmed) return;
    for (const field of groupFields(group)) this.#working[group.id][field.name] = field.default;
    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /** Restore every control in every tab to its schema default. */
  static async #onResetAll() {
    const confirmed = await DialogV2.confirm({
      window: { title: "ILLUMINUS.Confirm.ResetAllTitle" },
      content: `<p>${game.i18n.localize("ILLUMINUS.Confirm.ResetAll")}</p>`
    });
    if (!confirmed) return;
    this.#working = foundry.utils.deepClone(this.#baseline);
    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /** Discard unsaved edits and reload from the stored style. */
  static async #onRevert() {
    if (this.#dirty) {
      const confirmed = await DialogV2.confirm({
        window: { title: "ILLUMINUS.Confirm.RevertTitle" },
        content: `<p>${game.i18n.localize("ILLUMINUS.Confirm.Revert")}</p>`
      });
      if (!confirmed) return;
    }
    this.#loadWorking();
    this.#applyPreview();
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Open the editor for a style, focusing an already-open window if there is
   * one. Always resolves to the application either way, so callers can drive it
   * without caring whether it was already on screen.
   * @param {string} styleId
   * @returns {Promise<IlluminusStyleEditor>}
   */
  static async open(styleId) {
    const id = `illuminus-style-editor-${styleId}`;
    let existing = foundry.applications.instances.get(id);
    // An application stays in the register for the length of its closing
    // animation, so "one is open already" can mean one on its way out: no
    // element, nothing drawn, and a caller left waiting for controls that will
    // never arrive. Give the close its moment rather than reviving a window
    // mid-flight — pressing Edit again the instant a window closes is exactly
    // when this happens, and it looks like the editor failing to open.
    for (let i = 0; i < 20 && existing && !existing.rendered; i++) {
      await new Promise((done) => setTimeout(done, 50));
      existing = foundry.applications.instances.get(id);
    }
    if (existing?.rendered) {
      existing.bringToFront();
      // Looked at twice, because a window does not admit to closing. `close()`
      // marks nothing at the moment it is called — the application still says
      // RENDERED, and only says CLOSED a frame or two later — so a window that
      // says it is drawn can already be on its way out. Asking again is the
      // only way to tell, and it costs nothing on the ordinary path of opening
      // one that is genuinely there.
      await new Promise((done) => setTimeout(done, 80));
      if (existing.rendered) return existing;
      existing = foundry.applications.instances.get(id);
      for (let i = 0; i < 20 && existing && !existing.rendered; i++) {
        await new Promise((done) => setTimeout(done, 50));
        existing = foundry.applications.instances.get(id);
      }
    }
    // Still registered and still not drawn: draw it rather than hand it back as
    // it is, since a second window would collide with it on id.
    if (existing) return existing.render({ force: true });
    return new IlluminusStyleEditor({ styleId }).render({ force: true });
  }
}
