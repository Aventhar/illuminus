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

/**
 * How a thing is laid out, for the parts a person builds themselves: whether it
 * is a block or a row, how a row shares out its room, how much room it may take
 * and what happens to whatever will not fit.
 *
 * Every one of these emits nothing until it is set, so a block, tag or picture
 * that says nothing about its layout is laid out as Foundry lays it out.
 */
/**
 * `display` falls back to what the thing was laid out as, never to nothing.
 *
 * An unset control emits no value, and a `display` reading an unset property is
 * invalid at computed-value time — which takes the *initial* value, `inline`,
 * rather than leaving the element alone. A tag is deliberately an inline block
 * so its padding grows its own box, and it spilled over the lines around it the
 * moment this control existed. Whatever the skeleton lays a thing out as has to
 * be said again here as the fallback.
 */
const displayed = (group, fallback) => `  display: ${v(group, "display")
  .replace(/\)$/, `, ${fallback})`)};`;

const layout = (group, fallback = "block") => `${displayed(group, fallback)}
  flex-direction: ${v(group, "flexDirection")};
  flex-wrap: ${v(group, "flexWrap")};
  justify-content: ${v(group, "justify")};
  align-items: ${v(group, "alignItems")};
  gap: ${v(group, "gap")};
  min-width: ${v(group, "minWidth")};
  max-width: ${v(group, "maxWidth")};
  min-height: ${v(group, "minHeight")};
  max-height: ${v(group, "maxHeight")};
  overflow: ${v(group, "overflow")};`;

/**
 * A fill that graduates from one color to another.
 *
 * A color goes in `background-color` and a gradient cannot — it is an image —
 * so it goes on the element's own `background-image`, which is free: a
 * background *picture* rides on a layer of its own. Both ends start
 * transparent, so a fill nobody has graduated is the fill alone.
 */
/**
 * A turn and a size, as one transform.
 *
 * Each control emits its whole function or nothing, and both are read with an
 * empty fallback — so one set is that one alone, and neither set leaves the
 * declaration holding nothing, which is "none". An identity transform is not
 * "none": it makes the element a containing block, which is the same trap the
 * frosting has and the reason that one is a single control.
 */
const turned = (group) =>
  `  transform: ${vOr(group, "turn", "")} ${vOr(group, "scale", "")};`;

const graduated = (group, prefix = "") => {
  const of = (part) => (prefix ? `${prefix}${part}` : part.charAt(0).toLowerCase() + part.slice(1));
  return `  background-image: linear-gradient(${v(group, of("GradientAngle"))},
    ${v(group, of("GradientFrom"))}, ${v(group, of("GradientTo"))});`;
};

const box = (group) => `  background-color: ${v(group, "background")};
  backdrop-filter: ${v(group, "frost")};
${graduated(group)}
  margin: ${sides(group, "margin")};
  padding: ${sides(group, "padding")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
  corner-shape: ${v(group, "cornerShape")};
  box-shadow: ${shadow(group, "shadow")};`;


/* ==========================================================================
   Lists and tables, once per treatment.

   These used to be written by hand in the skeleton, because there was one of
   each. A family of five means the same rules five times over with different
   custom properties, which is exactly what this file exists for — and the
   default is now just another set, written for "carries no treatment class".

   The selectors are passed in rather than derived, because the default and a
   treatment are shaped differently: a default styles every `ul` that has not
   been treated, while a treatment styles the element carrying its own class.
   ========================================================================== */

/** Where a list's rules land: the list itself, its two kinds, and its items. */
const listTargets = (group) => {
  const page = ".illuminus-styled .journal-page-content";
  if (group.id !== "lists") {
    const own = `${page} .illuminus-list--${group.id}`;
    return {
      list: own,
      ul: `${page} ul.illuminus-list--${group.id}`,
      ol: `${page} ol.illuminus-list--${group.id}`,
      dl: `${page} dl.illuminus-list--${group.id}`,
      item: `${own} > li`,
      marker: `${own} > li::marker`,
      term: `${own} > dt`,
      detail: `${own} > dd`
    };
  }
  // A list nobody has treated, and the items inside one — said as "not inside a
  // treated list" so a plain item within a treatment follows the treatment.
  //
  // And never inside a `<menu>`. The page editor's toolbar is built from menus
  // of lists, and ProseMirror's content element carries `journal-page-content`
  // too — so without this, the Default List rules reach the editor's drop-downs.
  // Core hides their entries with `display: none` from its compatibility layer,
  // which a module layer beats however it is written: every menu unfurled at
  // once, over the page, with our bullets beside each entry.
  const loose = ":not(.illuminus-list):not(menu *)";
  const plain = (tag) => `${page} ${tag}${loose}`;
  return {
    list: `${plain("ul")},\n${plain("ol")}`,
    ul: plain("ul"),
    ol: plain("ol"),
    dl: plain("dl"),
    item: `${page} li:not(.illuminus-list li):not(menu *)`,
    marker: `${page} li:not(.illuminus-list li):not(menu *)::marker`,
    term: `${page} dt:not(.illuminus-list dt):not(menu *)`,
    detail: `${page} dd:not(.illuminus-list dd):not(menu *)`
  };
};

