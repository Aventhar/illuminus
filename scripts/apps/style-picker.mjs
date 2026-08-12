import { listStyles, getAssignedStyleId, assignStyle } from "../style-store.mjs";
import { refreshOpenSheets } from "../style-injector.mjs";
import { IlluminusStyleManager } from "./style-manager.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Ask which style to apply to a journal, and apply it.
 *
 * Deliberately a small dialog rather than a full Application: choosing a style
 * is a one-field decision, and the result is visible immediately on any open
 * copy of the journal.
 *
 * @param {JournalEntry} entry
 * @returns {Promise<void>}
 */
export async function promptStyleAssignment(entry) {
  if (!entry) return;
  const styles = listStyles();
  const current = getAssignedStyleId(entry);

  if (!styles.length) {
    const openManager = await DialogV2.confirm({
      window: { title: "ILLUMINUS.Picker.Title" },
      content: `<p>${game.i18n.localize("ILLUMINUS.Picker.NoStyles")}</p>`,
      yes: { label: "ILLUMINUS.Picker.OpenManager" },
      no: { label: "ILLUMINUS.Buttons.Cancel" }
    });
    if (openManager) IlluminusStyleManager.open();
    return;
  }

  const options = [`<option value="" ${current ? "" : "selected"}>${
    game.i18n.localize("ILLUMINUS.Picker.None")
  }</option>`];
  for (const style of styles) {
    options.push(`<option value="${style.id}" ${style.id === current ? "selected" : ""}>${
      foundry.utils.escapeHTML(style.name)
    }</option>`);
  }

  const content = `
    <p class="hint">${game.i18n.format("ILLUMINUS.Picker.Hint", { name: foundry.utils.escapeHTML(entry.name) })}</p>
    <div class="form-group">
      <label>${game.i18n.localize("ILLUMINUS.Picker.Label")}</label>
      <select name="styleId">${options.join("")}</select>
    </div>`;

  const result = await DialogV2.prompt({
    window: { title: "ILLUMINUS.Picker.Title", icon: "fa-solid fa-palette" },
    content,
    ok: {
      label: "ILLUMINUS.Buttons.Apply",
      icon: "fa-solid fa-check",
      callback: (_event, button) => button.form.elements.styleId.value
    },
    rejectClose: false
  });
  if (result === null || result === undefined) return;

  await assignStyle(entry, result);
  refreshOpenSheets();

  const applied = styles.find((s) => s.id === result);
  ui.notifications.info(applied
    ? game.i18n.format("ILLUMINUS.Notifications.Applied", { style: applied.name, journal: entry.name })
    : game.i18n.format("ILLUMINUS.Notifications.Cleared", { journal: entry.name }));
}
