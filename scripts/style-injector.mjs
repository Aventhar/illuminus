import { STYLE_ELEMENT_ID, STYLED_CLASS, STYLE_ATTR, log } from "./constants.mjs";
import { compileAll, compileDeclarations } from "./style-compiler.mjs";
import { getStyles, getAssignedStyleId } from "./style-store.mjs";

/**
 * Keeps the compiled stylesheet in `document.head` in sync with the style store,
 * and tags journal sheets so the right scoped rule applies to them.
 *
 * One <style> element holds every style in the world. Sheets opt in by carrying
 * the `illuminus-styled` class plus a `data-illuminus-style` attribute, so
 * applying, changing, or clearing a style never needs a re-render.
 */

/** Live preview overrides, keyed by style id, set while the editor is open. */
const previews = new Map();

/** The <style> element, created on first use. */
function styleElement() {
  let element = document.getElementById(STYLE_ELEMENT_ID);
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ELEMENT_ID;
    document.head.append(element);
  }
  return element;
}

/**
 * Recompile every style into the document stylesheet. Cheap enough to call on
 * any change — the whole sheet is a few kilobytes of custom properties.
 */
export function refreshStyles() {
  let css = compileAll(getStyles());
  for (const [id, settings] of previews) {
    const declarations = compileDeclarations(settings);
    if (declarations) css += `\n\n.${STYLED_CLASS}[${STYLE_ATTR}="${id}"] {\n${declarations}\n}`;
  }
  styleElement().textContent = css;
  log.debug(`compiled ${Object.keys(getStyles()).length} style(s), ${previews.size} preview(s)`);
}

/**
 * Show unsaved editor values on any open journal using that style. The preview
 * rule is appended after the stored rules, so it wins on document order.
 * @param {string} id
 * @param {object} settings
 */
export function setPreview(id, settings) {
  previews.set(id, settings);
  refreshStyles();
}

/** Drop a live preview, restoring the stored appearance. */
export function clearPreview(id) {
  if (!previews.delete(id)) return;
  refreshStyles();
}

/* -------------------------------------------- */
/*  Sheet tagging                               */
/* -------------------------------------------- */

/**
 * Tag or untag a rendered sheet root according to the style assigned to its
 * journal.
 * @param {HTMLElement} root      The sheet's root element.
 * @param {JournalEntry} entry    The journal the sheet displays.
 */
export function applyToElement(root, entry) {
  if (!root) return;
  const styleId = getAssignedStyleId(entry);
  if (styleId && getStyles()[styleId]) {
    root.classList.add(STYLED_CLASS);
    root.setAttribute(STYLE_ATTR, styleId);
  } else {
    root.classList.remove(STYLED_CLASS);
    root.removeAttribute(STYLE_ATTR);
  }
}

/**
 * Re-tag every journal sheet currently on screen. Called after a style is
 * assigned or deleted so open windows update without being closed.
 */
export function refreshOpenSheets() {
  for (const app of foundry.applications.instances.values()) {
    const entry = resolveEntry(app.document);
    if (entry) applyToElement(app.element, entry);
  }
}

/**
 * The JournalEntry a document belongs to: the entry itself, or the parent of a
 * JournalEntryPage when a single page is popped out on its own.
 * @param {foundry.abstract.Document} [document]
 * @returns {JournalEntry|null}
 */
export function resolveEntry(document) {
  if (!document) return null;
  if (document.documentName === "JournalEntry") return document;
  if (document.documentName === "JournalEntryPage") return document.parent ?? null;
  return null;
}
