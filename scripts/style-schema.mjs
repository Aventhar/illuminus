import { CSS_VAR_PREFIX } from "./constants.mjs";

/**
 * The single source of truth for what a journal style can control.
 *
 * Both the settings GUI and the CSS compiler are generated from this table, so
 * adding a new control is a one-line change here plus a rule in
 * `styles/illuminus.css` that consumes the emitted custom property.
 *
 * Field contract:
 *   name    Key within its group. Path in the style data is `<group>.<name>`.
 *   type    Drives the GUI widget, value coercion, and the default CSS mapping:
 *             color   a #rrggbb / #rrggbbaa string, emitted verbatim
 *             image   a file path, emitted as url("…") or `none` when blank
 *             font    a font family name, emitted quoted with a fallback stack
 *             number  emitted with `unit` appended
 *             select  one of `choices`, emitted verbatim unless `emit` says otherwise
 *             toggle  emitted as `on` when true and `off` when false
 *   default Value used when a style does not specify this field. Every field
 *           MUST have one — defaults are emitted as a base rule so no var() in
 *           the skeleton stylesheet can ever resolve to nothing.
 *   emit    Optional (value) => string | Record<suffix, string>. Returning a
 *           record emits several related custom properties from one control,
 *           which is how a single natural-language choice like "Drop cap: three
 *           lines" drives float, size, and spacing together. Suffixes extend
 *           the base property name: suffix "size" on field `dropCap` in group
 *           `body` emits `--ill-body-drop-cap-size`.
 *   zeroAs  For number fields, the CSS to emit when the value is 0. Lets "0"
 *           mean "no limit" for things like maximum width.
 *
 * Labels are localized from `ILLUMINUS.Field.<name>.label` / `.hint`, shared
 * across groups so "Font" reads the same wherever it appears.
 */

const SERIF = "serif";

/** Choices reused across several groups. */
const CHOICES = {
  align: ["left", "center", "right", "justify"],
  alignNoJustify: ["left", "center", "right"],
  weight: ["normal", "bold"],
  fontStyle: ["normal", "italic"],
  caps: ["none", "uppercase", "smallCaps"],
  lineStyle: ["none", "solid", "double", "dashed", "dotted"],
  borderStyle: ["none", "solid", "double", "groove", "ridge", "dashed", "dotted"],
  bullet: ["disc", "circle", "square", "none", "diamond", "star"],
  blend: ["normal", "multiply", "overlay", "softLight", "luminosity"],
  textureFit: ["tile", "cover", "contain", "stretch"],
  edge: ["all", "left", "topBottom", "none"],
  dropCap: ["none", "two", "three", "four"]
};

/* -------------------------------------------- */
/*  Multi-property emitters                     */
/* -------------------------------------------- */

/** Capitalisation needs both text-transform and font-variant to be set. */
const emitCaps = (value) => ({
  none: { transform: "none", variant: "normal" },
  uppercase: { transform: "uppercase", variant: "normal" },
  smallCaps: { transform: "none", variant: "small-caps" }
}[value] ?? { transform: "none", variant: "normal" });

/** Texture fit maps onto background-size plus background-repeat. */
const emitTextureFit = (value) => ({
  tile: { size: "auto", repeat: "repeat" },
  cover: { size: "cover", repeat: "no-repeat" },
  contain: { size: "contain", repeat: "no-repeat" },
  stretch: { size: "100% 100%", repeat: "no-repeat" }
}[value] ?? { size: "auto", repeat: "repeat" });

/**
 * Which sides of a boxed-text block get a border, as 0/1 multipliers that the
 * stylesheet multiplies by the chosen border width.
 */
const emitEdge = (value) => {
  const sides = {
    all: [1, 1, 1, 1],
    left: [0, 0, 0, 1],
    topBottom: [1, 0, 1, 0],
    none: [0, 0, 0, 0]
  }[value] ?? [0, 0, 0, 1];
  const [top, right, bottom, left] = sides;
  return { top, right, bottom, left };
};

/**
 * A drop cap sets float, size, leading, and tint together, or neutralises all
 * of them. The tint indirects through the separate colour field so that turning
 * the drop cap off leaves the first letter looking like ordinary body text
 * rather than a stray coloured character.
 */
const emitDropCap = (value) => {
  const lines = { two: 2, three: 3, four: 4 }[value];
  if (!lines) {
    return { float: "none", size: "inherit", "line-height": "inherit", gap: "0", weight: "inherit", tint: "inherit" };
  }
  return {
    float: "left",
    size: `${lines * 0.92}em`,
    "line-height": "0.82",
    gap: "0.08em",
    weight: "bold",
    tint: "var(--ill-body-drop-cap-color)"
  };
};

/** Bullet glyphs, including the decorative options that need quoted strings. */
const emitBullet = (value) => ({
  disc: "disc",
  circle: "circle",
  square: "square",
  none: "none",
  diamond: '"\\2726  "',
  star: '"\\2605  "'
}[value] ?? "disc");

