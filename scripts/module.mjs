import { MODULE_ID, FLAGS, getSetting, setSetting, log } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { refreshStyles, refreshOpenSheets, applyToElement, resolveEntry } from "./style-injector.mjs";
import {
  getStyles, getStyle, listStyles, createStyle, updateStyle, deleteStyle, duplicateStyle,
  getAssignedStyle, getAssignedStyleId, assignStyle, seedPresetsIfEmpty
} from "./style-store.mjs";
import { exportStyles, promptImport } from "./io.mjs";
import { IlluminusStyleManager } from "./apps/style-manager.mjs";
import { IlluminusStyleEditor } from "./apps/style-editor.mjs";
import { promptStyleAssignment } from "./apps/style-picker.mjs";
import { registerEditorMenu } from "./editor-menu.mjs";

/**
 * Entry point for Illuminus.
 *
 * The module's job is to keep two things in sync: the compiled stylesheet in
 * document.head, and the `illuminus-styled` marker on any journal sheet whose
 * journal has a style assigned. Everything else hangs off those two.
 */

Hooks.once("init", () => {
  log.info(`initializing ${MODULE_ID}`);

  registerSettings();
  registerEditorMenu();

  // Publish the public API for macros and other modules.
  game.modules.get(MODULE_ID).api = {
    MODULE_ID,
    openManager: () => IlluminusStyleManager.open(),
    openEditor: (styleId) => IlluminusStyleEditor.open(styleId),
    pickStyleFor: (entry) => promptStyleAssignment(entry),
    getStyles, getStyle, listStyles,
    createStyle, updateStyle, deleteStyle, duplicateStyle,
    getAssignedStyle, getAssignedStyleId, assignStyle,
    exportStyles, promptImport,
    refreshStyles,
    getSetting, setSetting
  };
});

Hooks.once("ready", async () => {
  await seedPresetsIfEmpty();
  refreshStyles();
  log.info(`ready — Foundry ${game.version}, system ${game.system.id}`);
});

/* -------------------------------------------- */
/*  Applying styles to journals                 */
/* -------------------------------------------- */

/**
 * Tag a journal sheet as it renders. v14 fires render hooks for every class in
 * the inheritance chain, so this also covers system-provided subclasses of the
 * core journal sheet.
 */
Hooks.on("renderJournalEntrySheet", (app) => applyToElement(app.element, app.document));

/** Popped-out single pages get the same treatment via their parent journal. */
Hooks.on("renderJournalEntryPageSheet", (app) => applyToElement(app.element, resolveEntry(app.document)));

/** Reassigning or clearing a journal's style restyles open windows in place. */
Hooks.on("updateJournalEntry", (entry, changes) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAGS.style}`)) refreshOpenSheets();
  else if (changes.flags?.[`-=${MODULE_ID}`] !== undefined) refreshOpenSheets();
});

/** Editing the style library repaints every open journal. */
Hooks.on("illuminusStylesChanged", () => refreshOpenSheets());

/* -------------------------------------------- */
/*  Entry points into the GUI                   */
/* -------------------------------------------- */

/** A "Journal Style" button in the journal sheet's window header, for GMs. */
Hooks.on("getHeaderControlsJournalEntrySheet", (app, controls) => {
  if (!game.user.isGM) return;
  controls.push({
    icon: "fa-solid fa-palette",
    label: "ILLUMINUS.Controls.JournalStyle",
    action: "illuminusStyle",
    onClick: () => promptStyleAssignment(app.document)
  });
});

/** The same choice from the Journals sidebar, plus a jump to the library. */
Hooks.on("getJournalEntryContextOptions", (_directory, options) => {
  if (!game.user.isGM) return;
  options.push({
    name: "ILLUMINUS.Controls.JournalStyle",
    label: "ILLUMINUS.Controls.JournalStyle",
    icon: '<i class="fa-solid fa-palette"></i>',
    condition: () => game.user.isGM,
    visible: () => game.user.isGM,
    callback: (target) => promptStyleAssignment(game.journal.get(target.dataset.entryId)),
    onClick: (target) => promptStyleAssignment(game.journal.get(target.dataset.entryId))
  });
});

/** A footer button in the Journals sidebar that opens the style library. */
Hooks.on("renderJournalDirectory", (app, element) => {
  if (!game.user.isGM) return;
  const root = element instanceof HTMLElement ? element : app.element;
  if (!root || root.querySelector(".illuminus-open-manager")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "illuminus-open-manager";
  button.innerHTML = `<i class="fa-solid fa-swatchbook"></i> ${game.i18n.localize("ILLUMINUS.Manager.SidebarButton")}`;
  button.addEventListener("click", () => IlluminusStyleManager.open());

  const footer = root.querySelector(".directory-footer") ?? root.querySelector(".header-actions") ?? root;
  footer.append(button);
});
