/*
 * Illuminus — decorative styling for Foundry VTT journals.
 * Copyright (C) 2026 Aventhar.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { MODULE_ID, FLAGS, getSetting, setSetting, log } from "./constants.mjs";
import { registerSettings } from "./settings.mjs";
import { refreshStyles, refreshOpenSheets, applyToElement, resolveEntry } from "./style-injector.mjs";
import {
  getStyles, getStyle, listStyles, createStyle, updateStyle, deleteStyle, duplicateStyle,
  getAssignedStyle, getAssignedStyleId, assignStyle, seedPresetsIfEmpty, restorePresets
} from "./style-store.mjs";
import { exportStyles, promptImport } from "./io.mjs";
import { IlluminusStyleManager } from "./apps/style-manager.mjs";
import { IlluminusStyleEditor } from "./apps/style-editor.mjs";
import { promptStyleAssignment } from "./apps/style-picker.mjs";
import { registerEditorMenu } from "./editor-menu.mjs";
import { watchEditorDropdowns } from "./editor-dropdown.mjs";
import {
  getTemplates, getTemplate, listTemplates, createTemplate, updateTemplate, deleteTemplate,
  seedTemplatesIfEmpty, restoreTemplatePresets
} from "./template-store.mjs";
import { IlluminusTemplateManager } from "./apps/template-manager.mjs";
import { IlluminusExportDialog } from "./apps/export-dialog.mjs";
import { createSampleJournal } from "./sample-journal.mjs";
import { buildHtmlExport, exportJournalsAsHtml } from "./export-html.mjs";

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
  // The list a named control opens is built on the body, past anything scoped
  // to a styled window, so it is marked as it appears.
  watchEditorDropdowns();

  // Publish the public API for macros and other modules.
  game.modules.get(MODULE_ID).api = {
    MODULE_ID,
    openManager: () => IlluminusStyleManager.open(),
    openEditor: (styleId) => IlluminusStyleEditor.open(styleId),
    pickStyleFor: (entry) => promptStyleAssignment(entry),
    getStyles, getStyle, listStyles,
    createStyle, updateStyle, deleteStyle, duplicateStyle,
    getAssignedStyle, getAssignedStyleId, assignStyle, restorePresets,
    exportStyles, promptImport,
    refreshStyles,
    openTemplates: () => IlluminusTemplateManager.open(),
    createSampleJournal: (options) => createSampleJournal(options),
    openExport: (options) => IlluminusExportDialog.open(options),
    buildJournalExport: (options) => buildHtmlExport(options),
    exportJournals: (options) => exportJournalsAsHtml(options),
    getTemplates, getTemplate, listTemplates,
    createTemplate, updateTemplate, deleteTemplate, restoreTemplatePresets,
    getSetting, setSetting
  };
});

Hooks.once("ready", async () => {
  await seedPresetsIfEmpty();
  await seedTemplatesIfEmpty();
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

/**
 * And an export from the same menu, with this journal already ticked and the
 * style it is wearing already chosen — which is the whole choice, most times.
 */
Hooks.on("getJournalEntryContextOptions", (_directory, options) => {
  if (!game.user.isGM) return;
  const open = (target) => {
    const entry = game.journal.get(target.dataset.entryId);
    IlluminusExportDialog.open({ styleId: getAssignedStyleId(entry), entryIds: [entry?.id] });
  };
  options.push({
    name: "ILLUMINUS.Export.ContextEntry",
    label: "ILLUMINUS.Export.ContextEntry",
    icon: '<i class="fa-solid fa-file-export"></i>',
    condition: () => game.user.isGM,
    visible: () => game.user.isGM,
    callback: open,
    onClick: open
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

  const templates = document.createElement("button");
  templates.type = "button";
  templates.className = "illuminus-open-templates";
  templates.innerHTML = `<i class="fa-solid fa-file-lines"></i> ${game.i18n.localize("ILLUMINUS.Templates.SidebarButton")}`;
  templates.addEventListener("click", () => IlluminusTemplateManager.open());

  const footer = root.querySelector(".directory-footer") ?? root.querySelector(".header-actions") ?? root;
  footer.append(button, templates);
});