/* -------------------------------------------- */
/*  Field builders                              */
/* -------------------------------------------- */

const color = (name, def, opts = {}) => ({ type: "color", name, default: def, ...opts });
const num = (name, def, unit, min, max, step, opts = {}) =>
  ({ type: "number", name, default: def, unit, min, max, step, ...opts });
const select = (name, def, choices, opts = {}) => ({ type: "select", name, default: def, choices, ...opts });
const toggle = (name, def, on, off, opts = {}) => ({ type: "toggle", name, default: def, on, off, ...opts });
const font = (name, def, opts = {}) => ({ type: "font", name, default: def, fallback: SERIF, ...opts });

/**
 * The shared field set for a heading level. Every heading tab offers the same
 * controls so users learn the panel once.
 * @param {object} defaults  Per-level default overrides, keyed by field name.
 */
function headingFields(defaults = {}) {
  const d = (name, fallback) => (name in defaults ? defaults[name] : fallback);
  return [
    font("font", d("font", "")),
    num("size", d("size", 24), "px", 8, 96, 1),
    color("color", d("color", "#5e1914")),
    select("weight", d("weight", "bold"), CHOICES.weight),
    select("style", d("style", "normal"), CHOICES.fontStyle),
    select("caps", d("caps", "none"), CHOICES.caps, { emit: emitCaps }),
    num("letterSpacing", d("letterSpacing", 0), "px", -2, 12, 0.5),
    select("align", d("align", "left"), CHOICES.alignNoJustify),
    num("spaceAbove", d("spaceAbove", 16), "px", 0, 96, 1),
    num("spaceBelow", d("spaceBelow", 8), "px", 0, 96, 1),
    color("background", d("background", "#00000000")),
    num("paddingX", d("paddingX", 0), "px", 0, 48, 1),
    num("paddingY", d("paddingY", 0), "px", 0, 48, 1),
    num("radius", d("radius", 0), "px", 0, 32, 1),
    select("ruleStyle", d("ruleStyle", "none"), CHOICES.lineStyle),
    color("ruleColor", d("ruleColor", "#8a6a3d")),
    num("ruleWidth", d("ruleWidth", 2), "px", 0, 12, 1)
  ];
}

/* -------------------------------------------- */
/*  Groups (one tab each)                       */
/* -------------------------------------------- */

/** @type {Array<{id: string, icon: string, fields: object[]}>} */
export const GROUPS = [
  {
    id: "page",
    icon: "fa-solid fa-scroll",
    fields: [
      color("background", "#ede0c8"),
      { type: "image", name: "texture", default: "" },
      select("textureFit", "tile", CHOICES.textureFit, { emit: emitTextureFit }),
      select("textureBlend", "multiply", CHOICES.blend, {
        emit: (v) => (v === "softLight" ? "soft-light" : v)
      }),
      num("padding", 24, "px", 0, 120, 2),
      num("maxWidth", 0, "px", 0, 1600, 20, { zeroAs: "none" }),
      color("borderColor", "#8a6a3d"),
      select("borderStyle", "none", CHOICES.borderStyle),
      num("borderWidth", 2, "px", 0, 24, 1),
      num("radius", 0, "px", 0, 48, 1),
      toggle("innerShadow", false, "inset 0 0 40px rgb(80 50 20 / 35%)", "none")
    ]
  },
  {
    id: "title",
    icon: "fa-solid fa-heading",
    fields: [
      font("font", ""),
      num("size", 36, "px", 10, 96, 1),
      color("color", "#3b2412"),
      select("align", "center", CHOICES.alignNoJustify),
      select("weight", "bold", CHOICES.weight),
      select("style", "normal", CHOICES.fontStyle),
      select("caps", "none", CHOICES.caps, { emit: emitCaps }),
      num("letterSpacing", 0, "px", -2, 16, 0.5),
      toggle("shadow", false, "0 1px 2px rgb(0 0 0 / 35%)", "none")
    ]
  },
  { id: "heading1", icon: "fa-solid fa-1", fields: headingFields({ size: 28, color: "#5e1914" }) },
  { id: "heading2", icon: "fa-solid fa-2", fields: headingFields({ size: 22, color: "#7a3b16" }) },
  { id: "heading3", icon: "fa-solid fa-3", fields: headingFields({ size: 18, color: "#5a4326", style: "italic" }) },
  {
    id: "body",
    icon: "fa-solid fa-paragraph",
    fields: [
      font("font", ""),
      num("size", 16, "px", 8, 40, 1),
      color("color", "#241b10"),
      num("lineHeight", 1.5, "", 1, 3, 0.05),
      num("paragraphSpacing", 8, "px", 0, 48, 1),
      num("firstLineIndent", 0, "px", 0, 96, 2),
      select("align", "left", CHOICES.align),
      select("dropCap", "none", CHOICES.dropCap, { emit: emitDropCap }),
      color("dropCapColor", "#7a2010")
    ]
  },
  {
    id: "links",
    icon: "fa-solid fa-link",
    fields: [
      color("color", "#7a2010"),
      color("hoverColor", "#a8341c"),
      toggle("underline", true, "underline", "none"),
      select("weight", "normal", CHOICES.weight),
      color("chipBackground", "#00000000"),
      color("chipBorderColor", "#00000000"),
      num("chipRadius", 3, "px", 0, 16, 1)
    ]
  },
  {
    id: "lists",
    icon: "fa-solid fa-list-ul",
    fields: [
      select("bullet", "disc", CHOICES.bullet, { emit: emitBullet }),
      color("markerColor", "#7a2010"),
      num("indent", 24, "px", 0, 96, 2),
      num("itemSpacing", 4, "px", 0, 32, 1)
    ]
  },
  {
    id: "tables",
    icon: "fa-solid fa-table",
    fields: [
      color("headerBackground", "#5e1914"),
      color("headerColor", "#f6efe0"),
      font("headerFont", ""),
      color("textColor", "#241b10"),
      color("stripeColor", "#00000010"),
      color("borderColor", "#8a6a3d"),
      num("borderWidth", 1, "px", 0, 8, 1),
      num("cellPaddingX", 8, "px", 0, 32, 1),
      num("cellPaddingY", 4, "px", 0, 32, 1),
      num("radius", 0, "px", 0, 24, 1)
    ]
  },
  {
    id: "boxes",
    icon: "fa-solid fa-comment-dots",
    fields: [
      color("background", "#e3d3ad"),
      color("textColor", "#241b10"),
      font("font", ""),
      select("style", "italic", CHOICES.fontStyle),
      select("edge", "left", CHOICES.edge, { emit: emitEdge }),
      color("borderColor", "#7a2010"),
      num("borderWidth", 4, "px", 0, 24, 1),
      num("radius", 2, "px", 0, 32, 1),
      num("padding", 12, "px", 0, 48, 1),
      num("spacing", 12, "px", 0, 48, 1)
    ]
  },
  {
    id: "images",
    icon: "fa-solid fa-image",
    fields: [
      color("borderColor", "#8a6a3d"),
      select("borderStyle", "none", CHOICES.borderStyle),
      num("borderWidth", 2, "px", 0, 16, 1),
      num("radius", 0, "px", 0, 32, 1),
      toggle("shadow", false, "0 2px 8px rgb(0 0 0 / 35%)", "none"),
      color("captionColor", "#5a4326"),
      num("captionSize", 13, "px", 8, 32, 1),
      select("captionStyle", "italic", CHOICES.fontStyle),
      select("captionAlign", "center", CHOICES.alignNoJustify)
    ]
  }
];