const listRules = (group) => {
  const at = listTargets(group);
  return `
/* ${group.id} */
${at.list} {
  padding-inline-start: ${v(group, "indent")};
  margin: ${sides(group, "margin")};
  /* A list laid out as a row makes its items a run rather than a column, which
     is how a line of trait chips is built. It falls back to the list it was. */
${displayed(group, "block")}
  flex-direction: ${v(group, "flexDirection")};
  flex-wrap: ${v(group, "flexWrap")};
  justify-content: ${v(group, "justify")};
  align-items: ${v(group, "alignItems")};
  gap: ${v(group, "gap")};
  min-width: ${v(group, "minWidth")};
  max-width: ${v(group, "maxWidth")};
  min-height: ${v(group, "minHeight")};
  max-height: ${v(group, "maxHeight")};
  overflow: ${v(group, "overflow")};
}

${at.ul} {
  list-style-type: ${v(group, "bullet")};
}

${at.ol} {
  list-style-type: ${v(group, "numberStyle")};
}

${at.item} {
  margin-bottom: ${v(group, "itemSpacing")};
}

/* Sizing the marker rather than the item, so a big bullet does not drag the
   text up with it. */
${at.marker} {
  color: ${v(group, "markerColor")};
  font-family: ${v(group, "markerFont")};
  font-size: ${v(group, "markerSize")};
}

/* A definition list takes the same margins, and its two parts their own
   lettering: unset, both inherit Foundry's near-white and are all but invisible
   on a pale page. */
${at.dl} {
  margin: ${sides(group, "margin")};
}

${at.term} {
  font-family: ${v(group, "termFont")};
  -webkit-text-stroke: ${v(group, "termOutlineWidth")} ${v(group, "termOutlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "termTextShadowOffsetX")} ${v(group, "termTextShadowOffsetY")}
               ${v(group, "termTextShadowBlur")} ${v(group, "termTextShadowColor")};
  font-size: ${v(group, "termSize")};
  color: ${v(group, "termColor")};
  font-weight: ${v(group, "termTextStyle", "weight")};
  font-style: ${v(group, "termTextStyle", "slant")};
  font-variant: ${v(group, "termCaps", "variant")};
  text-transform: ${v(group, "termCaps", "transform")};
  margin-top: ${v(group, "termSpacingAbove")};
}

${at.detail} {
  font-family: ${v(group, "detailFont")};
  -webkit-text-stroke: ${v(group, "detailOutlineWidth")} ${v(group, "detailOutlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "detailTextShadowOffsetX")} ${v(group, "detailTextShadowOffsetY")}
               ${v(group, "detailTextShadowBlur")} ${v(group, "detailTextShadowColor")};
  font-size: ${v(group, "detailSize")};
  color: ${v(group, "detailColor")};
  font-weight: ${v(group, "detailTextStyle", "weight")};
  font-style: ${v(group, "detailTextStyle", "slant")};
  margin-left: ${v(group, "detailIndent")};
  margin-bottom: ${v(group, "detailSpacingBelow")};
}
`;
};

/** Where a table's rules land: the table, its cells, its rows, its caption. */
const tableTargets = (group) => {
  const page = ".illuminus-styled .journal-page-content";
  const own = group.id === "tables"
    ? `${page} table:not(.illuminus-table)`
    : `${page} table.illuminus-table--${group.id}`;
  return {
    table: own,
    cells: `${own} th,\n${own} td`,
    data: `${own} td`,
    header: `${own} th`,
    row: `${own} tbody tr`,
    stripe: `${own} tbody tr:nth-child(even)`,
    caption: `${own} > caption`
  };
};

const tableRules = (group) => {
  const at = tableTargets(group);
  return `
/* ${group.id} */
/* Separate borders rather than collapsed, so the table can carry its own frame
   and rounded corners independently of the lines between cells. */
${at.table} {
  width: ${v(group, "width")};
  /* A table laid out as something other than a table is the author's business;
     it falls back to the table it was. */
${displayed(group, "table")}
  min-width: ${v(group, "minWidth")};
  max-width: ${v(group, "maxWidth")};
  min-height: ${v(group, "minHeight")};
  max-height: ${v(group, "maxHeight")};
  border-collapse: separate;
  border-spacing: 0;
  overflow: ${vOr(group, "overflow", "hidden")};
  font-family: ${v(group, "font")};
  -webkit-text-stroke: ${v(group, "outlineWidth")} ${v(group, "outlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "textShadowOffsetX")} ${v(group, "textShadowOffsetY")}
               ${v(group, "textShadowBlur")} ${v(group, "textShadowColor")};
  font-size: ${v(group, "size")};
  line-height: ${v(group, "lineHeight")};
  color: ${v(group, "textColor")};
  margin: ${sides(group, "margin")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
  corner-shape: ${v(group, "cornerShape")};
}

${at.cells} {
  padding: ${sides(group, "cellPadding")};
  vertical-align: ${v(group, "verticalAlign")};
  border-width: ${sides(group, "cellBorder", "Width")};
  border-style: ${sides(group, "cellBorder", "Style")};
  border-color: ${sides(group, "cellBorder", "Color")};
}

${at.data} {
  text-align: ${v(group, "align")};
}

${at.header} {
  font-family: ${v(group, "headerFont")};
  -webkit-text-stroke: ${v(group, "headerOutlineWidth")} ${v(group, "headerOutlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "headerTextShadowOffsetX")} ${v(group, "headerTextShadowOffsetY")}
               ${v(group, "headerTextShadowBlur")} ${v(group, "headerTextShadowColor")};
  font-size: ${v(group, "headerSize")};
  font-weight: ${v(group, "headerTextStyle", "weight")};
  font-style: ${v(group, "headerTextStyle", "slant")};
  font-variant: ${v(group, "headerCaps", "variant")};
  text-transform: ${v(group, "headerCaps", "transform")};
  letter-spacing: ${v(group, "headerLetterSpacing")};
  word-spacing: ${v(group, "headerWordSpacing")};
  text-align: ${v(group, "headerAlign")};
  background-color: ${v(group, "headerBackground")};
${graduated(group, "header")}
  backdrop-filter: ${v(group, "headerFrost")};
  color: ${v(group, "headerColor")};
}

${at.row} {
  background-color: ${v(group, "rowColor")};
}

${at.stripe} {
  background-color: ${v(group, "stripeColor")};
}

${at.caption} {
  caption-side: ${v(group, "captionSide")};
  font-family: ${v(group, "captionFont")};
  -webkit-text-stroke: ${v(group, "captionOutlineWidth")} ${v(group, "captionOutlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "captionTextShadowOffsetX")} ${v(group, "captionTextShadowOffsetY")}
               ${v(group, "captionTextShadowBlur")} ${v(group, "captionTextShadowColor")};
  font-size: ${v(group, "captionSize")};
  color: ${v(group, "captionColor")};
  font-weight: ${v(group, "captionTextStyle", "weight")};
  font-style: ${v(group, "captionTextStyle", "slant")};
  font-variant: ${v(group, "captionCaps", "variant")};
  text-transform: ${v(group, "captionCaps", "transform")};
  text-align: ${v(group, "captionAlign")};
  padding-bottom: ${v(group, "captionSpacing")};
}
`;
};

/* -------------------------------------------- */

/**
 * What one member's rules hang off. The class is derived from the group id —
 * `box01` answers to `illuminus-box--box01` — so a renamed family cannot leave
 * the stylesheet naming something the editor no longer writes.
 */
