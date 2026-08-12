import { MODULE_ID, SETTINGS, getSetting, log } from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A minimal ApplicationV2 window, wired up end to end: template part, context
 * preparation, a data-action click handler, and localized chrome. Use it as the
 * starting point for real UI rather than as a feature in its own right.
 */
export class IlluminusPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "illuminus-panel",
    classes: ["illuminus", "illuminus-panel"],
    tag: "div",
    window: {
      title: "ILLUMINUS.Panel.Title",
      icon: "fa-solid fa-lightbulb",
      resizable: true
    },
    position: {
      width: 420,
      height: "auto"
    },
    actions: {
      ping: IlluminusPanel.#onPing
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/panel.hbs`
    }
  };

  /** Data handed to the Handlebars template on every render. */
  async _prepareContext(_options) {
    return {
      moduleId: MODULE_ID,
      version: game.modules.get(MODULE_ID)?.version ?? "0.0.0",
      isGM: game.user.isGM,
      enabled: getSetting(SETTINGS.enabled) ?? false,
      systemId: game.system.id,
      systemTitle: game.system.title
    };
  }

  /** Click handler bound by `data-action="ping"` in the template. */
  static #onPing(_event, _target) {
    log.debug("ping action fired");
    ui.notifications.info(game.i18n.localize("ILLUMINUS.Notifications.Ping"));
  }

  /** Open the panel, reusing the existing instance if one is already rendered. */
  static show() {
    const existing = foundry.applications.instances.get("illuminus-panel");
    if (existing) return existing.bringToFront();
    return new IlluminusPanel().render({ force: true });
  }
}
