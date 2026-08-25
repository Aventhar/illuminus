import { SCHEMA_VERSION, log } from "./constants.mjs";

/**
 * Forward migration of stored style data.
 *
 * `cleanSettings` discards anything it does not recognize, so a style saved
 * under an older schema would silently lose every renamed property. Migrations
 * run before that filter and translate old keys into their modern equivalents.
 *
 * Each migration takes the settings object for one style and returns a new one.
 * They are applied in order for every version between the stored one and
 * SCHEMA_VERSION, so a version 1 style loaded today passes through all of them.
 */

const SIDES = ["Top", "Right", "Bottom", "Left"];
const CORNERS = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"];

/** Set a value on every side of a box property. */
function spread(target, prefix, suffix, value) {
  if (value === undefined) return;
  for (const side of SIDES) target[`${prefix}${side}${suffix}`] = value;
}

/** Set a value on every corner. */
function spreadCorners(target, prefix, value) {
  if (value === undefined) return;
  for (const corner of CORNERS) target[`${prefix}${corner}`] = value;
}

/** Move a key, dropping the old name. */
function rename(target, from, to) {
  if (target[from] === undefined) return;
  target[to] = target[from];
  delete target[from];
}

/** v1 offered only normal/bold; v2 uses numeric CSS weights. */
const WEIGHT = { normal: "400", bold: "700" };

/**
 * Version 1 -> 2.
 *
 * Every compound property was split so each side, corner, and shadow component
 * is separately addressable: one border control became twelve, one corner
 * radius became four, on/off shadows became full offset/blur/spread/color sets,
 * and normal/bold became the nine numeric weights.
 */
function v1_to_v2(settings) {
  const out = foundry.utils.deepClone(settings ?? {});

  for (const [groupId, group] of Object.entries(out)) {
    if (!group || typeof group !== "object") continue;

    // Borders, corners, and box spacing, wherever they appeared.
    spread(group, "border", "Width", group.borderWidth);
    spread(group, "border", "Style", group.borderStyle);
    spread(group, "border", "Color", group.borderColor);
    delete group.borderWidth; delete group.borderStyle; delete group.borderColor;

    spreadCorners(group, "corner", group.radius);
    delete group.radius;

    if (group.padding !== undefined) { spread(group, "padding", "", group.padding); delete group.padding; }
    if (group.paddingX !== undefined) {
      group.paddingLeft = group.paddingRight = group.paddingX;
      delete group.paddingX;
    }
    if (group.paddingY !== undefined) {
      group.paddingTop = group.paddingBottom = group.paddingY;
      delete group.paddingY;
    }

    // Numeric font weights.
    for (const key of ["weight", "headerWeight", "captionWeight"]) {
      if (WEIGHT[group[key]]) group[key] = WEIGHT[group[key]];
    }

    // Headings expressed their surrounding gaps as spaceAbove/spaceBelow, and
    // their underline as a separate "rule" rather than a bottom border.
    rename(group, "spaceAbove", "marginTop");
    rename(group, "spaceBelow", "marginBottom");
    rename(group, "ruleStyle", "borderBottomStyle");
    rename(group, "ruleColor", "borderBottomColor");
    rename(group, "ruleWidth", "borderBottomWidth");

    // Group-specific moves.
    if (groupId === "page" && group.innerShadow) {
      Object.assign(group, {
        innerShadowOffsetX: 0, innerShadowOffsetY: 0, innerShadowBlur: 40,
        innerShadowSpread: 0, innerShadowColor: "#50321459"
      });
    }
    delete group.innerShadow;

    if ((groupId === "title") && group.shadow) {
      Object.assign(group, { textShadowOffsetX: 0, textShadowOffsetY: 1, textShadowBlur: 2, textShadowColor: "#00000059" });
    }
    if (groupId === "images" && group.shadow) {
      Object.assign(group, { shadowOffsetX: 0, shadowOffsetY: 2, shadowBlur: 8, shadowSpread: 0, shadowColor: "#00000059" });
    }
    if (typeof group.shadow === "boolean") delete group.shadow;

    if (groupId === "body") rename(group, "paragraphSpacing", "marginBottom");

    if (groupId === "links") {
      if ("underline" in group) {
        group.decorationLine = group.underline ? "underline" : "none";
        delete group.underline;
      }
      rename(group, "chipBackground", "background");
      spread(group, "border", "Color", group.chipBorderColor);
      delete group.chipBorderColor;
      spreadCorners(group, "corner", group.chipRadius);
      delete group.chipRadius;
    }

    if (groupId === "tables") {
      if (group.cellPaddingX !== undefined) {
        group.cellPaddingLeft = group.cellPaddingRight = group.cellPaddingX;
        delete group.cellPaddingX;
      }
      if (group.cellPaddingY !== undefined) {
        group.cellPaddingTop = group.cellPaddingBottom = group.cellPaddingY;
        delete group.cellPaddingY;
      }
      // v1 drew one grid line for both the outer frame and the cells.
      spread(group, "cellBorder", "Width", group.borderTopWidth);
      spread(group, "cellBorder", "Style", group.borderTopStyle);
      spread(group, "cellBorder", "Color", group.borderTopColor);
    }

    if (groupId === "boxes") {
      rename(group, "textColor", "color");
      rename(group, "spacing", "marginTop");
      if (group.marginTop !== undefined) {
        group.marginBottom = group.marginTop;
        group.marginLeft = group.marginRight = 0;
      }
      // "Which edges are marked" chose which sides got the single border width.
      if ("edge" in group) {
        const width = group.borderTopWidth ?? 4;
        const on = {
          all: ["Top", "Right", "Bottom", "Left"],
          left: ["Left"],
          topBottom: ["Top", "Bottom"],
          none: []
        }[group.edge] ?? ["Left"];
        for (const side of SIDES) group[`border${side}Width`] = on.includes(side) ? width : 0;
        delete group.edge;
      }
    }
  }

  return out;
}

