/**
 * Wrap each heading's run of content, so a heading can column the text beneath
 * it.
 *
 * A journal page is a flat sequence: a heading, some paragraphs, another
 * heading, more paragraphs. CSS can only set columns on an element, and "the
 * paragraphs after this heading" is not one — so one is made here, at render.
 *
 * Three things are deliberate:
 *
 *   - **Nothing is stored.** The wrappers exist in what is on screen, never in
 *     the page's own content: a person could not have typed them, and a journal
 *     that carries markup its editor cannot produce is a journal that breaks the
 *     first time somebody edits it.
 *   - **The heading stays outside its wrapper.** It is the run of text that goes
 *     into columns, not the heading, which reads across the full measure as a
 *     section heading does in print.
 *   - **It runs again on every render, and undoes itself first.** A sheet
 *     re-renders when a page is edited or a style changes, and wrapping wrapped
 *     content would nest a column inside a column.
 */

/** The class each wrapper carries, with the heading level it belongs to. */
export const FLOW_CLASS = "illuminus-flow";

/**
 * Content above the first heading belongs to level 1.
 *
 * The page's *title* is a level 1 heading — the sheet renders it in a header of
 * its own, outside the content, and level 1 is what styles it. So the text
 * beneath that title is the text under a level 1 heading, and setting Heading 1
 * to two columns sets it in two. Giving it a level of its own instead left the
 * first and most obvious heading governing nothing at all.
 */
const LEAD = "h1";

/** Take the wrappers back out, leaving the content where it was. */
export function unwrapHeadingSections(content) {
  for (const flow of content.querySelectorAll(`:scope > .${FLOW_CLASS}`)) {
    flow.replaceWith(...flow.childNodes);
  }
}

/**
 * Wrap the runs inside one element holding a page's content.
 *
 * Exported here as well as used below: an export builds its pages in a parsed
 * document of its own, where there is no `.journal-page-content` to look for
 * yet — the content *is* the element being handed over.
 * @param {HTMLElement} content
 */
export function wrapFlows(content) {
  unwrapHeadingSections(content);
  let level = LEAD;
  let flow = null;
  for (const node of [...content.childNodes]) {
    const heading = node.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(node.tagName);
    if (heading) {
      level = node.tagName.toLowerCase();
      flow = null;
      continue;
    }
    // Whitespace between elements belongs to whatever follows it, not to the
    // run that has just ended — otherwise every wrapper starts with a newline
    // and an empty first line box in the first column.
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
    // A custom element is left exactly where it is. Moving one disconnects it
    // and connects it again, which throws away whatever it was holding: a
    // secret passage's <secret-block> came back with a Reveal button that did
    // nothing at all, because the element it belonged to was no longer the one
    // listening. The run ends here and a new one starts after it, so a secret
    // stands between two columned passages rather than inside one.
    if (node.nodeType === Node.ELEMENT_NODE && node.localName.includes("-")) {
      flow = null;
      continue;
    }
    if (!flow) {
      flow = document.createElement("div");
      flow.className = `${FLOW_CLASS} ${FLOW_CLASS}--${level}`;
      node.before(flow);
    }
    flow.append(node);
  }
}

/** The class the page's opening letter wears. */
export const CAP_CLASS = "illuminus-drop-cap";

/**
 * Give the page's opening letter an element of its own.
 *
 * `::first-letter` would be the obvious way, and it is how this started — but a
 * browser applies only a fixed list of properties to it, and an outline is not
 * on that list: `-webkit-text-stroke-width` computes to zero there however it is
 * written. A real element takes every property a letter can have.
 *
 * Only the first paragraph of a page, and only its first character: the letter
 * a reader sees as the opening of the page.
 */
export function markDropCap(content) {
  for (const old of content.querySelectorAll(`.${CAP_CLASS}`)) {
    old.replaceWith(...old.childNodes);
    old.parentElement?.normalize();
  }
  const first = content.querySelector(`:scope > p, :scope > .${FLOW_CLASS} > p`);
  if (!first) return;
  const text = [...first.childNodes].find((node) =>
    node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (!text) return;
  const at = text.textContent.search(/\S/);
  if (at < 0) return;

  const letter = document.createElement("span");
  letter.className = CAP_CLASS;
  // Split twice: once at the letter, once after it. The span goes in where the
  // letter was, before what follows — putting it in before moving the letter
  // would be asking a node to sit inside itself.
  const capital = text.splitText(at);
  const rest = capital.splitText(1);
  rest.before(letter);
  letter.append(capital);
}

/**
 * Wrap every page inside a rendered element: a journal sheet, the editor's
 * sample, or a page built for export.
 * @param {HTMLElement} root
 */
export function wrapHeadingSections(root) {
  if (!root) return;
  for (const content of root.querySelectorAll(".journal-page-content")) {
    // Never inside the editor. Its content element carries the same class while
    // ProseMirror owns the DOM underneath it, and moving nodes out from under
    // an editor breaks the selection it is holding — which showed up as an
    // inline tag refusing to wrap the words a person had selected.
    // The sample's editor stands for the editor, where these never run: it is
    // written as a plain element so that no editor starts inside the sample, so
    // it says what it is instead.
    if (content.closest("prose-mirror, .illuminus-preview__editor")
      || content.isContentEditable) continue;
    wrapFlows(content);
    markDropCap(content);
  }
}
