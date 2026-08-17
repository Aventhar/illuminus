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
  // Every CSS weight, each with and without a slant, ordered light to heavy so
  // the list reads as a ramp rather than a pile.
  textStyle: ["thin", "thinItalic", "extraLight", "extraLightItalic", "light", "lightItalic",
              "normal", "normalItalic", "medium", "mediumItalic", "semiBold", "semiBoldItalic",
              "bold", "boldItalic", "extraBold", "extraBoldItalic", "black", "blackItalic"],
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

/** Mirroring, used to face an illustration into the page. */
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
const TEXT_STYLE_WEIGHT = {
  thin: "100", extraLight: "200", light: "300", normal: "400", medium: "500",
  semiBold: "600", bold: "700", extraBold: "800", black: "900"
};

const emitTextStyle = (value) => {
  if (value === "inherit") return { weight: "inherit", slant: "inherit" };
  const italic = String(value).endsWith("Italic");
  const base = italic ? String(value).slice(0, -"Italic".length) : String(value);
  return { weight: TEXT_STYLE_WEIGHT[base] ?? "400", slant: italic ? "italic" : "normal" };
};

/**
 * The single choice standing in for an old thickness-and-slant pair. Callers
 * still pass the two separately as defaults, so every group keeps the look it
 * had before the controls were merged.
 */
