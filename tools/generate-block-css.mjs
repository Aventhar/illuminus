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
  font-weight: ${v(group, "textStyle", "weight")};
  font-style: ${v(group, "textStyle", "slant")};
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
  font-weight: ${v(group, "headingTextStyle", "weight")};
  font-style: ${v(group, "headingTextStyle", "slant")};
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
  font-weight: ${v(group, "captionTextStyle", "weight")};
  font-style: ${v(group, "captionTextStyle", "slant")};
  text-align: ${v(group, "captionAlign")};
  color: ${vOr(group, "captionColor", "inherit")};
  margin-top: ${v(group, "captionSpacing")};
}
`;

/* -------------------------------------------- */

/**
 * One inline treatment. A tag is an inline block because vertical padding on a
 * true inline box spills over the lines above and below rather than growing its
 * own — the reason Paizo's trait tags are list items in a flex row. Its picture
 * rides on a layer behind the lettering, isolated so that a blend mode mixes
 * with the tag's own fill rather than with the page beneath it.
 */
const tagRules = (group) => `
/* ${group.id} */
.illuminus-styled .journal-page-content .illuminus-tag--${group.id} {
  float: ${v(group, "float")};
  vertical-align: ${v(group, "verticalAlign")};
  bottom: ${v(group, "lift")};
  min-width: ${v(group, "minWidth")};
  background-color: ${v(group, "background")};
  padding: ${sides(group, "padding")};
  margin: ${sides(group, "margin")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
  box-shadow: ${shadow(group, "shadow")};
  font-family: ${v(group, "font")};
  font-size: ${v(group, "size")};
  font-weight: ${v(group, "textStyle", "weight")};
  font-style: ${v(group, "textStyle", "slant")};
  font-variant: ${v(group, "caps", "variant")};
  text-transform: ${v(group, "caps", "transform")};
  letter-spacing: ${v(group, "letterSpacing")};
  line-height: ${v(group, "lineHeight")};
  color: ${vOr(group, "color", "inherit")};
}

.illuminus-styled .journal-page-content .illuminus-tag--${group.id}::before {
  background-image: ${v(group, "texture")};
  background-size: ${v(group, "texture", "fit-size")};
  background-repeat: ${v(group, "texture", "fit-repeat")};
  background-position: ${v(group, "texturePosition")};
  mix-blend-mode: ${v(group, "textureBlend")};
  opacity: ${v(group, "textureOpacity")};
}
`;

/**
 * A block left empty vanishes only if its own setting says so, and only in the
 * read view. `:empty` alone cannot see this: the editor leaves an empty
 * paragraph inside, so the block has a child and is not empty by that test.
 * Scoping to `section.journal-page-content` keeps the rule away from the
 * editor, whose content element is a `prose-mirror` — a block that disappeared
 * while its author was typing in it could not be clicked back into.
 */
const CONTENTFUL = ":where(p, li, h1, h2, h3, h4, h5, h6, table, img, figure, blockquote):not(:empty)";

const emptyRules = (group) => `
.illuminus-styled section.journal-page-content .illuminus-block--${group.id}:not(:has(${CONTENTFUL})) {
  display: ${v(group, "whenEmpty")};
}
`;

/* -------------------------------------------- */

/** The heading groups, paired with the element each one styles. */
const HEADINGS = [1, 2, 3, 4, 5, 6].map((level) => ({
  level,
  group: GROUPS.find((g) => g.id === `heading${level}`)
}));

/**
 * One heading level. Six of these differ only in which properties they read and
 * which element they land on, and levels 4 to 6 used to borrow level 3's rule
 * wholesale because writing three more by hand was not worth it.
 */
/**
 * The journal sheet renders a page's title as an h1, h2, or h3 depending on the
 * page's own title level, and all three take level 1's look — so level 1 styles
 * the page header as well as its own element.
 */
const headingSelector = (level) => {
  const own = `.illuminus-styled .journal-page-content h${level}`;
  if (level !== 1) return own;
  return [1, 2, 3].map((l) => `.illuminus-styled .journal-page-header h${l}`).concat(own).join(",\n");
};

const headingRules = (group, level) => `
/* ${group.id} */
${headingSelector(level)} {
  font-family: ${v(group, "font")};
  font-size: ${v(group, "size")};
  font-weight: ${v(group, "textStyle", "weight")};
  font-style: ${v(group, "textStyle", "slant")};
  font-variant: ${v(group, "caps", "variant")};
  text-transform: ${v(group, "caps", "transform")};
  letter-spacing: ${v(group, "letterSpacing")};
  word-spacing: ${v(group, "wordSpacing")};
  line-height: ${v(group, "lineHeight")};
  text-align: ${v(group, "align")};
  color: ${v(group, "color")};
  text-shadow: ${v(group, "textShadowOffsetX")} ${v(group, "textShadowOffsetY")}
               ${v(group, "textShadowBlur")} ${v(group, "textShadowColor")};
  background-color: ${v(group, "background")};
  margin: ${sides(group, "margin")};
  padding: ${sides(group, "padding")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
}
`;

/* -------------------------------------------- */

/**
 * A background image behind one fill color.
 *
 * Every fill in the interface has one, so rather than write forty near-identical
 * rules by hand they are expanded from this table. The image rides on a `::before`
 * layer rather than the element's own `background-image`, so that its strength and
 * blend mode are independent of the lettering in front of it; `isolation` keeps a
 * blend mode mixing with the tag's own fill rather than with the page beneath.
 *
 * `host: false` marks an element Foundry has already positioned — forcing
 * `position: relative` on a window root drops it into normal flow and shoves the
 * rest of the interface sideways.
 */
const IMAGE_LAYERS = [
  { selector: ".illuminus-styled.application", group: "window", prefix: "", host: false },
  { selector: ".illuminus-styled .window-header", group: "window", prefix: "titleBar" },
  { selector: ".illuminus-styled .window-header button.header-control", group: "window", prefix: "headerButton" },
  { selector: ".illuminus-styled .window-header button.header-control:hover", group: "window", prefix: "headerButtonHover" },
  { selector: ".illuminus-styled .journal-entry-page .edit-container button", group: "window", prefix: "pageButton" },
  { selector: ".illuminus-styled .journal-entry-page .edit-container button:hover", group: "window", prefix: "pageButtonHover" },
  { selector: ".illuminus-styled .journal-sidebar", group: "sidebar", prefix: "" },
  { selector: ".illuminus-styled .journal-sidebar .toc li.page:hover", group: "sidebar", prefix: "hover" },
  { selector: ".illuminus-styled .journal-sidebar .toc li.page.active", group: "sidebar", prefix: "active" },
  { selector: ".illuminus-styled .journal-sidebar .toc li.category", group: "sidebar", prefix: "category" },
  { selector: '.illuminus-styled .journal-sidebar search input[type="search"]', group: "sidebar", prefix: "search" },
  { selector: ".illuminus-styled .journal-sidebar button", group: "sidebar", prefix: "button" },
  { selector: ".illuminus-styled .journal-sidebar button:hover", group: "sidebar", prefix: "buttonHover" },
  { selector: ".illuminus-styled .journal-header .title", group: "title", prefix: "" },
  ...HEADINGS.map(({ group, level }) =>
    ({ selector: `.illuminus-styled .journal-page-content h${level}`, group: group.id, prefix: "" })),
  { selector: ".illuminus-styled .journal-page-content a.content-link, .illuminus-styled .journal-page-content a.inline-roll", group: "links", prefix: "" },
  { selector: ".illuminus-styled .journal-page-content thead th", group: "tables", prefix: "header" },
  { selector: ".illuminus-styled .journal-page-content blockquote:not(.illuminus-block)", group: "boxes", prefix: "" },
  ...GROUPS.filter((g) => g.family === "blocks")
    .map((g) => ({ selector: `.illuminus-styled .journal-page-content .illuminus-block--${g.id}`, group: g.id, prefix: "" })),
  ...GROUPS.filter((g) => g.family === "pictures")
    .map((g) => ({ selector: `.illuminus-styled .journal-page-content .illuminus-picture--${g.id}`, group: g.id, prefix: "" }))
];

/** The custom property one image field emits, by prefix, part, and suffix. */
const imageVar = (layer, part, suffix = "") => {
  const group = GROUPS.find((g) => g.id === layer.group);
  const name = layer.prefix ? `${layer.prefix}Texture${part}` : `texture${part}`;
  return v(group, name, suffix);
};

const imageLayer = (layer) => `
${layer.selector} {
${layer.host === false ? "" : "  position: relative;\n"}  isolation: isolate;
}

${layer.selector}::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  background-image: ${imageVar(layer, "")};
  background-size: ${imageVar(layer, "Fit", "size")};
  background-repeat: ${imageVar(layer, "Fit", "repeat")};
  background-position: ${imageVar(layer, "Position")};
  mix-blend-mode: ${imageVar(layer, "Blend")};
  opacity: ${imageVar(layer, "Opacity")};
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

/* An inline treatment: laid out as an inline block so its padding grows its own
   box rather than spilling over the lines around it, positioned so it can be
   lifted off the baseline, and isolated so its picture layer blends against the
   tag rather than the page. */
.illuminus-styled .journal-page-content .illuminus-tag {
  display: inline-block;
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
}

.illuminus-styled .journal-page-content .illuminus-tag::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
}

/* A tag with nothing in it has nothing to show. Read view only, for the same
   reason the empty-block rule is. */
.illuminus-styled section.journal-page-content .illuminus-tag:empty {
  display: none;
}
`;

const blockGroups = GROUPS.filter((g) => g.family === "blocks");
const blocks = blockGroups.map(blockRules).join("");
const pictures = GROUPS.filter((g) => g.family === "pictures").map(pictureRules).join("");
const tags = GROUPS.filter((g) => g.family === "tags").map(tagRules).join("");
const empties = blockGroups.map(emptyRules).join("");
const headings = HEADINGS.map(({ group, level }) => headingRules(group, level)).join("");
const images = IMAGE_LAYERS.map(imageLayer).join("");
const out = `${header}${headings}${blocks}${pictures}${tags}${empties}${images}`;
fs.writeFileSync(`${ROOT}/styles/illuminus-generated.css`, out);
console.log(`wrote styles/illuminus-generated.css — ${out.split("\n").length} lines, `
  + `${GROUPS.filter((g) => g.family).length} groups`);