const memberSelector = (group, suffix = "") => {
  // The one group that is not a member: a tag nobody has given a treatment,
  // said as "carries no treatment class" rather than by listing the ten, so a
  // renamed or added treatment cannot leave it behind.
  // The plain picture, the same.
  if (group.id === "images") {
    return `.illuminus-styled .journal-page-content figure:not(.illuminus-image)${suffix}`;
  }
  // The plain box, said as "carries no treatment class" for the same reason.
  if (group.id === "boxes") {
    return `.illuminus-styled .journal-page-content blockquote:not(.illuminus-box)${suffix}`;
  }
  if (group.id === "tags") {
    return `.illuminus-styled .journal-page-content .illuminus-tag`
      + `:not([class*="illuminus-tag--"])${suffix}`;
  }
  const kind = group.id.replace(/\d{2}$/, "");
  return `.illuminus-styled .journal-page-content .illuminus-${kind}--${group.id}${suffix}`;
};

/*
 * How a block sits on the page: which way it floats, how wide it is, where it
 * is nudged to, and how it arranges whatever it holds. Written apart from the
 * rest so the plain box can be laid out by the same code as its treatments —
 * it was the only box that could not be given a width.
 */
const blockPlacing = (group) => `  float: ${v(group, "float")};
  width: ${v(group, "width")};
  clear: ${v(group, "clear")};
  /* Where it is nudged to. Its position is written by the rule that makes it
     ready to hold a picture layer, so that one place decides it. */
  top: ${v(group, "offsetTop")};
  left: ${v(group, "offsetLeft")};
${turned(group)}
${layout(group)}`;

