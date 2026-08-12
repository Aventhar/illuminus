import { MODULE_ID, SETTINGS, log } from "./constants.mjs";
import { IlluminusStyleManager } from "./apps/style-manager.mjs";
import { refreshStyles } from "./style-injector.mjs";

/**
 * Register every module setting. Called once from the `init` hook, before any
 * code reads a setting value.
 */
export function registerSettings() {
  // The style library itself. Hidden from the settings list — it is edited
  // through the manager, not by hand.
  game.settings.register(MODULE_ID, SETTINGS.styles, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => refreshStyles()
  });

  game.settings.registerMenu(MODULE_ID, "styleManager", {
    name: "ILLUMINUS.Settings.Manager.Name",
    label: "ILLUMINUS.Settings.Manager.Label",
    hint: "ILLUMINUS.Settings.Manager.Hint",
    icon: "fa-solid fa-swatchbook",
    type: IlluminusStyleManager,
    restricted: true
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
