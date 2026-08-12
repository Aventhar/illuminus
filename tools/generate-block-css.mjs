/**
 * Regenerate styles/illuminus-generated.css.
 *
 * Blocks and picture treatments are ten near-identical rule sets each, and CSS
 * has no way to express that once. Rather than maintain twenty copies by hand,
 * the rules are written here as a template and expanded per group, with every
 * property name coming from `cssVarFor` so a renamed field cannot drift out of
 * sync with the stylesheet.
 *
 * Text and heading properties fall back to the page's own values: a size of 0,
 * an `inherit` choice, or an empty color emits nothing, and `inherit` here
 * means "whatever the page already says".
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };
const { GROUPS, groupFields, cssVarFor } = await import(`${ROOT}/scripts/style-schema.mjs`);

/** The custom property a field emits, looked up by name so typos fail loudly. */
function varFor(group, name, suffix = "") {
  const field = groupFields(group).find((f) => f.name === name);
  if (!field) throw new Error(`${group.id} has no field "${name}"`);
  return cssVarFor(group.id, field, suffix);
}

const v = (group, name, suffix) => `var(${varFor(group, name, suffix)})`;
/** For values that may be absent, so the page's own setting shows through. */
const vOr = (group, name, fallback) => `var(${varFor(group, name)}, ${fallback})`;

const sides = (group, prefix, suffix = "") =>
  ["Top", "Right", "Bottom", "Left"].map((side) => v(group, `${prefix}${side}${suffix}`)).join(" ");
const corners = (group, prefix) =>
  ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((c) => v(group, `${prefix}${c}`)).join(" ");
const shadow = (group, prefix) =>
  `${v(group, `${prefix}OffsetX`)} ${v(group, `${prefix}OffsetY`)} `
  + `${v(group, `${prefix}Blur`)} ${v(group, `${prefix}Spread`)} ${v(group, `${prefix}Color`)}`;

const box = (group) => `  background-color: ${v(group, "background")};
  margin: ${sides(group, "margin")};
  padding: ${sides(group, "padding")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
  box-shadow: ${shadow(group, "shadow")};`;

/* -------------------------------------------- */

const blockRules = (group) => `
/* ${group.id} */
.illuminus-styled .journal-page-content .illuminus-block--${group.id} {
  float: ${v(group, "float")};
  width: ${v(group, "width")};
  clear: ${v(group, "clear")};
${box(group)}
  font-family: ${v(group, "font")};
  font-size: ${v(group, "size")};
  font-weight: ${v(group, "weight")};
  font-style: ${v(group, "style")};
  font-variant: ${v(group, "caps", "variant")};
  text-transform: ${v(group, "caps", "transform")};
  letter-spacing: ${v(group, "letterSpacing")};
  line-height: ${v(group, "lineHeight")};
  text-align: ${v(group, "align")};
  color: ${vOr(group, "color", "inherit")};
}

.illuminus-styled .journal-page-content .illuminus-block--${group.id} :is(h1, h2, h3, h4, h5, h6) {
  font-family: ${v(group, "headingFont")};
  font-size: ${v(group, "headingSize")};
  font-weight: ${v(group, "headingWeight")};
  font-variant: ${v(group, "headingCaps", "variant")};
  text-transform: ${v(group, "headingCaps", "transform")};
  text-align: ${v(group, "headingAlign")};
  color: ${vOr(group, "headingColor", "inherit")};
  margin-top: ${v(group, "headingMarginTop")};
  margin-bottom: ${v(group, "headingMarginBottom")};
  border-top-width: ${v(group, "headingRuleWidth")};
  border-top-style: ${v(group, "headingRuleStyle")};
  border-top-color: ${v(group, "headingRuleColor")};
}
`;

const pictureRules = (group) => `
/* ${group.id} */
.illuminus-styled .journal-page-content .illuminus-picture--${group.id} {
  float: ${v(group, "float")};
  width: ${v(group, "width")};
  clear: ${v(group, "clear")};
  background-color: ${v(group, "background")};
  margin-top: ${v(group, "marginTop")};
  margin-bottom: ${v(group, "marginBottom")};
  /* Horizontal placement comes from the alignment control, as auto margins. */
  margin-left: ${v(group, "align", "left")};
  margin-right: ${v(group, "align", "right")};
  padding: ${sides(group, "padding")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
  box-shadow: ${shadow(group, "shadow")};
}

.illuminus-styled .journal-page-content .illuminus-picture--${group.id} img {
  display: block;
  width: 100%;
  height: auto;
  transform: ${v(group, "flip")};
  opacity: ${v(group, "opacity")};
  /* The page-wide picture frame would otherwise apply on top of this one. */
  border: none;
  border-radius: inherit;
  box-shadow: none;
  margin: 0;
  padding: 0;
  max-width: 100%;
}

.illuminus-styled .journal-page-content .illuminus-picture--${group.id} figcaption {
  font-family: ${v(group, "captionFont")};
  font-size: ${v(group, "captionSize")};
  font-weight: ${v(group, "captionWeight")};
  font-style: ${v(group, "captionStyle")};
  text-align: ${v(group, "captionAlign")};
  color: ${vOr(group, "captionColor", "inherit")};
  margin-top: ${v(group, "captionSpacing")};
}
`;

/* -------------------------------------------- */

const header = `/* ==========================================================================
   Illuminus — generated block and picture rules

   DO NOT EDIT. Written by \`node tools/generate-block-css.mjs\`.

   Ten blocks and ten picture treatments are identical apart from which custom
   properties they read, and CSS cannot express that once. The template lives in
   the generator; every property name here comes from the schema, so a renamed
   field is a generator error rather than a rule that silently stops working.

   Markup, as inserted by the editor's Illuminus menu:
     <section class="illuminus-block illuminus-block--block01">…</section>
     <figure class="illuminus-picture illuminus-picture--picture01">
       <img src="…"><figcaption>…</figcaption>
     </figure>
   ========================================================================== */

/* Shared: a block is a flow container, a picture treatment is a figure. */
.illuminus-styled .journal-page-content .illuminus-block {
  display: block;
  overflow-wrap: break-word;
}

.illuminus-styled .journal-page-content .illuminus-block > :last-child {
  margin-bottom: 0;
}

.illuminus-styled .journal-page-content .illuminus-picture {
  display: block;
  max-width: 100%;
}
`;

const blocks = GROUPS.filter((g) => g.family === "blocks").map(blockRules).join("");
const pictures = GROUPS.filter((g) => g.family === "pictures").map(pictureRules).join("");
const out = `${header}${blocks}${pictures}`;
fs.writeFileSync(`${ROOT}/styles/illuminus-generated.css`, out);
console.log(`wrote styles/illuminus-generated.css — ${out.split("\n").length} lines, `
  + `${GROUPS.filter((g) => g.family).length} groups`);
