import { MODULE_ID, FLAGS, log } from "../constants.mjs";
import {
  listStyles, createStyle, duplicateStyle, deleteStyle, updateStyle, restorePresets
} from "../style-store.mjs";
import { exportStyles, promptImport } from "../io.mjs";
import { IlluminusStyleEditor } from "./style-editor.mjs";
import { IlluminusExportDialog } from "./export-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * The library of journal styles for this world: create, rename, duplicate,
 * delete, and move styles in and out of the world as JSON files.
 *
 * Reached from Configure Settings, and from the Journals sidebar footer.
 */
export class IlluminusStyleManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "illuminus-style-manager",
    classes: ["illuminus", "illuminus-manager"],
    tag: "div",
    window: {
      title: "ILLUMINUS.Manager.Title",
      icon: "fa-solid fa-swatchbook",
      resizable: true
    },
    position: { width: 620, height: 560 },
    actions: {
      create: IlluminusStyleManager.#onCreate,
      edit: IlluminusStyleManager.#onEdit,
      rename: IlluminusStyleManager.#onRename,
      duplicate: IlluminusStyleManager.#onDuplicate,
      remove: IlluminusStyleManager.#onDelete,
      exportOne: IlluminusStyleManager.#onExportOne,
      exportSelected: IlluminusStyleManager.#onExportSelected,
      exportAll: IlluminusStyleManager.#onExportAll,
      import: IlluminusStyleManager.#onImport,
      advancedExport: IlluminusStyleManager.#onAdvancedExport,
      restore: IlluminusStyleManager.#onRestore,
      toggleAll: IlluminusStyleManager.#onToggleAll
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/style-manager.hbs`, scrollable: [".illuminus-style-list"] }
  };

  /**
   * The ids ticked in the list.
   *
   * Read from the boxes when something asks, rather than mirrored in a field:
   * keeping a copy meant re-rendering the whole window on every tick to show a
   * count, which threw away the scroll position and made ticking four styles in
   * a row feel like fighting the list. The template library never did this, and
   * the two windows now work the same way.
   */
  #selected() {
    return [...this.element.querySelectorAll("input[name='pick']:checked")].map((box) => box.value);
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const styles = listStyles();
    context.styles = styles.map((style) => ({
      ...style,
      usage: game.journal.filter((j) => j.getFlag(MODULE_ID, FLAGS.style) === style.id).length
    }));
    context.hasStyles = styles.length > 0;
    return context;
  }

  /** The style id for the row a clicked button sits in. */
  static #rowId(target) {
    return target.closest("[data-style-id]")?.dataset.styleId;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onCreate() {
    const style = await createStyle();
    this.render();
    IlluminusStyleEditor.open(style.id);
  }

  static #onEdit(_event, target) {
    const id = IlluminusStyleManager.#rowId(target);
    if (id) IlluminusStyleEditor.open(id);
  }

  static async #onRename(_event, target) {
    const id = IlluminusStyleManager.#rowId(target);
    const style = listStyles().find((s) => s.id === id);
    if (!style) return;

    const content = `
      <div class="form-group">
        <label>${game.i18n.localize("ILLUMINUS.Manager.NameLabel")}</label>
        <input type="text" name="name" value="${foundry.utils.escapeHTML(style.name)}" autofocus>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("ILLUMINUS.Manager.DescriptionLabel")}</label>
        <textarea name="description" rows="3">${foundry.utils.escapeHTML(style.description ?? "")}</textarea>
      </div>`;

    const result = await DialogV2.prompt({
      window: { title: "ILLUMINUS.Manager.RenameTitle" },
      content,
      ok: {
        label: "ILLUMINUS.Buttons.Save",
        callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!result) return;
    await updateStyle(id, { name: String(result.name).trim() || style.name, description: String(result.description) });
    this.render();
  }

  static async #onDuplicate(_event, target) {
    const id = IlluminusStyleManager.#rowId(target);
    if (!id) return;
    await duplicateStyle(id);
    this.render();
  }

  static async #onDelete(_event, target) {
    const id = IlluminusStyleManager.#rowId(target);
    const style = listStyles().find((s) => s.id === id);
    if (!style) return;
    const usage = game.journal.filter((j) => j.getFlag(MODULE_ID, FLAGS.style) === id).length;

    const confirmed = await DialogV2.confirm({
      window: { title: "ILLUMINUS.Confirm.DeleteTitle" },
      content: `<p>${game.i18n.format("ILLUMINUS.Confirm.Delete", { name: style.name })}</p>` +
        (usage ? `<p class="notification warning">${game.i18n.format("ILLUMINUS.Confirm.DeleteInUse", { count: usage })}</p>` : "")
    });
    if (!confirmed) return;

    await deleteStyle(id);
    // Forced: the style is going away, so there is nothing to offer to save
    // into, and the unsaved-changes prompt would have nowhere to put it.
    foundry.applications.instances.get(`illuminus-style-editor-${id}`)?.close({ force: true });
    this.render();
    log.debug("deleted style", id);
  }

  static #onExportOne(_event, target) {
    const id = IlluminusStyleManager.#rowId(target);
    if (id) exportStyles([id]);
  }

  static #onExportSelected() {
    const ids = this.#selected();
    if (!ids.length) return ui.notifications.warn(game.i18n.localize("ILLUMINUS.Errors.NothingSelected"));
    exportStyles(ids);
  }

  static #onExportAll() {
    exportStyles(listStyles().map((s) => s.id));
  }

  /**
   * Export journals as web pages, under one style. A ticked style is taken as
   * the one meant; otherwise the dialog opens on the first.
   */
  static #onAdvancedExport() {
    IlluminusExportDialog.open({ styleId: this.#selected()[0] });
  }

  /** Put back any bundled style this world no longer has. */
  static async #onRestore() {
    const restored = await restorePresets();
    ui.notifications.info(restored
      ? game.i18n.format("ILLUMINUS.Manager.Restored", { count: restored })
      : game.i18n.localize("ILLUMINUS.Manager.RestoredNone"));
    this.render();
  }

  static async #onImport() {
    const created = await promptImport();
    if (created?.length) this.render();
  }

  static #onToggleAll(_event, target) {
    const on = target.checked ?? true;
    for (const box of this.element.querySelectorAll("input[name='pick']")) box.checked = on;
  }

  /* -------------------------------------------- */

  /**
   * Open the manager, focusing an already-open window if there is one. Always
   * resolves to the application either way.
   * @returns {Promise<IlluminusStyleManager>}
   */
  static async open() {
    const existing = foundry.applications.instances.get("illuminus-style-manager");
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    return new IlluminusStyleManager().render({ force: true });
  }
}
