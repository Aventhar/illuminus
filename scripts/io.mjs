import { MODULE_ID, SCHEMA_VERSION, log } from "./constants.mjs";
import { cleanSettings } from "./style-schema.mjs";
import { getStyle, importStyles } from "./style-store.mjs";
import { getTemplate, listTemplates, createTemplate, cleanTemplate } from "./template-store.mjs";

/**
 * Export and import of journal styles as JSON, so a look built in one world can
 * be carried to another.
 *
 * The file format is deliberately flat and self-describing:
 *
 * {
 *   "module": "illuminus",
 *   "schemaVersion": 1,
 *   "exportedAt": "2026-08-11T00:00:00.000Z",
 *   "styles": [ { "name": …, "description": …, "settings": { … } } ]
 * }
 */

/** Turn a name into something safe to use as a filename. */
function slugify(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "styles";
}

/**
 * Build the export payload for a set of style ids.
 * @param {string[]} ids
 * @returns {object|null} The payload, or null when no ids resolved.
 */
export function buildExport(ids) {
  const styles = ids
    .map((id) => getStyle(id))
    .filter(Boolean)
    .map(({ name, description, swatches, labels, settings }) => ({ name, description, swatches, labels, settings }));
  if (!styles.length) return null;
  return {
    module: MODULE_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    styles
  };
}

/**
 * Download the given styles as a JSON file.
 * @param {string[]} ids
 * @returns {boolean} Whether a file was produced.
 */
export function exportStyles(ids) {
  const payload = buildExport(ids);
  if (!payload) {
    ui.notifications.warn(game.i18n.localize("ILLUMINUS.Notifications.NothingToExport"));
    return false;
  }
  const filename = payload.styles.length === 1
    ? `illuminus-${slugify(payload.styles[0].name)}.json`
    : `illuminus-styles-${payload.styles.length}.json`;
  foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", filename);
  log.info(`exported ${payload.styles.length} style(s) to ${filename}`);
  return true;
}

/**
 * Validate and normalize a parsed export payload.
 *
 * Accepts either the wrapped format above or a bare array of style objects, and
 * discards anything that is not a recognized schema field.
 * @param {any} parsed
 * @returns {{styles: object[], warnings: string[]}}
 * @throws {Error} When the payload contains no usable styles at all.
 */
export function normalizeImport(parsed) {
  const warnings = [];
  let incoming = parsed;

  if (Array.isArray(parsed)) incoming = { styles: parsed };
  if (!incoming || typeof incoming !== "object" || !Array.isArray(incoming.styles)) {
    throw new Error(game.i18n.localize("ILLUMINUS.Errors.ImportShape"));
  }
  if (incoming.module && incoming.module !== MODULE_ID) {
    warnings.push(game.i18n.format("ILLUMINUS.Errors.ImportForeign", { module: incoming.module }));
  }
  if (incoming.schemaVersion > SCHEMA_VERSION) {
    warnings.push(game.i18n.format("ILLUMINUS.Errors.ImportNewer", {
      found: incoming.schemaVersion,
      supported: SCHEMA_VERSION
    }));
  }

  const styles = [];
  for (const raw of incoming.styles) {
    if (!raw || typeof raw !== "object") continue;
    const settings = cleanSettings(raw.settings);
    if (!Object.keys(settings).length) {
      warnings.push(game.i18n.format("ILLUMINUS.Errors.ImportEmptyStyle", { name: raw.name ?? "?" }));
      continue;
    }
    styles.push({
      name: String(raw.name ?? "").trim() || game.i18n.localize("ILLUMINUS.Style.NewName"),
      description: String(raw.description ?? ""),
      swatches: Array.isArray(raw.swatches) ? raw.swatches : [],
      labels: raw.labels && typeof raw.labels === "object" ? raw.labels : {},
      settings
    });
  }

  if (!styles.length) throw new Error(game.i18n.localize("ILLUMINUS.Errors.ImportNoStyles"));
  return { styles, warnings };
}

