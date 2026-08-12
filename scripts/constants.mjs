/**
 * Shared identifiers for the Illuminus module.
 * Importing these instead of hard-coding strings keeps renames to a single file.
 */

/** Must match the `id` field in module.json. */
export const MODULE_ID = "illuminus";

/** Prefix for every localization key this module owns. */
export const LOCALE_PREFIX = "ILLUMINUS";

/** Keys for settings registered via `game.settings.register`. */
export const SETTINGS = {
  enabled: "enabled",
  debug: "debug"
};

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
