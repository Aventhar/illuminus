import { MODULE_ID, SETTINGS, getSetting, setSetting, log } from "./constants.mjs";
import { TEMPLATE_PRESETS } from "./template-presets.mjs";

/**
 * Read and write the world's collection of page templates.
 *
 * A template is a stored snippet of journal markup — a statblock frame, a
 * handout, a two-column spread — that an author drops into a page from the
 * editor's Illuminus menu. Styles decide how a page *looks*; templates decide
 * what is *there* to look at, which is the half a non-technical author cannot
 * otherwise produce without typing HTML.
 *
 * Two properties make them safe and portable, and both are worth keeping:
 *
 *   - **Nothing is trusted.** A template's markup is never injected. It is
 *     parsed through Foundry's own ProseMirror schema at insertion time, which
 *     silently drops any element or attribute the editor does not recognize, so
 *     an imported template from a stranger cannot smuggle in a script any more
 *     than a pasted paragraph can.
 *   - **They carry class names, not styling.** A template refers to Illuminus's
 *     stable keys (`illuminus-box--box01`), never to colors or sizes, so the
 *     same template renders differently under every style — which is the point.
 */

/** How many templates one world may hold. A guard against runaway imports. */
const MAX_TEMPLATES = 200;

/** How much markup one template may carry. */
const MAX_MARKUP = 20000;

/** Trim a stored template to a shape the rest of the module can rely on. */
export function cleanTemplate(template) {
  const id = String(template?.id ?? "").trim() || foundry.utils.randomID();
  return {
    id,
    name: String(template?.name ?? "").trim().slice(0, 80) || game.i18n.localize("ILLUMINUS.Templates.Untitled"),
    description: String(template?.description ?? "").trim().slice(0, 300),
    markup: String(template?.markup ?? "").slice(0, MAX_MARKUP),
    // Set on the built-ins so the manager can say which came with the module,
    // and so restoring them can tell them apart from the author's own.
    preset: template?.preset ? String(template.preset) : undefined
  };
}

/** Every template in the world, keyed by id. */
export function getTemplates() {
  const stored = getSetting(SETTINGS.templates) ?? {};
  const out = {};
  for (const [id, template] of Object.entries(stored)) {
    if (!template || typeof template !== "object") continue;
    out[id] = cleanTemplate({ ...template, id });
  }
  return out;
}

/** One template, or undefined. */
export function getTemplate(id) {
  return getTemplates()[id];
}

/** Every template, in display order. */
export function listTemplates() {
  return Object.values(getTemplates()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Write the whole collection back. */
async function writeTemplates(templates) {
  await setSetting(SETTINGS.templates, templates);
  Hooks.callAll("illuminusTemplatesChanged");
}

/**
 * Store a new template.
 * @param {{name?: string, description?: string, markup?: string}} data
 * @returns {Promise<object>} The stored record.
 */
export async function createTemplate(data = {}) {
  const templates = getTemplates();
  if (Object.keys(templates).length >= MAX_TEMPLATES) {
    ui.notifications.warn(game.i18n.format("ILLUMINUS.Errors.TooManyTemplates", { max: MAX_TEMPLATES }));
    return undefined;
  }
  const template = cleanTemplate({ ...data, id: data.id ?? foundry.utils.randomID() });
  templates[template.id] = template;
  await writeTemplates(templates);
  log.debug("created template", template.id);
  return template;
}

/** Change a stored template. */
export async function updateTemplate(id, changes = {}) {
  const templates = getTemplates();
  if (!templates[id]) return undefined;
  templates[id] = cleanTemplate({ ...templates[id], ...changes, id });
  await writeTemplates(templates);
  return templates[id];
}

/** Remove a template. */
export async function deleteTemplate(id) {
  const templates = getTemplates();
  if (!templates[id]) return false;
  delete templates[id];
  await writeTemplates(templates);
  return true;
}

/**
 * Seed the bundled templates the first time Illuminus runs in a world. Only
 * when the collection is empty, so removing one does not bring it back.
 */
export async function seedTemplatesIfEmpty() {
  if (Object.keys(getTemplates()).length) return;
  const templates = {};
  for (const preset of TEMPLATE_PRESETS) {
    const template = cleanTemplate({ ...preset, preset: preset.id });
    templates[template.id] = template;
  }
  await writeTemplates(templates);
  log.info(`seeded ${TEMPLATE_PRESETS.length} template(s)`);
}

/**
 * Put back any bundled template the world no longer has, leaving the author's
 * own alone — and leaving an edited one alone too unless asked.
 * @param {boolean} [overwrite=false] Also restore ones that have been edited.
 * @returns {Promise<number>} How many were restored.
 */
export async function restoreTemplatePresets(overwrite = false) {
  const templates = getTemplates();
  let restored = 0;
  for (const preset of TEMPLATE_PRESETS) {
    const existing = Object.values(templates).find((t) => t.preset === preset.id);
    if (existing && !overwrite) continue;
    const template = cleanTemplate({ ...preset, id: existing?.id ?? preset.id, preset: preset.id });
    templates[template.id] = template;
    restored += 1;
  }
  if (restored) await writeTemplates(templates);
  return restored;
}

/** The module id, so callers do not need to import constants for a flag read. */
export const TEMPLATE_MODULE = MODULE_ID;
