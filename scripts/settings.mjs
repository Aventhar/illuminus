import { MODULE_ID, SETTINGS, log } from "./constants.mjs";

/**
 * Register every module setting. Called once from the `init` hook, before any
 * code reads a setting value.
 */
export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: "ILLUMINUS.Settings.Enabled.Name",
    hint: "ILLUMINUS.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: (value) => log.debug(`setting ${SETTINGS.enabled} =`, value)
  });

  game.settings.register(MODULE_ID, SETTINGS.debug, {
    name: "ILLUMINUS.Settings.Debug.Name",
    hint: "ILLUMINUS.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  log.info("settings registered");
}
