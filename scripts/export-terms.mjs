import { SETTINGS, getSetting, setSetting } from "./constants.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * The personal-use notice, shown before an export and on demand.
 *
 * An export copies more than a person's own work. The journal's words and
 * pictures may be a publisher's, the styling may be a game system's or another
 * module's, and the fonts are usually Foundry's. None of that is a problem in a
 * home game and all of it is a problem on a website, so the notice is shown
 * before the first export rather than buried in a readme.
 *
 * It appears for *every* kind of export, not only the one that carries another
 * module's styling. Choosing an Illuminus style changes whose styling travels;
 * it does not change whose adventure text and artwork do.
 *
 * Shown once per person, because a notice that appears every time is a notice
 * nobody reads — but the export window says what is being carried each time, so
 * the facts stay in view even after the notice has been dismissed.
 */

/**
 * What an export is about to carry, worded for a person.
 *
 * Deliberately not named: whose system or module the styling belongs to is not
 * something a notice should assert on a publisher's behalf, and the answer
 * changes with every world it runs in.
 */
export function whatTravels({ styling = true } = {}) {
  const parts = [game.i18n.localize("ILLUMINUS.Export.CarriesText")];
  if (styling) parts.push(game.i18n.localize("ILLUMINUS.Export.CarriesStyling"));
  return parts;
}

/** The notice itself, as markup for the dialog. */
function noticeContent(lines) {
  const bullets = [
    "ILLUMINUS.Export.TermsWhoFoundry",
    "ILLUMINUS.Export.TermsWhoPublisher",
    "ILLUMINUS.Export.TermsWhoAuthor",
    "ILLUMINUS.Export.TermsWhoSystem",
    "ILLUMINUS.Export.TermsWhoModule"
  ].map((key) => `<li>${game.i18n.localize(key)}</li>`).join("");

  const carrying = lines?.length
    ? `<p class="illuminus-terms__carrying">${lines.map((line) => foundry.utils.escapeHTML(line)).join(" ")}</p>`
    : "";

  return `<section class="illuminus-terms">
    <h3><i class="fa-solid fa-triangle-exclamation"></i> ${game.i18n.localize("ILLUMINUS.Export.TermsTitle")}</h3>
    ${carrying}
    <p>${game.i18n.localize("ILLUMINUS.Export.TermsPersonal")}</p>
    <p>${game.i18n.localize("ILLUMINUS.Export.TermsResponsible")}</p>
    <ul>${bullets}</ul>
  </section>`;
}

/**
 * Show the notice and wait for an answer.
 *
 * @param {object} [options]
 * @param {string[]} [options.carrying]  What this export will copy.
 * @param {boolean} [options.force]      Show it even if it has been dismissed.
 * @returns {Promise<boolean>}  Whether to go ahead.
 */
export async function confirmExportTerms({ carrying = [], force = false } = {}) {
  if (!force && getSetting(SETTINGS.exportTermsSeen)) return true;

  const again = force
    ? ""
    : `<label class="illuminus-terms__again">
         <input type="checkbox" name="dismiss">
         <span>${game.i18n.localize("ILLUMINUS.Export.TermsDismiss")}</span>
       </label>`;

  const answered = await DialogV2.wait({
    window: { title: game.i18n.localize("ILLUMINUS.Export.TermsTitle"), icon: "fa-solid fa-scale-balanced" },
    classes: ["illuminus"],
    position: { width: 520 },
    content: `${noticeContent(carrying)}${again}`,
    buttons: force
      ? [{ action: "close", label: "ILLUMINUS.Buttons.Close", default: true }]
      : [
        // Cancel is the one with focus: going ahead should be a decision
        // somebody makes, not the thing that happens when they hit Return.
        { action: "cancel", icon: "fa-solid fa-xmark", label: "ILLUMINUS.Buttons.Cancel", default: true },
        {
          action: "accept",
          icon: "fa-solid fa-file-export",
          label: "ILLUMINUS.Export.TermsAccept",
          callback: (_event, button) => (button.form.elements.dismiss?.checked ? "accept-quietly" : "accept")
        }
      ],
    rejectClose: false
  });

  if (answered === "accept-quietly") await setSetting(SETTINGS.exportTermsSeen, true);
  return answered === "accept" || answered === "accept-quietly";
}

/** Show the notice because somebody asked to read it. */
export function showExportTerms(carrying = []) {
  return confirmExportTerms({ carrying, force: true });
}
