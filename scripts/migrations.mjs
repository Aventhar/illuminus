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

/** Migrations keyed by the version they upgrade *from*. */
const MIGRATIONS = {
  1: v1_to_v2,
  2: v2_to_v3,
  3: v3_to_v4
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
