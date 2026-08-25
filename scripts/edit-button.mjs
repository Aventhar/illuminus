/**
 * Let the Edit pencil sit above the page it edits.
 *
 * Foundry puts it inside the page's own `article`, in a container as tall as
 * the page, and that page scrolls inside a box which clips — so however far up
 * Distance From Top pushes the pencil, it stops being drawn the moment it
 * passes the top of that box. The journal's name sits above the box and cannot
 * be reached from inside it at all.
 *
 * Anchored to the window, the container is moved out to the area holding the
 * contents panel and the page, which begins at the journal's name — so a
 * distance of nothing puts the pencil beside that name, and the same Which Side
 * and Distance controls place it from there.
 *
 * Three rules, the ones the rest of the render-time work follows. **Nothing is
 * stored**: the element is Foundry's, and what changes is where it hangs rather
 * than anything a page holds. **It undoes itself first**, because a sheet
 * re-renders on every edit and a style can be changed while one is open. And
 * **only where one page is on show**: a journal read as one long scroll gives
 * every page a pencil of its own, and a stack of them in one corner would be
 * worse than each sitting on the page it belongs to.
 */

/** Where a moved container came from, so it can be put back. */
const FROM = "illuminusEditAnchor";

/** Put every moved container back on the page it belongs to. */
function unanchor(root) {
  for (const container of root.querySelectorAll("[data-illuminus-edit-anchor]")) {
    const pageId = container.dataset[FROM];
    delete container.dataset[FROM];
    const page = root.querySelector(`article.journal-entry-page[data-page-id="${pageId}"]`);
    if (page) page.append(container);
  }
}

/**
 * Hang the pencil off the window rather than the page, or put it back.
 * @param {HTMLElement} root            The sheet's root element.
 * @param {object} [options]
 * @param {boolean} [options.toWindow]  Whether the style asks for the window's own.
 */
export function anchorEditButton(root, { toWindow = false } = {}) {
  if (!root) return;
  unanchor(root);
  if (!toWindow) return;
  const content = root.querySelector(".journal-entry-content");
  const pages = [...root.querySelectorAll("article.journal-entry-page")];
  if (!content || pages.length !== 1) return;
  const container = pages[0].querySelector(":scope > .edit-container");
  if (!container) return;
  container.dataset[FROM] = pages[0].dataset.pageId ?? "";
  content.append(container);
}
