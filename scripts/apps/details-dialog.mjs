const { DialogV2 } = foundry.applications.api;

/**
 * Ask for a name and a description.
 *
 * The bundled styles and templates arrive with a line under their name saying
 * what they are for, and a library of a dozen home-made ones is far easier to
 * read when they do too. So everywhere something of a person's own is named —
 * renaming a style, renaming a template, keeping a selection as a template —
 * asks the same two questions, in the same window, in the same order.
 *
 * A description is always optional. Somebody naming a template mid-sentence in
 * the editor should not be made to write prose about it first.
 *
 * @param {object} options
 * @param {string} options.title          Window title.
 * @param {string} [options.name]         Current name.
 * @param {string} [options.description]  Current description.
 * @param {string} [options.body]         A line of explanation above the fields.
 * @param {string} [options.placeholder]  Placeholder for an empty name.
 * @returns {Promise<{name: string, description: string}|null>}  Null if canceled
 *   or if no name was given.
 */
export async function promptDetails({ title, name = "", description = "", body = "", placeholder = "" }) {
  const escape = foundry.utils.escapeHTML;
  const content = `
    ${body ? `<p>${escape(body)}</p>` : ""}
    <div class="form-group">
      <label>${game.i18n.localize("ILLUMINUS.Manager.NameLabel")}</label>
      <input type="text" name="name" value="${escape(name)}"
             placeholder="${escape(placeholder)}" autofocus>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("ILLUMINUS.Manager.DescriptionLabel")}</label>
      <textarea name="description" rows="3"
                placeholder="${escape(game.i18n.localize("ILLUMINUS.Manager.DescriptionPlaceholder"))}"
      >${escape(description)}</textarea>
    </div>`;

  const result = await DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: "ILLUMINUS.Buttons.Save",
      callback: (_event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    },
    rejectClose: false
  });

  const chosen = String(result?.name ?? "").trim();
  if (!chosen) return null;
  return { name: chosen, description: String(result?.description ?? "").trim() };
}