/** A heading inside a block, on the same terms. */
const blockHeadings = (group) => `
${memberSelector(group, " :is(h1, h2, h3, h4, h5, h6)")} {
  font-family: ${v(group, "headingFont")};
  -webkit-text-stroke: ${v(group, "headingOutlineWidth")} ${v(group, "headingOutlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "headingTextShadowOffsetX")} ${v(group, "headingTextShadowOffsetY")}
               ${v(group, "headingTextShadowBlur")} ${v(group, "headingTextShadowColor")};
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

const boxRules = (group) => `
/* ${group.id} */
${memberSelector(group)} {
${blockPlacing(group)}
${box(group)}
  font-family: ${v(group, "font")};
  -webkit-text-stroke: ${v(group, "outlineWidth")} ${v(group, "outlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "textShadowOffsetX")} ${v(group, "textShadowOffsetY")}
               ${v(group, "textShadowBlur")} ${v(group, "textShadowColor")};
  font-size: ${v(group, "size")};
  font-weight: ${v(group, "textStyle", "weight")};
  font-style: ${v(group, "textStyle", "slant")};
  font-variant: ${v(group, "caps", "variant")};
  text-transform: ${v(group, "caps", "transform")};
  letter-spacing: ${v(group, "letterSpacing")};
  word-spacing: ${v(group, "wordSpacing")};
  line-height: ${v(group, "lineHeight")};
  text-wrap: ${v(group, "wrap")};
  hyphens: ${v(group, "hyphens")};
  text-align: ${v(group, "align")};
  color: ${vOr(group, "color", "inherit")};
}
${blockHeadings(group)}`;

/*
 * The shape a picture is cropped to, and which way it faces. Written apart so
 * the plain picture is cropped by the same code as a treated one — it was the
 * only picture that could not be given a shape or flipped.
 *
 * The fallbacks matter: an unset control emits nothing, and a property reading
 * an unset value takes its initial value rather than leaving the picture alone.
 */
const pictureShaped = (group) => `  aspect-ratio: ${vOr(group, "pictureShape", "auto")};
  object-fit: ${vOr(group, "pictureCrop", "cover")};
  object-position: ${vOr(group, "pictureFrom", "center")};
  transform: ${v(group, "flip")};`;

const imageRules = (group) => `
/* ${group.id} */
${memberSelector(group)} {
  float: ${v(group, "float")};
  width: ${v(group, "width")};
  clear: ${v(group, "clear")};
  /* Where it is nudged to. Its position is written by the rule that makes it
     ready to hold a picture layer, so that one place decides it. */
  top: ${v(group, "offsetTop")};
  left: ${v(group, "offsetLeft")};
${turned(group)}
${displayed(group, "block")}
  min-width: ${v(group, "minWidth")};
  max-width: ${v(group, "maxWidth")};
  min-height: ${v(group, "minHeight")};
  max-height: ${v(group, "maxHeight")};
  overflow: ${v(group, "overflow")};
  background-color: ${v(group, "background")};
  backdrop-filter: ${v(group, "frost")};
${graduated(group)}
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
  corner-shape: ${v(group, "cornerShape")};
  box-shadow: ${shadow(group, "shadow")};
}

${memberSelector(group, " img")} {
  display: block;
  width: 100%;
  height: auto;
${pictureShaped(group)}
  opacity: ${v(group, "opacity")};
  /* The page-wide picture frame would otherwise apply on top of this one. */
  border: none;
  border-radius: inherit;
  box-shadow: none;
  margin: 0;
  padding: 0;
  max-width: 100%;
}

${memberSelector(group, " figcaption")} {
  font-family: ${v(group, "captionFont")};
  -webkit-text-stroke: ${v(group, "captionOutlineWidth")} ${v(group, "captionOutlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "captionTextShadowOffsetX")} ${v(group, "captionTextShadowOffsetY")}
               ${v(group, "captionTextShadowBlur")} ${v(group, "captionTextShadowColor")};
  font-size: ${v(group, "captionSize")};
  font-weight: ${v(group, "captionTextStyle", "weight")};
  font-style: ${v(group, "captionTextStyle", "slant")};
  font-variant: ${v(group, "captionCaps", "variant")};
  text-transform: ${v(group, "captionCaps", "transform")};
  text-align: ${v(group, "captionAlign")};
  color: ${vOr(group, "captionColor", "inherit")};
  margin-top: ${v(group, "captionSpacing")};
}
`;

/* -------------------------------------------- */

/**
 * One inline treatment. A tag is an inline block because vertical padding on a
 * true inline box spills over the lines above and below rather than growing its
 * own — the reason a published adventure sets its trait tags as list items in a
 * flex row. Its picture
 * rides on a layer behind the lettering, isolated so that a blend mode mixes
 * with the tag's own fill rather than with the page beneath it.
 */
const tagRules = (group) => `
/* ${group.id} */
${memberSelector(group)} {
  float: ${v(group, "float")};
  vertical-align: ${v(group, "verticalAlign")};
  bottom: ${v(group, "lift")};
  min-width: ${v(group, "minWidth")};
  /* Whether both halves of a tag broken across two lines are drawn whole. The
     fallback is what a browser does anyway, so a tag nobody has asked about is
     sliced as it always was. */
  -webkit-box-decoration-break: ${v(group, "wrapEdges").replace(/\)$/, ", slice)")};
  box-decoration-break: ${v(group, "wrapEdges").replace(/\)$/, ", slice)")};
${displayed(group, "inline-block")}
  flex-direction: ${v(group, "flexDirection")};
  flex-wrap: ${v(group, "flexWrap")};
  justify-content: ${v(group, "justify")};
  align-items: ${v(group, "alignItems")};
  gap: ${v(group, "gap")};
  max-width: ${v(group, "maxWidth")};
  min-height: ${v(group, "minHeight")};
  max-height: ${v(group, "maxHeight")};
  overflow: ${v(group, "overflow")};
${turned(group)}
  background-color: ${v(group, "background")};
  backdrop-filter: ${v(group, "frost")};
${graduated(group)}
  padding: ${sides(group, "padding")};
  margin: ${sides(group, "margin")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
  corner-shape: ${v(group, "cornerShape")};
  box-shadow: ${shadow(group, "shadow")}, inset ${shadow(group, "innerShadow")};
  font-family: ${v(group, "font")};
  -webkit-text-stroke: ${v(group, "outlineWidth")} ${v(group, "outlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "textShadowOffsetX")} ${v(group, "textShadowOffsetY")}
               ${v(group, "textShadowBlur")} ${v(group, "textShadowColor")};
  font-size: ${v(group, "size")};
  font-weight: ${v(group, "textStyle", "weight")};
  font-style: ${v(group, "textStyle", "slant")};
  font-variant: ${v(group, "caps", "variant")};
  text-transform: ${v(group, "caps", "transform")};
  letter-spacing: ${v(group, "letterSpacing")};
  word-spacing: ${v(group, "wordSpacing")};
  line-height: ${v(group, "lineHeight")};
  text-wrap: ${v(group, "wrap")};
  hyphens: ${v(group, "hyphens")};
  color: ${vOr(group, "color", "inherit")};
}

${memberSelector(group, "::before")} {
  background-image: ${v(group, "texture")};
  background-size: ${v(group, "texture", "fit-size")};
  background-repeat: ${v(group, "texture", "fit-repeat")};
  background-position: ${v(group, "texturePosition")};
  mix-blend-mode: ${v(group, "textureBlend")};
  opacity: ${v(group, "textureOpacity")};
  filter: blur(${v(group, "textureBlur").replace(/\)$/, ", 0px)")})
          brightness(${v(group, "textureBrightness").replace(/\)$/, ", 100%)")})
          contrast(${v(group, "textureContrast").replace(/\)$/, ", 100%)")})
          saturate(${v(group, "textureSaturation").replace(/\)$/, ", 100%)")})
          sepia(${v(group, "textureAge").replace(/\)$/, ", 0%)")});
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
${memberSelector(group, `:not(:has(${CONTENTFUL}))`)
  .replaceAll(".illuminus-styled .journal-page-content", ".illuminus-styled section.journal-page-content")} {
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
${layout(group, "block")}
  font-family: ${v(group, "font")};
  -webkit-text-stroke: ${v(group, "outlineWidth")} ${v(group, "outlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "textShadowOffsetX")} ${v(group, "textShadowOffsetY")}
               ${v(group, "textShadowBlur")} ${v(group, "textShadowColor")};
  font-size: ${v(group, "size")};
  font-weight: ${v(group, "textStyle", "weight")};
  font-style: ${v(group, "textStyle", "slant")};
  font-variant: ${v(group, "caps", "variant")};
  text-transform: ${v(group, "caps", "transform")};
  letter-spacing: ${v(group, "letterSpacing")};
  word-spacing: ${v(group, "wordSpacing")};
  line-height: ${v(group, "lineHeight")};
  text-wrap: ${v(group, "wrap")};
  hyphens: ${v(group, "hyphens")};
  text-align: ${v(group, "align")};
  color: ${v(group, "color")};
  text-shadow: ${v(group, "textShadowOffsetX")} ${v(group, "textShadowOffsetY")}
               ${v(group, "textShadowBlur")} ${v(group, "textShadowColor")};
  -webkit-text-stroke: ${v(group, "outlineWidth")} ${v(group, "outlineColor")};
  paint-order: stroke fill;
  text-shadow: ${v(group, "textShadowOffsetX")} ${v(group, "textShadowOffsetY")}
               ${v(group, "textShadowBlur")} ${v(group, "textShadowColor")};
  background-color: ${v(group, "background")};
${graduated(group)}
  backdrop-filter: ${v(group, "frost")};
  margin: ${sides(group, "margin")};
  padding: ${sides(group, "padding")};
  border-width: ${sides(group, "border", "Width")};
  border-style: ${sides(group, "border", "Style")};
  border-color: ${sides(group, "border", "Color")};
  border-radius: ${corners(group, "corner")};
  corner-shape: ${v(group, "cornerShape")};
}
`;

/* -------------------------------------------- */

/**
 * Where each element's hovered paint lands.
 *
 * The schema derives a hovered counterpart for every lettering color, fill, and
 * edge color it defines; this says which element each group is. A group with no
 * entry here simply has no hovered rule — the sidebar and the window state
 * theirs by hand, and a family member's selector comes from its own id.
 */
const HOVER_TARGETS = {
  page: ".illuminus-styled .journal-entry-content",
  title: {
    text: ".illuminus-styled .journal-header .title",
    box: ".illuminus-styled .journal-header"
  },
  heading1: headingSelector(1),
  heading2: ".illuminus-styled .journal-page-content h2",
  heading3: ".illuminus-styled .journal-page-content h3",
  heading4: ".illuminus-styled .journal-page-content h4",
  heading5: ".illuminus-styled .journal-page-content h5",
  heading6: ".illuminus-styled .journal-page-content h6",
  // Ordinary text wherever it appears, so a list item or a table cell is
  // covered by the Body tab rather than needing a hovered state of its own.
  body: ["p", "li", "dd", "dt", "td"]
    .map((tag) => `.illuminus-styled .journal-page-content ${tag}`).join(", "),
  tables: ".illuminus-styled .journal-page-content table",
  boxes: ".illuminus-styled .journal-page-content blockquote:not(.illuminus-box)",
  secrets: ".illuminus-styled .journal-page-content section.secret",
  images: ".illuminus-styled .journal-page-content figure",
  links: ".illuminus-styled .journal-page-content a.content-link, .illuminus-styled .journal-page-content a.inline-roll"
};

/** The paint a hovered element can change, and the property each one sets. */
const SHADOW_PARTS = ["OffsetX", "OffsetY", "Blur", "Color"];

const HOVER_PROPS = [
  { name: "color", property: "color" },
  // Longhands rather than the shorthand: the ordinary rule sets the shorthand,
  // and one half of a state's outline may be left to fall back to it.
  { name: "outlineWidth", property: "-webkit-text-stroke-width" },
  { name: "outlineColor", property: "-webkit-text-stroke-color" },
  { name: "background", property: "background-color", box: true },
  ...["Top", "Right", "Bottom", "Left"].map((side) => ({
    name: `border${side}Color`,
    property: `border-${side.toLowerCase()}-color`,
    box: true
  }))
];

/**
 * One element's hovered rule.
 *
 * Each declaration falls back to the ordinary value, so a hovered color that
 * was never set changes nothing at all rather than resetting the element to
 * some default.
 */
/**
 * One element's hovered rule, or two where the words and the box they sit in
 * are different elements.
 *
 * The journal's name is the case that needs it: Foundry renders it as an
 * `<input>`, which cannot hold a picture, so its fill and its edges are painted
 * on the header around it while the lettering stays on the input. The hovered
 * rule has to divide the same way — painting a hovered fill on the input put a
 * flat color over the header's picture, which is exactly the box somebody sees
 * appear when they point at the title.
 */
const hoverRules = (group, target) => {
  const fields = groupFields(group);
  const selector = typeof target === "string" ? target : target.text;
  const boxSelector = typeof target === "string" ? target : target.box;
  const wanted = HOVER_PROPS
    .filter(({ name }) => fields.some((field) => field.name === `hover${name[0].toUpperCase()}${name.slice(1)}`));
  const declare = ({ name, property }) => {
    const hovered = `hover${name[0].toUpperCase()}${name.slice(1)}`;
    return `  ${property}: var(${varFor(group, hovered)}, var(${varFor(group, name)}));`;
  };
  const boxLines = selector === boxSelector ? [] : wanted.filter((one) => one.box).map(declare);
  const lines = wanted.filter((one) => selector === boxSelector || !one.box).map(declare);
  // A text shadow is four controls and one property, so it is composed rather
  // than mapped: each part falls back to the ordinary one on its own, which is
  // what lets a state change the color of a shadow and leave its offsets alone.
  if (fields.some((field) => field.name === "hoverTextShadowOffsetX")) {
    const part = (name) => {
      const hovered = `hoverTextShadow${name}`;
      return `var(${varFor(group, hovered)}, var(${varFor(group, `textShadow${name}`)}))`;
    };
    lines.push(`  text-shadow: ${part("OffsetX")} ${part("OffsetY")}\n               ${part("Blur")} ${part("Color")};`);
  }
  if (!lines.length) return "";
  // Appended per selector: a comma-joined list would otherwise hover only its
  // last member, which is the kind of thing that half-works in silence.
  const hovered = selector.split(",").map((one) => `${one.trim()}:hover`).join(",\n");
  const boxRule = !boxLines.length ? "" : `
${boxSelector.split(",").map((one) => `${one.trim()}:hover`).join(",\n")} {
${boxLines.join("\n")}
}
`;
  return boxRule + `
${hovered} {
${lines.join("\n")}
}
`;
};

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
  // `host: false`: whether this one is positioned is a control of its own —
  // the layer taking `position: relative` for itself held the button still
  // however that control was set.
  { selector: ".illuminus-styled .journal-entry-page .edit-container button", group: "window", prefix: "pageButton", host: false },
  // And its pointed-at twin, whose host rule is the same button with the
  // state stripped off it — so this one held the button still as well.
  { selector: ".illuminus-styled .journal-entry-page .edit-container button:hover", group: "window", prefix: "pageButtonHover", host: false },
  { selector: ".illuminus-styled.journal-entry-page.application, .illuminus-styled .illuminus-preview__editor", group: "editor", prefix: "", host: false },
  { selector: ".illuminus-styled.journal-entry-page .window-header, .illuminus-styled .illuminus-preview__editor .window-header", group: "editor", prefix: "titleBar" },
  { selector: ".illuminus-styled.journal-entry-page .window-header button.header-control", group: "editor", prefix: "headerButton" },
  { selector: ".illuminus-styled.journal-entry-page .window-header button.header-control:hover", group: "editor", prefix: "headerButtonHover" },
  { selector: ".illuminus-styled.journal-entry-page menu.editor-menu, .illuminus-styled .illuminus-preview__editor menu.editor-menu", group: "editorToolbar", prefix: "toolbar" },
  { selector: ".illuminus-styled.journal-entry-page menu.editor-menu .pm-dropdown, .illuminus-styled .illuminus-preview__editor menu.editor-menu .pm-dropdown", group: "editorDropdowns", prefix: "dropdown" },
  { selector: ".illuminus-styled.journal-entry-page menu.editor-menu button:not(.pm-dropdown), .illuminus-styled .illuminus-preview__editor menu.editor-menu button:not(.pm-dropdown)", group: "editorToolbar", prefix: "toolbarButton" },
  { selector: ".illuminus-styled.journal-entry-page .page-metadata select, .illuminus-styled .illuminus-preview__editor .page-metadata select", group: "editorSettingsBar", prefix: "field" },
  { selector: ".illuminus-styled.journal-entry-page .page-metadata, .illuminus-styled .illuminus-preview__editor .page-metadata", group: "editorSettingsBar", prefix: "settingsBar" },
  // Core positions the list itself, so the layer rides on it without claiming it.
  { selector: ".illuminus-styled#prosemirror-dropdown ul", group: "editorDropdowns", prefix: "list", host: false },
  { selector: ".illuminus-styled .journal-sidebar", group: "sidebar", prefix: "" },
  { selector: ".illuminus-styled .journal-sidebar .toc li.page", group: "sidebarEntries", prefix: "entry" },
  { selector: ".illuminus-styled .journal-sidebar .toc li.page:hover", group: "sidebarEntries", prefix: "entryHover" },
  { selector: ".illuminus-styled .journal-sidebar .toc li.heading", group: "sidebarHeadings", prefix: "heading" },
  { selector: ".illuminus-styled .journal-sidebar .toc li.category", group: "sidebarCategories", prefix: "category" },
  { selector: '.illuminus-styled .journal-sidebar search input[type="search"]', group: "sidebarSearch", prefix: "search" },
  { selector: ".illuminus-styled .journal-sidebar button", group: "sidebarButtons", prefix: "button" },
  { selector: ".illuminus-styled .journal-sidebar button:hover", group: "sidebarButtons", prefix: "buttonHover" },
  // The layer goes on the header, not on the title inside it: Foundry renders a
  // journal's name as an `<input>`, and a replaced element has no `::before` to
  // put a picture on — so the Title tab's Background Image had nowhere to paint
  // and silently did nothing. The header is the same width and a real element.
  { selector: ".illuminus-styled .journal-header", group: "title", prefix: "" },
  // The same selector the heading's own rule uses, so level 1's picture reaches
  // the page title as well: the sheet renders that title *outside* the content,
  // and a layer written for the content only left Background Image doing
  // nothing on the one heading most likely to want one.
  ...HEADINGS.map(({ group, level }) =>
    ({ selector: headingSelector(level), group: group.id, prefix: "" })),
  { selector: ".illuminus-styled .journal-page-content a.content-link, .illuminus-styled .journal-page-content a.inline-roll", group: "links", prefix: "" },
  { selector: ".illuminus-styled .journal-page-content table:not(.illuminus-table) thead th", group: "tables", prefix: "header" },
  // Each table treatment's own header row, on the same terms.
  ...GROUPS.filter((g) => g.family === "tableStyles").map((g) => ({
    selector: `.illuminus-styled .journal-page-content table.illuminus-table--${g.id} thead th`,
    group: g.id, prefix: "header"
  })),
  { selector: ".illuminus-styled .journal-page-content blockquote:not(.illuminus-box)", group: "boxes", prefix: "" },
  ...GROUPS.filter((g) => g.family === "boxStyles")
    .map((g) => ({ selector: memberSelector(g), group: g.id, prefix: "" })),
  ...GROUPS.filter((g) => g.family === "imageStyles")
    .map((g) => ({ selector: memberSelector(g), group: g.id, prefix: "" }))
];

/** The custom property one image field emits, by prefix, part, and suffix. */
const imageVar = (layer, part, suffix = "") => {
  const group = GROUPS.find((g) => g.id === layer.group);
  const name = layer.prefix ? `${layer.prefix}Texture${part}` : `texture${part}`;
  return v(group, name, suffix);
};

/**
 * `::after` on every member of a comma-joined selector, not only the last.
 *
 * Two things are going on here, and both were bugs.
 *
 * The layer rides on `::after` and not on `::before` because **FontAwesome owns
 * `::before`**: an icon is a glyph in that pseudo-element's `content`, and a
 * layer rule setting `content: ""` erased the icon on every button it touched.
 * The button kept its fill, so it read as "the icon color does not work" when
 * the icon was not there at all.
 *
 * And it is appended to each member of a comma-joined selector, not to the list:
 * `a, b::after` attaches the pseudo-element to `b` alone and applies the rule's
 * declarations to `a` itself — which put `position: absolute; inset: 0` on every
 * content link in a styled journal. The same trap as appending `:hover` to a
 * list, and it fails just as quietly.
 */
const eachAfter = (selector) => selector
  .split(",")
  .map((one) => `${one.trim()}::after`)
  .join(",\n");

/**
 * The element a layer hangs off, made ready to hold one — always, not only in
 * the state whose picture it is.
 *
 * `isolation: isolate` starts a stacking context. Applied under `:hover`, it
 * appeared and disappeared as the pointer moved, and anything Foundry had put
 * inside that element went with it: a context menu opened on a listed page
 * flickered and could not be clicked. The state belongs on the picture, not on
 * the box that holds it.
 */
const layerHost = (selector) => selector.replace(/:hover|\.active(?=$|[\s,])/g, "");

/**
 * Whether a layer's host is positioned, and by what.
 *
 * A layer is placed against its host, so the host has to be positioned — but
 * where the part *offers* a placing control, the control decides and the
 * skeleton's own value is what an unset one falls back to. That is the same
 * bargain `display` makes: a control that can override something the skeleton
 * deliberately sets must name what the skeleton set.
 *
 * Only "relative" and "stay put" are on offer for exactly this reason. A part
 * put back into normal flow would send its own background picture to the corner
 * of the page.
 */
const hostPosition = (layer) => {
  const group = GROUPS.find((g) => g.id === layer.group);
  const name = layer.prefix ? `${layer.prefix}Position` : "position";
  const offered = (group?.sections ?? []).some((section) =>
    section.fields.some((field) => field.name === name));
  return offered ? vOr(group, name, "relative") : "relative";
};

const imageLayer = (layer) => `
${layerHost(layer.selector)} {
${layer.host === false ? "" : `  position: ${hostPosition(layer)};\n`}  isolation: isolate;
}

${eachAfter(layer.selector)} {
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
  /* What is done to the picture before it is laid down. Every part carries its
     own fallback: one unset part makes the whole declaration invalid, and a
     picture somebody had blurred would then not be blurred at all. */
  filter: blur(${imageVar(layer, "Blur").replace(/\)$/, ", 0px)")})
          brightness(${imageVar(layer, "Brightness").replace(/\)$/, ", 100%)")})
          contrast(${imageVar(layer, "Contrast").replace(/\)$/, ", 100%)")})
          saturate(${imageVar(layer, "Saturation").replace(/\)$/, ", 100%)")})
          sepia(${imageVar(layer, "Age").replace(/\)$/, ", 0%)")});
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
     <section class="illuminus-box illuminus-box--box01">…</section>
     <figure class="illuminus-image illuminus-image--image01">
       <img src="…"><figcaption>…</figcaption>
     </figure>
   ========================================================================== */

