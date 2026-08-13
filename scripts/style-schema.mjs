import { CSS_VAR_PREFIX } from "./constants.mjs";

/**
 * The single source of truth for what a journal style can control.
 *
 * Both the settings GUI and the CSS compiler are generated from this table, so
 * adding a control is a one-line change here plus a rule in
 * `styles/illuminus.css` that consumes the emitted custom property.
 *
 * Structure: GROUPS -> sections -> fields. A group is one tab; a section is one
 * collapsible block within that tab. Nothing here ever collapses two CSS
 * properties into one control — each side of a border, each corner of a box,
 * and each component of a shadow is separately addressable.
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
 *   link    Optional grouping key marking this field as one variant of a
 *           repeated property (the four `borderWidth` sides share a link key).
 *           The editor's "Match all sides" button copies the first value in
 *           each link group across its siblings.
 *   emit    Optional (value) => string | Record<suffix, string>. Returning a
 *           record emits several related custom properties from one control.
 *           Suffixes extend the base property name.
 *   zeroAs  For number fields, the CSS to emit when the value is 0.
 *
 * Labels are localized from `ILLUMINUS.Field.<name>.label` / `.hint`, shared
 * across groups so "Top Thickness" reads the same wherever it appears.
 */

const SERIF = "serif";

/** The four sides of a CSS box, in the order the shorthands take them. */
const SIDES = ["Top", "Right", "Bottom", "Left"];

/** The four corners, in border-radius shorthand order. */
const CORNERS = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"];

