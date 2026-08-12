import { MODULE_ID, FLAGS, log } from "../constants.mjs";
import { listStyles, createStyle, duplicateStyle, deleteStyle, updateStyle } from "../style-store.mjs";
import { exportStyles, promptImport } from "../io.mjs";
import { IlluminusStyleEditor } from "./style-editor.mjs";

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
      toggleAll: IlluminusStyleManager.#onToggleAll
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/style-manager.hbs`, scrollable: [".illuminus-style-list"] }
  };

  /** Ids ticked for export, kept across re-renders. */
  #selected = new Set();

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const styles = listStyles();
    context.styles = styles.map((style) => ({
      ...style,
      selected: this.#selected.has(style.id),
      usage: game.journal.filter((j) => j.getFlag(MODULE_ID, FLAGS.style) === style.id).length
    }));
    context.hasStyles = styles.length > 0;
    context.allSelected = styles.length > 0 && styles.every((s) => this.#selected.has(s.id));
    context.selectedCount = this.#selected.size;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const box of this.element.querySelectorAll("input[data-style-id]")) {
      box.addEventListener("change", () => {
        if (box.checked) this.#selected.add(box.dataset.styleId);
        else this.#selected.delete(box.dataset.styleId);
        this.render();
      });
    }
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
    this.#selected.delete(id);
    foundry.applications.instances.get(`illuminus-style-editor-${id}`)?.close();
    this.render();
    log.debug("deleted style", id);
  }

  static #onExportOne(_event, target) {
    const id = IlluminusStyleManager.#rowId(target);
    if (id) exportStyles([id]);
  }

  static #onExportSelected() {
    exportStyles([...this.#selected]);
  }

  static #onExportAll() {
    exportStyles(listStyles().map((s) => s.id));
  }

  static async #onImport() {
    const created = await promptImport();
    if (created?.length) this.render();
  }

  static #onToggleAll(_event, target) {
    const styles = listStyles();
    if (target.checked) for (const style of styles) this.#selected.add(style.id);
    else this.#selected.clear();
    this.render();
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