/* Shared: a block is a flow container, a picture treatment is a figure. */
.illuminus-styled .journal-page-content .illuminus-box {
  display: block;
  overflow-wrap: break-word;
}

.illuminus-styled .journal-page-content .illuminus-box > :last-child {
  margin-bottom: 0;
}

.illuminus-styled .journal-page-content .illuminus-image {
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

const blockGroups = GROUPS.filter((g) => g.family === "boxStyles");
const blocks = blockGroups.map(boxRules).join("");
/*
 * The plain box, laid out and headed by the same code as its treatments.
 * Its paint is written by hand in the skeleton — a blockquote nobody has
 * treated has been painted there since before the treatments existed — so only
 * the two halves it was missing are written here, rather than a second copy of
 * a rule that already works.
 */
const plainBox = GROUPS.find((group) => group.id === "boxes");
const defaultBlock = plainBox ? `
/* boxes — laid out and headed as its treatments are */
${memberSelector(plainBox)} {
${blockPlacing(plainBox)}
}
${blockHeadings(plainBox)}${emptyRules(plainBox)}` : "";
const pictures = GROUPS.filter((g) => g.family === "imageStyles").map(imageRules).join("");
/*
 * The plain picture, placed and cropped by the same code as its treatments.
 * Its paint — fill, edges, corners, shadow, caption — is written by hand in the
 * skeleton, and has been since before the treatments existed, so only the two
 * halves it was missing are written here.
 */
const plainPicture = GROUPS.find((group) => group.id === "images");
const defaultPicture = plainPicture ? `
/* images — placed and cropped as its treatments are */
${memberSelector(plainPicture)} {
  float: ${v(plainPicture, "float")};
  width: ${v(plainPicture, "width")};
  clear: ${v(plainPicture, "clear")};
  /* Said here rather than by the layer host, as a treatment's is: the plain
     picture carries no background layer, because its fill sits behind the
     picture rather than behind content. */
  position: ${v(plainPicture, "position")};
  top: ${v(plainPicture, "offsetTop")};
  left: ${v(plainPicture, "offsetLeft")};
${turned(plainPicture)}
${displayed(plainPicture, "block")}
  min-width: ${v(plainPicture, "minWidth")};
  min-height: ${v(plainPicture, "minHeight")};
  max-height: ${v(plainPicture, "maxHeight")};
  overflow: ${v(plainPicture, "overflow")};
}

${memberSelector(plainPicture, " img")} {
${pictureShaped(plainPicture)}
}
` : "";
const tags = GROUPS.filter((g) => g.family === "tagStyles" || g.id === "tags")
  .map(tagRules).join("");
const empties = blockGroups.map(emptyRules).join("");
/**
 * The text under one heading level.
 *
 * `heading-sections.mjs` wraps each heading's run of content at render, which is
 * what gives these something to apply to: columns need an element, and "the
 * paragraphs after this heading" is not one until something makes it one.
 */
const flowRules = (group, level) => `
/* the text under a level ${level} heading */
.illuminus-styled .journal-page-content .illuminus-flow--h${level} {
  column-count: ${v(group, "columnCount")};
  column-gap: ${v(group, "columnGap")};
  column-rule-width: ${v(group, "columnRuleWidth")};
  column-rule-style: ${v(group, "columnRuleStyle")};
  column-rule-color: ${v(group, "columnRuleColor")};
}
`;

/**
 * The marker that folds one heading level.
 *
 * The marker is written into every heading whatever the style says, and the
 * stylesheet decides whether a reader can see it — a style supplies values and
 * never rules, so "this level folds" has to be a value like any other.
 *
 * The glyph is the marker's own `::before` content, which is how FontAwesome
 * draws an icon in the first place: the element carries the family, and naming
 * a marker means naming the character. It turns when what it holds is open,
 * rather than swapping for a second glyph, so one control covers both states.
 */
const foldRules = (group, level) => {
  const each = (suffix) => headingSelector(level)
    .split(",").map((one) => `${one.trim()}${suffix}`).join(",\n");
  return `
/* the folding marker on a level ${level} heading */
${each(" > .illuminus-fold")} {
  display: ${v(group, "foldShown")};
  align-items: center;
  justify-content: center;
  color: ${vOr(group, "foldColor", "currentColor")};
  font-size: ${v(group, "foldSize")};
  margin-right: ${v(group, "foldGap")};
}

${each(" > .illuminus-fold i")} {
  transform: rotate(${v(group, "foldTurn")});
}

${each(".is-folded > .illuminus-fold i")} {
  transform: rotate(0deg);
}

${each(" > .illuminus-fold i::before")} {
  content: ${v(group, "foldIcon")};
}
`;
};

const headings = HEADINGS.map(({ group, level }) =>
  headingRules(group, level) + flowRules(group, level) + foldRules(group, level)).join("");
/**
 * The shadow that goes with a picture.
 *
 * The schema derives a shadow and an inner shading beside every background
 * picture, on the grounds that both answer the same question — how this surface
 * sits on the page — so the rules are written from the same table the pictures
 * are. The two are one declaration: `box-shadow` takes a list, and an element
 * setting it twice keeps only the second.
 *
 * A state's own picture is skipped, as it is in the schema: the pointed-at
 * shadow comes from the mirrored `:hover` rule below, which reads the twin.
 */
const shadowLayer = (layer) => {
  if (/hover|active/i.test(layer.prefix)) return "";
  const group = GROUPS.find((g) => g.id === layer.group);
  const outer = layer.prefix ? `${layer.prefix}Shadow` : "shadow";
  const inner = layer.prefix ? `${layer.prefix}InnerShadow` : "innerShadow";
  return `
${layerHost(layer.selector)} {
  box-shadow: ${shadow(group, outer)},
              inset ${shadow(group, inner)};
}
`;
};

const images = IMAGE_LAYERS.map(imageLayer).join("") + IMAGE_LAYERS.map(shadowLayer).join("");

/* -------------------------------------------- */
/*  The same rules again, pointed at             */
/* -------------------------------------------- */

/**
 * Every custom property that has a state's own counterpart, and what to read
 * instead when the thing wearing it is pointed at.
 *
 * Built from the schema rather than from a list of properties: every control in
 * a state-switched section has a twin now — a size, a typeface, a spacing, not
 * only paint — and a list would be a second place to keep them.
 */
const varsFor = (word) => {
  const Word = `${word[0].toUpperCase()}${word.slice(1)}`;
  const isState = (name) => new RegExp(`^${word}|${Word}(?=[A-Z])`).test(name);
  const vars = new Map();
  for (const group of GROUPS) {
  const fields = groupFields(group);
  for (const field of fields) {
    if (isState(field.name)) continue;
    // Paired by taking the state word back out of the other name, in either
    // spelling: `hoverColor` and `buttonHoverColor` both belong to the control
    // whose name is what is left. Splitting the ordinary name to guess where
    // the word would go cannot be done — `headerButtonColor` is not "header"
    // wearing "ButtonColor".
    const stemOf = (name) => {
      const stripped = name.replace(new RegExp(`^${word}`), "").replace(new RegExp(`${Word}(?=[A-Z])`), "");
      return stripped ? `${stripped[0].toLowerCase()}${stripped.slice(1)}` : name;
    };
    const twin = fields.find((other) => isState(other.name) && stemOf(other.name) === field.name);
    if (!twin) continue;
    // Paired by the name they share rather than by the suffixes they emit: one
    // control can write several properties — a lettering style writes a weight
    // and a slant — and they all hang off the same stem.
    vars.set(cssVarFor(group.id, field), cssVarFor(group.id, twin));
  }
  }
  // The longest stem a property name begins with wins: one control can write
  // several properties, and they all hang off the same stem.
  const stems = [...vars.entries()].sort((a, b) => b[0].length - a[0].length);
  return (name) => {
    if (vars.has(name)) return vars.get(name);
    const stem = stems.find(([ordinary]) => name.startsWith(`${ordinary}-`));
    return stem ? `${stem[1]}${name.slice(stem[0].length)}` : null;
  };
};

/** What to read instead of each property when the thing wearing it is pointed at. */
const hoverTwinOf = varsFor("hover");

/** And when it is the one being read, or the one a reader chose. */
const activeTwinOf = varsFor("active");

/** A selector with `:hover` on it, before any pseudo-element it ends with. */
const pointedAt = (selector) => selector.split(",").map((one) => {
  const trimmed = one.trim();
  const pseudo = trimmed.match(/::[a-z-]+$/)?.[0] ?? "";
  return `${pseudo ? trimmed.slice(0, -pseudo.length) : trimmed}:hover${pseudo}`;
}).join(",\n");

/**
 * Every `var(--ill-…)` in a declaration, wrapped so the state's own value is
 * read first and the ordinary one is what it falls back to.
 *
 * Written as a scan rather than a pattern because a good many of these already
 * carry a fallback of their own — `var(--ill-box01-color, inherit)` — and a
 * pattern that stopped at the first bracket left every one of those alone,
 * which is a control that silently governs both states again.
 */
function readTwins(declaration, twinOf) {
  let out = "";
  let at = 0;
  while (true) {
    const found = declaration.indexOf("var(--ill-", at);
    if (found < 0) return out + declaration.slice(at);
    out += declaration.slice(at, found);
    let depth = 0;
    let end = found + 3;
    for (; end < declaration.length; end += 1) {
      if (declaration[end] === "(") depth += 1;
      else if (declaration[end] === ")" && --depth === 0) break;
    }
    const whole = declaration.slice(found, end + 1);
    const name = whole.slice(4).match(/^--ill-[a-z0-9-]+/)?.[0] ?? "";
    const twin = twinOf(name);
    out += twin ? `var(${twin}, ${whole})` : whole;
    at = end + 1;
  }
}

/**
 * The stylesheet again, for the moment somebody points at something.
 *
 * Rather than a hand-kept list of which properties a state may change, each
 * rule that reads a property with a twin is written out a second time under
 * `:hover`, reading the twin and falling back to the ordinary value. A style
 * that sets nothing for a state therefore looks exactly as it did, and nothing
 * can be settable in one state and not the other — which is what it was.
 */
function pointedRules(css, { twinOf = hoverTwinOf, selector: restate = pointedAt } = {}) {
  const out = [];
  // Comments first: a brace inside one — and there are several, quoting the
  // very rules this walks — makes nonsense of reading a stylesheet by its
  // brackets, and the rule after it is silently skipped.
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selector, body] of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const target = selector.trim();
    if (!target.startsWith(".illuminus-styled")) continue;
    if (/:hover|:focus|::-webkit/.test(target)) continue;
    const stated = restate(target);
    if (!stated) continue;
    const lines = [];
    for (const declaration of body.split(";")) {
      const rewritten = readTwins(declaration.trim(), twinOf);
      if (rewritten === declaration.trim()) continue;
      lines.push(`  ${rewritten};`);
    }
    if (!lines.length) continue;
    out.push(`\n${stated} {\n${lines.join("\n")}\n}\n`);
  }
  return out.join("");
}