function textStyleOf(weight, slant) {
  if (weight === "inherit" || slant === "inherit") return "inherit";
  const base = Object.keys(TEXT_STYLE_WEIGHT).find((k) => TEXT_STYLE_WEIGHT[k] === String(weight)) ?? "normal";
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
function boxSections() {
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
 * lines above and below instead of growing its own; that is why a published
 * adventure sets its trait tags as list items in a flex row rather than as spans. And "push right" is a
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
    { id: "background", fields: [col("background", "#00000000"), ...imageFields()] },
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
function imageSections() {
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
    {
      id: "text",
      // An outline is drawn *behind* the letterform rather than centred on its
      // edge, which is what `paint-order` in the stylesheet is for: a stroke
      // painted over the fill eats into the shapes and thickens a display face
      // until it closes up.
      fields: [
        ...textFields("", defaults),
        num("outlineWidth", 0, "px", 0, 8, 0.5),
        col("outlineColor", "#000000")
      ]
    },
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
    id: "sidebar",
    icon: "fa-solid fa-list-tree",
    // Styles the window's contents panel rather than anything on the page, so
    // its tab sits with the Window tab at the end of the strip.
    strip: "end",
    sections: [
      { id: "background", fields: [col("background", "#00000000"), ...imageFields()] },
      { id: "padding", fields: spacingFields("padding", 0, { max: 80 }) },
      { id: "layout", fields: [num("sidebarWidth", 300, "px", 120, 700, 10)] },
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
        id: "background",
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
      { id: "shadow", hint: "ILLUMINUS.Sections.pageShadow.hint", fields: shadowFields("shadow") },
      { id: "innerShadow", fields: shadowFields("innerShadow") }
    ]
  },


  {
    id: "title",
    icon: "fa-solid fa-t",
    sections: bannerSections({
      size: 36, color: "#3b2412", weight: "700", align: "center", lineHeight: 1.2
    })
  },

  {
    id: "heading1",
    icon: "fa-solid fa-heading",
    family: "headings",
    sections: bannerSections({
      size: 28, color: "#5e1914", weight: "700", lineHeight: 1.2, margin: { top: 16, bottom: 8 }
    })
  },
  {
    id: "heading2",
    icon: "fa-solid fa-heading",
    family: "headings",
    sections: bannerSections({
      size: 22, color: "#7a3b16", weight: "700", lineHeight: 1.25, margin: { top: 16, bottom: 8 }
    })
  },
  {
    id: "heading3",
    icon: "fa-solid fa-heading",
    family: "headings",
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
    family: "headings",
    sections: bannerSections({
      size: 16, color: "#5a4326", weight: "700", lineHeight: 1.3,
      margin: { top: 12, bottom: 5 }
    })
  },
  {
    id: "heading5",
    icon: "fa-solid fa-heading",
    family: "headings",
    sections: bannerSections({
      size: 15, color: "#5a4326", weight: "600", caps: "smallCaps", lineHeight: 1.3,
      margin: { top: 12, bottom: 4 }
    })
  },
  {
    id: "heading6",
    icon: "fa-solid fa-heading",
    family: "headings",
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
        // What the editor's own toolbar buttons produce. Highlight arrives as
        // Foundry's yellow-on-black until it is set here.
        id: "marks",
        fields: [
          col("highlightBackground", "#e8c979"),
          col("highlightColor", "#241b10"),
          col("strikeColor", "#7a2010"),
          num("strikeThickness", 1, "px", 0, 12, 1),
          col("underlineColor", "#8a6a3d"),
          num("underlineThickness", 1, "px", 0, 12, 1),
          num("underlineOffset", 2, "px", 0, 20, 1),
          col("abbrColor", "#5a4326"),
          select("abbrLine", "dotted", CHOICES.lineStyle),
          font("quoteFont", ""),
          select("quoteStyle", "italic", CHOICES.fontStyle),
          col("quoteColor", "")
        ]
      },
      {
        id: "code",
        fields: [
          font("codeFont", "monospace"),
          num("codeSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("codeColor", "#3a2c18"),
          col("codeBackground", "#00000012"), ...imageFields("code"),
          ...spacingFields("codePadding", { top: 1, right: 4, bottom: 1, left: 4 }, { max: 60 }),
          ...cornerFields("codeCorner", 3),
          col("codeBorderColor", "#8a6a3d"),
          num("codeBorderWidth", 0, "px", 0, 12, 1),
          ...spacingFields("codeBlockPadding", 10, { max: 80 }),
          num("codeBlockMarginTop", 10, "px", -60, 120, 1),
          num("codeBlockMarginBottom", 10, "px", -60, 120, 1)
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
        // dt and dd inherit Foundry's own colors, which are light — on a
        // parchment page they are close to invisible until set here.
        id: "definitions",
        fields: [
          font("termFont", ""),
          num("termSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("termColor", "#5e1914"),
          textStyleField("termTextStyle", "700", "normal"),
          select("termCaps", "none", CHOICES.caps, { emit: emitCaps }),
          num("termSpacingAbove", 8, "px", 0, 100, 1),
          font("detailFont", ""),
          num("detailSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("detailColor", "#241b10"),
          textStyleField("detailTextStyle", "400", "normal"),
          num("detailIndent", 24, "px", 0, 200, 2),
          num("detailSpacingBelow", 6, "px", 0, 100, 1)
        ]
      },
      {
        id: "margin",
        fields: spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 })
      },
      {
        id: "layout",
        fields: [
          num("indent", 24, "px", 0, 200, 2),
          num("itemSpacing", 4, "px", 0, 60, 1)
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
      {
        id: "tableCaption",
        fields: [
          select("captionSide", "top", ["top", "bottom"]),
          font("captionFont", ""),
          num("captionSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("captionColor", "#5a4326"),
          textStyleField("captionTextStyle", "700", "italic"),
          select("captionCaps", "none", CHOICES.caps, { emit: emitCaps }),
          select("captionAlign", "center", CHOICES.alignNoJustify),
          num("captionSpacing", 6, "px", 0, 60, 1)
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
    icon: "fa-solid fa-square-dashed",
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
      { id: "shadow", fields: shadowFields("shadow") },
      {
        // Foundry's disclosure widget: a <details> the reader can fold away.
        id: "collapsible",
        fields: [
          font("summaryFont", ""),
          num("summarySize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("summaryColor", "#5e1914"),
          textStyleField("summaryTextStyle", "700", "normal"),
          select("summaryCaps", "none", CHOICES.caps, { emit: emitCaps }),
          col("summaryBackground", "#00000000"), ...imageFields("summary"),
          ...spacingFields("summaryPadding", { top: 4, right: 8, bottom: 4, left: 8 }, { max: 60 }),
          col("collapsibleBackground", "#00000000"),
          col("collapsibleBorderColor", "#8a6a3d"),
          num("collapsibleBorderWidth", 1, "px", 0, 12, 1),
          ...cornerFields("collapsibleCorner", 3),
          ...spacingFields("collapsiblePadding", { top: 0, right: 8, bottom: 4, left: 8 }, { max: 80 }),
          num("collapsibleMarginTop", 10, "px", -60, 120, 1),
          num("collapsibleMarginBottom", 10, "px", -60, 120, 1)
        ]
      }
    ]
  },

  {
    id: "secrets",
    icon: "fa-solid fa-user-secret",
    sections: [
      { id: "background", fields: [col("background", "#3500790d"), ...imageFields()] },
      {
        id: "revealed",
        fields: [col("revealedBackground", "#0035000d"), ...imageFields("revealed")]
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
          num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" }),
          select("align", "inherit", ["inherit", ...CHOICES.align])
        ]
      },
      { id: "padding", fields: spacingFields("padding", { top: 4, right: 8, bottom: 4, left: 8 }) },
      { id: "margin", fields: spacingFields("margin", { top: 10, right: 0, bottom: 10, left: 0 }, { min: -100 }) },
      {
        id: "border",
        // Top and bottom only by default, as Foundry draws them.
        fields: borderFields("border", { color: "#7a6a58" }).map((field) =>
          ["borderTopWidth", "borderBottomWidth"].includes(field.name) ? { ...field, default: 1 } : field)
      },
      { id: "corners", fields: cornerFields("corner") },
      { id: "shadow", fields: shadowFields("shadow") },
      {
        id: "revealButton",
        fields: [
          col("buttonColor", "#f0f0e0"),
          col("buttonBackground", "#00000000"), ...imageFields("button"),
          col("buttonBorderColor", "#8a8a8a"),
          col("buttonHoverColor", "#ffffff"),
          col("buttonHoverBackground", "#00000000"), ...imageFields("buttonHover"),
          col("buttonHoverBorderColor", "#c9a961"),
          num("buttonSize", 13, "px", 6, 40, 1),
          num("buttonBorderWidth", 1, "px", 0, 12, 1),
          select("buttonBorderStyle", "dashed", CHOICES.borderStyle),
          ...cornerFields("buttonCorner", 3)
        ]
      }
    ]
  },

  {
    id: "images",
    icon: "fa-solid fa-image",
    sections: [
      { id: "margin", fields: spacingFields("margin", 0, { min: -100 }) },
      {
        id: "layout",
        fields: [
          num("maxWidth", 100, "%", 5, 100, 1),
          num("opacity", 100, "%", 0, 100, 1)
        ]
      },
      { id: "padding", fields: spacingFields("padding", 0, { max: 80 }) },
      { id: "background", fields: [col("background", "#00000000")] },
      { id: "border", fields: borderFields("border") },
      { id: "corners", fields: cornerFields("corner") },
      { id: "shadow", fields: shadowFields("shadow") },
      {
        // A box-shadow glows the rectangle a picture sits in; drop-shadow
        // follows the alpha, so a cut-out rune glows around the rune.
        id: "glow",
        fields: [
          col("glowColor", "#00000000"),
          num("glowSize", 0, "px", 0, 80, 1),
          num("glowOffsetX", 0, "px", -60, 60, 1),
          num("glowOffsetY", 0, "px", -60, 60, 1)
        ]
      },
      {
        // Sound, video, and embedded pages, which take a frame of their own.
        id: "media",
        fields: [
          num("mediaMaxWidth", 100, "%", 5, 100, 1),
          ...borderFields("mediaBorder"),
          ...cornerFields("mediaCorner", 3),
          ...shadowFields("mediaShadow"),
          num("mediaMarginTop", 8, "px", -60, 120, 1),
          num("mediaMarginBottom", 8, "px", -60, 120, 1)
        ]
      },
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
  },

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `box${String(i + 1).padStart(2, "0")}`,
    icon: "fa-solid fa-square-dashed",
    family: "boxStyles",
    sections: boxSections()
  })),

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `tag${String(i + 1).padStart(2, "0")}`,
    icon: "fa-solid fa-tag",
    family: "tagStyles",
    sections: tagSections()
  })),

  ...Array.from({ length: 10 }, (_, i) => ({
    id: `image${String(i + 1).padStart(2, "0")}`,
    icon: "fa-solid fa-image",
    family: "imageStyles",
    sections: imageSections()
  })),

];

/* -------------------------------------------- */
/*  Hovered states                              */
/* -------------------------------------------- */

/**
 * Every element that can be painted can be painted differently under the
 * pointer.
 *
 * Rather than write these out forty times, each is derived from the control it
 * shadows: wherever a section sets a lettering color, a fill, or an edge color,
 * it gains a hovered counterpart beside it. The editor pairs them by name, so
 * the section gets its Normal / Hovered switch for free.
 *
 * **Paint only, deliberately.** Sizes, padding, and typefaces are not shadowed:
 * changing those under the pointer reflows the page, so text slides out from
 * under the cursor as you reach for it. Color, fill, and edges can change
 * without moving anything.
 *
 * Each defaults to empty, which emits nothing — so until someone sets one, a
 * hovered element looks exactly like an unhovered one.
 */
const HOVERABLE = [
  "color",
  "background",
  ...SIDES.map((side) => `border${side}Color`)
];

/** Hovered name for a control, e.g. `borderTopColor` -> `hoverBorderTopColor`. */
export function hoverNameFor(name) {
  return `hover${name[0].toUpperCase()}${name.slice(1)}`;
}

/** Whether a name is the hovered twin of some other control. */
function isHoverName(name) {
  return /^hover[A-Z]/.test(name);
}

/**
 * The window frame and the contents panel are not hovered as objects — their
 * hovered states belong to the things inside them, which they already state by
 * hand. Deriving more would offer controls that could never do anything.
 */
const NO_HOVER = new Set(["window", "sidebar"]);

for (const group of GROUPS) {
  if (NO_HOVER.has(group.id)) continue;
  const taken = new Set(group.sections.flatMap((section) => section.fields.map((field) => field.name)));
  let derived = 0;
  for (const section of group.sections) {
    for (const name of HOVERABLE) {
      if (!section.fields.some((field) => field.name === name)) continue;
      const hovered = hoverNameFor(name);
      // Never shadow a control the schema already spells out itself — the
      // sidebar and the window state their hovered colors by hand.
      if (taken.has(hovered)) continue;
      taken.add(hovered);
      section.fields.push(col(hovered, ""));
      derived += 1;
    }
  }

  // A switch for the whole tab, off by default: most things a reader points at
  // should not move under the pointer, and a hovered state nobody asked for is
  // a hovered state half filled in. It rides in the first section as chrome —
  // stored and exported like any other value, but drawn beside the tab's name
  // rather than in the list, because it governs the list.
  if (!derived) continue;
  group.sections[0].fields.push({
    type: "toggle", name: "hoverOff", default: true, chrome: true, emit: () => null
  });
}

/* -------------------------------------------- */
/*  One order, everywhere                       */
/* -------------------------------------------- */

/**
 * Every tab reads the same way, so that knowing where a control lives on one of
 * them is knowing where it lives on all of them: what the element is made of
 * first — its text, then its fill, its inner spacing, its edges, its shadow,
 * the room around it, and how much room it takes — and after that the parts
 * that live inside it, roughly in the order you meet them reading down the page.
 *
 * A tab lists whichever of these it has and skips the rest, and the two
 * decorations that belong to lettering rather than to a box — a link's
 * underline, a body's opening capital — sit up with the text instead of down
 * with the paint.
 *
 * A section missing from this list throws rather than falling to the end
 * unnoticed: where a new one belongs is a decision, not a default.
 */
const SECTION_ORDER = [
  // Text, and what is done to it
  "text", "textShadow", "decoration", "paragraph", "columns", "dropCap",
  "marks", "code", "marker", "definitions",
  // The element itself, from the inside out
  "background", "padding", "border", "corners", "shadow", "innerShadow",
  "glow", "margin", "layout", "tagLayout",
  // The parts inside it
  "chip", "blockHeadings", "header", "rows", "cellPadding", "cellBorder",
  "tableCaption", "caption", "media", "collapsible", "revealed",
  "revealButton", "dividers",
  // The contents panel, then the window
  "entries", "entryBorder", "entryStates", "number", "subHeadings",
  "category", "search", "buttons",
  "frame", "titleBar", "headerButtons", "pageButton"
];

/**
 * And within a section that more than one tab carries, the controls come in one
 * order too. Only the shared sections are listed: a section that exists on a
 * single tab has nothing to be consistent with, and its author's order is
 * usually the meaningful one.
 *
 * Sections built by `spacingFields`, `borderFields` and their like are already
 * identical wherever they appear, and are left out.
 */
const FIELD_ORDER = {
  text: [
    "font", "size", "color", "textColor", "textStyle", "outlineWidth",
    "outlineColor", "caps", "letterSpacing", "wordSpacing", "lineHeight",
    "align", "verticalAlign", "width"
  ],
  background: [
    "background", "texture", "textureFit", "texturePosition",
    "textureAttachment", "textureBlend", "textureOpacity"
  ],
  layout: [
    "float", "width", "maxWidth", "sidebarWidth", "align", "clear", "flip",
    "opacity", "indent", "itemSpacing", "whenEmpty"
  ],
  tagLayout: ["float", "minWidth", "verticalAlign", "lift"],
  caption: [
    "captionFont", "captionSize", "captionColor", "captionTextStyle",
    "captionCaps", "captionAlign", "captionSpacing"
  ]
};

for (const group of GROUPS) {
  for (const section of group.sections) {
    if (!SECTION_ORDER.includes(section.id)) {
      throw new Error(`${group.id}: section "${section.id}" has no place in SECTION_ORDER`);
    }
    const order = FIELD_ORDER[section.id];
    if (order) {
      for (const field of section.fields) {
        // A hovered control is placed against its own below, not by this list.
        if (order.includes(field.name) || isHoverName(field.name)) continue;
        throw new Error(`${group.id}.${section.id}: "${field.name}" has no place in FIELD_ORDER.${section.id}`);
      }
      section.fields.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    }

    // A hovered color sits against the ordinary one it replaces, so that the
    // two states read alike: switching to Hovered hides controls but never
    // shuffles the ones that stay.
    const twins = new Map(section.fields.map((field) => [hoverNameFor(field.name), field.name]));
    const ordered = [];
    for (const field of section.fields) {
      if (twins.has(field.name)) continue;
      ordered.push(field);
      const hovered = section.fields.find((other) => twins.get(other.name) === field.name);
      if (hovered) ordered.push(hovered);
    }
    section.fields = ordered;
  }
  group.sections.sort((a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id));
}

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
