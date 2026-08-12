import { MODULE_ID, STYLED_CLASS, STYLE_ATTR, log } from "../constants.mjs";
import { GROUPS, defaultSettings, cleanSettings } from "../style-schema.mjs";
import { getStyle, updateStyle } from "../style-store.mjs";
import { setPreview, clearPreview, refreshStyles } from "../style-injector.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * The tabbed editor for a single journal style.
 *
 * Every control on every tab is generated from `style-schema.mjs`, so the GUI
 * never needs to be touched when a new style property is added.
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
    position: { width: 860, height: 720 },
    form: {
      handler: IlluminusStyleEditor.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    actions: {
      resetGroup: IlluminusStyleEditor.#onResetGroup,
      resetAll: IlluminusStyleEditor.#onResetAll,
      revert: IlluminusStyleEditor.#onRevert
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
    const available = foundry.applications.settings.menus.FontConfig.getAvailableFontChoices();
    return Object.assign(choices, available);
  }

  /** @override */
  async _prepareContext(options) {
    if (!this.#working) this.#loadWorking();
    const context = await super._prepareContext(options);
    const fonts = this.#fontChoices();

    context.styleId = this.#styleId;
    context.style = this.style;
    context.dirty = this.#dirty;
    context.styledClass = STYLED_CLASS;
    context.styleAttr = STYLE_ATTR;
    context.groups = GROUPS.map((group) => ({
      id: group.id,
      label: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.label`),
      hint: game.i18n.localize(`ILLUMINUS.Groups.${group.id}.hint`),
      active: this.tabGroups.sheet === group.id,
      fields: group.fields.map((field) => this.#fieldContext(group, field, fonts))
    }));
    context.buttons = [
      { type: "submit", icon: "fa-solid fa-floppy-disk", label: "ILLUMINUS.Buttons.Save" },
      { type: "button", action: "revert", icon: "fa-solid fa-rotate-left", label: "ILLUMINUS.Buttons.Revert" }
    ];
    return context;
  }

  /**
   * Label for a select option. Most choices read the same wherever they appear
   * ("Bold", "Centred"), but a few need wording specific to their control —
   * "Left" means one thing for alignment and another for a box's border. A
   * field-specific key wins when one exists; otherwise the shared label is used.
   * @param {string} fieldName
   * @param {string} choice
   */
  #choiceLabel(fieldName, choice) {
    const specific = `ILLUMINUS.Choices.${fieldName}.${choice}`;
    if (game.i18n.has(specific)) return game.i18n.localize(specific);
    return game.i18n.localize(`ILLUMINUS.Choices.${choice}`);
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
      value: choice,
      label,
      selected: choice === value
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
    // Any control change repaints the preview immediately; persistence waits for Save.
    this.element.addEventListener("change", this.#onFieldChange.bind(this));
    this.element.addEventListener("input", this.#onFieldChange.bind(this));
    this.#applyPreview();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    clearPreview(this.#styleId);
  }

  /** Read the form into the working copy and repaint. */
  #onFieldChange(event) {
    if (!event.target?.name) return;
    this.#readForm();
    this.#dirty = true;
    this.#applyPreview();
    this.#markDefaults();
  }

  /** Replace the working copy with the current form state. */
  #readForm() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    const expanded = foundry.utils.expandObject(data);
    this.#working = foundry.utils.mergeObject(defaultSettings(), cleanSettings(expanded), { inplace: false });
  }

  /** Push the working copy to the live stylesheet. */
  #applyPreview() {
    setPreview(this.#styleId, this.#working);
  }

  /** Flag controls that still hold their default value, so changes stand out. */
  #markDefaults() {
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const row = this.element.querySelector(`[data-field="${group.id}.${field.name}"]`);
        if (row) row.classList.toggle("is-default", this.#working?.[group.id]?.[field.name] === field.default);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Save the working copy to the world. */
  static async #onSubmit(_event, _form, _formData) {
    this.#readForm();
    await updateStyle(this.#styleId, { settings: this.#working });
    this.#dirty = false;
    clearPreview(this.#styleId);
    refreshStyles();
    ui.notifications.info(game.i18n.format("ILLUMINUS.Notifications.Saved", { name: this.style?.name ?? "" }));
    log.debug("saved style", this.#styleId);
  }

  /** Restore the current tab's controls to their schema defaults. */
  static async #onResetGroup(_event, target) {
    const groupId = target.dataset.group;
    const group = GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "ILLUMINUS.Confirm.ResetGroupTitle" },
      content: `<p>${game.i18n.format("ILLUMINUS.Confirm.ResetGroup", {
        group: game.i18n.localize(`ILLUMINUS.Groups.${groupId}.label`)
      })}</p>`
    });
    if (!confirmed) return;
    for (const field of group.fields) this.#working[groupId][field.name] = field.default;
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

  /** Open the editor for a style, focusing an already-open window if there is one. */
  static open(styleId) {
    const existing = foundry.applications.instances.get(`illuminus-style-editor-${styleId}`);
    if (existing) return existing.bringToFront();
    return new IlluminusStyleEditor({ styleId }).render({ force: true });
  }
}