/**
 * Version 2 -> 3.
 *
 * Thickness and Slant were two controls that are almost always set together, so
 * they became one Text Style choice naming a weight and a slant together. Every
 * numeric weight has a name, so nothing is lost: 800 becomes Extra Bold, 200
 * Extra Light.
 */
const TEXT_STYLE_PAIRS = [
  ["weight", "style", "textStyle"],
  ["headingWeight", "headingStyle", "headingTextStyle"],
  ["captionWeight", "captionStyle", "captionTextStyle"],
  ["activeWeight", null, "activeTextStyle"],
  ["numberWeight", null, "numberTextStyle"],
  ["categoryWeight", null, "categoryTextStyle"],
  ["headerWeight", null, "headerTextStyle"]
];

/** Every CSS weight has a name in the combined control, so none is lost. */
const WEIGHT_NAME = {
  100: "thin", 200: "extraLight", 300: "light", 400: "normal", 500: "medium",
  600: "semiBold", 700: "bold", 800: "extraBold", 900: "black"
};

/** The combined choice standing for an old thickness and slant. */
function combineTextStyle(weight, slant) {
  if (weight === undefined && slant === undefined) return undefined;
  if (weight === "inherit" || slant === "inherit") {
    // One half inheriting and the other not cannot be expressed any more; the
    // half that was set is the one the author chose deliberately.
    if (weight === "inherit" && (slant === "inherit" || slant === undefined)) return "inherit";
    if (slant === "inherit" && weight === undefined) return "inherit";
  }
  const base = WEIGHT_NAME[Number(weight === "inherit" ? 400 : weight ?? 400)] ?? "normal";
  const italic = slant === "italic" || slant === "oblique";
  return italic ? `${base}Italic` : base;
}

function v2_to_v3(settings) {
  const out = foundry.utils.deepClone(settings ?? {});
  for (const group of Object.values(out)) {
    if (!group || typeof group !== "object") continue;
    for (const [weightKey, slantKey, combined] of TEXT_STYLE_PAIRS) {
      const weight = group[weightKey];
      const slant = slantKey ? group[slantKey] : undefined;
      const value = combineTextStyle(weight, slant);
      if (value !== undefined) group[combined] = value;
      delete group[weightKey];
      if (slantKey) delete group[slantKey];
    }
  }
  return out;
}

/**
 * Version 3 -> 4.
 *
 * The GUI calls them boxes and image styles, so the data does too: `block01`
 * became `box01` and `picture01` became `image01`. The classes written into
 * journal pages changed with them, but the old ones keep working — the
 * stylesheet matches both, because pages already saved cannot be rewritten.
 */