const CHOICES = {
  align: ["left", "center", "right", "justify"],
  alignNoJustify: ["left", "center", "right"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  fontStyle: ["normal", "italic", "oblique"],
  caps: ["none", "uppercase", "lowercase", "capitalize", "smallCaps"],
  borderStyle: ["none", "solid", "double", "groove", "ridge", "inset", "outset", "dashed", "dotted"],
  lineStyle: ["none", "solid", "double", "dashed", "dotted", "wavy"],
  decorationLine: ["none", "underline", "overline", "lineThrough"],
  bullet: ["disc", "circle", "square", "none", "diamond", "star", "dash", "arrow"],
  numberStyle: ["decimal", "decimalLeadingZero", "lowerAlpha", "upperAlpha",
                "lowerRoman", "upperRoman", "none"],
  blend: ["normal", "multiply", "overlay", "softLight", "hardLight", "screen", "luminosity", "colorBurn"],
  textureFit: ["tile", "cover", "contain", "stretch"],
  texturePosition: ["topLeft", "top", "topRight", "left", "center", "right", "bottomLeft", "bottom", "bottomRight"],
  textureAttachment: ["scroll", "fixed", "local"],
  dropCap: ["none", "two", "three", "four", "five"],
  blockFloat: ["none", "left", "right"],
  blockWidth: ["full", "threeQuarters", "half", "third"],
  blockClear: ["none", "left", "right", "both"],
  flip: ["none", "horizontal", "vertical", "both"],
  verticalAlign: ["top", "middle", "bottom"],
  inlineAlign: ["baseline", "middle", "top", "bottom"],
  textStyle: ["normal", "normalItalic", "bold", "boldItalic", "light", "lightItalic"],
  whenEmpty: ["show", "hide"],
  whiteSpace: ["normal", "preWrap", "nowrap"],
  wordBreak: ["normal", "breakWord", "breakAll"]
};

/* -------------------------------------------- */
/*  Multi-property emitters                     */
/* -------------------------------------------- */

/** Capitalization needs both text-transform and font-variant. */
const emitCaps = (value) => ({
  inherit: { transform: "inherit", variant: "inherit" },
  none: { transform: "none", variant: "normal" },
  uppercase: { transform: "uppercase", variant: "normal" },
  lowercase: { transform: "lowercase", variant: "normal" },
  capitalize: { transform: "capitalize", variant: "normal" },
  smallCaps: { transform: "none", variant: "small-caps" }
}[value] ?? { transform: "none", variant: "normal" });

/** Texture fit maps onto background-size plus background-repeat. */
const emitTextureFit = (value) => ({
  tile: { size: "auto", repeat: "repeat" },
  cover: { size: "cover", repeat: "no-repeat" },
  contain: { size: "contain", repeat: "no-repeat" },
  stretch: { size: "100% 100%", repeat: "no-repeat" }
}[value] ?? { size: "auto", repeat: "repeat" });

/** Nine-point background position. */
const emitTexturePosition = (value) => ({
  topLeft: "left top", top: "center top", topRight: "right top",
  left: "left center", center: "center center", right: "right center",
  bottomLeft: "left bottom", bottom: "center bottom", bottomRight: "right bottom"
}[value] ?? "left top");

/**
 * A drop cap sets float, size, leading, weight, and tint together, or
 * neutralises all of them. The tint indirects through the separate color field
 * so that switching the drop cap off leaves the first letter looking like
 * ordinary body text rather than a stray colored character.
 */
const emitDropCap = (value) => {
  const lines = { two: 2, three: 3, four: 4, five: 5 }[value];
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

/** Block width as a percentage, so floats sit side by side predictably. */
const emitBlockWidth = (value) => ({
  full: "100%", threeQuarters: "75%", half: "50%", third: "33%"
}[value] ?? "100%");

/** Alignment for a picture that is not floated, applied as auto margins. */
const emitPictureAlign = (value) => ({
  left: { left: "0", right: "auto" },
  center: { left: "auto", right: "auto" },
  right: { left: "auto", right: "0" }
}[value] ?? { left: "auto", right: "auto" });

/** Mirroring, which Paizo uses to face an illustration into the page. */
const emitFlip = (value) => ({
  none: "none", horizontal: "scaleX(-1)", vertical: "scaleY(-1)", both: "scale(-1, -1)"
}[value] ?? "none");

/** Bullet glyphs, including decorative options that need quoted strings. */
const emitBullet = (value) => ({
  disc: "disc", circle: "circle", square: "square", none: "none",
  diamond: '"\\2726  "', star: '"\\2605  "', dash: '"\\2014  "', arrow: '"\\27A4  "'
}[value] ?? "disc");

/** Multi-word CSS keywords that differ from their camelCase choice value. */
const KEYWORD = {
  softLight: "soft-light", hardLight: "hard-light", colorBurn: "color-burn",
  lineThrough: "line-through", preWrap: "pre-wrap", breakWord: "break-word", breakAll: "break-all",
  decimalLeadingZero: "decimal-leading-zero", lowerAlpha: "lower-alpha", upperAlpha: "upper-alpha",
  lowerRoman: "lower-roman", upperRoman: "upper-roman"
};
const emitKeyword = (value) => KEYWORD[value] ?? value;

/**
 * Whether a block that has been left empty still takes up room. The rule that
 * reads this only matches an empty one, so "show" has to name the display the
 * block would have had anyway.
 */
const emitWhenEmpty = (value) => (value === "hide" ? "none" : "block");

/**
 * How the lettering looks, as one choice rather than a thickness and a slant
 * side by side. Two controls that are almost always set together read as one
 * decision to anyone who does not think in CSS, which is who the GUI is for.
 * Both properties still come out the other end.
 */
const emitTextStyle = (value) => ({
  inherit: { weight: "inherit", slant: "inherit" },
  normal: { weight: "400", slant: "normal" },
  normalItalic: { weight: "400", slant: "italic" },
  bold: { weight: "700", slant: "normal" },
  boldItalic: { weight: "700", slant: "italic" },
  light: { weight: "300", slant: "normal" },
  lightItalic: { weight: "300", slant: "italic" }
}[value] ?? { weight: "400", slant: "normal" });

/**
 * The single choice standing in for an old thickness-and-slant pair. Callers
 * still pass the two separately as defaults, so every group keeps the look it
 * had before the controls were merged.
 */
function textStyleOf(weight, slant) {
  if (weight === "inherit" || slant === "inherit") return "inherit";
  const heavy = Number(weight ?? 400);
  const base = heavy >= 600 ? "bold" : heavy <= 300 ? "light" : "normal";
  const italic = slant === "italic" || slant === "oblique";
  return italic ? `${base}Italic` : base;
}

/** The same choice list, with "use the setting above" in front. */
const withInherit = () => ["inherit", ...CHOICES.textStyle];

/** One combined lettering control. */
const textStyleField = (name, weight = "400", slant = "normal", { inherit = false } = {}) =>
  select(name, textStyleOf(weight, slant), inherit ? withInherit() : CHOICES.textStyle,
    { emit: emitTextStyle });

/* -------------------------------------------- */
/*  Field builders                              */
/* -------------------------------------------- */

const col = (name, def, opts = {}) => ({ type: "color", name, default: def, ...opts });
const num = (name, def, unit, min, max, step, opts = {}) =>
  ({ type: "number", name, default: def, unit, min, max, step, ...opts });
const select = (name, def, choices, opts = {}) => ({ type: "select", name, default: def, choices, ...opts });
const font = (name, def, opts = {}) => ({ type: "font", name, default: def, fallback: SERIF, ...opts });

/**
 * Twelve fields: width, style, and color for each of the four sides.
 * Default style is `solid` rather than `none` so that raising a thickness
 * produces a visible border without a second trip to the style dropdown.
 */
function borderFields(prefix, { width = 0, style = "solid", color = "#8a6a3d" } = {}) {
  return SIDES.flatMap((side) => [
    num(`${prefix}${side}Width`, width, "px", 0, 40, 1, { link: `${prefix}Width` }),
    select(`${prefix}${side}Style`, style, CHOICES.borderStyle, { link: `${prefix}Style` }),
    col(`${prefix}${side}Color`, color, { link: `${prefix}Color` })
  ]);
}

/** Four fields, one per corner. */
function cornerFields(prefix, radius = 0) {
  return CORNERS.map((corner) => num(`${prefix}${corner}`, radius, "px", 0, 120, 1, { link: prefix }));
}

/**
 * Four fields, one per side. Used for both padding and margin; `values` may be
 * a single number or a per-side object.
 */
function spacingFields(prefix, values = 0, { min = 0, max = 200 } = {}) {
  const at = (side) => (typeof values === "object" ? values[side.toLowerCase()] ?? 0 : values);
  return SIDES.map((side) => num(`${prefix}${side}`, at(side), "px", min, max, 1, { link: prefix }));
}

/** Five fields describing one box shadow. A transparent color means none. */
function shadowFields(prefix, { color = "#00000000", blur = 0, offsetY = 0 } = {}) {
  return [
    num(`${prefix}OffsetX`, 0, "px", -100, 100, 1),
    num(`${prefix}OffsetY`, offsetY, "px", -100, 100, 1),
    num(`${prefix}Blur`, blur, "px", 0, 200, 1),
    num(`${prefix}Spread`, 0, "px", -100, 100, 1),
    col(`${prefix}Color`, color)
  ];
}

/** Four fields describing one text shadow. */
function textShadowFields(prefix = "textShadow") {
  return [
    num(`${prefix}OffsetX`, 0, "px", -40, 40, 1),
    num(`${prefix}OffsetY`, 0, "px", -40, 40, 1),
    num(`${prefix}Blur`, 0, "px", 0, 60, 1),
    col(`${prefix}Color`, "#00000000")
  ];
}

/** The typography set shared by every text-bearing group. */
function textFields(prefix, defaults = {}) {
  const d = (name, fallback) => (name in defaults ? defaults[name] : fallback);
  const n = (suffix) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  return [
    font(n("Font"), d("font", "")),
    num(n("Size"), d("size", 16), "px", 6, 200, 1),
    col(n("Color"), d("color", "#241b10")),
    textStyleField(n("TextStyle"), d("weight", "400"), d("style", "normal")),
    select(n("Caps"), d("caps", "none"), CHOICES.caps, { emit: emitCaps }),
    num(n("LetterSpacing"), d("letterSpacing", 0), "px", -5, 40, 0.5),
    num(n("WordSpacing"), d("wordSpacing", 0), "px", -10, 60, 0.5),
    num(n("LineHeight"), d("lineHeight", 1.4), "", 0.5, 4, 0.05),
    select(n("Align"), d("align", "left"), d("choices", CHOICES.alignNoJustify))
  ];
}

/**
 * One insertable block: a container an author wraps around content.
 *
 * Ten of these exist, named Block01..Block10 and renameable per style. Text and
 * heading settings default to "use the page setting" — an empty color, a size
 * of 0, or an `inherit` choice emits nothing, so the stylesheet's fallback to
 * the page value applies. That keeps a new block from fighting the typography
 * already set up, which matters when ten of them are on offer.
 */
function blockSections() {
  const inheritWeight = ["inherit", ...CHOICES.weight];
  const inheritStyle = ["inherit", ...CHOICES.fontStyle];
  const inheritCaps = ["inherit", ...CHOICES.caps];
  const inheritAlign = ["inherit", ...CHOICES.align];
  return [
    {
      id: "layout",
      fields: [
        select("float", "none", CHOICES.blockFloat),
        select("width", "full", CHOICES.blockWidth, { emit: emitBlockWidth }),
        select("clear", "none", CHOICES.blockClear),
        select("whenEmpty", "show", CHOICES.whenEmpty, { emit: emitWhenEmpty })
      ]
    },
    {
      id: "text",
      fields: [
        font("font", ""),
        num("size", 0, "px", 0, 200, 1, { zeroAs: "inherit" }),
        col("color", ""),
        textStyleField("textStyle", "inherit", "inherit", { inherit: true }),
        select("caps", "inherit", inheritCaps, { emit: emitCaps }),
        num("letterSpacing", 0, "px", -5, 40, 0.5),
        num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" }),
        select("align", "inherit", inheritAlign)
      ]
    },
    {
      id: "blockHeadings",
      fields: [
        font("headingFont", ""),
        num("headingSize", 0, "px", 0, 200, 1, { zeroAs: "inherit" }),
        col("headingColor", ""),
        textStyleField("headingTextStyle", "inherit", "inherit", { inherit: true }),
        select("headingCaps", "inherit", inheritCaps, { emit: emitCaps }),
        select("headingAlign", "inherit", inheritAlign),
        num("headingMarginTop", 0, "px", -100, 100, 1),
        num("headingMarginBottom", 0, "px", -100, 100, 1),
        num("headingRuleWidth", 0, "px", 0, 20, 1),
        select("headingRuleStyle", "solid", CHOICES.lineStyle),
        col("headingRuleColor", "#8a6a3d")
      ]
    },
    { id: "background", fields: [col("background", "#00000000"), ...imageFields()] },
    { id: "padding", fields: spacingFields("padding", 10) },
    { id: "margin", fields: spacingFields("margin", { top: 12, right: 0, bottom: 12, left: 0 }, { min: -100 }) },
    { id: "border", fields: borderFields("border", { color: "#8a6a3d" }) },
    { id: "corners", fields: cornerFields("corner") },
    { id: "shadow", fields: shadowFields("shadow") }
  ];
}

/**
 * A background image for one fill color, so anywhere a color can be set a
 * picture can be laid over it. Named `<prefix>Texture` to match the two that
 * already existed, which keeps `cssVarFor` and the generated layers uniform.
 */
function imageFields(prefix = "") {
  const n = (suffix) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  return [
    { type: "image", name: n("Texture"), default: "" },
    select(n("TextureFit"), "cover", CHOICES.textureFit, { emit: emitTextureFit }),
    select(n("TexturePosition"), "center", CHOICES.texturePosition, { emit: emitTexturePosition }),
    select(n("TextureBlend"), "normal", CHOICES.blend, { emit: emitKeyword }),
    num(n("TextureOpacity"), 100, "%", 0, 100, 1)
  ];
}

/**
 * One inline treatment: applied to a run of words rather than to a block.
 *
 * This is what a trait tag, a rarity badge, or the level on the right of a
 * statblock title is made of. Ten exist, named Tag01..Tag10 and renameable per
 * style, and they ride on the editor's `span` mark, which carries classes
 * through a save exactly as `blockquote` does for a block.
 *
 * Two decisions are load-bearing and not obvious. A tag is laid out as an
 * inline block, because vertical padding on a true inline box spills over the
 * lines above and below instead of growing its own; that is why Paizo's trait
 * tags are list items in a flex row rather than spans. And "push right" is a
 * float, so a title line needs no cooperation from the heading around it —
 * `<h2>Sewer Haze <span>Disease 7</span></h2>` splits on its own.
 *
 * Type settings mean "use the surrounding text" by default, as they do for a
 * block: a size of 0, an `inherit` choice, or an empty color emits nothing.
 */
function tagSections() {
  return [
    {
      id: "tagLayout",
      fields: [
        select("float", "none", CHOICES.blockFloat),
        select("verticalAlign", "baseline", CHOICES.inlineAlign),
        num("lift", 0, "px", -30, 30, 1),
        num("minWidth", 0, "px", 0, 400, 1, { zeroAs: "auto" })
      ]
    },
    {
      id: "text",
      fields: [
        font("font", ""),
        num("size", 0, "px", 0, 200, 1, { zeroAs: "inherit" }),
        col("color", ""),
        textStyleField("textStyle", "inherit", "inherit", { inherit: true }),
        select("caps", "inherit", ["inherit", ...CHOICES.caps], { emit: emitCaps }),
        num("letterSpacing", 0, "px", -5, 40, 0.5),
        num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" })
      ]
    },
    { id: "background", fields: [col("background", "#00000000")] },
    { id: "texture", fields: imageFields() },
    { id: "padding", fields: spacingFields("padding", { top: 2, right: 8, bottom: 2, left: 8 }, { max: 80 }) },
    { id: "margin", fields: spacingFields("margin", { top: 0, right: 4, bottom: 0, left: 0 }, { min: -60, max: 80 }) },
    { id: "border", fields: borderFields("border") },
    { id: "corners", fields: cornerFields("corner") },
    { id: "shadow", fields: shadowFields("shadow") }
  ];
}

/**
 * One picture treatment: applied to a single image to diverge from the
 * page-wide Pictures settings. Ten of these exist, renameable per style.
 */
function pictureSections() {
  return [
    {
      id: "layout",
      fields: [
        select("float", "none", CHOICES.blockFloat),
        select("width", "full", CHOICES.blockWidth, { emit: emitBlockWidth }),
        select("align", "center", CHOICES.alignNoJustify, { emit: emitPictureAlign }),
        select("clear", "none", CHOICES.blockClear),
        select("flip", "none", CHOICES.flip, { emit: emitFlip }),
        num("opacity", 100, "%", 0, 100, 1)
      ]
    },
    { id: "background", fields: [col("background", "#00000000"), ...imageFields()] },
    { id: "padding", fields: spacingFields("padding", 0, { max: 80 }) },
    {
      id: "margin",
      fields: [
        num("marginTop", 8, "px", -100, 200, 1),
        num("marginBottom", 8, "px", -100, 200, 1)
      ]
    },
    { id: "border", fields: borderFields("border") },
    { id: "corners", fields: cornerFields("corner") },
    { id: "shadow", fields: shadowFields("shadow") },
    {
      id: "caption",
      fields: [
        font("captionFont", ""),
        num("captionSize", 0, "px", 0, 100, 1, { zeroAs: "inherit" }),
        col("captionColor", ""),
        textStyleField("captionTextStyle", "inherit", "inherit", { inherit: true }),
        select("captionAlign", "inherit", ["inherit", ...CHOICES.align]),
        num("captionSpacing", 4, "px", 0, 60, 1)
      ]
    }
  ];
}

/** The section set shared by heading levels and the journal title. */
function bannerSections(defaults = {}) {
  return [
    { id: "text", fields: textFields("", defaults) },
    { id: "textShadow", fields: textShadowFields() },
    { id: "margin", fields: spacingFields("margin", defaults.margin ?? 0, { min: -100 }) },
    { id: "padding", fields: spacingFields("padding", defaults.padding ?? 0) },
    { id: "background", fields: [col("background", defaults.background ?? "#00000000"), ...imageFields()] },
    { id: "border", fields: borderFields("border", defaults.border) },
    { id: "corners", fields: cornerFields("corner") }
  ];
}

/* -------------------------------------------- */
/*  Groups (one tab each)                       */
/* -------------------------------------------- */

/** @type {Array<{id: string, icon: string, sections: Array<{id: string, fields: object[]}>}>} */
export const GROUPS = [
{
    id: "window",
    icon: "fa-solid fa-window-maximize",
    // Styles the frame rather than anything on the page, so its tab sits at the
    // end of the strip. Its position in this list is unaffected.
    strip: "end",
    sections: [
      {
        id: "frame",
        fields: [
          col("background", "#00000000"), ...imageFields(),
          ...borderFields("border", { color: "#00000000" }),
          ...cornerFields("corner")
        ]
      },
      {
        id: "titleBar",
        fields: [
          col("titleBarBackground", "#00000000"), ...imageFields("titleBar"),
          font("font", ""),
          num("size", 16, "px", 6, 60, 1),
          col("color", "#f7f3e8"),
          textStyleField("textStyle", "700", "normal"),
          select("caps", "none", CHOICES.caps, { emit: emitCaps }),
          num("letterSpacing", 0, "px", -5, 40, 0.5),
          select("align", "left", CHOICES.alignNoJustify),
          ...spacingFields("padding", 0, { max: 60 })
        ]
      },
      {
        id: "headerButtons",
        fields: [
          col("headerButtonColor", "#f7f3e8"),
          col("headerButtonHoverColor", "#ffffff"),
          col("headerButtonBackground", "#00000000"), ...imageFields("headerButton"),
          col("headerButtonHoverBackground", "#00000000"), ...imageFields("headerButtonHover"),
          num("headerButtonSize", 14, "px", 6, 48, 1),
          ...borderFields("headerButtonBorder", { color: "#00000000" }),
          ...cornerFields("headerButtonCorner", 3)
        ]
      },
      {
        id: "pageButton",
        fields: [
          col("pageButtonColor", "#e7d1b1"),
          col("pageButtonHoverColor", "#ffffff"),
          col("pageButtonBackground", "#0b0a1380"), ...imageFields("pageButton"),
          col("pageButtonHoverBackground", "#0b0a13cc"), ...imageFields("pageButtonHover"),
          num("pageButtonSize", 14, "px", 6, 48, 1),
          ...borderFields("pageButtonBorder", { width: 1, color: "#9f8475" }),
          ...cornerFields("pageButtonCorner", 3)
        ]
      }
    ]
  },

    {
    id: "page",
    icon: "fa-solid fa-scroll",
    sections: [
      {
        id: "surface",
        fields: [
          col("background", "#ede0c8"),
          { type: "image", name: "texture", default: "" },
          select("textureFit", "tile", CHOICES.textureFit, { emit: emitTextureFit }),
          select("texturePosition", "topLeft", CHOICES.texturePosition, { emit: emitTexturePosition }),
          select("textureAttachment", "scroll", CHOICES.textureAttachment),
          select("textureBlend", "multiply", CHOICES.blend, { emit: emitKeyword }),
          num("textureOpacity", 100, "%", 0, 100, 1)
        ]
      },
      { id: "layout", fields: [num("maxWidth", 0, "px", 0, 2000, 10, { zeroAs: "none" })] },
      { id: "padding", fields: spacingFields("padding", 24) },
      { id: "border", fields: borderFields("border") },
      { id: "corners", fields: cornerFields("corner") },
      { id: "shadow", fields: shadowFields("shadow") },
      { id: "innerShadow", fields: shadowFields("innerShadow") }
    ]
  },

  {
    id: "sidebar",
    icon: "fa-solid fa-list-tree",
    sections: [
      {
        id: "surface",
        fields: [
          col("background", "#00000000"), ...imageFields(),
          num("sidebarWidth", 300, "px", 120, 700, 10),
          ...spacingFields("padding", 0, { max: 80 })
        ]
      },
      { id: "border", fields: borderFields("border", { color: "#00000000" }) },
      { id: "corners", fields: cornerFields("corner") },
      {
        id: "entries",
        fields: [
          ...textFields("", { size: 14, color: "#f0f0e0", weight: "400", lineHeight: 2.3 }),
          ...spacingFields("entryPadding", 0, { max: 60 })
        ]
      },
      { id: "entryBorder", fields: borderFields("entryBorder", { color: "#00000000" }) },
      {
        id: "entryStates",
        fields: [
          col("hoverColor", "#ffffff"),
          col("hoverBackground", "#00000000"), ...imageFields("hover"),
          col("activeColor", "#ffffff"),
          col("activeBackground", "#00000000"), ...imageFields("active"),
          col("activeAccentColor", "#c9a961"),
          num("activeAccentWidth", 0, "px", 0, 20, 1),
          textStyleField("activeTextStyle", "400", "normal")
        ]
      },
      {
        id: "number",
        fields: [
          col("numberColor", "#8a8a8a"),
          num("numberSize", 14, "px", 6, 60, 1),
          textStyleField("numberTextStyle", "400", "normal"),
          select("numberAlign", "center", CHOICES.alignNoJustify),
          num("numberWidth", 40, "px", 0, 120, 2)
        ]
      },
      {
        id: "subHeadings",
        fields: [
          font("headingFont", ""),
          num("headingSize", 14, "px", 6, 60, 1),
          col("headingColor", "#c8c8b8"),
          textStyleField("headingTextStyle", "400", "normal"),
          col("headingHoverColor", "#ffffff"),
          num("headingIndent", 16, "px", 0, 120, 2),
          num("headingLineHeight", 2.3, "", 0.5, 5, 0.05)
        ]
      },
      {
        id: "category",
        fields: [
          font("categoryFont", ""),
          num("categorySize", 24, "px", 6, 80, 1),
          col("categoryColor", "#f0f0e0"),
          textStyleField("categoryTextStyle", "700", "normal"),
          select("categoryCaps", "uppercase", CHOICES.caps, { emit: emitCaps }),
          num("categoryLetterSpacing", 1, "px", -5, 40, 0.5),
          select("categoryAlign", "center", CHOICES.alignNoJustify),
          col("categoryBackground", "#00000000"), ...imageFields("category")
        ]
      },
      {
        id: "search",
        fields: [
          col("searchBackground", "#00000000"), ...imageFields("search"),
          col("searchColor", "#f0f0e0"),
          col("searchPlaceholderColor", "#8a8a8a"),
          num("searchSize", 14, "px", 6, 40, 1),
          ...borderFields("searchBorder", { color: "#00000000" }),
          ...cornerFields("searchCorner", 3)
        ]
      },
      {
        id: "buttons",
        fields: [
          col("buttonColor", "#f0f0e0"),
          col("buttonBackground", "#00000000"), ...imageFields("button"),
          col("buttonBorderColor", "#8a8a8a"),
          col("buttonHoverColor", "#ffffff"),
          col("buttonHoverBackground", "#00000000"), ...imageFields("buttonHover"),
          col("buttonHoverBorderColor", "#c9a961"),
          num("buttonBorderWidth", 1, "px", 0, 12, 1),
          ...cornerFields("buttonCorner", 3)
        ]
      }
    ]
  },

  {
    id: "title",
    icon: "fa-solid fa-signature",
    sections: bannerSections({
      size: 36, color: "#3b2412", weight: "700", align: "center", lineHeight: 1.2
    })
  },

  {
    id: "heading1",
    icon: "fa-solid fa-heading",
    sections: bannerSections({
      size: 28, color: "#5e1914", weight: "700", lineHeight: 1.2, margin: { top: 16, bottom: 8 }
    })
  },
  {
    id: "heading2",
    icon: "fa-solid fa-heading",
    sections: bannerSections({
      size: 22, color: "#7a3b16", weight: "700", lineHeight: 1.25, margin: { top: 16, bottom: 8 }
    })
  },
  {
    id: "heading3",
    icon: "fa-solid fa-heading",
    sections: bannerSections({
      size: 18, color: "#5a4326", weight: "700", style: "italic", lineHeight: 1.3,
      margin: { top: 14, bottom: 6 }
    })
  },

  // Levels 4 to 6 carried on looking like level 3 until they got tabs of their
  // own. Their defaults continue the same progression, so a style written
  // before they existed keeps the look it had.
  {
    id: "heading4",
    icon: "fa-solid fa-heading",
    sections: bannerSections({
      size: 16, color: "#5a4326", weight: "700", lineHeight: 1.3,
      margin: { top: 12, bottom: 5 }
    })
  },
  {
    id: "heading5",
    icon: "fa-solid fa-heading",
    sections: bannerSections({
      size: 15, color: "#5a4326", weight: "600", caps: "smallCaps", lineHeight: 1.3,
      margin: { top: 12, bottom: 4 }
    })
  },
  {
    id: "heading6",
    icon: "fa-solid fa-heading",
    sections: bannerSections({
      size: 14, color: "#6b5636", weight: "600", style: "italic", lineHeight: 1.3,
      margin: { top: 10, bottom: 4 }
    })
  },

  {
    id: "body",
    icon: "fa-solid fa-paragraph",
    sections: [
      {
        id: "text",
        fields: textFields("", { size: 16, color: "#241b10", lineHeight: 1.5, choices: CHOICES.align })
      },
      {
        id: "paragraph",
        fields: [
          ...spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 }),
          num("firstLineIndent", 0, "px", -100, 200, 2),
          select("whiteSpace", "normal", CHOICES.whiteSpace, { emit: emitKeyword }),
          select("wordBreak", "normal", CHOICES.wordBreak, { emit: emitKeyword })
        ]
      },
      {
        id: "columns",
        fields: [
          num("columnCount", 1, "", 1, 4, 1),
          num("columnGap", 32, "px", 0, 200, 2),
          num("columnRuleWidth", 0, "px", 0, 20, 1),
          select("columnRuleStyle", "solid", CHOICES.borderStyle),
          col("columnRuleColor", "#8a6a3d")
        ]
      },
      {
        id: "dropCap",
        fields: [
          select("dropCap", "none", CHOICES.dropCap, { emit: emitDropCap }),
          font("dropCapFont", ""),
          col("dropCapColor", "#7a2010")
        ]
      },
      {
        id: "dividers",
        fields: [
          num("dividerWidth", 1, "px", 0, 40, 1),
          select("dividerStyle", "solid", CHOICES.borderStyle),
          col("dividerColor", "#8a6a3d"),
          num("dividerLength", 100, "%", 5, 100, 1),
          select("dividerAlign", "center", CHOICES.alignNoJustify, { emit: emitPictureAlign }),
          num("dividerMarginTop", 12, "px", -100, 200, 1),
          num("dividerMarginBottom", 12, "px", -100, 200, 1)
        ]
      }
    ]
  },

  {
    id: "links",
    icon: "fa-solid fa-link",
    sections: [
      {
        id: "text",
        fields: [
          col("color", "#7a2010"),
          col("hoverColor", "#a8341c"),
          textStyleField("textStyle", "400", "normal"),
          num("letterSpacing", 0, "px", -5, 40, 0.5)
        ]
      },
      {
        id: "decoration",
        fields: [
          select("decorationLine", "underline", CHOICES.decorationLine, { emit: emitKeyword }),
          select("decorationStyle", "solid", CHOICES.lineStyle),
          col("decorationColor", "#7a2010"),
          num("decorationThickness", 1, "px", 0, 12, 0.5),
          num("decorationOffset", 2, "px", -10, 20, 0.5)
        ]
      },
      { id: "chip", fields: [col("background", "#00000000"), ...imageFields(), ...spacingFields("padding", 0, { max: 40 })] },
      { id: "border", fields: borderFields("border", { color: "#00000000" }) },
      { id: "corners", fields: cornerFields("corner", 3) }
    ]
  },

  {
    id: "lists",
    icon: "fa-solid fa-list-ul",
    sections: [
      {
        id: "marker",
        fields: [
          select("bullet", "disc", CHOICES.bullet, { emit: emitBullet }),
        select("numberStyle", "decimal", CHOICES.numberStyle, { emit: emitKeyword }),
        num("markerSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("markerColor", "#7a2010"),
          font("markerFont", "")
        ]
      },
      {
        id: "layout",
        fields: [
          num("indent", 24, "px", 0, 200, 2),
          num("itemSpacing", 4, "px", 0, 60, 1),
          ...spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 })
        ]
      }
    ]
  },

  {
    id: "tables",
    icon: "fa-solid fa-table",
    sections: [
      {
        id: "text",
        fields: [
          font("font", ""),
          num("size", 16, "px", 6, 100, 1),
          col("textColor", "#241b10"),
          num("lineHeight", 1.4, "", 0.5, 4, 0.05),
          select("align", "left", CHOICES.align),
          select("verticalAlign", "middle", CHOICES.verticalAlign),
          num("width", 100, "%", 10, 100, 1)
        ]
      },
      {
        id: "header",
        fields: [
          col("headerBackground", "#5e1914"), ...imageFields("header"),
          col("headerColor", "#f6efe0"),
          font("headerFont", ""),
          num("headerSize", 16, "px", 6, 100, 1),
          textStyleField("headerTextStyle", "700", "normal"),
          select("headerCaps", "none", CHOICES.caps, { emit: emitCaps }),
          select("headerAlign", "left", CHOICES.align),
          num("headerLetterSpacing", 0, "px", -5, 40, 0.5)
        ]
      },
      { id: "rows", fields: [col("stripeColor", "#00000010"), col("rowColor", "#00000000")] },
      { id: "cellPadding", fields: spacingFields("cellPadding", { top: 4, right: 8, bottom: 4, left: 8 }, { max: 80 }) },
      { id: "cellBorder", fields: borderFields("cellBorder", { width: 1 }) },
      { id: "border", fields: borderFields("border", { width: 1 }) },
      { id: "corners", fields: cornerFields("corner") },
      { id: "margin", fields: spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 }) }
    ]
  },

  {
    id: "boxes",
    icon: "fa-solid fa-comment-dots",
    sections: [
      {
        id: "text",
        fields: textFields("", {
          size: 16, color: "#241b10", style: "italic", lineHeight: 1.5, choices: CHOICES.align
        })
      },
      { id: "background", fields: [col("background", "#e3d3ad"), ...imageFields()] },
      { id: "padding", fields: spacingFields("padding", 12) },
      { id: "margin", fields: spacingFields("margin", 12, { min: -100 }) },
      {
        id: "border",
        // Left-only by default: the classic read-aloud accent bar.
        fields: borderFields("border", { color: "#7a2010" }).map((field) =>
          field.name === "borderLeftWidth" ? { ...field, default: 4 } : field)
      },
      { id: "corners", fields: cornerFields("corner", 2) },
      { id: "shadow", fields: shadowFields("shadow") }
    ]
  },

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `block${String(i + 1).padStart(2, "0")}`,
    icon: "fa-solid fa-square-dashed",
    family: "blocks",
    sections: blockSections()
  })),

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `picture${String(i + 1).padStart(2, "0")}`,
    icon: "fa-solid fa-image",
    family: "pictures",
    sections: pictureSections()
  })),

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `tag${String(i + 1).padStart(2, "0")}`,
    icon: "fa-solid fa-tag",
    family: "tags",
    sections: tagSections()
  })),

  {
    id: "images",
    icon: "fa-solid fa-image",
    sections: [
      {
        id: "layout",
        fields: [
          num("maxWidth", 100, "%", 5, 100, 1),
          num("opacity", 100, "%", 0, 100, 1),
          ...spacingFields("margin", 0, { min: -100 })
        ]
      },
      { id: "padding", fields: spacingFields("padding", 0, { max: 80 }) },
      { id: "background", fields: [col("background", "#00000000")] },
      { id: "border", fields: borderFields("border") },
      { id: "corners", fields: cornerFields("corner") },
      { id: "shadow", fields: shadowFields("shadow") },
      {
        id: "caption",
        fields: [
          font("captionFont", ""),
          num("captionSize", 13, "px", 6, 100, 1),
          col("captionColor", "#5a4326"),
          textStyleField("captionTextStyle", "400", "italic"),
          select("captionCaps", "none", CHOICES.caps, { emit: emitCaps }),
          select("captionAlign", "center", CHOICES.alignNoJustify),
          num("captionSpacing", 4, "px", 0, 60, 1)
        ]
      }
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
 * The custom property a field emits, e.g. `--ill-page-border-top-width`.
 * @param {string} groupId
 * @param {object} field
 * @param {string} [suffix]  Extra segment for fields that emit several properties.
 */
export function cssVarFor(groupId, field, suffix = "") {
  const base = `${CSS_VAR_PREFIX}-${kebab(groupId)}-${kebab(field.name)}`;
  return suffix ? `${base}-${kebab(suffix)}` : base;
}

/** The dot path a field occupies in style data, e.g. `page.borderTopWidth`. */
export function pathFor(groupId, field) {
  return `${groupId}.${field.name}`;
}

/** Every field in a group, flattened across its sections. */
export function groupFields(group) {
  return group.sections.flatMap((section) => section.fields);
}

/** Every field in the schema, paired with its group and section. */
export function allFields() {
  return GROUPS.flatMap((group) =>
    group.sections.flatMap((section) =>
      section.fields.map((field) => ({ group, section, field }))));
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
      const asString = String(value);
      if (!field.choices.includes(asString)) continue;
      coerced = asString;
    } else {
      coerced = String(value);
    }
    clean[group.id] ??= {};
    clean[group.id][field.name] = coerced;
  }
  return clean;
}
