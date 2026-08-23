import { STYLED_CLASS, STYLE_ATTR } from "./constants.mjs";

/**
 * Give the list a Format or Illuminus control opens the style of the window it
 * belongs to.
 *
 * The list is not inside that window. Core clones it into a
 * `#prosemirror-dropdown` on `document.body` and positions it against the
 * button, which puts it past everything scoped to a styled sheet — so a style
 * could paint the control and not the list it opens.
 *
 * Marked as it appears, with the class and the style id of whatever was
 * clicked, so the same values reach it. Three things follow the rules the rest
 * of the render-time work follows: **nothing is stored** — the element is
 * core's and is thrown away when the list closes, and a fresh one is marked the
 * next time; **nothing else changes** — no rule is added and no node is moved,
 * only two attributes on an element that lives for as long as the list is open;
 * and **it is asked for on the click itself**, because the list is built inside
 * that click's own handler.
 */

/** The list is built inside the button's own handler, so this runs after it. */
function markDropdown(event) {
  const from = event.target?.closest?.(`.${STYLED_CLASS}[${STYLE_ATTR}]`);
  const list = document.getElementById("prosemirror-dropdown");
  if (!list) return;
  // Opened from an unstyled window, or from something else entirely: the list
  // is left exactly as Foundry drew it.
  if (!from) {
    list.classList.remove(STYLED_CLASS);
    list.removeAttribute(STYLE_ATTR);
    return;
  }
  list.classList.add(STYLED_CLASS);
  list.setAttribute(STYLE_ATTR, from.getAttribute(STYLE_ATTR));
}

/** Watch for a list being opened, once. */
export function watchEditorDropdowns() {
  document.addEventListener("click", markDropdown);
}
