/**
 * Shared identifiers for the Illuminus module.
 * Importing these instead of hard-coding strings keeps renames to a single file.
 */

/** Must match the `id` field in module.json. */
export const MODULE_ID = "illuminus";

/** Keys for settings registered via `game.settings.register`. */
export const SETTINGS = {
  styles: "styles",
  templates: "templates",
  recentColors: "recentColors",
  exportTermsSeen: "exportTermsSeen",
  debug: "debug"
};

/** Document flag keys, read as `document.getFlag(MODULE_ID, FLAGS.style)`. */
export const FLAGS = {
  style: "style"
};

/** Prefix for every CSS custom property this module emits. */
export const CSS_VAR_PREFIX = "--ill";

/** Class added to a journal sheet root when a style is applied to it. */
export const STYLED_CLASS = "illuminus-styled";

/** Data attribute on a styled sheet root holding the applied style's id. */
export const STYLE_ATTR = "data-illuminus-style";

/** Id of the <style> element in document.head holding the saved styles. */
export const STYLE_ELEMENT_ID = "illuminus-compiled-styles";

/**
 * Id of a second <style> element holding unsaved editor previews. Keeping them
 * apart means dragging a slider recompiles one style rather than all of them,
 * and preview rules always win on document order.
 */
export const PREVIEW_ELEMENT_ID = "illuminus-preview-styles";

/** Reserved style id meaning "no style; use the Foundry default appearance". */
export const NO_STYLE = "";

/** Current schema version, stamped onto exported files for forward migration. */
export const SCHEMA_VERSION = 9;

/**
 * Console logger that stays quiet unless the `debug` setting is on.
 * Errors and warnings always print.
 */
export const log = {
  debug(...args) {
    if (!getSetting(SETTINGS.debug)) return;
    console.log(`${MODULE_ID} |`, ...args);
  },
  info(...args) {
    console.log(`${MODULE_ID} |`, ...args);
  },
  warn(...args) {
    console.warn(`${MODULE_ID} |`, ...args);
  },
  error(...args) {
    console.error(`${MODULE_ID} |`, ...args);
  }
};

/** Read a module setting, tolerating calls made before registration. */
export function getSetting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

/** Write a module setting. */
export function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}
