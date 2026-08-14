import { MODULE_ID, STYLED_CLASS, STYLE_ATTR, log } from "../constants.mjs";
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
    position: { width: 980, height: 780 },
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
      openColorPicker: IlluminusStyleEditor.#onOpenColorPicker
    }
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    body: {
      template: `modules/${MODULE_ID}/templates/style-editor.hbs`,
      // Registered as a partial so the page tabs and the block and picture tabs
      // render their controls from one copy.
      templates: [`modules/${MODULE_ID}/templates/style-field.hbs`],
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
    { id: "imageStyles", icon: "fa-solid fa-images", label: "ILLUMINUS.Families.imageStyles" }
  ];

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
        current: { ...this.#groupContext(current, fonts), label: this.#labelFor(current.id) }
      };
    });

    // Which member each family's own preview panel is built for. Taken from
    // the same resolution as the tab above, so the panel can never end up
    // showing a different block from the one whose controls are on screen.
    context.preview = Object.fromEntries(context.families.map((family) =>
      [family.id, { id: family.current.id, label: family.current.label }]));

    context.groups = IlluminusStyleEditor.pageGroups.map((group) => ({
      id: group.id,
      label: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.label`),
      hint: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.hint`),
      active: this.tabGroups.sheet === group.id,
      changedCount: this.#changedCount(group),
      sections: group.sections.map((section) => ({
        id: section.id,
        label: game.i18n.localize(`ILLUMINUS.Sections.${section.id}.label`),
        hint: game.i18n.localize(`ILLUMINUS.Sections.${section.id}.hint`),
        open: this.#expanded.has(`${group.id}.${section.id}`),
        // Only sections whose fields repeat one property across sides or
        // corners can offer to match them.
        matchable: section.fields.some((field) => field.link),
        fields: section.fields.map((field) => this.#fieldContext(group, field, fonts))
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
        label: game.i18n.localize(`ILLUMINUS.Sections.${section.id}.label`),
        hint: game.i18n.localize(`ILLUMINUS.Sections.${section.id}.hint`),
        open: this.#expanded.has(`${group.id}.${section.id}`),
        matchable: section.fields.some((field) => field.link),
        fields: section.fields.map((field) => this.#fieldContext(group, field, fonts))
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
  #fieldText(group, field, part) {
    const specific = `ILLUMINUS.Field.${group.family ?? group.id}.${field.name}.${part}`;
    if (game.i18n.has(specific)) return game.i18n.localize(specific);
    return game.i18n.localize(`ILLUMINUS.Field.${field.name}.${part}`);
  }

  /** Build the template data for one control. */
  #fieldContext(group, field, fonts) {
    const value = this.#working?.[group.id]?.[field.name] ?? field.default;
    const context = {
      path: `${group.id}.${field.name}`,
      type: field.type,
      label: this.#fieldText(group, field, "label"),
      hint: this.#fieldText(group, field, "hint"),
      value,
      isDefault: value === this.#baselineFor(group.id, field)
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
   * Let the sample pane be resized by dragging the strip on its left edge.
   *
   * Pointer capture rather than document listeners: the pointer leaves the
   * 11px strip on the first move otherwise, and the drag stops dead. The width
   * is held on the instance so a re-render — which happens on every field
   * change — does not snap the pane back.
   */
  #activateGrip() {
    const pane = this.element.querySelector(".illuminus-preview");
    const grip = this.element.querySelector(".illuminus-preview__grip");
    if (!pane || !grip) return;
    if (this.#previewWidth) pane.style.setProperty("--illuminus-pane-width", `${this.#previewWidth}px`);

    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      grip.classList.add("is-dragging");
      const right = pane.getBoundingClientRect().right;

      const onMove = (move) => {
        // Measured from the pane's right edge, which does not move, so the
        // sample follows the pointer exactly however the window is laid out.
        const width = Math.round(Math.min(Math.max(right - move.clientX, 260), 1200));
        this.#previewWidth = width;
        pane.style.setProperty("--illuminus-pane-width", `${width}px`);
      };
      const onUp = () => {
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
    this.#activateGrip();
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
    for (const group of GROUPS) {
      const item = this.element.querySelector(`nav.tabs [data-tab="${group.id}"]`);
      if (!item || item.querySelector(".illuminus-badge")) continue;
      const badge = document.createElement("span");
      badge.className = "illuminus-badge";
      badge.dataset.tooltip = game.i18n.localize("ILLUMINUS.Editor.ChangedTooltip");
      item.append(badge);
    }
    for (const group of GROUPS) this.#updateTabBadge(group.id);
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
    if (choice === "save") await this.submit();
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
    if (!input?.name) return;
    const [groupId, fieldName] = input.name.split(".");
    const field = GROUPS.find((g) => g.id === groupId)?.sections
      .flatMap((s) => s.fields).find((f) => f.name === fieldName);
    if (!field) return;

    const raw = input.type === "checkbox" ? input.checked : input.value;
    const coerced = cleanSettings({ [groupId]: { [fieldName]: raw } })?.[groupId]?.[fieldName];
    if (coerced === undefined) return;

    this.#working[groupId][fieldName] = coerced;
    this.#dirty = true;
    this.#applyPreview();

    const row = this.element.querySelector(`[data-field="${groupId}.${fieldName}"]`);
    row?.classList.toggle("is-default", coerced === this.#baselineFor(groupId, field));
    if (row && field.type === "color") this.#showSwatch(row, String(coerced));
    this.#updateTabBadge(groupId);
  }

  /** Refresh the "n changed" badge on a tab without re-rendering. */
  #updateTabBadge(groupId) {
    const group = GROUPS.find((g) => g.id === groupId);
    const badge = this.element.querySelector(`nav.tabs [data-tab="${groupId}"] .illuminus-badge`);
    if (!group || !badge) return;
    const count = this.#changedCount(group);
    badge.textContent = count || "";
    badge.classList.toggle("is-empty", !count);
  }

  /**
   * Re-mark every control against the baseline, in place.
   *
   * Saving moves the baseline, so everything becomes "unchanged" again. Doing
   * it without a re-render keeps the scroll position, the open sections, and
   * the focused control where the user left them.
   */
  #refreshBaselineMarkers() {
    for (const group of GROUPS) {
      for (const field of groupFields(group)) {
        const row = this.element.querySelector(`[data-field="${group.id}.${field.name}"]`);
        row?.classList.toggle("is-default",
          this.#working?.[group.id]?.[field.name] === this.#baselineFor(group.id, field));
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
  static async #onPickColor(_event, target) {
    const path = target.dataset.path;
    const picker = this.element.querySelector(`[data-field="${path}"] color-picker`);
    if (!picker) return;
    const hex = await IlluminusStyleEditor.#pickFromWindow();
    if (hex) picker.value = hex;
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
    const existing = foundry.applications.instances.get(`illuminus-style-editor-${styleId}`);
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    return new IlluminusStyleEditor({ styleId }).render({ force: true });
  }
}
