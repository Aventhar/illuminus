/**
 * The heading a reader has chosen in the contents panel.
 *
 * Foundry marks the page being read — `li.page.active` — but nothing marks a
 * *heading* within it, so a style had no way to say "this is the section you
 * are in". The panel's Sub-Headings settings have a Selected state, and this is
 * what that state applies to: the entry a reader clicked, until they click
 * another or open another page.
 *
 * The same three rules as the folding markers and the flow wrappers: nothing is
 * stored, nothing happens inside an editor, and it is re-applied on every render
 * rather than left to survive one. What is remembered is remembered for the
 * session only, keyed by the page and the heading's anchor, because the element
 * itself does not survive the render that replaced it.
 */

/** The class the chosen heading wears. */
export const CURRENT_CLASS = "illuminus-current";

/** Which heading is current, by page. */
const chosen = new Map();

/** Put the class where the memory says it belongs. */
function applyCurrent(toc) {
  for (const entry of toc.querySelectorAll("li.page")) {
    const page = entry.dataset.pageId ?? "";
    const anchor = chosen.get(page);
    for (const item of entry.querySelectorAll(":scope > ol.headings > li.heading")) {
      item.classList.toggle(CURRENT_CLASS, Boolean(anchor) && item.dataset.anchor === anchor);
    }
  }
}

/**
 * Mark the chosen heading in a rendered sheet, and follow the reader's clicks.
 *
 * One listener per panel, marked on the element it is bound to: a sheet
 * re-renders on every edit, and a listener added again on each render would
 * answer a single click as many times as the sheet had been drawn.
 * @param {HTMLElement} root
 */
export function markCurrentHeadings(root) {
  if (!root) return;
  for (const toc of root.querySelectorAll(".journal-sidebar .toc")) {
    applyCurrent(toc);
    if (toc.dataset.illuminusCurrent) continue;
    toc.dataset.illuminusCurrent = "watching";
    toc.addEventListener("click", (event) => {
      const item = event.target.closest?.("li.heading[data-anchor]");
      if (!item || !toc.contains(item)) return;
      const page = item.closest("li.page")?.dataset.pageId ?? "";
      chosen.set(page, item.dataset.anchor);
      applyCurrent(toc);
    });
  }
}
