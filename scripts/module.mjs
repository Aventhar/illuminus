import { MODULE_ID, SETTINGS, getSetting, setSetting, log } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { IlluminusPanel } from "./apps/illuminus-panel.mjs";

/**
 * Entry point for the Illuminus module.
 *
 * Hook order at world load: init -> setup -> ready. Register settings and
 * templates in `init`, read other modules' data in `setup`, and touch world
 * documents only from `ready` onward.
 */

Hooks.once("init", () => {
  log.info(`initializing ${MODULE_ID}`);

  registerSettings();

  // Publish the public API on the module document so other packages and macros
  // can reach it as `game.modules.get("illuminus").api`.
  const module = game.modules.get(MODULE_ID);
  module.api = {
    MODULE_ID,
    SETTINGS,
    getSetting,
    setSetting,
    openPanel: () => IlluminusPanel.show(),
    IlluminusPanel
  };
});

Hooks.once("ready", () => {
  log.info(`ready — running on Foundry ${game.version}, system ${game.system.id}`);
});

/**
 * Add a scene-control button that opens the panel. Foundry v13+ passes the
 * controls as a keyed record rather than an array.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!getSetting(SETTINGS.enabled)) return;

  const tokens = Array.isArray(controls) ? controls.find((c) => c.name === "tokens") : controls.tokens;
  if (!tokens) return;

  const tool = {
    name: MODULE_ID,
    title: "ILLUMINUS.Controls.OpenPanel",
    icon: "fa-solid fa-lightbulb",
    button: true,
    visible: true,
    onChange: () => IlluminusPanel.show()
  };

  if (Array.isArray(tokens.tools)) tokens.tools.push(tool);
  else tokens.tools[MODULE_ID] = tool;
});