/* -------------------------------------------- */
/*  Derived helpers                             */
/* -------------------------------------------- */

/** Convert a camelCase name to the kebab-case used in CSS properties. */
function kebab(name) {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * The custom property a field emits, e.g. `--ill-heading1-rule-color`.
 * @param {string} groupId
 * @param {object} field
 * @param {string} [suffix]  Extra segment for fields that emit several properties.
 */
export function cssVarFor(groupId, field, suffix = "") {
  const base = `${CSS_VAR_PREFIX}-${kebab(groupId)}-${kebab(field.name)}`;
  return suffix ? `${base}-${kebab(suffix)}` : base;
}

/** The dot path a field occupies in style data, e.g. `heading1.ruleColor`. */
export function pathFor(groupId, field) {
  return `${groupId}.${field.name}`;
}

/** Every field in the schema, paired with its group. */
export function allFields() {
  return GROUPS.flatMap((group) => group.fields.map((field) => ({ group, field })));
}

/** A fully-populated settings object containing every schema default. */
export function defaultSettings() {
  const settings = {};
  for (const { group, field } of allFields()) {
    settings[group.id] ??= {};
    settings[group.id][field.name] = field.default;
  }
  return settings;
}

/**
 * Drop any keys that are not in the schema and coerce the rest to the right
 * primitive type. Used on import and when reading the form, so neither a
 * malformed file nor a tampered input can put unknown data into the store.
 * @param {object} settings  Untrusted settings object.
 * @returns {object}         A settings object containing only known fields.
 */
export function cleanSettings(settings) {
  const clean = {};
  if (!settings || typeof settings !== "object") return clean;
  for (const { group, field } of allFields()) {
    const value = settings?.[group.id]?.[field.name];
    if (value === undefined || value === null) continue;
    let coerced = value;
    if (field.type === "number") {
      coerced = Number(value);
      if (!Number.isFinite(coerced)) continue;
      if (field.min !== undefined) coerced = Math.max(field.min, coerced);
      if (field.max !== undefined) coerced = Math.min(field.max, coerced);
    } else if (field.type === "toggle") {
      coerced = Boolean(value);
    } else if (field.type === "select") {
      if (!field.choices.includes(value)) continue;
    } else {
      coerced = String(value);
    }
    clean[group.id] ??= {};
    clean[group.id][field.name] = coerced;
  }
  return clean;
}
