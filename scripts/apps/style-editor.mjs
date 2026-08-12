import { MODULE_ID, STYLED_CLASS, STYLE_ATTR, log } from "../constants.mjs";
import { GROUPS, defaultSettings, cleanSettings, groupFields } from "../style-schema.mjs";
import { getStyle, updateStyle } from "../style-store.mjs";
import { setPreview, clearPreview, refreshStyles } from "../style-injector.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * The tabbed editor for a single journal style.
 *
 * Every control on every tab is generated from `style-schema.mjs` — 391 of them
 * across 68 collapsible sections — so the GUI never needs touching when a style
 * property is added.
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

  /** Whether the working copy differs from what is stored. */
  #dirty = false;

  /** Sections the user has collapsed, so a re-render does not reopen them. */
  #collapsed = new Set();

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
      pickColor: IlluminusStyleEditor.#onPickColor
    }
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    body: {
      template: `modules/${MODULE_ID}/templates/style-editor.hbs`,
      classes: ["illuminus-editor__body"],
      scrollable: [".illuminus-fields"]
    },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  static TABS = {
    sheet: {
      tabs: GROUPS.map((group) => ({ id: group.id, icon: group.icon, label: `ILLUMINUS.Groups.${group.id}.label` })),
      initial: GROUPS[0].id
    }
  };

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
    this.#dirty = false;
  }

  /** Font family choices offered by Foundry, plus a "use the sheet default" entry. */
  #fontChoices() {
    const choices = { "": game.i18n.localize("ILLUMINUS.Field.font.inherit") };
    return Object.assign(choices, foundry.applications.settings.menus.FontConfig.getAvailableFontChoices());
  }

  /**
   * Label for a select option. Most choices read the same wherever they appear
   * ("Bold", "Centred"), but a few need wording specific to their control. A
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
    context.groups = GROUPS.map((group) => ({
      id: group.id,
      label: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.label`),
      hint: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.hint`),
      active: this.tabGroups.sheet === group.id,
      changedCount: this.#changedCount(group),
      sections: group.sections.map((section) => ({
        id: section.id,
        label: game.i18n.localize(`ILLUMINUS.Sections.${section.id}.label`),
        hint: game.i18n.localize(`ILLUMINUS.Sections.${section.id}.hint`),
        open: !this.#collapsed.has(`${group.id}.${section.id}`),
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

  /** How many controls in a group differ from their default, for the tab badge. */
  #changedCount(group) {
    return groupFields(group).filter((field) => this.#working?.[group.id]?.[field.name] !== field.default).length;
  }

  /** Build the template data for one control. */
  #fieldContext(group, field, fonts) {
    const value = this.#working?.[group.id]?.[field.name] ?? field.default;
    const context = {
      path: `${group.id}.${field.name}`,
      type: field.type,
      label: game.i18n.localize(`ILLUMINUS.Field.${field.name}.label`),
      hint: game.i18n.localize(`ILLUMINUS.Field.${field.name}.hint`),
      value,
      isDefault: value === field.default
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

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const onChange = this.#onFieldChange.bind(this);
    this.element.addEventListener("change", onChange);
    this.element.addEventListener("input", onChange);
    this.#renderTabBadges();
    this.#removeUnsupportedEyedroppers();
    this.#applyPreview();
  }

  /**
   * Drop the eyedropper buttons when the browser cannot sample the screen,
   * rather than offering a control that silently does nothing.
   */
  #removeUnsupportedEyedroppers() {
    if (globalThis.EyeDropper) return;
    for (const button of this.element.querySelectorAll(".illuminus-eyedropper")) button.remove();
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

  /** @override */
  _onClose(options) {
    super._onClose(options);
    clearPreview(this.#styleId);
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
    row?.classList.toggle("is-default", coerced === field.default);
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
    this.#dirty = false;
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
   * Sample a colour from anywhere on screen.
   *
   * Foundry's own colour control is a plain `<input type="color">`, which on
   * macOS hands off to the system colour panel — whose magnifier is outside
   * this module's reach and does not reliably sample. The EyeDropper API is
   * the browser's own picker and sidesteps it entirely.
   *
   * The sampled value is applied by assigning to the colour element, so it
   * travels the same change path as any manual edit.
   */
  static async #onPickColor(_event, target) {
    const path = target.dataset.path;
    const picker = this.element.querySelector(`[data-field="${path}"] color-picker`);
    if (!picker) return;

    if (!globalThis.EyeDropper) {
      ui.notifications.warn(game.i18n.localize("ILLUMINUS.Notifications.NoEyedropper"));
      return;
    }

    try {
      const { sRGBHex } = await new globalThis.EyeDropper().open();
      if (sRGBHex) picker.value = sRGBHex;
    } catch (error) {
      // Dismissing the picker rejects with AbortError; that is not a failure.
      if (error?.name === "AbortError") return;
      log.error("eyedropper failed", error);
      ui.notifications.error(game.i18n.localize("ILLUMINUS.Notifications.EyedropperFailed"));
    }
  }

  /** Collapse or expand a section, remembering the choice across re-renders. */
  static #onToggleSection(_event, target) {
    const key = `${target.dataset.group}.${target.dataset.section}`;
    if (this.#collapsed.has(key)) this.#collapsed.delete(key);
    else this.#collapsed.add(key);
  }

  /** Restore one section's controls to their schema defaults. */
  static async #onResetSection(_event, target) {
    const { group, section } = IlluminusStyleEditor.#sectionFrom(target);
    if (!group || !section) return;
    for (const field of section.fields) this.#working[group.id][field.name] = field.default;
    this.#dirty = true;
    this.#applyPreview();
    this.render();
  }

  /** Restore the current tab's controls to their schema defaults. */
  static async #onResetGroup(_event, target) {
    const group = GROUPS.find((g) => g.id === target.dataset.group);
    if (!group) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "ILLUMINUS.Confirm.ResetGroupTitle" },
      content: `<p>${game.i18n.format("ILLUMINUS.Confirm.ResetGroup", {
        group: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.label`)
      })}</p>`
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
    this.#working = defaultSettings();
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
