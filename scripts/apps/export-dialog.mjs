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
      pickNone: IlluminusExportDialog.#onPickNone,
      pickStyled: IlluminusExportDialog.#onPickStyled
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

  /** Every journal tick box, for the three quick pickers. */
  #boxes() {
    return [...this.element.querySelectorAll('input[name="entryIds"]')];
  }

  static #onPickAll() {
    for (const box of this.#boxes()) box.checked = true;
  }

  static #onPickNone() {
    for (const box of this.#boxes()) box.checked = false;
  }

  /**
   * Tick the journals already wearing the chosen style, which is what an
   * author usually means by "export my adventure".
   */
  static #onPickStyled() {
    const styleId = this.element.querySelector('select[name="styleId"]').value;
    for (const box of this.#boxes()) {
      const entry = game.journal.get(box.value);
      box.checked = Boolean(entry) && getAssignedStyleId(entry) === styleId;
    }
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    const entryIds = [data.entryIds ?? []].flat().filter(Boolean);
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
