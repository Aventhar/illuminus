import { MODULE_ID, SETTINGS, FLAGS, NO_STYLE, SCHEMA_VERSION, getSetting, setSetting, log } from "./constants.mjs";
import { GROUPS, cleanSettings, defaultSettings } from "./style-schema.mjs";
import { migrateStyle } from "./migrations.mjs";
import { PRESETS } from "./presets.mjs";

/**
 * Read and write the world's collection of journal styles, and the assignment
 * of a style to a JournalEntry.
 *
 * Styles live in one world setting keyed by style id. Assignment lives on the
 * JournalEntry as a module flag, so it travels with the journal when the entry
 * is exported to or imported from a compendium.
 */

/** How many saved colors a style may keep. */
const MAX_SWATCHES = 40;

/** Keep only well-formed hex colors, without duplicates. */
function cleanSwatches(swatches) {
  if (!Array.isArray(swatches)) return [];
  const seen = new Set();
  for (const value of swatches) {
    const hex = String(value).trim().toLowerCase();
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) seen.add(hex);
    if (seen.size >= MAX_SWATCHES) break;
  }
  return [...seen];
}

/**
 * Display names a style gives its blocks, picture treatments, and inline tags.
 * The keys are checked against the schema itself rather than a pattern, so a new
 * family cannot be silently discarded here the way tags were when this read
 * `/^(block|picture)\d{2}$/`.
 */
const NAMEABLE = new Set(GROUPS.filter((group) => group.family).map((group) => group.id));

function cleanLabels(labels) {
  if (!labels || typeof labels !== "object") return {};
  const clean = {};
  for (const [key, value] of Object.entries(labels)) {
    if (!NAMEABLE.has(key)) continue;
    const text = String(value).trim().slice(0, 40);
    if (text) clean[key] = text;
  }
  return clean;
}

/** Shape of a stored style record. */
function makeRecord({ id, name, description = "", settings = {}, swatches = [], labels = {}, preset = false }) {
  return {
    id,
    name,
    description,
    preset,
    schemaVersion: SCHEMA_VERSION,
    // A style's own palette. Not part of `settings`, since it changes nothing
    // about how a journal looks — it is a convenience for whoever edits it.
    swatches: cleanSwatches(swatches),
    // Blocks and picture treatments are named per style: the keys stay stable so
    // markup and exported styles stay portable, only the wording travels.
    labels: cleanLabels(labels),
    settings: cleanSettings(settings)
  };
}

/**
 * All styles in the world, keyed by id. Never returns null.
 *
 * Styles saved under an older schema are migrated on the way out, so callers
 * always see current field names. The migration is not written back here —
 * that happens the next time the style is saved — so a world opened by a GM
 * without write access is never modified just by being read.
 */
export function getStyles() {
  const stored = getSetting(SETTINGS.styles);
  if (!stored || typeof stored !== "object") return {};
  const migrated = {};
  for (const [id, style] of Object.entries(stored)) {
    if (!style || typeof style !== "object") continue;
    migrated[id] = migrateStyle(style);
  }
  return migrated;
}

/** A single style by id, or undefined. */
export function getStyle(id) {
  if (!id) return undefined;
  return getStyles()[id];
}

