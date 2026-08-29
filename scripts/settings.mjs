import { MODULE_ID, SETTINGS, log } from "./constants.mjs";
import { IlluminusStyleManager } from "./apps/style-manager.mjs";
import { IlluminusTemplateManager } from "./apps/template-manager.mjs";
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

  // The template library. Edited through its own manager, like the styles.
  game.settings.register(MODULE_ID, SETTINGS.templates, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.registerMenu(MODULE_ID, "styleManager", {
    name: "ILLUMINUS.Settings.Manager.Name",
    label: "ILLUMINUS.Settings.Manager.Label",
    hint: "ILLUMINUS.Settings.Manager.Hint",
    icon: "fa-solid fa-swatchbook",
    type: IlluminusStyleManager,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "templateManager", {
    name: "ILLUMINUS.Settings.Templates.Name",
    label: "ILLUMINUS.Settings.Templates.Label",
    hint: "ILLUMINUS.Settings.Templates.Hint",
    icon: "fa-solid fa-file-lines",
    type: IlluminusTemplateManager,
    restricted: true
  });

  // Colors picked recently, offered back in the picker. Per person rather than
  // per world: it is a record of what someone has been doing, not part of a style.
  game.settings.register(MODULE_ID, SETTINGS.recentColors, {
    scope: "client",
    config: false,
    type: Array,
    default: []
  });

  // Which sliders the color picker offers. Changed in the picker itself rather
  // than here, so it is remembered rather than configured — a second place to
  // set it would be a second answer to one question. HSL by default: hue,
  // saturation and lightness are what a person picking a color is thinking in,
  // and red-green-blue is the machine's way of saying it.
  game.settings.register(MODULE_ID, SETTINGS.colorSliders, {
    scope: "client",
    config: false,
    type: String,
    default: "hsl"
  });

  // Whether this person has read the personal-use notice and asked not to be
  // shown it again. Per person rather than per world: it is about what someone
  // has read, and a second GM has not read it just because the first one did.
  game.settings.register(MODULE_ID, SETTINGS.exportTermsSeen, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  // How the editor was left last time: how large the sample was drawn, whether
  // it was answering the pointer, and how the room was split between the sample
  // and the settings. None of it is part of any style — it is how one person
  // likes to work, so it is theirs and not the world's.
  game.settings.register(MODULE_ID, SETTINGS.editorView, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  // Where the eyedropper takes its color from. Reading it out of the page needs
  // no screen-capture permission and keeps transparency, but it can only see
  // inside the Foundry window and cannot sample a background picture. The
  // browser's own picker can take any pixel on the screen — a reference image in
  // another window — but returns an opaque color, and on some systems it has
  // been unreliable. Per person rather than per world: it is about the machine.
  game.settings.register(MODULE_ID, SETTINGS.eyedropper, {
    name: "ILLUMINUS.Settings.Eyedropper.Name",
    hint: "ILLUMINUS.Settings.Eyedropper.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      page: "ILLUMINUS.Settings.Eyedropper.Page",
      screen: "ILLUMINUS.Settings.Eyedropper.Screen"
    },
    default: "page"
  });

  // Which words the editor names its controls with. Plain language is the
  // whole point of the module and stays the default; somebody who already
  // writes CSS can have the property names instead. Per person rather than per
  // world, because it is about who is reading the interface — one GM writing
  // CSS should not rename every control for the one who does not.
  game.settings.register(MODULE_ID, SETTINGS.wording, {
    name: "ILLUMINUS.Settings.Wording.Name",
    hint: "ILLUMINUS.Settings.Wording.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "plain",
    choices: {
      plain: "ILLUMINUS.Settings.Wording.Plain",
      css: "ILLUMINUS.Settings.Wording.Css"
    },
    onChange: () => {
      for (const app of foundry.applications.instances.values()) {
        if (app.constructor.name.startsWith("Illuminus")) app.render();
      }
    }
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