const GROUP_RENAMES = Object.fromEntries([
  ...Array.from({ length: 10 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return [`block${n}`, `box${n}`];
  }),
  ...Array.from({ length: 10 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return [`picture${n}`, `image${n}`];
  })
]);

function v3_to_v4(settings) {
  const out = {};
  for (const [groupId, group] of Object.entries(settings ?? {})) {
    out[GROUP_RENAMES[groupId] ?? groupId] = group;
  }
  return out;
}

/**
 * Version 4 -> 5.
 *
 * Columns moved from Body, where one setting columned a whole page, onto each
 * heading level: a chapter can now run wide and the section beneath it set in
 * two. A style that columned its pages keeps doing so — the old setting is
 * copied to every level, and the text above the first heading follows level 1,
 * which is the level the page's own title is.
 */
const COLUMN_KEYS = ["columnCount", "columnGap", "columnRuleWidth", "columnRuleStyle", "columnRuleColor"];

function v4_to_v5(settings) {
  const out = foundry.utils.deepClone(settings ?? {});
  const body = out.body;
  if (!body) return out;
  const columns = Object.fromEntries(
    COLUMN_KEYS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  for (const key of COLUMN_KEYS) delete body[key];
  if (!Object.keys(columns).length) return out;

  for (const groupId of ["heading1", "heading2", "heading3", "heading4", "heading5", "heading6"]) {
    out[groupId] = { ...columns, ...(out[groupId] ?? {}) };
  }
  return out;
}

/**
 * Version 5 -> 6.
 *
 * The contents panel's entry, its edges, and its states became one section, and
 * each state gained its own edge colors — which is what the Page Marker was
 * drawing by hand, as an inset shadow down the left of the selected entry. So
 * the marker becomes what it always was: a left edge the entry carries and the
 * selected state colors in.
 */
function v5_to_v6(settings) {
  const out = foundry.utils.deepClone(settings ?? {});
  const sidebar = out.sidebar;
  if (!sidebar) return out;
  const width = Number(sidebar.activeAccentWidth ?? 0);
  const color = sidebar.activeAccentColor;
  delete sidebar.activeAccentWidth;
  delete sidebar.activeAccentColor;
  if (width > 0) {
    sidebar.entryBorderLeftWidth = sidebar.entryBorderLeftWidth ?? width;
    // Transparent while the entry is neither pointed at nor selected, so the
    // line shows where the marker used to and nowhere else.
    sidebar.entryBorderLeftColor = sidebar.entryBorderLeftColor ?? "#00000000";
    if (color) sidebar.activeEntryBorderLeftColor = sidebar.activeEntryBorderLeftColor ?? color;
  }
  return out;
}

/**
 * Version 6 -> 7.
 *
 * The lettering control offered nine thicknesses crossed with italic —
 * eighteen entries in a drop-down, most of which no typeface has. It offers
 * Light, Normal, and Bold, with italic as a tick box beside it. Anything
 * heavier than normal becomes bold and anything lighter becomes light, which is
 * the same rule the nine were collapsed by once before, and the italic half
 * moves to the box.
 */
const TEXT_STYLE_BASE = {
  thin: "light", extraLight: "light", light: "light",
  normal: "normal", medium: "normal", semiBold: "bold",
  bold: "bold", extraBold: "bold", black: "bold"
};

function v6_to_v7(settings) {
  const out = foundry.utils.deepClone(settings ?? {});
  for (const group of Object.values(out)) {
    if (!group || typeof group !== "object") continue;
    for (const [key, value] of Object.entries(group)) {
      if (!/TextStyle$|^textStyle$/.test(key) || typeof value !== "string") continue;
      if (value === "inherit") continue;
      const italic = value.endsWith("Italic");
      const base = italic ? value.slice(0, -"Italic".length) : value;
      group[key] = TEXT_STYLE_BASE[base] ?? "normal";
      if (italic) group[`${key}Slant`] = true;
    }
  }
  return out;
}

/**
 * Version 7 -> 8.
 *
 * A list's hovered colors were written by hand as `hoverMarkerColor` and its
 * kin, before the schema learned to derive a hovered twin for a control that
 * carries a prefix. They are derived now, under the name that convention gives
 * them — the prefix first, the state in the middle.
 */
const HOVER_LIST_RENAMES = {
  hoverMarkerColor: "markerHoverColor",
  hoverTermColor: "termHoverColor",
  hoverDetailColor: "detailHoverColor"
};

function v7_to_v8(settings) {
  const out = foundry.utils.deepClone(settings ?? {});
  const lists = out.lists;
  if (!lists) return out;
  for (const [from, to] of Object.entries(HOVER_LIST_RENAMES)) rename(lists, from, to);
  return out;
}

/**
 * Version 8 -> 9.
 *
 * Two changes to the contents panel. A listed page's own fill and picture were
 * named for the state alone — `hoverBackground`, `activeTexture` — while the
 * panel's own fill is `background` in the same tab, so the pointed-at rule the
 * generator mirrors for the panel read the *entry's* color and painted the whole
 * panel with it. They are named for the entry now.
 *
 * And page numbers became a tick box that starts unticked, so a stored "shown"
 * or "notShown" becomes the answer it stood for.
 */
function v8_to_v9(settings) {
  const out = foundry.utils.deepClone(settings ?? {});
  const sidebar = out.sidebar;
  if (!sidebar) return out;
  for (const [from, to] of [["hoverBackground", "entryHoverBackground"],
    ["activeBackground", "entryActiveBackground"]]) rename(sidebar, from, to);
  for (const part of ["Texture", "TextureFit", "TexturePosition", "TextureBlend", "TextureOpacity"]) {
    rename(sidebar, `hover${part}`, `entryHover${part}`);
    rename(sidebar, `active${part}`, `entryActive${part}`);
  }
  if (typeof sidebar.numberShown === "string") sidebar.numberShown = sidebar.numberShown !== "notShown";
  return out;
}

/** Migrations keyed by the version they upgrade *from*. */
/**
 * Version 9 -> 10.
 *
 * The Edit button's "Follows The Page" became "Hold At The Top", which is the
 * same choice named for what ticking it does: Foundry's button holds its place
 * on screen while the page scrolls under it, and a person watching that says
 * the button is staying put rather than following the page. The answer is
 * therefore inverted along with the name — a style that said "follows" meant
 * "not held".
 */
function v9_to_v10(settings) {
  const out = foundry.utils.deepClone(settings ?? {});
  const window = out.window;
  if (!window || window.pageButtonFollows === undefined) return out;
  window.pageButtonHoldTop = !window.pageButtonFollows;
  delete window.pageButtonFollows;
  return out;
}

const MIGRATIONS = {
  1: v1_to_v2,
  2: v2_to_v3,
  3: v3_to_v4,
  4: v4_to_v5,
  5: v5_to_v6,
  6: v6_to_v7,
  7: v7_to_v8,
  8: v8_to_v9,
  9: v9_to_v10
};

/**
 * Bring a style's settings up to the current schema version.
 * @param {object} settings         The stored settings object.
 * @param {number} [fromVersion=1]  The version the settings were saved under.
 * @returns {object}                Settings expressed in the current schema.
 */
export function migrateSettings(settings, fromVersion = 1) {
  let current = settings ?? {};
  let version = Number.isFinite(fromVersion) ? fromVersion : 1;
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    current = migration(current);
    version += 1;
  }
  return current;
}

/**
 * Migrate a whole style record, leaving its identity untouched.
 * @param {object} style
 * @returns {object}
 */
export function migrateStyle(style) {
  const from = Number(style?.schemaVersion ?? 1);
  if (from >= SCHEMA_VERSION) return style;
  log.debug(`migrating style "${style?.name}" from schema ${from} to ${SCHEMA_VERSION}`);
  return {
    ...style,
    schemaVersion: SCHEMA_VERSION,
    settings: migrateSettings(style?.settings, from),
    // The names a style gives its boxes and image styles are keyed by group id
    // as well, and live outside `settings` — without this they are dropped by
    // `cleanLabels`, which only keeps keys the schema still knows.
    labels: migrateLabels(style?.labels, from)
  };
}

/**
 * Bring a style's per-member names up to the current schema version.
 * @param {object} labels
 * @param {number} [fromVersion=1]
 * @returns {object}
 */
export function migrateLabels(labels, fromVersion = 1) {
  if (!labels || typeof labels !== "object") return labels;
  if (Number(fromVersion) > 3) return labels;
  const out = {};
  for (const [key, value] of Object.entries(labels)) out[GROUP_RENAMES[key] ?? key] = value;
  return out;
}
