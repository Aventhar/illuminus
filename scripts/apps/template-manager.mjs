import { MODULE_ID, log } from "../constants.mjs";
import {
  listTemplates, updateTemplate, deleteTemplate, restoreTemplatePresets
} from "../template-store.mjs";
import { exportTemplates, promptTemplateImport } from "../io.mjs";
import { promptDetails } from "./details-dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * The library of page templates for this world: rename, delete, restore the
 * bundled ones, and move templates in and out as JSON files.
 *
 * Templates are made in the journal editor rather than here — select what you
 * want to keep and choose "Save selection as template" from the Illuminus menu
 * — so this window is for tidying and sharing them, not authoring.
 */
export class IlluminusTemplateManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "illuminus-template-manager",
    classes: ["illuminus", "illuminus-manager"],
    tag: "div",
    window: {
      title: "ILLUMINUS.Templates.Title",
      icon: "fa-solid fa-file-lines",
      resizable: true
    },
    position: { width: 620, height: 560 },
    actions: {
      rename: IlluminusTemplateManager.#onRename,
      remove: IlluminusTemplateManager.#onDelete,
      restore: IlluminusTemplateManager.#onRestore,
      exportOne: IlluminusTemplateManager.#onExportOne,
      exportSelected: IlluminusTemplateManager.#onExportSelected,
      exportAll: IlluminusTemplateManager.#onExportAll,
      import: IlluminusTemplateManager.#onImport,
      toggleAll: IlluminusTemplateManager.#onToggleAll
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/template-manager.hbs`,
      scrollable: [".illuminus-template-list"]
    }
  };

  /** Open the library, or bring it forward if it is already up. */
  static open() {
    const existing = foundry.applications.instances.get("illuminus-template-manager");
    if (existing) return existing.bringToFront();
    return new IlluminusTemplateManager().render({ force: true });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.templates = listTemplates().map((template) => ({
      ...template,
      // Enough to recognise a template by without rendering its markup.
      summary: summarize(template.markup),
      bundled: Boolean(template.preset)
    }));
    context.empty = context.templates.length === 0;
    return context;
  }

  /** The ids ticked in the list. */
  #selected() {
    return [...this.element.querySelectorAll("input[name='pick']:checked")].map((box) => box.value);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onRename(_event, target) {
    const id = target.dataset.id;
    const template = listTemplates().find((t) => t.id === id);
    if (!template) return;
    const details = await promptDetails({
      title: game.i18n.localize("ILLUMINUS.Manager.RenameTitle"),
      name: template.name,
      description: template.description ?? ""
    });
    if (!details) return;
    await updateTemplate(id, details);
    this.render();
  }

  static async #onDelete(_event, target) {
    const id = target.dataset.id;
    const template = listTemplates().find((t) => t.id === id);
    if (!template) return;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("ILLUMINUS.Templates.DeleteTitle") },
      content: `<p>${game.i18n.format("ILLUMINUS.Templates.DeleteBody", { name: template.name })}</p>`
    });
    if (!confirmed) return;
    await deleteTemplate(id);
    this.render();
  }

  static async #onRestore() {
    const restored = await restoreTemplatePresets();
    ui.notifications.info(restored
      ? game.i18n.format("ILLUMINUS.Templates.Restored", { count: restored })
      : game.i18n.localize("ILLUMINUS.Templates.RestoredNone"));
    this.render();
  }

  static #onExportOne(_event, target) {
    exportTemplates([target.dataset.id]);
  }

  static #onExportSelected() {
    const ids = this.#selected();
    if (!ids.length) return ui.notifications.warn(game.i18n.localize("ILLUMINUS.Errors.NothingSelected"));
    exportTemplates(ids);
  }

  static #onExportAll() {
    exportTemplates(listTemplates().map((template) => template.id));
  }

  static async #onImport() {
    await promptTemplateImport();
    this.render();
  }

  static #onToggleAll(_event, target) {
    const on = target.checked ?? true;
    for (const box of this.element.querySelectorAll("input[name='pick']")) box.checked = on;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    log.debug(`template library rendered with ${context.templates.length} template(s)`);
  }
}

/**
 * A one-line description of what a template contains, taken from its markup.
 * Reading the tags rather than rendering them keeps the list cheap and avoids
 * putting a stranger's markup into the manager's own DOM.
 */
function summarize(markup) {
  const counts = new Map();
  for (const [, tag] of String(markup).matchAll(/<([a-z][a-z0-9]*)\b/gi)) {
    const name = tag.toLowerCase();
    if (["span", "em", "strong", "br", "img"].includes(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag, n]) => (n > 1 ? `${n}× ${tag}` : tag))
    .join(", ");
}
