import { MODULE_ID, log } from "../constants.mjs";
import { listStyles, getAssignedStyleId } from "../style-store.mjs";
import { exportJournalsAsHtml } from "../export-html.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** "1 page" rather than "1 pages": Foundry's formatter does not decline. */
function pageCount(count) {
  return game.i18n.format(count === 1 ? "ILLUMINUS.Export.PageCountOne" : "ILLUMINUS.Export.PageCount", { count });
}

/**
 * Choose what to export, and in what.
 *
 * Exports are per style — "these journals, as they look under this style" — so
 * this window opens from the style library, and from a journal's own context
 * menu with that journal already ticked and its assigned style already chosen.
 */
export class IlluminusExportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "illuminus-export-dialog",
    classes: ["illuminus", "illuminus-manager"],
    tag: "form",
    window: {
      title: "ILLUMINUS.Export.Title",
      icon: "fa-solid fa-file-export",
      resizable: true
    },
    position: { width: 560, height: 620 },
    form: {
      handler: IlluminusExportDialog.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      pickAll: IlluminusExportDialog.#onPickAll,
      pickNone: IlluminusExportDialog.#onPickNone
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/export-dialog.hbs`,
      scrollable: [".illuminus-export-dialog__list"]
    },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  /** @type {string} The style ticked when the window opens. */
  #styleId;

  /** @type {Set<string>} Journals ticked when the window opens. */
  #entryIds;

  constructor({ styleId, entryIds = [], ...options } = {}) {
    super(options);
    this.#styleId = styleId ?? listStyles()[0]?.id ?? "";
    this.#entryIds = new Set(entryIds);
  }

  /**
   * Open the window, or bring it forward.
   * @param {{styleId?: string, entryIds?: string[]}} [options]
   */
  static open(options = {}) {
    const existing = foundry.applications.instances.get("illuminus-export-dialog");
    if (existing) return existing.bringToFront();
    return new IlluminusExportDialog(options).render({ force: true });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.styles = listStyles().map((style) => ({
      id: style.id,
      name: style.name,
      selected: style.id === this.#styleId
    }));
    context.journals = game.journal.contents
      .filter((entry) => entry.testUserPermission(game.user, "OBSERVER"))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        styleId: getAssignedStyleId(entry) ?? "",
        pages: pageCount(entry.pages.contents.filter((page) => ["text", "image"].includes(page.type)).length),
        selected: this.#entryIds.has(entry.id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    context.buttons = [
      { type: "submit", icon: "fa-solid fa-file-export", label: "ILLUMINUS.Export.Build" }
    ];
    return context;
  }

  /**
   * The journal rows a person can actually see. Select All means the ones in
   * front of you, not the ones the filter is hiding.
   */
  #rows() {
    return [...this.element.querySelectorAll(".illuminus-export-dialog__row")]
      .filter((row) => !row.classList.contains("is-filtered-out"));
  }

  #boxes() {
    return this.#rows().map((row) => row.querySelector('input[name="entryIds"]'));
  }

  static #onPickAll() {
    for (const box of this.#boxes()) box.checked = true;
  }

  static #onPickNone() {
    for (const box of this.#boxes()) box.checked = false;
  }

  /**
   * Show only the journals already wearing the chosen style.
   *
   * A hidden journal is unticked as it goes: leaving it ticked would export
   * something the list is no longer showing, which is the kind of surprise an
   * export should never spring on anyone.
   *
   * The filter can be turned off, because dressing an unstyled journal in a
   * style is half the point of choosing one here — the tick box decides which
   * of the two jobs this window is doing.
   */
  #applyFilter() {
    const wanted = this.element.querySelector('select[name="styleId"]')?.value ?? "";
    const only = this.element.querySelector('input[name="onlyStyled"]')?.checked ?? false;
    let showing = 0;
    for (const row of this.element.querySelectorAll(".illuminus-export-dialog__row")) {
      const hide = only && row.dataset.styleId !== wanted;
      row.classList.toggle("is-filtered-out", hide);
      if (hide) row.querySelector('input[name="entryIds"]').checked = false;
      else showing += 1;
    }
    // Saying "none of your journals use this style" beats an empty box.
    const empty = this.element.querySelector(".illuminus-export-dialog__none");
    if (empty) empty.classList.toggle("is-shown", showing === 0);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const control of ['select[name="styleId"]', 'input[name="onlyStyled"]']) {
      this.element.querySelector(control)?.addEventListener("change", () => this.#applyFilter());
    }
    this.#applyFilter();
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    // Only what is on show: a filtered-out journal is unticked as it is hidden,
    // but a form remembers what it was told, not what it last displayed.
    const visible = new Set(this.#boxes().filter((box) => box.checked).map((box) => box.value));
    const entryIds = [data.entryIds ?? []].flat().filter((id) => visible.has(id));
    if (!entryIds.length) {
      ui.notifications.warn(game.i18n.localize("ILLUMINUS.Export.PickOne"));
      return;
    }
    log.debug(`exporting ${entryIds.length} journal(s) as HTML`);
    await exportJournalsAsHtml({
      styleId: data.styleId,
      entryIds,
      secrets: Boolean(data.secrets)
    });
  }
}
