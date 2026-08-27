/**
 * Folding: a heading that hides the run of text beneath it.
 *
 * The same three rules as the flow wrappers in `heading-sections.mjs`, and for
 * the same reasons:
 *
 *   - **Nothing is stored.** A marker is written into what is on screen, never
 *     into the page's own content — a person could not have typed one.
 *   - **Never inside an editor.** ProseMirror owns the DOM under its content
 *     element, and a button appearing inside a heading being typed into is a
 *     button in the way.
 *   - **It undoes itself first**, because a sheet re-renders on every edit and
 *     a marker added to a heading that has one is two markers.
 *
 * What a *style* decides is only whether a reader can see the marker, and what
 * it looks like: the marker is always in the markup, and `--ill-…-fold-shown`
 * is what makes it visible. That keeps the compiler's one rule — a style
 * supplies values, never rules — while still letting a style say "this level
 * folds".
 *
 * Which sections are folded is remembered for as long as the world is open, and
 * no longer: a sheet re-renders whenever a page is edited or a style changes,
 * and a reader who had folded three chapters away would have to fold them again
 * every time. It is keyed by the page and the heading rather than by the
 * element, which does not survive the render that replaced it.
 */

/** The class a marker wears. */
export const FOLD_CLASS = "illuminus-fold";

/** The class the thing it folds wears while it is folded. */
export const FOLDED_CLASS = "is-folded";

/** What is folded right now, by page and heading. */
const folded = new Set();

/** A marker, ready to be put in front of something. */
function marker(key, onToggle) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = FOLD_CLASS;
  button.dataset.fold = key;
  // The glyph is `::before` content on this element, which is how FontAwesome
  // draws every icon — a style names the character and this names the family.
  // `inert` keeps the icon out of the way of the click.
  button.innerHTML = '<i class="fa-solid fa-chevron-right" inert></i>';
  button.addEventListener("click", (event) => {
    // The markers in the contents panel sit inside Foundry's own click target,
    // which would take the reader to the page they were trying to fold.
    event.preventDefault();
    event.stopPropagation();
    if (folded.has(key)) folded.delete(key);
    else folded.add(key);
    onToggle(folded.has(key));
  });
  return button;
}

/**
 * Show or hide what a marker holds, and say which it is.
 *
 * Only what folding hid is unhidden again: Foundry hides a listed page from the
 * players itself, with the same attribute, and unfolding the entry above it
 * would otherwise show them a page a gamemaster had taken away.
 */
function setFolded(button, host, targets, off) {
  button.setAttribute("aria-expanded", String(!off));
  host.classList.toggle(FOLDED_CLASS, off);
  for (const target of targets()) {
    if (off) {
      if (target.hasAttribute("hidden")) continue;
      target.setAttribute("hidden", "");
      target.dataset.illuminusFolded = "";
    } else if ("illuminusFolded" in target.dataset) {
      target.removeAttribute("hidden");
      delete target.dataset.illuminusFolded;
    }
  }
}

/**
 * Put a marker in front of something, and hang the folding off it.
 * @param {HTMLElement} host      What carries the marker and the folded class.
 * @param {HTMLElement} into      Where the marker goes, as its first child.
 * @param {string} key            What is remembered between renders.
 * @param {() => HTMLElement[]} targets  What the marker hides, asked for each
 *                                       time: the contents panel rebuilds its
 *                                       list under us.
 */
function fold(host, into, key, targets) {
  const button = marker(key, (off) => setFolded(button, host, targets, off));
  into.prepend(button);
  setFolded(button, host, targets, folded.has(key));
}

/** Take every marker back out, and unhide what they were hiding. */
export function unmarkFolds(root) {
  for (const button of root.querySelectorAll(`.${FOLD_CLASS}`)) button.remove();
  for (const host of root.querySelectorAll(`.${FOLDED_CLASS}`)) host.classList.remove(FOLDED_CLASS);
  for (const hidden of root.querySelectorAll("[hidden][data-illuminus-folded]")) {
    hidden.removeAttribute("hidden");
    hidden.removeAttribute("data-illuminus-folded");
  }
}

/** The heading level of an element, or 0 for anything that is not one. */
const levelOf = (node) => (node?.tagName?.match(/^H([1-6])$/)?.[1] ?? 0) * 1;

/**
 * Everything a heading governs: what follows it until a heading of its own
 * level or shallower. Asked for each time rather than kept, because the flow
 * wrappers are rebuilt on every render.
 */
function runAfter(heading) {
  const run = [];
  const level = levelOf(heading);
  for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
    const other = levelOf(node);
    if (other && other <= level) break;
    run.push(node);
  }
  return run;
}

/** Mark the headings inside one page's content. */
function markHeadings(content, pageId) {
  for (const heading of content.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!runAfter(heading).length) continue;
    const key = `${pageId}:${heading.dataset.anchor || heading.textContent.trim()}`;
    fold(heading, heading, key, () => runAfter(heading));
  }
}

/**
 * The page's own title, which is a level 1 heading that governs the whole page.
 *
 * Foundry renders it in `.journal-page-header`, outside the content — so it has
 * no siblings to walk and `runAfter` finds nothing. What it governs is simply
 * the content, which is why it is marked apart from the rest.
 *
 * Without this, ticking Can Be Folded on Heading 1 did nothing on any ordinary
 * page: a page's only level 1 heading is usually its title, and an author who
 * writes one *inside* the content as well is the rare case rather than the
 * common one. The stylesheet has always had a rule for a marker here.
 */
function markTitle(content, pageId) {
  const page = content.closest(".journal-entry-page") ?? content.parentElement;
  const title = page?.querySelector(".journal-page-header h1");
  if (!title || title.querySelector(`.${FOLD_CLASS}`)) return;
  const key = `${pageId}:title`;
  fold(title, title, key, () => [content]);
}

/**
 * Give every heading that governs something a marker, in a rendered sheet.
 * @param {HTMLElement} root
 */
export function markFolds(root) {
  if (!root) return;
  unmarkFolds(root);
  for (const content of root.querySelectorAll(".journal-page-content")) {
    // Never inside the editor, for the same reason the flow wrappers are not.
    // The sample's editor stands for the editor, where these never run: it is
    // written as a plain element so that no editor starts inside the sample, so
    // it says what it is instead.
    if (content.closest("prose-mirror, .illuminus-preview__editor")
      || content.isContentEditable) continue;
    const pageId = content.closest("[data-page-id]")?.dataset.pageId ?? "";
    markHeadings(content, pageId);
    markTitle(content, pageId);
  }
}
