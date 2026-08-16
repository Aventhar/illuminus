import { MODULE_ID, log } from "../constants.mjs";
import { listStyles, getAssignedStyleId } from "../style-store.mjs";
import { exportJournalsAsHtml } from "../export-html.mjs";
import { confirmExportTerms, showExportTerms, whatTravels } from "../export-terms.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A window to print into, opened while the click that asked for it is still
 * fresh, and given something to say while the pages are made.
 *
 * Returns null when the browser refuses, which is not a failure: the export
 * falls back to printing a frame instead.
 */
function openWaitingWindow() {
  const view = window.open("", "_blank");
  if (!view) return null;
  view.document.write(`<!doctype html><meta charset="utf-8">`
    + `<title>${foundry.utils.escapeHTML(game.i18n.localize("ILLUMINUS.Export.Title"))}</title>`
    + `<style>body{font-family:system-ui,sans-serif;background:#16130f;color:#e8e0d0;`
    + `display:grid;place-items:center;height:100vh;margin:0}</style>`
    + `<p>${foundry.utils.escapeHTML(game.i18n.localize("ILLUMINUS.Export.Printing"))}</p>`);
  view.document.close();
  return view;
}

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
    // Tall enough for every section at once: a window that opens with its last
    // fieldset cut off reads as a mistake, and this one has five.
    position: { width: 560, height: 780 },
    form: {
      handler: IlluminusExportDialog.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      pickAll: IlluminusExportDialog.#onPickAll,
      pickNone: IlluminusExportDialog.#onPickNone,
      terms: IlluminusExportDialog.#onShowTerms
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
    // "As it looks now" comes first, because it is the one choice that needs no
    // styles set up at all — a world that has never opened Illuminus can still
    // export what is on the screen.
    context.styles = [
      { id: "", name: game.i18n.localize("ILLUMINUS.Export.OwnLook"), selected: !this.#styleId },
      ...listStyles().map((style) => ({
        id: style.id,
        name: style.name,
        selected: style.id === this.#styleId
      }))
    ];
    context.carrying = whatTravels().join(" ");
    // One window, three ways out. A folder is the fullest, one page is the one
    // you can email, and printing is the one that becomes a PDF.
    // The PDF leads, and is what the window offers unless told otherwise: it is
    // the one most people are here for, and the only one that ends at a table.
    context.formats = [
      { id: "print", label: "ILLUMINUS.Export.FormatPrint", checked: true },
      { id: "folder", label: "ILLUMINUS.Export.FormatFolder" },
      { id: "file", label: "ILLUMINUS.Export.FormatFile" }
    ];
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
    // Saying "none of your journals use this style" beats an empty box — but
    // only when there are journals to filter. A world with none of its own
    // already says so, and two empty messages at once say neither.
    const rows = this.element.querySelectorAll(".illuminus-export-dialog__row").length;
    const empty = this.element.querySelector(".illuminus-export-dialog__none");
    if (empty) empty.classList.toggle("is-shown", rows > 0 && showing === 0);
  }

  /**
   * Some choices only mean something for one way of saving. Whether the page's
   * own surface is printed is a question about paper, so it is asked when a PDF
   * is what is being made and not before.
   */
  #applyFormat() {
    const format = this.element.querySelector('input[name="format"]:checked')?.value ?? "folder";
    for (const only of this.element.querySelectorAll(".illuminus-export-dialog__pdf-only")) {
      only.classList.toggle("is-hidden", format !== "print");
    }
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const control of ['select[name="styleId"]', 'input[name="onlyStyled"]']) {
      this.element.querySelector(control)?.addEventListener("change", () => this.#applyFilter());
    }
    for (const radio of this.element.querySelectorAll('input[name="format"]')) {
      radio.addEventListener("change", () => this.#applyFormat());
    }
    this.#applyFilter();
    this.#applyFormat();
  }

  /** Read the notice again, whenever somebody wants to. */
  static #onShowTerms() {
    showExportTerms(whatTravels());
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
    const format = data.format ?? "print";

    // The notice first, and the window after it. A browser allows a new window
    // while it can still see the click that asked for one — and the notice is
    // answered with a click of its own, so the permission survives being asked
    // a question. Opening the window first put a blank tab in front of a notice
    // waiting behind it, which is a good way to make somebody think the export
    // has hung.
    if (!await confirmExportTerms({ carrying: whatTravels() })) return;

    // Printing a page in a window of its own is what gives the reader a
    // sensible filename and a contents page that still works on paper: a
    // browser names a print job after the top-level document, and keeps that
    // document's internal links. The window waits, saying so, while the pages
    // are built.
    const target = format === "print" ? openWaitingWindow() : null;

    log.debug(`exporting ${entryIds.length} journal(s) as ${format}`);
    await exportJournalsAsHtml({
      styleId: data.styleId,
      entryIds,
      secrets: Boolean(data.secrets),
      pageBackground: Boolean(data.pageBackground),
      format,
      target
    });
  }
}