/**
 * Read a user-selected file and add its styles to the world.
 * @param {File} file
 * @returns {Promise<object[]>} The imported records.
 */
export async function importStylesFromFile(file) {
  const text = await foundry.utils.readTextFromFile(file);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(game.i18n.format("ILLUMINUS.Errors.ImportParse", { message: error.message }));
  }
  const { styles, warnings } = normalizeImport(parsed);
  for (const warning of warnings) ui.notifications.warn(warning);
  const created = await importStyles(styles);
  ui.notifications.info(game.i18n.format("ILLUMINUS.Notifications.Imported", { count: created.length }));
  return created;
}

/**
 * Open a file chooser and import the chosen file.
 * @returns {Promise<object[]|null>} The imported records, or null if canceled.
 */
export function promptImport() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await importStylesFromFile(file));
      } catch (error) {
        log.error(error);
        ui.notifications.error(error.message);
        resolve(null);
      }
    }, { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}


/* -------------------------------------------- */
/*  Templates                                   */
/* -------------------------------------------- */

/**
 * Download the given templates as a JSON file.
 *
 * Templates carry markup rather than settings, so the payload says so — an
 * import reads the marker and refuses a file of the wrong kind rather than
 * silently producing empty templates.
 * @param {string[]} ids
 * @returns {boolean} Whether a file was produced.
 */
export function exportTemplates(ids) {
  const templates = ids
    .map((id) => getTemplate(id))
    .filter(Boolean)
    .map(({ name, description, markup }) => ({ name, description, markup }));
  if (!templates.length) {
    ui.notifications.warn(game.i18n.localize("ILLUMINUS.Notifications.NothingToExport"));
    return false;
  }
  const payload = {
    module: MODULE_ID,
    kind: "templates",
    exportedAt: new Date().toISOString(),
    templates
  };
  const filename = templates.length === 1
    ? `illuminus-template-${slugify(templates[0].name)}.json`
    : `illuminus-templates-${templates.length}.json`;
  foundry.utils.saveDataToFile(JSON.stringify(payload, null, 2), "application/json", filename);
  log.info(`exported ${templates.length} template(s) to ${filename}`);
  return true;
}

/**
 * Validate a parsed template payload.
 *
 * The markup itself is not inspected here: it is parsed through Foundry's own
 * editor schema when it is inserted, which drops anything the editor does not
 * recognise. Checking it twice, in two different ways, would only invite the
 * two checks to disagree.
 * @param {any} parsed
 * @returns {object[]}
 * @throws {Error} When the payload holds no usable templates.
 */
export function normalizeTemplateImport(parsed) {
  const list = Array.isArray(parsed) ? parsed : parsed?.templates;
  if (!Array.isArray(list)) throw new Error(game.i18n.localize("ILLUMINUS.Errors.ImportShape"));
  const templates = list
    .filter((entry) => entry && typeof entry === "object" && typeof entry.markup === "string" && entry.markup.trim())
    .map((entry) => cleanTemplate({ ...entry, id: undefined, preset: undefined }));
  if (!templates.length) throw new Error(game.i18n.localize("ILLUMINUS.Errors.ImportNoTemplates"));
  return templates;
}

/** Store an imported set of templates. */
export async function importTemplates(templates) {
  const created = [];
  for (const template of templates) {
    const record = await createTemplate(template);
    if (record) created.push(record);
  }
  return created;
}

/** Open a file chooser and import the chosen template file. */
export function promptTemplateImport() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const parsed = JSON.parse(await file.text());
        const created = await importTemplates(normalizeTemplateImport(parsed));
        ui.notifications.info(game.i18n.format("ILLUMINUS.Notifications.ImportedTemplates", { count: created.length }));
        resolve(created);
      } catch (error) {
        log.error(error);
        ui.notifications.error(error.message);
        resolve(null);
      }
    }, { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/** Every template id, for "export all". */
export const allTemplateIds = () => listTemplates().map((template) => template.id);