/** Styles as an array sorted by name, for list rendering. */
export function listStyles() {
  return Object.values(getStyles()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Persist the whole collection. GM only — Foundry enforces this on world scope. */
async function writeStyles(styles) {
  await setSetting(SETTINGS.styles, styles);
  Hooks.callAll("illuminusStylesChanged", styles);
  return styles;
}

/** Generate an id that is not already taken. */
function uniqueId(styles) {
  let id;
  do {
    id = foundry.utils.randomID(12);
  } while (id in styles);
  return id;
}

/**
 * Create a new style.
 * @param {object} data  Partial style data. `settings` is filled from schema
 *                       defaults when omitted so a new style is immediately usable.
 * @returns {Promise<object>} The created record.
 */
export async function createStyle(data = {}) {
  const styles = getStyles();
  const record = makeRecord({
    id: uniqueId(styles),
    name: data.name || game.i18n.localize("ILLUMINUS.Style.NewName"),
    description: data.description ?? "",
    swatches: data.swatches ?? [],
    labels: data.labels ?? {},
    settings: data.settings ?? defaultSettings()
  });
  styles[record.id] = record;
  await writeStyles(styles);
  log.debug("created style", record.id, record.name);
  return record;
}

/**
 * Update an existing style in place.
 * @param {string} id
 * @param {object} changes  Any of name, description, settings.
 * @returns {Promise<object|undefined>} The updated record.
 */
export async function updateStyle(id, changes = {}) {
  const styles = getStyles();
  const existing = styles[id];
  if (!existing) return undefined;
  styles[id] = makeRecord({
    ...existing,
    ...changes,
    id,
    preset: existing.preset,
    swatches: changes.swatches ?? existing.swatches,
    labels: changes.labels ?? existing.labels,
    settings: changes.settings ?? existing.settings
  });
  await writeStyles(styles);
  return styles[id];
}

/**
 * Delete a style and clear it from any journal currently using it, so no entry
 * is left pointing at a style that no longer exists.
 * @param {string} id
 */
export async function deleteStyle(id) {
  const styles = getStyles();
  if (!(id in styles)) return;
  delete styles[id];

  const orphaned = game.journal.filter((j) => j.getFlag(MODULE_ID, FLAGS.style) === id);
  for (const entry of orphaned) await entry.unsetFlag(MODULE_ID, FLAGS.style);
  if (orphaned.length) log.debug(`cleared deleted style from ${orphaned.length} journal(s)`);

  await writeStyles(styles);
}

/**
 * Copy a style under a new id and name.
 * @param {string} id
 * @returns {Promise<object|undefined>} The new record.
 */
export async function duplicateStyle(id) {
  const source = getStyle(id);
  if (!source) return undefined;
  return createStyle({
    name: game.i18n.format("ILLUMINUS.Style.CopyName", { name: source.name }),
    description: source.description,
    swatches: [...(source.swatches ?? [])],
    labels: { ...(source.labels ?? {}) },
    settings: foundry.utils.deepClone(source.settings)
  });
}

/**
 * Merge style records into the store, assigning fresh ids so an import can
 * never overwrite an existing style.
 * @param {object[]} records  Sanitized incoming records.
 * @returns {Promise<object[]>} The records as stored.
 */
export async function importStyles(records) {
  const styles = getStyles();
  const created = [];
  for (const incoming of records) {
    const record = makeRecord({
      id: uniqueId(styles),
      name: incoming.name || game.i18n.localize("ILLUMINUS.Style.NewName"),
      description: incoming.description ?? "",
      swatches: incoming.swatches ?? [],
      labels: incoming.labels ?? {},
      settings: incoming.settings ?? {}
    });
    styles[record.id] = record;
    created.push(record);
  }
  await writeStyles(styles);
  return created;
}

/* -------------------------------------------- */
/*  Assignment                                  */
/* -------------------------------------------- */

/** The style id assigned to a JournalEntry, or "" when unstyled. */
export function getAssignedStyleId(entry) {
  return entry?.getFlag(MODULE_ID, FLAGS.style) ?? NO_STYLE;
}

/** The style record assigned to a JournalEntry, or undefined. */
export function getAssignedStyle(entry) {
  return getStyle(getAssignedStyleId(entry));
}

/**
 * Assign a style to a JournalEntry, or clear it when given a falsy id.
 * @param {JournalEntry} entry
 * @param {string} styleId
 */
export async function assignStyle(entry, styleId) {
  if (!styleId) return entry.unsetFlag(MODULE_ID, FLAGS.style);
  return entry.setFlag(MODULE_ID, FLAGS.style, styleId);
}

/* -------------------------------------------- */
/*  First-run seeding                           */
/* -------------------------------------------- */

/**
 * Populate the store with the bundled presets the first time the module runs in
 * a world. Presets are ordinary styles afterwards — editable and deletable.
 */
export async function seedPresetsIfEmpty() {
  if (!game.user.isGM) return;
  if (Object.keys(getStyles()).length) return;
  const styles = {};
  for (const preset of PRESETS) {
    styles[preset.id] = makeRecord({ ...preset, preset: true });
  }
  await writeStyles(styles);
  log.info(`seeded ${PRESETS.length} preset styles`);
}
