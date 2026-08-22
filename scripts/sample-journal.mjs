import { MODULE_ID, log } from "./constants.mjs";
import { assignStyle } from "./style-store.mjs";

/**
 * Build a real journal out of the editor's Live Sample.
 *
 * The sample shows every element a style can paint, at the size of a pane
 * beside the settings. Some judgements need the real thing: how a heading sits
 * against a full measure of text, whether columns break where they should, what
 * the window frame does around it. So the same markup is offered as a journal.
 *
 * **One source, two consumers.** The page's contents come from
 * `templates/sample-page.hbs`, which the editor also includes — writing the
 * markup here as a second copy would leave the two to drift apart, and a sample
 * that no longer matches the editor is worse than none.
 *
 * Two things are taken out on the way through. `data-part` marks the pieces the
 * editor dims and scrolls to, and means nothing in a journal. The Reveal button
 * is Foundry's to draw: a secret section in a real page gets one from the
 * enricher, and the sample's is a picture of it.
 */

/** The folder sample journals are kept in, made if it is not there. */
async function sampleFolder() {
  const name = game.i18n.localize("ILLUMINUS.Sample.Folder");
  const existing = game.folders.find((folder) => folder.type === "JournalEntry" && folder.name === name);
  if (existing) return existing;
  return Folder.create({ name, type: "JournalEntry", color: "#5e1914" });
}

/** The sample page's markup, as a journal can hold it. */
export async function sampleMarkup() {
  const rendered = await foundry.applications.handlebars.renderTemplate(
    `modules/${MODULE_ID}/templates/sample-page.hbs`, {});
  const page = document.createElement("div");
  page.innerHTML = rendered;
  for (const marked of page.querySelectorAll("[data-part]")) marked.removeAttribute("data-part");
  for (const button of page.querySelectorAll("button")) button.remove();
  // A secret passage is revealed by its id. Foundry's Reveal button rewrites
  // the page's *stored* markup, finding the passage by matching `id="…"` — so a
  // section written without one can never be revealed, and its button does
  // nothing at all when clicked. The editor gives each secret an id as a person
  // makes it; markup turned into a page has to do the same. One per page rather
  // than one in the template, since two sample journals must not share an id.
  for (const secret of page.querySelectorAll("section.secret")) {
    if (!secret.id) secret.id = `secret-${foundry.utils.randomID()}`;
  }
  return page.innerHTML.trim();
}

/**
 * Create the sample journal, and open it.
 *
 * @param {object} [options]
 * @param {string} [options.styleId]  A style to dress it in, so it opens
 *   showing what the editor was showing.
 * @returns {Promise<JournalEntry>}
 */
export async function createSampleJournal({ styleId } = {}) {
  const folder = await sampleFolder();
  // Numbered rather than reused: somebody comparing two styles wants two
  // journals, and overwriting the one they were looking at is a poor surprise.
  const base = game.i18n.localize("ILLUMINUS.Sample.JournalName");
  const taken = game.journal.filter((entry) => entry.name === base || entry.name.startsWith(`${base} `));
  const name = taken.length ? `${base} ${taken.length + 1}` : base;

  const entry = await JournalEntry.create({ name, folder: folder?.id ?? null });
  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name: game.i18n.localize("ILLUMINUS.Preview.Heading1"),
    type: "text",
    title: { show: true, level: 1 },
    text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, content: await sampleMarkup() }
  }]);

  if (styleId) await assignStyle(entry, styleId);
  log.info(`built sample journal "${name}"`);
  entry.sheet.render({ force: true });
  return entry;
}