/**
 * The contents panel's two lists again, for the entry being read and the
 * heading a reader chose.
 *
 * Only these: everywhere else "selected" means nothing, and a state nothing can
 * enter is a set of controls that does nothing. The lettering rules name the
 * link inside the row rather than the row, so each is restated as that link
 * inside a chosen row — `.toc .page-title` becomes `.toc li.page.active
 * .page-title`, which is how the hand-written Selected rules were already
 * written.
 */
const CHOSEN = [
  [/(\.journal-sidebar \.toc )li\.page(?![-\w.])/g, "$1li.page.active"],
  [/(\.journal-sidebar \.toc )\.page-title/g, "$1li.page.active .page-title"],
  [/(\.journal-sidebar \.toc )li\.heading(?![-\w.])/g, "$1li.heading.illuminus-current"],
  [/(\.journal-sidebar \.toc )\.heading-link/g, "$1li.heading.illuminus-current .heading-link"]
];

/** One selector as it reads for the chosen row, or null where it is not one. */
const chosen = (selector) => {
  if (/\.active|illuminus-current|\.context/.test(selector)) return null;
  const out = selector.split(",").map((one) => {
    const trimmed = one.trim();
    for (const [pattern, replacement] of CHOSEN) {
      const said = trimmed.replace(pattern, replacement);
      if (said !== trimmed) return said;
    }
    return null;
  });
  return out.every(Boolean) ? out.join(",\n") : null;
};

// Lists and tables, the default and its treatments alike: the default is the
// set written for "carries no treatment class", so one template serves both.
const lists = GROUPS.filter((g) => g.family === "listStyles" || g.id === "lists")
  .map(listRules).join("");
const tables = GROUPS.filter((g) => g.family === "tableStyles" || g.id === "tables")
  .map(tableRules).join("");

const ordinary = `${header}${headings}${blocks}${defaultBlock}${pictures}${defaultPicture}${tags}${lists}${tables}${empties}${images}`;
const written = fs.readFileSync(`${ROOT}/styles/illuminus.css`, "utf8");
const hovers = pointedRules(written) + pointedRules(ordinary);
const selected = pointedRules(written, { twinOf: activeTwinOf, selector: chosen })
  + pointedRules(ordinary, { twinOf: activeTwinOf, selector: chosen });
const out = `${ordinary}${hovers}${selected}`;
fs.writeFileSync(`${ROOT}/styles/illuminus-generated.css`, out);
console.log(`wrote styles/illuminus-generated.css — ${out.split("\n").length} lines, `
  + `${GROUPS.filter((g) => g.family).length} groups`);
