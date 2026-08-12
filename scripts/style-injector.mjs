import { STYLE_ELEMENT_ID, PREVIEW_ELEMENT_ID, STYLED_CLASS, STYLE_ATTR, log } from "./constants.mjs";
import { compileAll, compileDeclarations, selectorFor } from "./style-compiler.mjs";
import { getStyles, getAssignedStyleId } from "./style-store.mjs";

/**
 * Keeps the compiled stylesheets in `document.head` in sync with the style
 * store, and tags journal sheets so the right scoped rule applies to them.
 *
 * Two <style> elements, in this order:
 *   1. the saved styles, rebuilt only when the store changes
 *   2. unsaved editor previews, rebuilt on every slider drag
 * Splitting them means editing one style does not recompile the other four, and
 * a preview always wins over the saved rule on document order.
 *
 * Sheets opt in by carrying the `illuminus-styled` class plus a
 * `data-illuminus-style` attribute, so applying, changing, or clearing a style
 * never needs a re-render.
 */

/** Unsaved editor values, keyed by style id. */
const previews = new Map();

/** Get or create one of the two style elements, keeping them in order. */
function styleElement(id) {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement("style");
    element.id = id;
    document.head.append(element);
  }
  return element;
}

/** Rebuild the saved-styles sheet. Cheap enough to call on any store change. */
export function refreshStyles() {
  const styles = getStyles();
  styleElement(STYLE_ELEMENT_ID).textContent = compileAll(styles);
  refreshPreviews();
  log.debug(`compiled ${Object.keys(styles).length} style(s)`);
}

/** Rebuild only the preview sheet. */
function refreshPreviews() {
  const rules = [];
  for (const [id, settings] of previews) {
    const declarations = compileDeclarations(settings);
    if (declarations) rules.push(`${selectorFor(id)} {\n${declarations}\n}`);
  }
  styleElement(PREVIEW_ELEMENT_ID).textContent = rules.join("\n\n");
}

/**
 * Show unsaved editor values on any open journal using that style, and on the
 * editor's own sample pane.
 * @param {string} id
 * @param {object} settings
 */
export function setPreview(id, settings) {
  previews.set(id, settings);
  refreshPreviews();
}

/** Drop a live preview, restoring the saved appearance. */
export function clearPreview(id) {
  if (!previews.delete(id)) return;
  refreshPreviews();
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
