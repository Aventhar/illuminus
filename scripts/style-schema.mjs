import { CSS_VAR_PREFIX } from "./constants.mjs";

/**
 * The single source of truth for what a journal style can control.
 *
 * Both the settings GUI and the CSS compiler are generated from this table, so
 * adding a control is a one-line change here plus a rule in
 * `styles/illuminus.css` that consumes the emitted custom property.
 *
 * Structure: GROUPS -> sections -> fields. A group is one part; a section is one
 * collapsible block within that part. Nothing here ever collapses two CSS
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

/**
 * What a section's own order writes to ask for a line across the part.
 *
 * A part laid out by hand reads in runs — the lettering, then how it is spaced,
 * then what is drawn around it — and a line between them says so without a
 * heading for each.
 */
export const DIVIDER = "---";

const CHOICES = {
  // How a thing is laid out. `inherit` everywhere means "as the journal has it",
  // so every one of these starts by doing nothing at all.
  display: ["inherit", "block", "inline", "inlineBlock", "flex", "inlineFlex", "grid", "none"],
  flexDirection: ["inherit", "row", "rowReverse", "column", "columnReverse"],
  flexWrap: ["inherit", "nowrap", "wrap", "wrapReverse"],
  justify: ["inherit", "start", "center", "end", "between", "around", "evenly"],
  alignItems: ["inherit", "stretch", "start", "center", "end", "baseline"],
  position: ["asPlaced", "heldInView"],
  overflow: ["inherit", "visible", "hidden", "auto", "scroll"],
  wrap: ["inherit", "balance", "pretty", "nowrap"],
  hyphens: ["inherit", "neverBreak", "breakAsNeeded"],
  // What a corner is cut to. `round` is the browser's own, so it is the default
  // everywhere and a style that says nothing about a corner changes nothing.
  cornerShape: ["round", "bevel", "notch", "scoop", "squircle"],
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
  dropCap: ["none", "two", "three", "four", "five"],
  blockFloat: ["none", "left", "right"],
  blockWidth: ["full", "threeQuarters", "half", "third"],
  blockClear: ["none", "left", "right", "both"],
  flip: ["none", "horizontal", "vertical", "both"],
  verticalAlign: ["top", "middle", "bottom"],
  inlineAlign: ["baseline", "middle", "top", "bottom"],
  // Every CSS weight, each with and without a slant, ordered light to heavy so
  // the list reads as a ramp rather than a pile.
  textStyle: ["light", "normal", "bold"],
  whenEmpty: ["show", "hide"],
  foldIcon: ["chevron", "caret", "angle", "arrow", "plus"],
  // The shape a picture is cropped to, named by what it is for rather than by
  // its numbers: a browser wants a ratio, and nobody thinks in ratios.
  pictureShape: ["ownShape", "square", "landscape", "portrait", "wide", "tall", "panorama"],
  pictureCrop: ["cover", "contain", "stretch"],
  whiteSpace: ["normal", "preWrap", "nowrap"],
  wordBreak: ["normal", "breakWord", "breakAll"]
};

/* -------------------------------------------- */
/*  Multi-property emitters                     */
/* -------------------------------------------- */

/**
 * The words a person uses and the words CSS uses are not always the same, and
 * the schema keeps the first. These say the second.
 */
const CSS_WORD = {
  inlineBlock: "inline-block", inlineFlex: "inline-flex",
  rowReverse: "row-reverse", columnReverse: "column-reverse",
  wrapReverse: "wrap-reverse",
  start: "flex-start", center: "center", end: "flex-end",
  between: "space-between", around: "space-around", evenly: "space-evenly",
  stretch: "stretch", baseline: "baseline"
};

const emitWord = (value) => (value === "inherit" ? null : CSS_WORD[value] ?? value);

/** Where a part sits, named apart from the browser's own words. */
const emitPlacing = (value) => (value === "heldInView" ? "sticky" : null);

/** Hyphenation, named apart from the browser's own words. */
const emitHyphens = (value) =>
  ({ neverBreak: "manual", breakAsNeeded: "auto" }[value] ?? null);

/** A shape a person can name, written as the ratio a browser wants. */
const emitShape = (value) => ({
  square: "1 / 1", landscape: "4 / 3", portrait: "3 / 4",
  wide: "16 / 9", tall: "9 / 16", panorama: "21 / 9"
}[value] ?? null);

/** How a picture fills a shape that is not its own. */
const emitCrop = (value) => ({ cover: "cover", contain: "contain", stretch: "fill" }[value] ?? null);

/**
 * How a thing is laid out: whether it is a block or a row, how a row shares out
 * its room, whether it floats, how big it may be, and what happens to whatever
 * will not fit.
 *
 * Every control starts at "as the journal has it" and emits nothing until it is
 * given a value, so a part that says nothing about its layout is laid out
 * exactly as Foundry lays it out.
 *
 * **Where a control is offered is decided per part, not here.** `position` is
 * the plain warning: forcing one on a window Foundry has already placed drops a
 * 600px window into normal flow and shoves the whole interface sideways, which
 * is why the picture layers say `host: false` and why this is never offered on
 * a window root.
 */
function layoutFields(prefix = "", { flex = true, room = true, position = false,
  minWidth = true } = {}) {
  const n = (suffix) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  const fields = [
    select(n("Display"), "inherit", CHOICES.display, { emit: emitWord })
  ];
  if (flex) fields.push(
    select(n("FlexDirection"), "inherit", CHOICES.flexDirection, { emit: emitWord }),
    select(n("FlexWrap"), "inherit", CHOICES.flexWrap, { emit: emitWord }),
    select(n("Justify"), "inherit", CHOICES.justify, { emit: emitWord }),
    select(n("AlignItems"), "inherit", CHOICES.alignItems, { emit: emitWord }),
    num(n("Gap"), 0, "px", 0, 200, 1, { emitZero: false })
  );
  if (room) fields.push(
    // A part that already has a least width of its own says so: a tag's is
    // measured for an inline thing and reads "as wide as its words" at nought,
    // and two controls writing one setting is worse than either.
    ...(minWidth ? [num(n("MinWidth"), 0, "px", 0, 2000, 5, { emitZero: false })] : []),
    num(n("MaxWidth"), 0, "px", 0, 2000, 5, { emitZero: false }),
    num(n("MinHeight"), 0, "px", 0, 2000, 5, { emitZero: false }),
    num(n("MaxHeight"), 0, "px", 0, 2000, 5, { emitZero: false }),
    select(n("Overflow"), "inherit", CHOICES.overflow, { emit: emitWord })
  );
  if (position) fields.push(
    select(n("Position"), "asPlaced", CHOICES.position, { emit: emitPlacing }),
    num(n("OffsetTop"), 0, "px", -400, 400, 1, { emitZero: false }),
    num(n("OffsetLeft"), 0, "px", -400, 400, 1, { emitZero: false })
  );
  return fields;
}

/**
 * A fill that graduates from one color to another.
 *
 * A color goes in `background-color`, and a gradient cannot: it is an image.
 * The element's own `background-image` is free for it, because a background
 * *picture* rides on a layer of its own — which is what keeps a picture's
 * strength and blend mode independent of the lettering in front of it — so the
 * two never fight.
 *
 * Both ends start transparent, which is a gradient from nothing to nothing:
 * invisible until somebody sets a color, and no different from the fill alone.
 * That is what lets this be offered on every fill without changing any style
 * that says nothing about it.
 */
/**
 * Frosted glass: how much what is *behind* a fill is blurred.
 *
 * One control rather than several, and zero emits nothing, so a fill nobody has
 * frosted reads an unset value — which makes the whole declaration invalid at
 * computed-value time and leaves it at "none". That matters more than it looks:
 * a backdrop filter set to anything at all, an identity filter included, starts
 * a stacking context, and a panel that quietly became one would take whatever
 * Foundry had put inside it with it.
 *
 * It shows through a translucent fill and does nothing behind an opaque one,
 * which is the same bargain a blend mode makes and needs no wording of its own.
 */
/**
 * A turn and a size, as one transform.
 *
 * A photograph pinned to a page at a slight angle is the thing this is for, and
 * it is one of the few decorative moves a journal cannot make at all otherwise.
 *
 * Each control emits its *whole* function or nothing at all, and the rule reads
 * them with empty fallbacks — so one of them set is that one alone, and neither
 * set leaves the declaration with nothing in it, which is `none`. That last part
 * is the whole reason for the shape: an identity transform is not `none`, it
 * makes the element a containing block, which is the same trap the frosting has.
 *
 * The turn is written as `deg` and shown as a degree sign, as the gradient angle
 * is — a transform given "5°" is one a browser throws away.
 */
function turnFields(prefix = "") {
  const n = (suffix) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  return [
    num(n("Turn"), 0, "°", -30, 30, 0.5,
      { emit: (value) => (value ? `rotate(${value}deg)` : null) }),
    // Written as the ratio a browser wants, and shown as the percentage
    // everybody else thinks in.
    num(n("Scale"), 100, "%", 25, 200, 1,
      { emit: (value) => (value === 100 ? null : `scale(${value / 100})`) })
  ];
}

function frostFields(prefix = "") {
  const n = (suffix) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  return [
    num(n("Frost"), 0, "px", 0, 40, 1, { emit: (value) => (value ? `blur(${value}px)` : null) })
  ];
}

function gradientFields(prefix = "") {
  const n = (suffix) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  return [
    col(n("GradientFrom"), "#00000000"),
    col(n("GradientTo"), "#00000000"),
    // Shown as a degree sign and written as `deg`: a gradient given "90°" is a
    // gradient a browser throws away, and the fill then paints nothing at all.
    num(n("GradientAngle"), 180, "°", 0, 360, 5, { emit: (value) => `${value}deg` })
  ];
}

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

/**
 * Which side of the page the Edit pencil sits on, and how far in from it.
 *
 * Foundry pins it to the top right, where it lands on whatever a page keeps in
 * that corner. Both edges are stated rather than one, because leaving core's
 * `right` in place would hold the button there however far it was asked to
 * move — the unused edge has to say `auto`. The distance is a control of its
 * own, pointed at from here, so one number slides the button whichever side it
 * is on.
 */
const emitButtonSide = (value) => (value === "left"
  ? { left: "var(--ill-window-page-button-offset)", right: "auto" }
  : { left: "auto", right: "var(--ill-window-page-button-offset)" });

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
    // Through the state's own color first: the tint is a value naming another
    // control, so a hovered color reaches the letter only if the chain does the
    // asking. Unset, the hovered name resolves to nothing and the ordinary
    // color is what is used.
    tint: "var(--ill-body-hover-drop-cap-color, var(--ill-body-drop-cap-color))"
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

/**
 * The marker a folding heading wears.
 *
 * FontAwesome draws an icon as a glyph in `::before`'s `content`, so naming a
 * marker means naming that glyph — the icon element the module writes carries
 * the family already, and only the character changes. Nothing is emitted for an
 * unchosen one, which is what leaves a state's own marker following the
 * ordinary one.
 */
const emitFoldIcon = (value) => ({
  chevron: '"\\f054"', caret: '"\\f0da"', angle: '"\\f105"',
  arrow: '"\\f061"', plus: '"\\f067"'
}[value] ?? null);

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

/** A page number that is not displayed leaves its row to the page's name. */
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

/**
 * Three thicknesses, and italic asked separately.
 *
 * Nine weights crossed with italic made eighteen entries in a drop-down, and a
 * person choosing how a heading looks was reading a list of typographic terms
 * to find "bold". Light, Normal, and Bold are the three a face reliably has,
 * and italic is a yes-or-no question, so it is a tick box beside them.
 */
const emitTextStyle = (value) => {
  if (value === "inherit") return { weight: "inherit" };
  return { weight: TEXT_STYLE_WEIGHT[String(value)] ?? "400" };
};

/**
 * The single choice standing in for an old thickness-and-slant pair. Callers
 * still pass the two separately as defaults, so every group keeps the look it
 * had before the controls were merged.
 */
function textStyleOf(weight, slant) {
  if (weight === "inherit" || slant === "inherit") return "inherit";
  const number = Number(weight);
  if (Number.isFinite(number)) return number >= 600 ? "bold" : number <= 300 ? "light" : "normal";
  return TEXT_STYLE_WEIGHT[String(weight)] ? String(weight) : "normal";
}

/** The same choice list, with "use the setting above" in front. */
const withInherit = () => ["inherit", ...CHOICES.textStyle];

/**
 * The thickness, and the slant beside it.
 *
 * Two controls, one name: the tick box is `<name>Slant`, so the property it
 * emits is the `-slant` half the stylesheet already reads and no rule had to
 * change. Callers still pass a weight and a slant as defaults.
 */
const textStyleField = (name, weight = "400", slant = "normal", { inherit = false } = {}) => [
  select(name, textStyleOf(weight, slant), inherit ? withInherit() : CHOICES.textStyle,
    { emit: emitTextStyle }),
  {
    type: "toggle", name: `${name}Slant`,
    default: slant === "italic" || slant === "oblique",
    on: "italic", off: inherit && slant === "inherit" ? "inherit" : "normal"
  }
];

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

/**
 * Four fields, one per corner, and the shape they are cut to.
 *
 * A corner has a size and a shape, and until browsers grew `corner-shape` only
 * the size could be said: every corner in every style was a quarter circle.
 * The shape reads the same four sizes, so a corner already set to 12 becomes a
 * 12px bevel or a 12px scoop without a second measurement — and `round`, the
 * default, is what a browser does anyway, so a style that says nothing about it
 * looks exactly as it did.
 */
function cornerFields(prefix, radius = 0) {
  return [
    ...CORNERS.map((corner) => num(`${prefix}${corner}`, radius, "px", 0, 120, 1, { link: prefix })),
    select(`${prefix}Shape`, "round", CHOICES.cornerShape)
  ];
}

/**
 * The controls for a folding marker: whether there is one, what it looks like,
 * and how far it turns when what it holds is open.
 *
 * Folding itself is behavior rather than paint, so the switch is a real
 * control emitting a real property — the marker is always in the markup and the
 * stylesheet decides whether a reader can see it. That keeps the compiler's one
 * rule intact: a style supplies values, never rules.
 */
function foldFields() {
  return [
    { type: "toggle", name: "foldShown", default: false, on: "inline-flex", off: "none" },
    select("foldIcon", "chevron", CHOICES.foldIcon, { emit: emitFoldIcon }),
    col("foldColor", ""),
    num("foldSize", 0, "px", 0, 80, 1, { zeroAs: "inherit" }),
    num("foldGap", 6, "px", 0, 40, 1),
    num("foldTurn", 90, "deg", -180, 180, 5)
  ];
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
    // A size or a line height of zero means "whatever this already had", which
    // is what lets a control start by doing nothing at all.
    num(n("Size"), d("size", 0), "px", 0, 200, 1, { zeroAs: "inherit" }),
    col(n("Color"), d("color", "")),
    ...textStyleField(n("TextStyle"), d("weight", "inherit"), d("style", "inherit"), { inherit: true }),
    select(n("Caps"), d("caps", "inherit"), ["inherit", ...CHOICES.caps], { emit: emitCaps }),
    num(n("LetterSpacing"), d("letterSpacing", 0), "px", -5, 40, 0.5),
    num(n("WordSpacing"), d("wordSpacing", 0), "px", -10, 60, 0.5),
    num(n("LineHeight"), d("lineHeight", 0), "", 0, 4, 0.05, { zeroAs: "inherit" }),
    // Where the lines are allowed to break. A heading set over two lines breaks
    // where the measure runs out, which leaves one word alone as often as not;
    // balancing it evens the lines instead.
    select(n("Wrap"), "inherit", CHOICES.wrap, { emit: emitWord }),
    // Whether long words may be broken across a line with a hyphen, which is
    // what keeps justified text in a narrow column from opening rivers of
    // white. A browser needs the page's language to do it, and Foundry gives
    // it one.
    select(n("Hyphens"), "inherit", CHOICES.hyphens, { emit: emitHyphens }),
    select(n("Align"), d("align", "inherit"), d("choices", ["inherit", ...CHOICES.alignNoJustify]))
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
        select("whenEmpty", "show", CHOICES.whenEmpty, { emit: emitWhenEmpty }),
        // A block holds other things, so it can be a row of them as well as a
        // block of them: a stat line, a row of trait chips, a two-column aside.
        // It may also be nudged, or made to stay put while the page scrolls past
        // it — an aside that holds its place beside the text.
        ...layoutFields("", { position: true }),
        ...turnFields()
      ]
    },
    {
      id: "text",
      fields: [
        font("font", ""),
        num("size", 0, "px", 0, 200, 1, { zeroAs: "inherit" }),
        col("color", ""),
        ...textStyleField("textStyle", "inherit", "inherit", { inherit: true }),
        select("caps", "inherit", inheritCaps, { emit: emitCaps }),
        num("letterSpacing", 0, "px", -5, 40, 0.5),
        num("wordSpacing", 0, "px", -10, 60, 0.5),
        num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" }),
        select("wrap", "inherit", CHOICES.wrap, { emit: emitWord }),
        select("hyphens", "inherit", CHOICES.hyphens, { emit: emitHyphens }),
        select("align", "inherit", inheritAlign)
      ]
    },
    {
      id: "blockHeadings",
      fields: [
        font("headingFont", ""),
        num("headingSize", 0, "px", 0, 200, 1, { zeroAs: "inherit" }),
        col("headingColor", ""),
        ...textStyleField("headingTextStyle", "inherit", "inherit", { inherit: true }),
        select("headingCaps", "inherit", inheritCaps, { emit: emitCaps }),
        select("headingAlign", "inherit", inheritAlign),
        num("headingMarginTop", 0, "px", -100, 100, 1),
        num("headingMarginBottom", 0, "px", -100, 100, 1),
        num("headingRuleWidth", 0, "px", 0, 20, 1),
        select("headingRuleStyle", "solid", CHOICES.lineStyle),
        col("headingRuleColor", "#8a6a3d")
      ]
    },
    { id: "background", fields: [col("background", "#00000000"), ...gradientFields(), ...frostFields(), ...imageFields()] },
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
    num(n("TextureOpacity"), 100, "%", 0, 100, 1),
    // What is done to the picture itself before it is laid down: a scan softened
    // until it reads as a wash, a photograph drained of its color until it sits
    // under lettering, a texture darkened to hold ink. Each of these does
    // nothing at its default, so a picture nobody has touched is the picture.
    num(n("TextureBlur"), 0, "px", 0, 40, 0.5),
    num(n("TextureBrightness"), 100, "%", 0, 300, 5),
    num(n("TextureContrast"), 100, "%", 0, 300, 5),
    num(n("TextureSaturation"), 100, "%", 0, 300, 5),
    num(n("TextureAge"), 0, "%", 0, 100, 5)
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
        num("minWidth", 0, "px", 0, 400, 1, { zeroAs: "auto" }),
        // A tag long enough to break across two lines is one box sliced in two,
        // and a browser paints its edges only at the outer ends — so the middle
        // of the tag has no edge and the halves do not read as one thing.
        // Turned on, both halves are drawn whole.
        { type: "toggle", name: "wrapEdges", default: false, on: "clone", off: "slice" },
        // A tag is laid out `inline-block` by the skeleton so its padding grows
        // its own box; these say what it does with the room that gives it. Its
        // least width is declared above, measured for an inline thing.
        ...layoutFields("", { position: false, minWidth: false }),
        ...turnFields()
      ]
    },
    {
      id: "text",
      fields: [
        font("font", ""),
        num("size", 0, "px", 0, 200, 1, { zeroAs: "inherit" }),
        col("color", ""),
        ...textStyleField("textStyle", "inherit", "inherit", { inherit: true }),
        select("caps", "inherit", ["inherit", ...CHOICES.caps], { emit: emitCaps }),
        num("letterSpacing", 0, "px", -5, 40, 0.5),
        num("wordSpacing", 0, "px", -10, 60, 0.5),
        num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" }),
        select("wrap", "inherit", CHOICES.wrap, { emit: emitWord }),
        select("hyphens", "inherit", CHOICES.hyphens, { emit: emitHyphens })
      ]
    },
    { id: "background", fields: [col("background", "#00000000"), ...gradientFields(), ...frostFields(), ...imageFields()] },
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
        // The shape the picture is cropped to, and how it fills it. A treatment
        // that says nothing keeps the picture's own shape, which is what a
        // journal does now — and where a shape *is* named, the picture fills it
        // rather than being squashed into it, since the shape was the point.
        select("pictureShape", "ownShape", CHOICES.pictureShape, { emit: emitShape }),
        select("pictureCrop", "cover", CHOICES.pictureCrop, { emit: emitCrop }),
        select("pictureFrom", "center", CHOICES.texturePosition, { emit: emitTexturePosition }),
        // No row settings: a picture holds nothing to lay out inside it.
        ...layoutFields("", { flex: false, position: true }),
        ...turnFields(),
        num("opacity", 100, "%", 0, 100, 1)
      ]
    },
    { id: "background", fields: [col("background", "#00000000"), ...gradientFields(), ...frostFields(), ...imageFields()] },
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
        ...textStyleField("captionTextStyle", "inherit", "inherit", { inherit: true }),
        select("captionCaps", "none", CHOICES.caps, { emit: emitCaps }),
        select("captionAlign", "inherit", ["inherit", ...CHOICES.align]),
        num("captionSpacing", 4, "px", 0, 60, 1)
      ]
    }
  ];
}

/**
 * Columns for one run of text.
 *
 * A page is not columned as a whole: each heading governs the text beneath it,
 * so a chapter opening can run wide while the section under it sets in two.
 * That is why these live on the heading parts rather than on Body. The text
 * above the first heading follows level 1, because the page's title is a level
 * 1 heading — so nothing needs a set of its own.
 *
 * The rendered page is what carries this: `heading-sections.mjs` wraps each
 * heading's run of content in an element, because a multi-column container has
 * to be an element and a run of siblings is not one. Nothing is stored — the
 * journal's own content is untouched.
 */
function columnFields() {
  return [
    num("columnCount", 1, "", 1, 4, 1),
    num("columnGap", 32, "px", 0, 200, 2),
    num("columnRuleWidth", 0, "px", 0, 20, 1),
    select("columnRuleStyle", "solid", CHOICES.borderStyle),
    col("columnRuleColor", "#8a6a3d")
  ];
}

/**
 * A line drawn around each letter.
 *
 * Paired with `paint-order: stroke fill` in the stylesheet, so the stroke is
 * painted *behind* the letterform: over it, a heavy stroke eats into the shapes
 * and closes a display face up.
 */
function outlineFields(prefix = "") {
  const n = (suffix) => (prefix ? `${prefix}${suffix}` : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  return [
    num(n("OutlineWidth"), 0, "px", 0, 8, 0.5),
    col(n("OutlineColor"), "#000000")
  ];
}

/** The section set shared by heading levels and the journal title. */
/**
 * The order a heading level's categories read in, and the runs inside each.
 *
 * Laid out by hand, as the Title and Page parts are: the lettering and its
 * shadow are one question, the fill and its picture and both its shadows are
 * another, and the edges keep their corners.
 */
const HEADING_ORDER = ["layout", "text", "background", "padding", "margin", "border",
  "columns", "fold"];

function bannerSections(defaults = {}) {
  return [
    {
      // A heading is a thing a page has many of, so it may be laid out as a row
      // — a name with a rule running off it, a number beside a title — given a
      // measure of its own, or left out of a style's pages entirely.
      id: "layout",
      order: ["display", "flexDirection", "flexWrap", "justify", "alignItems", "gap",
        DIVIDER, "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow"],
      fields: layoutFields()
    },
    {
      id: "text",
      // An outline is drawn *behind* the letterform rather than centerd on its
      // edge, which is what `paint-order` in the stylesheet is for: a stroke
      // painted over the fill eats into the shapes and thickens a display face
      // until it closes up.
      order: [
        "font", "size", "color", "textStyle", "textStyleSlant",
        DIVIDER, "align", "caps", "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens",
        DIVIDER, "outlineColor", "outlineWidth",
        DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
      ],
      fields: [...textFields("", defaults), ...textShadowFields()]
    },
    {
      id: "background",
      label: "ILLUMINUS.Sections.fillAndImage.label",
      hint: "ILLUMINUS.Sections.fillAndImage.hint",
      order: [
        "background", "gradientFrom", "gradientTo", "gradientAngle", "frost",
        DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
        DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
        "innerShadowSpread", "innerShadowColor",
        DIVIDER, "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor"
      ],
      fields: [col("background", defaults.background ?? "#00000000"),
        ...gradientFields(), ...frostFields(), ...imageFields()]
    },
    {
      id: "padding",
      order: ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"],
      fields: spacingFields("padding", defaults.padding ?? 0)
    },
    {
      id: "margin",
      order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
      fields: spacingFields("margin", defaults.margin ?? 0, { min: -100 })
    },
    {
      id: "border",
      order: [
        "borderTopStyle", "borderTopColor", "borderTopWidth",
        DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
        DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
        DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
        DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
      ],
      // A heading level may ask for the line Foundry draws under it — the first
      // two levels have one — without asking for the other three sides.
      fields: [
        ...borderFields("border", defaults.border).map((field) =>
          field.name === "borderBottomWidth" && defaults.borderBottom
            ? { ...field, default: defaults.borderBottom } : field),
        ...cornerFields("corner")
      ]
    },
    // Heading levels only: these set the text *under* the heading. The
    // journal's own title has no text of its own to set.
    ...(defaults.columns
      ? [{
          id: "columns",
          hint: "ILLUMINUS.Sections.headingColumns.hint",
          order: ["columnCount", "columnGap", "columnRuleStyle", "columnRuleColor", "columnRuleWidth"],
          fields: columnFields()
        },
         // Heading levels only, for the same reason: folding hides the run of
         // text a heading governs, and the journal's title governs none.
         {
           id: "fold",
           order: ["foldShown", "foldIcon", "foldSize", "foldColor", "foldGap", "foldTurn"],
           fields: foldFields()
         }]
      : [])
  ];
}

/* -------------------------------------------- */
/*  Groups (one part each)                       */
/* -------------------------------------------- */

/**
 * One list's settings: where it sits, the room around it, the mark in front of
 * each item, and the two-part lettering of a definition list.
 *
 * Shared by Default List and by every list treatment, the way `boxSections` is
 * shared — so a treatment can say anything the default can.
 */
function listSections() {
  return [
    {
      id: "marker",
      order: ["markerFont", "markerSize", "markerColor", "bullet", "numberStyle"],
      fields: [
        select("bullet", "disc", CHOICES.bullet, { emit: emitBullet }),
      select("numberStyle", "decimal", CHOICES.numberStyle, { emit: emitKeyword }),
      num("markerSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
        col("markerColor", ""),
        col("markerHoverColor", ""),
        font("markerFont", "")
      ]
    },
    {
      // dt and dd inherit Foundry's own colors, which are light — on a
      // parchment page they are close to invisible until set here.
      id: "definitions",
      order: [
        "termFont", "termSize", "termColor", "termTextStyle", "termTextStyleSlant",
        "termCaps", "termSpacingAbove",
        DIVIDER, "termOutlineWidth", "termOutlineColor",
        DIVIDER, "termTextShadowOffsetX", "termTextShadowOffsetY",
        "termTextShadowBlur", "termTextShadowColor",
        DIVIDER, "detailFont", "detailSize", "detailColor", "detailTextStyle",
        "detailTextStyleSlant", "detailIndent", "detailSpacingBelow",
        DIVIDER, "detailOutlineWidth", "detailOutlineColor",
        DIVIDER, "detailTextShadowOffsetX", "detailTextShadowOffsetY",
        "detailTextShadowBlur", "detailTextShadowColor"
      ],
      fields: [
        font("termFont", ""),
        num("termSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
        col("termColor", ""),
        col("termHoverColor", ""),
        ...textStyleField("termTextStyle", "700", "normal"),
        select("termCaps", "none", CHOICES.caps, { emit: emitCaps }),
        num("termSpacingAbove", 8, "px", 0, 100, 1),
        font("detailFont", ""),
        num("detailSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
        col("detailColor", ""),
        col("detailHoverColor", ""),
        ...textStyleField("detailTextStyle", "400", "normal"),
        num("detailIndent", 24, "px", 0, 200, 2),
        num("detailSpacingBelow", 6, "px", 0, 100, 1)
      ]
    },
    {
      id: "margin",
      order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
      fields: spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 })
    },
    {
      id: "layout",
      order: ["indent", "itemSpacing", DIVIDER, "display", "flexDirection", "flexWrap", "justify", "alignItems", "gap",
        DIVIDER, "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow"],
      fields: [
        num("indent", 24, "px", 0, 200, 2),
        num("itemSpacing", 4, "px", 0, 60, 1),
        // A list laid out as a row makes its items a run rather than a
        // column, which is how a line of trait chips is built.
        ...layoutFields("", { hide: false })
      ]
    }
  ];
}

/**
 * One table's settings: the table itself, then the parts of it — the header
 * row, the rows beneath, a cell, and the caption.
 */
function tableSections() {
  return [
    // How wide the table is drawn, which is a question about the table rather
    // than about its lettering.
    { id: "layout",
      order: ["width", DIVIDER, "display", DIVIDER, "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow"],
      fields: [
        num("width", 100, "%", 10, 100, 1),
        ...layoutFields("", { flex: false, hide: false })
      ] },
    {
      id: "text",
      order: [
        "font", "size", "textColor",
        DIVIDER, "align", "verticalAlign", "lineHeight", "wrap", "hyphens",
        DIVIDER, "outlineColor", "outlineWidth",
        DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
      ],
      fields: [
        font("font", ""),
        num("size", 0, "px", 0, 100, 1, { zeroAs: "inherit" }),
        col("textColor", ""),
        num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" }),
        select("align", "left", CHOICES.align),
        select("verticalAlign", "middle", CHOICES.verticalAlign)
      ]
    },
    {
      id: "margin",
      order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
      fields: spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 })
    },
    {
      id: "border",
      order: [
        "borderTopStyle", "borderTopColor", "borderTopWidth",
        DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
        DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
        DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
        DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
      ],
      fields: [...borderFields("border"), ...cornerFields("corner")]
    },
    {
      id: "header",
      order: [
        "headerBackground", "headerGradientFrom", "headerGradientTo", "headerGradientAngle",
        "headerFrost",
        DIVIDER, "headerFont", "headerSize", "headerColor", "headerTextStyle", "headerTextStyleSlant",
        DIVIDER, "headerAlign", "headerCaps", "headerLetterSpacing", "headerWordSpacing",
        DIVIDER, "headerOutlineColor", "headerOutlineWidth",
        DIVIDER, "headerTextShadowOffsetX", "headerTextShadowOffsetY",
        "headerTextShadowBlur", "headerTextShadowColor",
        DIVIDER, "headerTexture", "headerTextureFit", "headerTexturePosition",
        "headerTextureBlend", "headerTextureOpacity", "headerTextureBlur", "headerTextureBrightness", "headerTextureContrast", "headerTextureSaturation", "headerTextureAge",
        DIVIDER, "headerInnerShadowOffsetX", "headerInnerShadowOffsetY", "headerInnerShadowBlur",
        "headerInnerShadowSpread", "headerInnerShadowColor",
        DIVIDER, "headerShadowOffsetX", "headerShadowOffsetY", "headerShadowBlur",
        "headerShadowSpread", "headerShadowColor"
      ],
      fields: [
        col("headerBackground", "#00000000"), ...gradientFields("header"), ...frostFields("header"),
          ...imageFields("header"),
        col("headerColor", ""),
        font("headerFont", ""),
        num("headerSize", 0, "px", 0, 100, 1, { zeroAs: "inherit" }),
        ...textStyleField("headerTextStyle", "700", "normal"),
        select("headerCaps", "none", CHOICES.caps, { emit: emitCaps }),
        select("headerAlign", "left", CHOICES.align),
        num("headerLetterSpacing", 0, "px", -5, 40, 0.5),
        num("headerWordSpacing", 0, "px", -10, 60, 0.5)
      ]
    },
    { id: "rows", order: ["rowColor", "stripeColor"],
      fields: [col("stripeColor", "#00000010"), col("rowColor", "#00000000")] },
    // A cell's own spacing and its edges are one question about a cell, so
    // they read as one category.
    {
      id: "cellPadding",
      label: "ILLUMINUS.Sections.cellStyles.label",
      hint: "ILLUMINUS.Sections.cellStyles.hint",
      order: [
        "cellPaddingTop", "cellPaddingBottom", "cellPaddingLeft", "cellPaddingRight",
        DIVIDER, "cellBorderTopStyle", "cellBorderTopColor", "cellBorderTopWidth",
        DIVIDER, "cellBorderBottomStyle", "cellBorderBottomColor", "cellBorderBottomWidth",
        DIVIDER, "cellBorderLeftStyle", "cellBorderLeftColor", "cellBorderLeftWidth",
        DIVIDER, "cellBorderRightStyle", "cellBorderRightColor", "cellBorderRightWidth"
      ],
      fields: [
        ...spacingFields("cellPadding", { top: 8, right: 16, bottom: 8, left: 16 }, { max: 80 }),
        ...borderFields("cellBorder")
      ]
    },
    {
      id: "tableCaption",
      order: [
        "captionFont", "captionSize", "captionColor", "captionTextStyle", "captionTextStyleSlant",
        DIVIDER, "captionAlign", "captionCaps",
        DIVIDER, "captionOutlineColor", "captionOutlineWidth",
        DIVIDER, "captionTextShadowOffsetX", "captionTextShadowOffsetY",
        "captionTextShadowBlur", "captionTextShadowColor", "captionSide", "captionSpacing"
      ],
      fields: [
        select("captionSide", "top", ["top", "bottom"]),
        font("captionFont", ""),
        num("captionSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
        col("captionColor", "#5a4326"),
        ...textStyleField("captionTextStyle", "700", "italic"),
        select("captionCaps", "none", CHOICES.caps, { emit: emitCaps }),
        select("captionAlign", "center", CHOICES.alignNoJustify),
        num("captionSpacing", 6, "px", 0, 60, 1)
      ]
    }
  ];
}

/**
 * How many treatments each family offers.
 *
 * Five rather than ten: a style that has to invent ten looks for a thing ends
 * up with eight nobody uses, and every one of them costs a full set of settings
 * in every style file. Raising it later is this number and a migration; lowering
 * it drops what the extra members held, which `cleanSettings` does silently.
 */
export const FAMILY_SIZE = 5;

/**
 * One family's members, named `<word>01`..`<word>0N`.
 *
 * The class a member writes is derived from its id — `box01` becomes
 * `illuminus-box--box01` — so the stylesheet can never name something the
 * editor no longer writes.
 */
const members = (word, family, icon, sections) =>
  Array.from({ length: FAMILY_SIZE }, (_, i) => ({
    id: `${word}${String(i + 1).padStart(2, "0")}`,
    icon,
    family,
    sections: sections()
  }));

/** @type {Array<{id: string, icon: string, sections: Array<{id: string, fields: object[]}>}>} */
export const GROUPS = [
  {
    id: "sidebar",
    icon: "fa-solid fa-list-tree",
    // Styles the window's contents panel rather than anything on the page, so
    // its part sits with the Window part at the end of the strip.
    strip: "end",
    sections: [
      {
        id: "background",
        fields: [
          col("background", "#00000000"), ...gradientFields(), ...frostFields(), ...imageFields()
        ]
      },
      { id: "padding", fields: spacingFields("padding", 0, { max: 80 }) },
      { id: "layout", fields: [num("sidebarWidth", 300, "px", 120, 700, 10)] },
      { id: "border", fields: borderFields("border", { color: "#00000000" }) },
      { id: "corners", fields: cornerFields("corner") },
      // Shading inside the panel's own edges, as the page has: it is what makes
      // a contents panel read as recessed into the window rather than painted
      // onto it.
      { id: "innerShadow", fields: shadowFields("innerShadow") },
      // One section for a listed page, in its three states. They were three
      // sections — the entry, its edges, and "entry states" — which meant the
      // ordinary look, the pointed-at look, and the selected look were set in
      // three different places and could not be compared. The editor's own
      // state switch reads the control names, so putting them together is all
      // it takes to get Normal / Hovered / Selected across the whole set.
      //
      // Each state states its own lettering, outline, and edge colors. Edge
      // *thickness* is shared, deliberately: a border that appears only when
      // pointed at would move every row below it. Leave the ordinary edge color
      // transparent and give the state one, and the line appears without
      // anything shifting.
      {
        id: "entries",
        fields: [
          // The panel is Foundry's until a style paints it: an entry's lettering,
          // and what it looks like pointed at or being read, all follow.
          ...textFields(""),
          col("hoverColor", ""),
          col("activeColor", ""),
          ...outlineFields("hover"),
          ...outlineFields("active"),
          ...textStyleField("activeTextStyle", "400", "normal"),
          // Named for the entry rather than for the state alone. `hoverBackground`
          // was the entry's fill, but the panel's own fill is `background` in
          // the same part — so the pointed-at rule the generator mirrors for the
          // panel read the entry's color and painted the whole panel with it
          // the moment a pointer entered it.
          col("entryBackground", "entryGradientFrom", "entryGradientTo", "entryGradientAngle", "entryFrost", "#00000000"), ...gradientFields("entry"), ...frostFields("entry"), ...imageFields("entry"),
          col("entryHoverBackground", "#00000000"), ...imageFields("entryHover"),
          col("entryActiveBackground", "#00000000"), ...imageFields("entryActive"),
          ...spacingFields("entryPadding", 0, { max: 60 }),
          ...borderFields("entryBorder", { color: "#c9593f" }).map((field) =>
            field.name === "entryBorderBottomWidth" ? { ...field, default: 1 } : field),
          ...SIDES.map((side) => col(`hoverEntryBorder${side}Color`, "")),
          ...SIDES.map((side) => col(`activeEntryBorder${side}Color`, "")),
          ...cornerFields("entryCorner"),
          ...spacingFields("entryMargin", 0, { min: -40, max: 60 })
        ]
      },
      {
        id: "number",
        fields: [
          // A tick box rather than a two-way choice: "shown or not" is what a tick
          // box is for, and page numbers are off until somebody wants them.
          { type: "toggle", name: "numberShown", default: true, on: "block", off: "none" },
          col("numberColor", "#666666"),
          num("numberSize", 14, "px", 6, 60, 1),
          ...textStyleField("numberTextStyle", "400", "normal"),
          select("numberAlign", "center", CHOICES.alignNoJustify),
          num("numberWidth", 40, "px", 0, 120, 2)
        ]
      },
      {
        id: "subHeadings",
        fields: [
          font("headingFont", ""),
          num("headingSize", 14, "px", 6, 60, 1),
          col("headingColor", ""),
          ...textStyleField("headingTextStyle", "400", "normal"),
          col("headingHoverColor", ""),
          // The heading a reader chose in the panel. Foundry marks the page
          // being read and nothing finer, so `scripts/toc-current.mjs` marks
          // the entry that was clicked — nothing is stored, as with the folding
          // markers.
          col("headingActiveColor", ""),
          ...textStyleField("headingActiveTextStyle", "400", "normal"),
          num("headingActiveOutlineWidth", 0, "px", 0, 20, 0.5),
          col("headingActiveOutlineColor", ""),
          col("headingBackground", "headingGradientFrom", "headingGradientTo", "headingGradientAngle", "headingFrost", "#00000000"), ...gradientFields("heading"), ...frostFields("heading"), ...imageFields("heading"),
          col("headingActiveBackground", "#00000000"), ...imageFields("headingActive"),
          ...SIDES.map((side) => col(`headingActiveBorder${side}Color`, "")),
          ...spacingFields("headingPadding", 0, { max: 60 }),
          ...borderFields("headingBorder", { color: "#00000000" }),
          ...cornerFields("headingCorner"),
          ...spacingFields("headingMargin", 0, { min: -40, max: 60 }),
          // The indent is the list's, not the item's: it moves every listed
          // heading in from the page entry above them together.
          // How far the whole list is pushed in, which belongs to the list
          // rather than to a row in it — so there is no such thing as the
          // indent of the heading a reader chose.
          num("headingIndent", 40, "px", 0, 120, 2, { noSelected: true }),
          num("headingLineHeight", 2.3, "", 0.5, 5, 0.05),
          select("headingWrap", "inherit", CHOICES.wrap, { emit: emitWord }),
          select("headingHyphens", "inherit", CHOICES.hyphens, { emit: emitHyphens })
        ]
      },
      {
        id: "category",
        fields: [
          font("categoryFont", ""),
          num("categorySize", 24, "px", 6, 80, 1),
          col("categoryColor", ""),
          ...textStyleField("categoryTextStyle", "700", "normal"),
          select("categoryCaps", "uppercase", CHOICES.caps, { emit: emitCaps }),
          num("categoryLetterSpacing", 1, "px", -5, 40, 0.5),
          num("categoryWordSpacing", 0, "px", -10, 60, 0.5),
          select("categoryAlign", "center", CHOICES.alignNoJustify),
          col("categoryBackground", "categoryGradientFrom", "categoryGradientTo", "categoryGradientAngle", "categoryFrost", "#00000000"), ...gradientFields("category"), ...frostFields("category"), ...imageFields("category"),
          // A category is a heading in a list of pages, so it needs room around
          // it as much as it needs lettering — without it the group name sits
          // hard against the first page under it.
          ...spacingFields("categoryPadding", 0, { max: 60 }),
          ...borderFields("categoryBorder", { color: "#00000000" }),
          ...cornerFields("categoryCorner"),
          ...spacingFields("categoryMargin", 0, { min: -40, max: 60 })
        ]
      },
      {
        id: "search",
        fields: [
          col("searchBackground", "searchGradientFrom", "searchGradientTo", "searchGradientAngle", "searchFrost", "#00000000"), ...gradientFields("search"), ...frostFields("search"), ...imageFields("search"),
          col("searchColor", "#e7d1b1"),
          col("searchPlaceholderColor", "#8a8a8a"),
          num("searchSize", 14, "px", 6, 40, 1),
          ...borderFields("searchBorder", { width: 1, color: "#00000000" }),
          ...cornerFields("searchCorner", 4)
        ]
      },
      {
        id: "buttons",
        fields: [
          col("buttonColor", ""),
          col("buttonBackground", "buttonGradientFrom", "buttonGradientTo", "buttonGradientAngle", "buttonFrost", ""), ...gradientFields("button"), ...frostFields("button"), ...imageFields("button"),
          col("buttonBorderColor", ""),
          col("buttonHoverColor", ""),
          col("buttonHoverBackground", "#00000000"), ...imageFields("buttonHover"),
          col("buttonHoverBorderColor", "#c9a961"),
          num("buttonBorderWidth", 1, "px", 0, 12, 1),
          ...cornerFields("buttonCorner", 4)
        ]
      }
    ]
  },

{
    id: "window",
    icon: "fa-solid fa-window-maximize",
    // Styles the frame rather than anything on the page, so its part sits at the
    // end of the strip. Its position in this list is unaffected.
    strip: "end",
    sections: [
      {
        id: "frame",
        fields: [
          col("background", "#00000000"), ...gradientFields(), ...frostFields(), ...imageFields(),
          ...borderFields("border", { color: "#00000000" }),
          ...cornerFields("corner")
        ]
      },
      // How wide the window may be drawn. Foundry sets a window's width itself,
      // as a number a person can drag; these are the limits it is drawn within,
      // which is what keeps a journal readable on a wide screen and usable on a
      // narrow one. Named for the frame rather than `minWidth`, which already
      // means the least width of a tag, and `maxWidth`, which already means the
      // measure of the text on a page.
      {
        id: "frameSize",
        fields: [
          num("frameMinWidth", 0, "px", 0, 3000, 10, { zeroAs: "auto" }),
          num("frameMaxWidth", 0, "px", 0, 3000, 10, { zeroAs: "none" })
        ]
      },
      {
        id: "titleBar",
        fields: [
          col("titleBarBackground", "titleBarGradientFrom", "titleBarGradientTo", "titleBarGradientAngle", "titleBarFrost", "#00000000"), ...gradientFields("titleBar"), ...frostFields("titleBar"), ...imageFields("titleBar"),
          font("font", ""),
          num("size", 0, "px", 0, 60, 1, { zeroAs: "inherit" }),
          col("color", ""),
          ...textStyleField("textStyle", "normal", "normal"),
          select("caps", "none", CHOICES.caps, { emit: emitCaps }),
          num("letterSpacing", 0, "px", -5, 40, 0.5),
          num("wordSpacing", 0, "px", -10, 60, 0.5),
          select("align", "left", CHOICES.alignNoJustify),
          ...spacingFields("padding", { top: 0, right: 8, bottom: 0, left: 8 }, { max: 60 })
        ]
      },
      {
        id: "headerButtons",
        fields: [
          col("headerButtonColor", "#f7f3e8"),
          col("headerButtonHoverColor", "#ffffff"),
          col("headerButtonBackground", "headerButtonGradientFrom", "headerButtonGradientTo", "headerButtonGradientAngle", "headerButtonFrost", "#00000000"), ...gradientFields("headerButton"), ...frostFields("headerButton"), ...imageFields("headerButton"),
          col("headerButtonHoverBackground", "#00000000"), ...imageFields("headerButtonHover"),
          num("headerButtonSize", 14, "px", 6, 48, 1),
          ...borderFields("headerButtonBorder", { color: "#00000000" }),
          ...cornerFields("headerButtonCorner", 4)
        ]
      },
      {
        id: "pageButton",
        fields: [
          col("pageButtonColor", "#e7d1b1"),
          col("pageButtonHoverColor", "#ffffff"),
          col("pageButtonBackground", "pageButtonGradientFrom", "pageButtonGradientTo", "pageButtonGradientAngle", "pageButtonFrost", "#0b0a1380"), ...gradientFields("pageButton"), ...frostFields("pageButton"), ...imageFields("pageButton"),
          col("pageButtonHoverBackground", "#0b0a13cc"), ...imageFields("pageButtonHover"),
          num("pageButtonSize", 14, "px", 6, 48, 1),
          // No hovered twin for either: where the pencil sits is decided by one
          // control naming the other, and a button that moved as the pointer
          // reached it would be a button nobody could click.
          select("pageButtonSide", "right", ["left", "right"], { emit: emitButtonSide, noTwin: true }),
          num("pageButtonOffset", 5, "px", -100, 600, 1, { noTwin: true }),
          // How far down the page it sits, and whether it travels with the
          // reader. Foundry's follows the scroll, which is what puts it across
          // a heading half way down a long page; held at the top it sits above
          // the words instead. Neither has a hovered twin, for the same reason
          // the side has none: a button that moved as the pointer reached it
          // would be a button nobody could click.
          num("pageButtonTop", 5, "px", -100, 600, 1, { noTwin: true }),
          // What the two distances are measured from. The page clips what
          // scrolls inside it, so a pencil pushed above the page's own top
          // stops being drawn there — anchored to the window it hangs off the
          // area the journal's name sits in, and is placed from that instead.
          // Read by `scripts/edit-button.mjs` at render rather than emitted:
          // where an element hangs is not something a value can say.
          select("pageButtonAnchor", "page", ["page", "window"],
            { emit: () => null, noCss: true, noTwin: true }),
          // Named for what ticking it does, which is the opposite of how it
          // read before: Foundry's button is `sticky`, so it holds its place on
          // screen while the page scrolls under it — and a person watching that
          // says the button is staying put, not that it is following the page.
          // Held is `relative` rather than `static`, because the button's own
          // picture layer is drawn inside it and needs a positioned box to sit
          // in whichever way this is set.
          { type: "toggle", name: "pageButtonHoldTop", default: false,
            on: "relative", off: "sticky", noTwin: true },
          ...borderFields("pageButtonBorder", { width: 1, color: "#9f8475" }),
          ...cornerFields("pageButtonCorner", 3)
        ]
      }
    ]
  },

    {
    id: "title",
    icon: "fa-solid fa-t",
    order: ["layout", "text", "background", "padding", "margin", "border"],
    // Laid out by hand rather than by the shared pass: fewer, longer sections,
    // each reading in runs with a line drawn between them. The lettering keeps
    // its own shadow, the fill keeps its picture and both its shadows, and the
    // edges keep their corners — three questions rather than seven.
    sections: [
      // Whether the journal's name is drawn at all. Some pages carry their own
      // title in the text, and a second one above it is a second title.
      { id: "layout", fields: [
        { type: "toggle", name: "shown", default: true, on: "block", off: "none" }
      ] },
      {
        id: "text",
        order: [
          "font", "size", "color", "textStyle", "textStyleSlant",
          DIVIDER, "align", "caps", "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens",
          DIVIDER, "outlineColor", "outlineWidth",
          DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
        ],
        fields: [
          // The name as Foundry draws it: a centerd banner, larger than the
          // prose, on a bar of its own.
          ...textFields("", { size: 32, color: "#e7d1b1", align: "center" }),
          ...textShadowFields()
        ]
      },
      {
        id: "background",
        label: "ILLUMINUS.Sections.fillAndImage.label",
        hint: "ILLUMINUS.Sections.fillAndImage.hint",
        order: [
          "background", "gradientFrom", "gradientTo", "gradientAngle", "frost",
          DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
          DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
          "innerShadowSpread", "innerShadowColor",
          DIVIDER, "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor"
        ],
        fields: [col("background", "#302831"), ...gradientFields(), ...frostFields(),
          ...imageFields()]
      },
      {
        id: "padding",
        order: ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"],
        fields: spacingFields("padding", 0)
      },
      {
        id: "margin",
        order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
        fields: spacingFields("margin", 0, { min: -100 })
      },
      {
        id: "border",
        order: [
          "borderTopStyle", "borderTopColor", "borderTopWidth",
          DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
          DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
          DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
          DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
        ],
        fields: [...borderFields("border"), ...cornerFields("corner")]
      }
    ]
  },

  {
    id: "page",
    icon: "fa-solid fa-scroll",
    // Laid out by hand, as the Title part is: the fill, its picture and both its
    // shadows are one question about the surface, and the edges and their
    // corners are one question about what is drawn around it.
    order: ["layout", "background", "padding", "border"],
    sections: [
      { id: "layout",
        order: ["maxWidth", DIVIDER, "display", "flexDirection", "flexWrap", "justify", "alignItems", "gap",
          DIVIDER, "minWidth", "minHeight", "maxHeight", "overflow"],
        fields: [
          num("maxWidth", 0, "px", 0, 2000, 10, { zeroAs: "none" }),
          // The page's own max width is stated above and kept, so the shared
          // one is left out here rather than offered twice.
          ...layoutFields("", { hide: false }).filter((field) => field.name !== "maxWidth")
        ] },
      {
        id: "background",
        label: "ILLUMINUS.Sections.fillAndImage.label",
        // The outer shadow keeps the note it had when it was a section of its
        // own: Foundry's window clips it, and only an export ever shows it.
        hint: "ILLUMINUS.Sections.pageFillAndImage.hint",
        order: [
          "background", "gradientFrom", "gradientTo", "gradientAngle", "frost",
          DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
          DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
          "innerShadowSpread", "innerShadowColor",
          DIVIDER, "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor"
        ],
        fields: [
          col("background", "#0b0a13e6"), ...frostFields(),
          { type: "image", name: "texture", default: "" },
          select("textureFit", "tile", CHOICES.textureFit, { emit: emitTextureFit }),
          select("texturePosition", "topLeft", CHOICES.texturePosition, { emit: emitTexturePosition }),
          select("textureBlend", "normal", CHOICES.blend, { emit: emitKeyword }),
          num("textureOpacity", 100, "%", 0, 100, 1),
          // The page states its picture by hand rather than through the shared
          // builder, because its defaults are Foundry's own — so the rest of
          // what a picture can be given is stated here as well.
          num("textureBlur", 0, "px", 0, 40, 0.5),
          num("textureBrightness", 100, "%", 0, 300, 5),
          num("textureContrast", 100, "%", 0, 300, 5),
          num("textureSaturation", 100, "%", 0, 300, 5),
          num("textureAge", 0, "%", 0, 100, 5),
          ...gradientFields(),
          ...shadowFields("shadow"),
          ...shadowFields("innerShadow")
        ]
      },
      {
        id: "padding",
        order: ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"],
        fields: spacingFields("padding", { top: 0, right: 12, bottom: 0, left: 0 })
      },
      {
        id: "border",
        order: [
          "borderTopStyle", "borderTopColor", "borderTopWidth",
          DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
          DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
          DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
          DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
        ],
        fields: [...borderFields("border"), ...cornerFields("corner", 6)]
      }
    ]
  },


  {
    id: "heading1",
    icon: "fa-solid fa-heading",
    family: "headings",
    order: HEADING_ORDER,
    sections: bannerSections({
      color: "#f7f3e8", size: 28, lineHeight: 0, margin: { top: 0, bottom: 8 },
      border: { color: "#5d142b" }, borderBottom: 2,
      columns: true
    })
  },
  {
    id: "heading2",
    icon: "fa-solid fa-heading",
    family: "headings",
    order: HEADING_ORDER,
    sections: bannerSections({
      color: "#f7f3e8", size: 21, lineHeight: 0, margin: { top: 21, bottom: 8 },
      border: { color: "#5d142b" }, borderBottom: 1,
      columns: true
    })
  },
  {
    id: "heading3",
    icon: "fa-solid fa-heading",
    family: "headings",
    order: HEADING_ORDER,
    sections: bannerSections({
      color: "#f7f3e8", size: 17.5, lineHeight: 0, margin: { top: 17.5, bottom: 8 },
      columns: true
    })
  },

  // Levels 4 to 6 carried on looking like level 3 until they got parts of their
  // own. Their defaults continue the same progression, so a style written
  // before they existed keeps the look it had.
  {
    id: "heading4",
    icon: "fa-solid fa-heading",
    family: "headings",
    order: HEADING_ORDER,
    sections: bannerSections({
      color: "#f7f3e8", size: 14, lineHeight: 0, margin: { top: 14, bottom: 8 },
      columns: true
    })
  },
  {
    id: "heading5",
    icon: "fa-solid fa-heading",
    family: "headings",
    order: HEADING_ORDER,
    sections: bannerSections({
      color: "#f7f3e8", size: 11.62, lineHeight: 0, margin: { top: 11.62, bottom: 8 },
      columns: true
    })
  },
  {
    id: "heading6",
    icon: "fa-solid fa-heading",
    family: "headings",
    order: HEADING_ORDER,
    sections: bannerSections({
      color: "#f7f3e8", size: 9.38, lineHeight: 0, margin: { top: 9.38, bottom: 8 },
      columns: true
    })
  },

  {
    id: "body",
    icon: "fa-solid fa-paragraph",
    // Laid out by hand, as the parts before it are: what a run reads in is said
    // by a line across the part rather than by a category of its own.
    order: ["text", "paragraph", "dropCap", "marks", "code", "codeBlock", "dividers"],
    sections: [
      {
        id: "text",
        order: [
          "font", "size", "color", "textStyle", "textStyleSlant",
          DIVIDER, "align", "caps", "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens"
        ],
        // Every one of these follows whatever is painting the page until it is
        // set: an empty color, a size of 0, an alignment of "inherit". A new
        // style therefore reads exactly as an unstyled journal does, in any
        // game system, rather than in the one it was written on.
        fields: textFields("", { choices: ["inherit", ...CHOICES.align] })
      },
      {
        id: "paragraph",
        order: [
          "firstLineIndent",
          DIVIDER, "marginTop", "marginBottom", "marginLeft", "marginRight",
          "whiteSpace", "wordBreak"
        ],
        fields: [
          ...spacingFields("margin", { top: 8, right: 0, bottom: 8, left: 0 }, { min: -100 }),
          num("firstLineIndent", 0, "px", -100, 200, 2),
          select("whiteSpace", "normal", CHOICES.whiteSpace, { emit: emitKeyword }),
          select("wordBreak", "normal", CHOICES.wordBreak, { emit: emitKeyword })
        ]
      },
      {
        // What the editor's own toolbar buttons produce. Highlight arrives as
        // Foundry's yellow-on-black until it is set here.
        id: "marks",
        order: [
          "quoteFont", "quoteColor", "quoteStyle",
          DIVIDER, "highlightColor", "highlightBackground", "highlightGradientFrom", "highlightGradientTo", "highlightGradientAngle", "highlightFrost",
          DIVIDER, "strikeColor", "strikeThickness",
          DIVIDER, "underlineColor", "underlineThickness", "underlineOffset",
          DIVIDER, "abbrColor", "abbrLine"
        ],
        fields: [
          col("highlightBackground", "highlightGradientFrom", "highlightGradientTo", "highlightGradientAngle", "highlightFrost", "#e8c979"), ...gradientFields("highlight"), ...frostFields("highlight"),
          col("highlightColor", "#241b10"),
          col("strikeColor", ""),
          num("strikeThickness", 1, "px", 0, 12, 1),
          col("underlineColor", ""),
          num("underlineThickness", 1, "px", 0, 12, 1),
          num("underlineOffset", 2, "px", 0, 20, 1),
          col("abbrColor", ""),
          select("abbrLine", "dotted", CHOICES.lineStyle),
          font("quoteFont", ""),
          select("quoteStyle", "italic", CHOICES.fontStyle),
          col("quoteColor", "")
        ]
      },
      {
        id: "code",
        order: [
          "codeFont", "codeSize", "codeColor", "codeBorderColor",
          DIVIDER, "codeBackground", "codeGradientFrom", "codeGradientTo", "codeGradientAngle", "codeFrost",
          DIVIDER, "codeTexture", "codeTextureFit", "codeTexturePosition",
          "codeTextureBlend", "codeTextureOpacity", "codeTextureBlur", "codeTextureBrightness", "codeTextureContrast", "codeTextureSaturation", "codeTextureAge",
          DIVIDER, "codeInnerShadowOffsetX", "codeInnerShadowOffsetY", "codeInnerShadowBlur",
          "codeInnerShadowSpread", "codeInnerShadowColor",
          DIVIDER, "codeShadowOffsetX", "codeShadowOffsetY", "codeShadowBlur",
          "codeShadowSpread", "codeShadowColor",
          DIVIDER, "codePaddingTop", "codePaddingBottom", "codePaddingLeft", "codePaddingRight",
          DIVIDER, "codeCornerTopLeft", "codeCornerTopRight", "codeCornerBottomLeft",
          "codeCornerBottomRight", "codeCornerShape", "codeBorderWidth"
        ],
        fields: [
          font("codeFont", "monospace"),
          num("codeSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("codeColor", ""),
          col("codeBackground", "codeGradientFrom", "codeGradientTo", "codeGradientAngle", "codeFrost", "#00000000"), ...gradientFields("code"), ...frostFields("code"), ...imageFields("code"),
          ...spacingFields("codePadding", { top: 0, right: 4, bottom: 0, left: 4 }, { max: 60 }),
          ...cornerFields("codeCorner"),
          col("codeBorderColor", ""),
          num("codeBorderWidth", 0, "px", 0, 12, 1),
        ]
      },
      // A block of code is its own thing: it had the same four Padding controls
      // as code inside a sentence, in the same section, under the same names.
      {
        id: "codeBlock",
        order: [
          "codeBlockPaddingTop", "codeBlockPaddingBottom", "codeBlockPaddingLeft", "codeBlockPaddingRight",
          DIVIDER, "codeBlockMarginTop", "codeBlockMarginBottom"
        ],
        fields: [
          ...spacingFields("codeBlockPadding", 10, { max: 80 }),
          num("codeBlockMarginTop", 10, "px", -60, 120, 1),
          num("codeBlockMarginBottom", 10, "px", -60, 120, 1)
        ]
      },
      {
        id: "dropCap",
        order: [
          "dropCap", "dropCapFont", "dropCapColor",
          DIVIDER, "dropCapOutlineColor", "dropCapOutlineWidth",
          DIVIDER, "dropCapTextShadowOffsetX", "dropCapTextShadowOffsetY",
          "dropCapTextShadowBlur", "dropCapTextShadowColor"
        ],
        fields: [
          select("dropCap", "none", CHOICES.dropCap, { emit: emitDropCap }),
          font("dropCapFont", ""),
          col("dropCapColor", "#7a2010")
        ]
      },
      {
        id: "dividers",
        order: [
          "dividerStyle", "dividerColor", "dividerLength", "dividerWidth", "dividerAlign",
          DIVIDER, "dividerMarginTop", "dividerMarginBottom"
        ],
        fields: [
          num("dividerWidth", 0, "px", 0, 40, 1),
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
    // Laid out by hand: the lettering and its shadow, then what is drawn around
    // it, then the line under it, then the chip a link can be set on.
    order: ["text", "border", "decoration", "chip"],
    sections: [
      {
        id: "text",
        order: [
          "color", "iconColor", "textStyle", "textStyleSlant", "letterSpacing", "wordSpacing",
          DIVIDER, "outlineColor", "outlineWidth",
          DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
        ],
        fields: [
          col("color", ""),
          // The mark Foundry puts in front of a link to something in the world:
          // a dragged actor arrives with a figure beside its name, a roll with
          // dice. It is an element of its own inside the link, and takes the
          // link's own color until this says otherwise.
          col("iconColor", ""),
          col("hoverColor", ""),
          ...outlineFields(),
          ...textShadowFields(),
          ...textStyleField("textStyle", "400", "normal"),
          num("letterSpacing", 0, "px", -5, 40, 0.5),
          num("wordSpacing", 0, "px", -10, 60, 0.5)
        ]
      },
      {
        id: "border",
        order: [
          "borderTopStyle", "borderTopColor", "borderTopWidth",
          DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
          DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
          DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
          DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
        ],
        fields: [
          ...borderFields("border", { width: 1, color: "#816b66" }),
          ...cornerFields("corner", 2)
        ]
      },
      {
        id: "decoration",
        order: [
          "decorationColor", "decorationLine", "decorationStyle",
          "decorationThickness", "decorationOffset"
        ],
        fields: [
          select("decorationLine", "none", CHOICES.decorationLine, { emit: emitKeyword }),
          select("decorationStyle", "solid", CHOICES.lineStyle),
          col("decorationColor", ""),
          num("decorationThickness", 1, "px", 0, 12, 0.5),
          num("decorationOffset", 2, "px", -10, 20, 0.5)
        ]
      },
      {
        id: "chip",
        order: [
          "background", "gradientFrom", "gradientTo", "gradientAngle", "frost",
          DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
          DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
          "innerShadowSpread", "innerShadowColor",
          DIVIDER, "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor",
          DIVIDER, "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
        ],
        // The chip Foundry draws a content link on: a dark pill with a hairline
        // edge, which is what an unstyled journal shows.
        fields: [
          col("background", "#0b0a13e6"), ...gradientFields(), ...frostFields(),
          ...imageFields(),
          ...spacingFields("padding", { top: 0, right: 4, bottom: 0, left: 4 }, { max: 40 })
        ]
      }
    ]
  },

  {
    id: "secrets",
    icon: "fa-solid fa-user-secret",
    // Laid out by hand: the words, the surface, the room around it, the edges,
    // then what it looks like once revealed and the button that reveals it.
    order: ["layout", "text", "background", "padding", "margin", "border", "revealed",
      "revealButton"],
    sections: [
      {
        // Hiding one is what the Reveal button is for, so it is not offered
        // here: a passage nobody can see is a passage nobody can reveal.
        id: "layout",
        order: ["display", "flexDirection", "flexWrap", "justify", "alignItems", "gap", DIVIDER, "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow"],
        fields: layoutFields("", { hide: false })
      },
      {
        id: "background",
        label: "ILLUMINUS.Sections.fillAndImage.label",
        hint: "ILLUMINUS.Sections.fillAndImage.hint",
        order: [
          "background", "gradientFrom", "gradientTo", "gradientAngle", "frost",
          DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
          DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
          "innerShadowSpread", "innerShadowColor",
          DIVIDER, "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor"
        ],
        fields: [col("background", "#3500790d"), ...gradientFields(), ...frostFields(),
          ...imageFields(), ...shadowFields("shadow")]
      },
      {
        id: "revealed",
        order: [
          "revealedBackground", "revealedGradientFrom", "revealedGradientTo", "revealedGradientAngle", "revealedFrost",
          DIVIDER, "revealedTexture", "revealedTextureFit", "revealedTexturePosition",
          "revealedTextureBlend", "revealedTextureOpacity", "revealedTextureBlur", "revealedTextureBrightness", "revealedTextureContrast", "revealedTextureSaturation", "revealedTextureAge",
          DIVIDER, "revealedInnerShadowOffsetX", "revealedInnerShadowOffsetY",
          "revealedInnerShadowBlur", "revealedInnerShadowSpread", "revealedInnerShadowColor",
          DIVIDER, "revealedShadowOffsetX", "revealedShadowOffsetY", "revealedShadowBlur",
          "revealedShadowSpread", "revealedShadowColor"
        ],
        fields: [col("revealedBackground", "revealedGradientFrom", "revealedGradientTo", "revealedGradientAngle", "revealedFrost", "#0035000d"), ...gradientFields("revealed"), ...frostFields("revealed"), ...imageFields("revealed")]
      },
      {
        id: "text",
        order: [
          "font", "size", "color", "textStyle", "textStyleSlant",
          DIVIDER, "align", "caps", "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens",
          DIVIDER, "outlineColor", "outlineWidth",
          DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
        ],
        fields: [
          font("font", ""),
          num("size", 0, "px", 0, 200, 1, { zeroAs: "inherit" }),
          col("color", ""),
          ...textStyleField("textStyle", "inherit", "inherit", { inherit: true }),
          select("caps", "inherit", ["inherit", ...CHOICES.caps], { emit: emitCaps }),
          num("letterSpacing", 0, "px", -5, 40, 0.5),
          num("wordSpacing", 0, "px", -10, 60, 0.5),
          num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" }),
          select("align", "inherit", ["inherit", ...CHOICES.align])
        ]
      },
      {
        id: "padding",
        order: ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"],
        fields: spacingFields("padding", { top: 4, right: 8, bottom: 4, left: 8 })
      },
      {
        id: "margin",
        order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
        fields: spacingFields("margin", { top: 10, right: 0, bottom: 10, left: 0 }, { min: -100 })
      },
      {
        id: "border",
        order: [
          "borderTopStyle", "borderTopColor", "borderTopWidth",
          DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
          DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
          DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
          DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
        ],
        // Top and bottom only by default, as Foundry draws them.
        fields: [
          ...borderFields("border", { color: "#7a6a58" }).map((field) =>
            ["borderTopWidth", "borderBottomWidth"].includes(field.name)
              ? { ...field, default: 1 } : field),
          ...cornerFields("corner")
        ]
      },
      {
        id: "revealButton",
        order: [
          "buttonSize", "buttonColor", "buttonBackground", "buttonGradientFrom", "buttonGradientTo", "buttonGradientAngle", "buttonFrost",
          DIVIDER, "buttonBorderStyle", "buttonBorderColor", "buttonBorderWidth",
          DIVIDER, "buttonCornerTopLeft", "buttonCornerTopRight",
          "buttonCornerBottomLeft", "buttonCornerBottomRight", "buttonCornerShape",
          DIVIDER, "buttonTexture", "buttonTextureFit", "buttonTexturePosition",
          "buttonTextureBlend", "buttonTextureOpacity", "buttonTextureBlur", "buttonTextureBrightness", "buttonTextureContrast", "buttonTextureSaturation", "buttonTextureAge",
          DIVIDER, "buttonInnerShadowOffsetX", "buttonInnerShadowOffsetY", "buttonInnerShadowBlur",
          "buttonInnerShadowSpread", "buttonInnerShadowColor",
          DIVIDER, "buttonShadowOffsetX", "buttonShadowOffsetY", "buttonShadowBlur",
          "buttonShadowSpread", "buttonShadowColor"
        ],
        fields: [
          col("buttonColor", "#f0f0e0"),
          col("buttonBackground", "buttonGradientFrom", "buttonGradientTo", "buttonGradientAngle", "buttonFrost", "#00000000"), ...gradientFields("button"), ...frostFields("button"), ...imageFields("button"),
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
    id: "lists",
    icon: "fa-solid fa-list-ul",
    // Laid out by hand: where the list sits, the room around it, the mark in
    // front of each item, and then the two-part lettering of a definition list.
    order: ["layout", "margin", "marker", "definitions"],
    sections: [
      {
        id: "marker",
        order: ["markerFont", "markerSize", "markerColor", "bullet", "numberStyle"],
        fields: [
          select("bullet", "disc", CHOICES.bullet, { emit: emitBullet }),
        select("numberStyle", "decimal", CHOICES.numberStyle, { emit: emitKeyword }),
        num("markerSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("markerColor", ""),
          col("markerHoverColor", ""),
          font("markerFont", "")
        ]
      },
      {
        // dt and dd inherit Foundry's own colors, which are light — on a
        // parchment page they are close to invisible until set here.
        id: "definitions",
        order: [
          "termFont", "termSize", "termColor", "termTextStyle", "termTextStyleSlant",
          "termCaps", "termSpacingAbove",
          DIVIDER, "termOutlineWidth", "termOutlineColor",
          DIVIDER, "termTextShadowOffsetX", "termTextShadowOffsetY",
          "termTextShadowBlur", "termTextShadowColor",
          DIVIDER, "detailFont", "detailSize", "detailColor", "detailTextStyle",
          "detailTextStyleSlant", "detailIndent", "detailSpacingBelow",
          DIVIDER, "detailOutlineWidth", "detailOutlineColor",
          DIVIDER, "detailTextShadowOffsetX", "detailTextShadowOffsetY",
          "detailTextShadowBlur", "detailTextShadowColor"
        ],
        fields: [
          font("termFont", ""),
          num("termSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("termColor", ""),
          col("termHoverColor", ""),
          ...textStyleField("termTextStyle", "700", "normal"),
          select("termCaps", "none", CHOICES.caps, { emit: emitCaps }),
          num("termSpacingAbove", 8, "px", 0, 100, 1),
          font("detailFont", ""),
          num("detailSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("detailColor", ""),
          col("detailHoverColor", ""),
          ...textStyleField("detailTextStyle", "400", "normal"),
          num("detailIndent", 24, "px", 0, 200, 2),
          num("detailSpacingBelow", 6, "px", 0, 100, 1)
        ]
      },
      {
        id: "margin",
        order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
        fields: spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 })
      },
      {
        id: "layout",
        order: ["indent", "itemSpacing", DIVIDER, "display", "flexDirection", "flexWrap", "justify", "alignItems", "gap",
          DIVIDER, "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow"],
        fields: [
          num("indent", 24, "px", 0, 200, 2),
          num("itemSpacing", 4, "px", 0, 60, 1),
          // A list laid out as a row makes its items a run rather than a
          // column, which is how a line of trait chips is built.
          ...layoutFields("", { hide: false })
        ]
      }
    ]
  },

  {
    id: "tables",
    icon: "fa-solid fa-table",
    // Laid out by hand: the table itself, then the parts of it — the header row,
    // the rows beneath, a cell, and the caption.
    order: ["layout", "text", "margin", "border", "header", "rows", "cellPadding", "tableCaption"],
    sections: [
      // How wide the table is drawn, which is a question about the table rather
      // than about its lettering.
      { id: "layout",
        order: ["width", DIVIDER, "display", DIVIDER, "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow"],
        fields: [
          num("width", 100, "%", 10, 100, 1),
          ...layoutFields("", { flex: false, hide: false })
        ] },
      {
        id: "text",
        order: [
          "font", "size", "textColor",
          DIVIDER, "align", "verticalAlign", "lineHeight", "wrap", "hyphens",
          DIVIDER, "outlineColor", "outlineWidth",
          DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
        ],
        fields: [
          font("font", ""),
          num("size", 0, "px", 0, 100, 1, { zeroAs: "inherit" }),
          col("textColor", ""),
          num("lineHeight", 0, "", 0, 4, 0.05, { zeroAs: "inherit" }),
          select("align", "left", CHOICES.align),
          select("verticalAlign", "middle", CHOICES.verticalAlign)
        ]
      },
      {
        id: "margin",
        order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
        fields: spacingFields("margin", { top: 0, right: 0, bottom: 8, left: 0 }, { min: -100 })
      },
      {
        id: "border",
        order: [
          "borderTopStyle", "borderTopColor", "borderTopWidth",
          DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
          DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
          DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
          DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
        ],
        fields: [...borderFields("border"), ...cornerFields("corner")]
      },
      {
        id: "header",
        order: [
          "headerBackground", "headerGradientFrom", "headerGradientTo", "headerGradientAngle",
        "headerFrost",
          DIVIDER, "headerFont", "headerSize", "headerColor", "headerTextStyle", "headerTextStyleSlant",
          DIVIDER, "headerAlign", "headerCaps", "headerLetterSpacing", "headerWordSpacing",
          DIVIDER, "headerOutlineColor", "headerOutlineWidth",
          DIVIDER, "headerTextShadowOffsetX", "headerTextShadowOffsetY",
          "headerTextShadowBlur", "headerTextShadowColor",
          DIVIDER, "headerTexture", "headerTextureFit", "headerTexturePosition",
          "headerTextureBlend", "headerTextureOpacity", "headerTextureBlur", "headerTextureBrightness", "headerTextureContrast", "headerTextureSaturation", "headerTextureAge",
          DIVIDER, "headerInnerShadowOffsetX", "headerInnerShadowOffsetY", "headerInnerShadowBlur",
          "headerInnerShadowSpread", "headerInnerShadowColor",
          DIVIDER, "headerShadowOffsetX", "headerShadowOffsetY", "headerShadowBlur",
          "headerShadowSpread", "headerShadowColor"
        ],
        fields: [
          col("headerBackground", "#00000000"), ...gradientFields("header"), ...frostFields("header"),
          ...imageFields("header"),
          col("headerColor", ""),
          font("headerFont", ""),
          num("headerSize", 0, "px", 0, 100, 1, { zeroAs: "inherit" }),
          ...textStyleField("headerTextStyle", "700", "normal"),
          select("headerCaps", "none", CHOICES.caps, { emit: emitCaps }),
          select("headerAlign", "left", CHOICES.align),
          num("headerLetterSpacing", 0, "px", -5, 40, 0.5),
          num("headerWordSpacing", 0, "px", -10, 60, 0.5)
        ]
      },
      { id: "rows", order: ["rowColor", "stripeColor"],
        fields: [col("stripeColor", "#00000010"), col("rowColor", "#00000000")] },
      // A cell's own spacing and its edges are one question about a cell, so
      // they read as one category.
      {
        id: "cellPadding",
        label: "ILLUMINUS.Sections.cellStyles.label",
        hint: "ILLUMINUS.Sections.cellStyles.hint",
        order: [
          "cellPaddingTop", "cellPaddingBottom", "cellPaddingLeft", "cellPaddingRight",
          DIVIDER, "cellBorderTopStyle", "cellBorderTopColor", "cellBorderTopWidth",
          DIVIDER, "cellBorderBottomStyle", "cellBorderBottomColor", "cellBorderBottomWidth",
          DIVIDER, "cellBorderLeftStyle", "cellBorderLeftColor", "cellBorderLeftWidth",
          DIVIDER, "cellBorderRightStyle", "cellBorderRightColor", "cellBorderRightWidth"
        ],
        fields: [
          ...spacingFields("cellPadding", { top: 8, right: 16, bottom: 8, left: 16 }, { max: 80 }),
          ...borderFields("cellBorder")
        ]
      },
      {
        id: "tableCaption",
        order: [
          "captionFont", "captionSize", "captionColor", "captionTextStyle", "captionTextStyleSlant",
          DIVIDER, "captionAlign", "captionCaps",
          DIVIDER, "captionOutlineColor", "captionOutlineWidth",
          DIVIDER, "captionTextShadowOffsetX", "captionTextShadowOffsetY",
          "captionTextShadowBlur", "captionTextShadowColor", "captionSide", "captionSpacing"
        ],
        fields: [
          select("captionSide", "top", ["top", "bottom"]),
          font("captionFont", ""),
          num("captionSize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("captionColor", "#5a4326"),
          ...textStyleField("captionTextStyle", "700", "italic"),
          select("captionCaps", "none", CHOICES.caps, { emit: emitCaps }),
          select("captionAlign", "center", CHOICES.alignNoJustify),
          num("captionSpacing", 6, "px", 0, 60, 1)
        ]
      }
    ]
  },

  {
    id: "boxes",
    icon: "fa-solid fa-square-dashed",
    // Laid out by hand: the words, the surface they sit on, the room around
    // them, the edges, and then the disclosure widget that can fold them away.
    order: ["layout", "text", "background", "padding", "margin", "border",
      "blockHeadings", "collapsible"],
    sections: [
      // Laid out and headed by the same function its five treatments use, so
      // the plain box cannot drift from them again. It was the only box that
      // could not be given a width, floated, turned, or held in view while the
      // page scrolled past — and the only one whose headings a style could not
      // reach.
      ...boxSections().filter((section) => ["layout", "blockHeadings"].includes(section.id)),
      {
        id: "text",
        order: [
          "font", "size", "color", "textStyle", "textStyleSlant",
          DIVIDER, "align", "caps", "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens",
          DIVIDER, "outlineColor", "outlineWidth",
          DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
        ],
        fields: textFields("", { style: "italic", choices: ["inherit", ...CHOICES.align] })
      },
      {
        id: "background",
        label: "ILLUMINUS.Sections.fillAndImage.label",
        hint: "ILLUMINUS.Sections.fillAndImage.hint",
        order: [
          "background", "gradientFrom", "gradientTo", "gradientAngle", "frost",
          DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
          DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
          "innerShadowSpread", "innerShadowColor",
          DIVIDER, "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor"
        ],
        fields: [col("background", "#00000000"), ...gradientFields(), ...frostFields(),
          ...imageFields(), ...shadowFields("shadow")]
      },
      {
        id: "padding",
        order: ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"],
        fields: spacingFields("padding", { top: 0, right: 0, bottom: 0, left: 16 })
      },
      {
        id: "margin",
        order: ["marginTop", "marginBottom", "marginLeft", "marginRight"],
        fields: spacingFields("margin", 0, { min: -100 })
      },
      {
        id: "border",
        order: [
          "borderTopStyle", "borderTopColor", "borderTopWidth",
          DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
          DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth",
          DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
          DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
        ],
        fields: [...borderFields("border", { color: "#7a2010" }), ...cornerFields("corner", 2)]
      },
      {
        // Foundry's disclosure widget: a <details> the reader can fold away.
        id: "collapsible",
        order: [
          "summaryFont", "summarySize", "summaryColor", "collapsibleBorderColor",
          "summaryTextStyle", "summaryTextStyleSlant",
          DIVIDER, "summaryCaps", "summaryBackground", "summaryGradientFrom", "summaryGradientTo", "summaryGradientAngle", "summaryFrost", "summaryPaddingTop", "summaryPaddingBottom",
          "summaryPaddingLeft", "summaryPaddingRight",
          DIVIDER, "collapsibleBackground", "collapsibleGradientFrom", "collapsibleGradientTo", "collapsibleGradientAngle", "collapsibleFrost", "collapsiblePaddingTop", "collapsiblePaddingBottom",
          "collapsiblePaddingLeft", "collapsiblePaddingRight",
          DIVIDER, "summaryOutlineColor", "summaryOutlineWidth",
          DIVIDER, "summaryTextShadowOffsetX", "summaryTextShadowOffsetY",
          "summaryTextShadowBlur", "summaryTextShadowColor",
          DIVIDER, "summaryTexture", "summaryTextureFit", "summaryTexturePosition",
          "summaryTextureBlend", "summaryTextureOpacity", "summaryTextureBlur", "summaryTextureBrightness", "summaryTextureContrast", "summaryTextureSaturation", "summaryTextureAge",
          DIVIDER, "summaryInnerShadowOffsetX", "summaryInnerShadowOffsetY", "summaryInnerShadowBlur",
          "summaryInnerShadowSpread", "summaryInnerShadowColor",
          DIVIDER, "summaryShadowOffsetX", "summaryShadowOffsetY", "summaryShadowBlur",
          "summaryShadowSpread", "summaryShadowColor",
          DIVIDER, "collapsibleMarginTop", "collapsibleMarginBottom",
          DIVIDER, "collapsibleBorderWidth", "collapsibleCornerTopLeft", "collapsibleCornerTopRight",
          "collapsibleCornerBottomLeft", "collapsibleCornerBottomRight", "collapsibleCornerShape"
        ],
        fields: [
          font("summaryFont", ""),
          num("summarySize", 0, "px", 0, 120, 1, { zeroAs: "inherit" }),
          col("summaryColor", "#5e1914"),
          ...textStyleField("summaryTextStyle", "700", "normal"),
          select("summaryCaps", "none", CHOICES.caps, { emit: emitCaps }),
          col("summaryBackground", "summaryGradientFrom", "summaryGradientTo", "summaryGradientAngle", "summaryFrost", "#00000000"), ...gradientFields("summary"), ...frostFields("summary"), ...imageFields("summary"),
          ...spacingFields("summaryPadding", { top: 4, right: 8, bottom: 4, left: 8 }, { max: 60 }),
          col("collapsibleBackground", "collapsibleGradientFrom", "collapsibleGradientTo", "collapsibleGradientAngle", "collapsibleFrost", "#00000000"), ...gradientFields("collapsible"), ...frostFields("collapsible"),
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
    id: "editor",
    icon: "fa-solid fa-pen-to-square",
    // The window Edit Page opens, which Foundry appends to the body and
    // positions itself. It is styled apart from the journal window: the two are
    // different windows doing different jobs, and a frame that reads well around
    // a page of prose is not always the one to write in. What is written *on*
    // is the page's own surface, which the Page part paints — the same surface as
    // the page it will become, so that what you type looks like what you will
    // read.
    strip: "end",
    sections: [
      {
        id: "frame",
        fields: [
          col("background", "#00000000"), ...gradientFields(), ...frostFields(), ...imageFields(),
          ...borderFields("border", { color: "#00000000" }),
          ...cornerFields("corner")
        ]
      },
      {
        id: "frameSize",
        fields: [
          num("frameMinWidth", 0, "px", 0, 3000, 10, { zeroAs: "auto" }),
          num("frameMaxWidth", 0, "px", 0, 3000, 10, { zeroAs: "none" })
        ]
      },
      {
        id: "titleBar",
        fields: [
          col("titleBarBackground", "titleBarGradientFrom", "titleBarGradientTo", "titleBarGradientAngle", "titleBarFrost", "#00000000"), ...gradientFields("titleBar"), ...frostFields("titleBar"), ...imageFields("titleBar"),
          font("font", ""),
          num("size", 0, "px", 0, 60, 1, { zeroAs: "inherit" }),
          col("color", ""),
          ...textStyleField("textStyle", "normal", "normal"),
          select("caps", "none", CHOICES.caps, { emit: emitCaps }),
          num("letterSpacing", 0, "px", -5, 40, 0.5),
          num("wordSpacing", 0, "px", -10, 60, 0.5),
          select("align", "left", CHOICES.alignNoJustify),
          ...spacingFields("padding", { top: 0, right: 8, bottom: 0, left: 8 }, { max: 60 })
        ]
      },
      {
        id: "headerButtons",
        fields: [
          col("headerButtonColor", "#f7f3e8"),
          col("headerButtonHoverColor", "#ffffff"),
          col("headerButtonBackground", "headerButtonGradientFrom", "headerButtonGradientTo", "headerButtonGradientAngle", "headerButtonFrost", "#00000000"), ...gradientFields("headerButton"), ...frostFields("headerButton"), ...imageFields("headerButton"),
          col("headerButtonHoverBackground", "#00000000"), ...imageFields("headerButtonHover"),
          num("headerButtonSize", 14, "px", 6, 48, 1),
          ...borderFields("headerButtonBorder", { color: "#00000000" }),
          ...cornerFields("headerButtonCorner", 4)
        ]
      },
      // The bar of controls above the prose, and the icons on it. Two
      // categories rather than one: a fill set on the bar paints the whole row
      // and a fill set on an icon paints what sits behind that icon, and one
      // category holding both said "Fill Color" twice and meant two things.
      {
        id: "toolbar",
        fields: [
          col("toolbarBackground", "toolbarGradientFrom", "toolbarGradientTo", "toolbarGradientAngle", "toolbarFrost", ""), ...gradientFields("toolbar"), ...frostFields("toolbar"), ...imageFields("toolbar"),
          ...borderFields("toolbarBorder", { color: "#00000000" }),
          ...cornerFields("toolbarCorner", 6),
          ...spacingFields("toolbarPadding", 8, { max: 60 })
        ]
      },
      {
        id: "toolbarIcons",
        fields: [
          col("toolbarColor", ""),
          col("toolbarHoverColor", ""),
          num("toolbarSize", 0, "px", 0, 40, 1, { zeroAs: "inherit" }),
          col("toolbarButtonBackground", "toolbarButtonGradientFrom", "toolbarButtonGradientTo", "toolbarButtonGradientAngle", "toolbarButtonFrost", ""), ...gradientFields("toolbarButton"), ...frostFields("toolbarButton"), ...imageFields("toolbarButton"),
          col("toolbarButtonHoverBackground", "#00000000"),
          ...borderFields("toolbarButtonBorder", { color: "#00000000" }),
          ...cornerFields("toolbarButtonCorner", 4),
          ...spacingFields("toolbarButtonPadding",
            { top: 0, right: 5, bottom: 0, left: 5 }, { max: 40 })
        ]
      },
      // The two named controls on that row — Format, and Illuminus — which open
      // a list rather than doing something. The list itself is Foundry's and is
      // drawn outside the window, so what a style reaches is the control.
      {
        id: "dropdowns",
        fields: [
          font("dropdownFont", ""),
          // Silent at 0 rather than the `inherit` the rest use: the rule reads
          // the icon size next, so a row set to 20 sizes its named controls too.
          num("dropdownSize", 0, "px", 0, 40, 1, { emitZero: false }),
          col("dropdownColor", ""),
          col("dropdownHoverColor", ""),
          ...textStyleField("dropdownTextStyle", "inherit", "inherit", { inherit: true }),
          col("dropdownBackground", "dropdownGradientFrom", "dropdownGradientTo", "dropdownGradientAngle", "dropdownFrost", "#00000000"), ...gradientFields("dropdown"), ...frostFields("dropdown"), ...imageFields("dropdown"),
          col("dropdownHoverBackground", "#00000000"),
          ...borderFields("dropdownBorder", { color: "#00000000" }),
          ...cornerFields("dropdownCorner", 4),
          ...spacingFields("dropdownPadding",
            { top: 1, right: 5, bottom: 1, left: 5 }, { max: 40 })
        ]
      },
      // The row those settings sit on, which is an area of its own: the
      // controls are painted below, and this is the strip behind them.
      {
        id: "settingsBar",
        fields: [
          // The lettering on the strip, which everything standing on it follows
          // until it is given something of its own: a size or a color set under
          // Page Settings wins, and one left alone takes what the strip says.
          ...textFields("settingsBar"),
          col("settingsBarBackground", "settingsBarGradientFrom", "settingsBarGradientTo", "settingsBarGradientAngle", "settingsBarFrost", "#00000000"), ...gradientFields("settingsBar"), ...frostFields("settingsBar"), ...imageFields("settingsBar"),
          ...borderFields("settingsBarBorder", { color: "#00000000" }),
          ...cornerFields("settingsBarCorner"),
          ...spacingFields("settingsBarPadding", 0, { max: 60 }),
          // Space around the strip as well as inside it: negative values pull
          // it against the page's name above it or the editing bar below.
          ...spacingFields("settingsBarMargin", 0, { min: -40, max: 60 })
        ]
      },
      // The list a named control opens, which core builds on the body rather
      // than inside the window — marked as it appears so these reach it.
      {
        id: "dropdownList",
        fields: [
          col("listBackground", "listGradientFrom", "listGradientTo", "listGradientAngle", "listFrost", "#00000000"), ...gradientFields("list"), ...frostFields("list"), ...imageFields("list"),
          ...borderFields("listBorder", { color: "#00000000" }),
          ...cornerFields("listCorner"),
          ...spacingFields("listPadding", 0, { max: 40 })
        ]
      },
      {
        id: "dropdownItems",
        fields: [
          font("itemFont", ""),
          num("itemSize", 0, "px", 0, 40, 1, { zeroAs: "inherit" }),
          col("itemColor", ""),
          ...textStyleField("itemTextStyle", "inherit", "inherit", { inherit: true }),
          col("itemBackground", "itemGradientFrom", "itemGradientTo", "itemGradientAngle", "itemFrost", "#00000000"), ...gradientFields("item"), ...frostFields("item"),
          ...cornerFields("itemCorner"),
          ...spacingFields("itemPadding", 0, { max: 40 }),
          // The line core draws between the runs of entries.
          col("itemDividerColor", "")
        ]
      },
      // The page's own settings, above the prose: which level its title is, and
      // whether that title is shown at all.
      {
        id: "pageFields",
        fields: [
          font("fieldFont", ""),
          num("fieldSize", 0, "px", 0, 40, 1, { zeroAs: "inherit" }),
          col("fieldColor", ""),
          ...textStyleField("fieldTextStyle", "inherit", "inherit", { inherit: true }),
          col("fieldBackground", "fieldGradientFrom", "fieldGradientTo", "fieldGradientAngle", "fieldFrost", ""), ...gradientFields("field"), ...frostFields("field"), ...imageFields("field"),
          ...borderFields("fieldBorder", { width: 1, color: "#00000000" }),
          ...cornerFields("fieldCorner", 4),
          ...spacingFields("fieldPadding",
            { top: 0, right: 8, bottom: 0, left: 8 }, { max: 40 }),
          // The tick box beside them is not a box at all: Foundry turns the
          // browser's own drawing off and prints a glyph in its place, so a
          // fill, an edge and a corner land on nothing. What it answers to is
          // the color of the empty box, the color it turns once ticked, the
          // color of the tick itself, and how large the glyph is drawn.
          col("fieldCheckColor", ""),
          col("fieldCheckTickedColor", ""),
          col("fieldCheckMarkColor", ""),
          num("fieldCheckSize", 0, "px", 0, 40, 1, { emitZero: false })
        ]
      }
    ]
  },

  // A tag nobody has given a treatment, which is the counterpart of Default Box
  // and Default Image: the shape a style hands the editor's plain Tag entry, so
  // one look can be had without picking one of ten.
  //
  // It cannot be reached by taking a treatment off, the way the other two are —
  // a tag *is* the mark, and removing it leaves bare words. The editor's Tag
  // menu names it first instead.
  {
    id: "tags",
    icon: "fa-solid fa-tag",
    sections: tagSections()
  },

  {
    id: "images",
    icon: "fa-solid fa-image",
    sections: [
      { id: "margin", fields: spacingFields("margin", 0, { min: -100 }) },
      {
        id: "layout",
        // Laid out as the five picture treatments are, which the plain picture
        // was not: it could not be floated, flipped, cropped to a shape, held
        // in view, turned or nudged. Three of theirs are left out on purpose.
        // Align is one: a treatment's emits the very margins this part already
        // offers, so both would write one property. Max Width is another — this
        // part states it as a share of the column, which is the more useful
        // answer for a picture, and `layoutFields` would add a second in pixels.
        // And a background picture is the third, which an `<img>` cannot carry:
        // its fill sits behind the picture rather than behind content, so there
        // is no layer to put one on.
        fields: [
          select("float", "none", CHOICES.blockFloat),
          select("width", "full", CHOICES.blockWidth, { emit: emitBlockWidth }),
          select("clear", "none", CHOICES.blockClear),
          select("flip", "none", CHOICES.flip, { emit: emitFlip }),
          select("pictureShape", "ownShape", CHOICES.pictureShape, { emit: emitShape }),
          select("pictureCrop", "cover", CHOICES.pictureCrop, { emit: emitCrop }),
          select("pictureFrom", "center", CHOICES.texturePosition, { emit: emitTexturePosition }),
          ...layoutFields("", { flex: false, position: true })
            .filter((field) => field.name !== "maxWidth"),
          ...turnFields(),
          num("maxWidth", 100, "%", 5, 100, 1),
          num("opacity", 100, "%", 0, 100, 1)
        ]
      },
      { id: "padding", fields: spacingFields("padding", 0, { max: 80 }) },
      { id: "background", fields: [col("background", "#00000000"), ...gradientFields(),
        ...frostFields(), ...shadowFields("innerShadow")] },
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
          ...textStyleField("captionTextStyle", "400", "italic"),
          select("captionCaps", "none", CHOICES.caps, { emit: emitCaps }),
          select("captionAlign", "center", CHOICES.alignNoJustify),
          num("captionSpacing", 4, "px", 0, 60, 1)
        ]
      }
    ]
  },

  ...members("box", "boxStyles", "fa-solid fa-square-dashed", boxSections),
  ...members("tag", "tagStyles", "fa-solid fa-tag", tagSections),
  ...members("image", "imageStyles", "fa-solid fa-image", imageSections),
  ...members("list", "listStyles", "fa-solid fa-list", listSections),
  ...members("table", "tableStyles", "fa-solid fa-table", tableSections),

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
  "background", "gradientFrom", "gradientTo", "gradientAngle",
  // A shadow is paint, like the outline beside it: it lifts the letter off what
  // is behind it and moves nothing. Sharing one between the states meant a
  // shadow set for the ordinary look was the shadow you got when pointed at.
  "textShadowOffsetX",
  "textShadowOffsetY",
  "textShadowBlur",
  "textShadowColor",
  // The outline as well as the fill: sharing one outline between the ordinary
  // and pointed-at states meant setting it under Hovered changed the ordinary
  // one too, which is not what a state is for. Still paint only — a stroke
  // draws inside the letter's own box, so nothing moves.
  "outlineWidth",
  "outlineColor",
  ...SIDES.map((side) => `border${side}Color`)
];

/**
 * A control's counterpart in one of its other states, saying nothing until it
 * is filled in.
 *
 * The same kind of control as the one it stands in for: an empty color or
 * typeface, an unchosen option, a number that emits nothing rather than a
 * literal zero — so the state's own rule falls back to the ordinary value and
 * an element nobody has set anything for looks exactly as it did.
 * @param {object} original  The control being shadowed.
 * @param {string} name      What the twin is called.
 * @param {string} word      The state, `hover` or `active`.
 */
function stateTwin(original, name, word) {
  if (original.type === "toggle") {
    // A tick box has two answers and the twin needs three: yes, no, and
    // "whatever the ordinary one says". Left as a tick box, an untouched twin
    // would read as *off* — which is how hovering the journal's name came to
    // hide it.
    return { ...select(name, "same", ["same", "on", "off"], {
      emit: (value) => (value === "on" ? original.on : value === "off" ? original.off : null)
    }), twin: true, origin: original.name };
  }
  // A twin says nothing until it is filled in, and zero is how a number says
  // it — so the twin's range has to start at zero however narrow the ordinary
  // control's is. Copying `min` raised the twin's silence to the control's
  // minimum: the panel's width twin emitted 120px, and pointing anywhere in a
  // journal shrank the contents panel from 300 to 120 and slid every click
  // target sideways with it.
  const quiet = {
    number: { default: 0, emitZero: false, min: 0 },
    font: { default: "", emitEmpty: false },
    select: { default: "" },
    color: { default: "" },
    image: { default: "" }
  }[original.type] ?? { default: "" };
  // "Match all sides" copies one value across everything sharing a link, so a
  // twin needs a link of its own: sharing the ordinary one's meant matching the
  // corners of a button overwrote its other states' corners with the ordinary
  // value, which reads as those settings not working.
  const link = original.link ? { link: stateNameFor(word, original.link) } : {};
  // Marked as derived, because a name is not enough to tell one by. A part can
  // declare a hovered *element* by hand — the contents panel's pointed-at entry
  // has a picture of its own, whose strength of 100% is meant — and those
  // controls wear "hover" in their name exactly as a derived twin does. Only a
  // derived twin owes its element silence when it is empty.
  return { ...original, name, twin: true, origin: original.name, ...quiet, ...link };
}

/** A state's name for a control, e.g. `hover` + `borderTopColor`. */
function stateNameFor(word, name) {
  return `${word}${name[0].toUpperCase()}${name.slice(1)}`;
}

/** Hovered name for a control, e.g. `borderTopColor` -> `hoverBorderTopColor`. */
export function hoverNameFor(name) {
  return `hover${name[0].toUpperCase()}${name.slice(1)}`;
}

/** Whether a name is the hovered twin of some other control. */
function isHoverName(name) {
  return /^hover[A-Z]/.test(name);
}

/**
 * An outline wherever lettering can be set.
 *
 * A section that offers a typeface is a section about words, so it offers a line
 * around them too — derived from that rather than listed, so a new text section
 * gets one without an edit here. The prefix comes from the typeface's own name,
 * which keeps `headingFont` and `headingOutlineWidth` together.
 *
 * Body text is left out: it is the one place a page-wide outline would be a
 * mistake rather than a decoration, and it is what everything else falls back
 * to. A list marker is left out because a marker is not a letterform — the
 * pseudo-element it is drawn in takes a color and a face and nothing else.
 */
const NO_OUTLINE_GROUPS = new Set(["body"]);
const NO_OUTLINE_FIELDS = new Set(["markerFont"]);
// Body text takes neither, with one exception: the opening capital is a piece
// of display lettering rather than prose, and is exactly the sort of letter
// somebody wants outlined and shadowed.
const OUTLINE_ANYWAY = new Set(["body.dropCap"]);

for (const group of GROUPS) {
  for (const section of group.sections) {
    if (NO_OUTLINE_GROUPS.has(group.id) && !OUTLINE_ANYWAY.has(`${group.id}.${section.id}`)) continue;
    for (const field of [...section.fields]) {
      if (field.type !== "font" || NO_OUTLINE_FIELDS.has(field.name)) continue;
      const prefix = field.name === "font" ? "" : field.name.replace(/Font$/, "");
      const [width] = outlineFields(prefix);
      const after = (added) => {
        // Directly after the last control sharing this prefix: appending to the
        // end of the section put a term's outline below a definition's indent,
        // which reads as belonging to neither.
        const last = section.fields.reduce((at, other, index) =>
          (prefix ? other.name.startsWith(prefix) : !/[A-Z]/.test(other.name[0])) ? index : at, -1);
        section.fields.splice(last + 1, 0, ...added);
      };
      if (!section.fields.some((other) => other.name === width.name)) after(outlineFields(prefix));
      // The two go together: an outline and a shadow are the two things you do
      // to a letter to lift it off what is behind it, and having one without
      // the other is a gap somebody meets the moment they try.
      const shadow = prefix ? `${prefix}TextShadow` : "textShadow";
      const inGroup = group.sections.some((other) =>
        other.fields.some((f) => f.name === `${shadow}OffsetX`));
      if (!inGroup) after(textShadowFields(shadow));
    }
  }
}

/**
 * A shadow, and a shading inside the edges, wherever a picture can be placed.
 *
 * A background picture and a shadow are the same decision from a style's point
 * of view: this is a surface, and here is how it sits on the page. Anything that
 * can carry one can carry the other, so the pair is derived from the picture
 * rather than listed — a new fill with a picture beside it gets both for free,
 * and `validate.mjs` sees to it that the stylesheet reads them.
 *
 * A state's own picture is skipped: its shadows come from the hovered twins
 * derived below, so shadowing `entryHoverTexture` here would be a second
 * control for the pointed-at shadow of a listed page.
 */
for (const group of GROUPS) {
  const taken = new Set(group.sections.flatMap((section) => section.fields.map((field) => field.name)));
  for (const section of group.sections) {
    for (const field of [...section.fields]) {
      const prefix = field.name === "texture" ? "" : field.name.match(/^(.*)Texture$/)?.[1];
      if (prefix === undefined || /hover|active/i.test(prefix)) continue;
      for (const kind of ["Shadow", "InnerShadow"]) {
        const name = prefix ? `${prefix}${kind}` : `${kind[0].toLowerCase()}${kind.slice(1)}`;
        if (taken.has(`${name}Color`)) continue;
        const made = shadowFields(name);
        for (const one of made) taken.add(one.name);
        section.fields.push(...made);
      }
    }
  }
}

/**
 * Parts laid out by hand, as data.
 *
 * The parts done earliest say their arrangement in their own literal — an
 * `order` on the group and one on each section. That reads well for a part whose
 * categories were also rewritten, and badly for seven parts at once, so the rest
 * say it here: which categories the part has, in which order, and what is in each
 * of them. A control named for a category it did not belong to is moved into it,
 * which is how a category can hold what were two before.
 *
 * The runs inside a category are separated by `DIVIDER`, exactly as they are in
 * a section's own `order`.
 */
/*
 * How a block lays itself out, and how a heading inside one is set. Stated once
 * and read twice: the five box treatments have always had these, and the plain
 * box — which is the same element without a treatment on it — now has them too.
 * Written apart from the tables below so the two cannot drift, which is how the
 * Default Box came to be the only box that could not be given a width.
 */
const BLOCK_LAYOUT_ORDER = [
  "float", "width", "clear", "whenEmpty",
  DIVIDER, "display", "flexDirection", "flexWrap", "justify", "alignItems", "gap",
  DIVIDER, "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow",
  DIVIDER, "position", "offsetTop", "offsetLeft", "turn", "scale"
];

const BLOCK_HEADINGS_ORDER = [
  "headingFont", "headingSize", "headingColor", "headingRuleColor", "headingTextStyle",
  "headingTextStyleSlant", DIVIDER, "headingAlign", "headingCaps", DIVIDER,
  "headingOutlineColor", "headingOutlineWidth", DIVIDER, "headingTextShadowOffsetX",
  "headingTextShadowOffsetY", "headingTextShadowBlur", "headingTextShadowColor", DIVIDER,
  "headingMarginTop", "headingMarginBottom", "headingRuleWidth", "headingRuleStyle",
  DIVIDER
];

const LAYOUTS = {
  images: {
    order: ["layout", "padding", "margin", "border", "caption", "media"],
    layout: { order: [
      "opacity", "background", "gradientFrom", "gradientTo", "gradientAngle", "frost",
      DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
      "innerShadowSpread", "innerShadowColor",
      DIVIDER, "glowOffsetX", "glowOffsetY", "glowSize", "glowColor",
      DIVIDER, "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor",
      // In the order a treatment reads them, so the plain picture and a treated
      // one are the same part with the same settings in the same places.
      DIVIDER, "float", "width", "clear", "flip",
      DIVIDER, "pictureShape", "pictureCrop", "pictureFrom",
      DIVIDER, "display", "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow",
      DIVIDER, "position", "offsetTop", "offsetLeft", "turn", "scale"
    ] },
    padding: { order: [
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    margin: { order: [
      "marginTop", "marginBottom", "marginLeft", "marginRight"
    ] },
    border: { order: [
      "borderTopStyle", "borderTopColor", "borderTopWidth", DIVIDER, "borderBottomStyle",
      "borderBottomColor", "borderBottomWidth", DIVIDER, "borderLeftStyle", "borderLeftColor",
      "borderLeftWidth", DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
      DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
    ] },
    caption: { label: "ILLUMINUS.Sections.imageCaption.label", hint: "ILLUMINUS.Sections.imageCaption.hint", order: [
      "captionFont", "captionSize", "captionColor", "captionTextStyle",
      "captionTextStyleSlant", DIVIDER, "captionAlign", "captionCaps", DIVIDER,
      "captionOutlineColor", "captionOutlineWidth", DIVIDER, "captionTextShadowOffsetX",
      "captionTextShadowOffsetY", "captionTextShadowBlur", "captionTextShadowColor",
      "captionSpacing"
    ] },
    media: { order: [
      "mediaMaxWidth", DIVIDER, "mediaShadowOffsetX", "mediaShadowOffsetY", "mediaShadowBlur",
      "mediaShadowSpread", "mediaShadowColor", DIVIDER, "mediaMarginTop", "mediaMarginBottom",
      DIVIDER, "mediaBorderTopStyle", "mediaBorderTopColor", "mediaBorderTopWidth", DIVIDER,
      "mediaBorderBottomStyle", "mediaBorderBottomColor", "mediaBorderBottomWidth", DIVIDER,
      "mediaBorderLeftStyle", "mediaBorderLeftColor", "mediaBorderLeftWidth", DIVIDER,
      "mediaBorderRightStyle", "mediaBorderRightColor", "mediaBorderRightWidth", DIVIDER,
      "mediaCornerTopLeft", "mediaCornerTopRight", "mediaCornerBottomLeft",
      "mediaCornerBottomRight", "mediaCornerShape", DIVIDER
    ] },
  },
  // The plain box: the same element without a treatment on it, so it is laid
  // out and headed by the same lists its treatments are.
  boxes: {
    layout: { order: BLOCK_LAYOUT_ORDER },
    blockHeadings: { order: BLOCK_HEADINGS_ORDER }
  },
  boxStyles: {
    order: ["layout", "text", "background", "gradientFrom", "gradientTo", "gradientAngle", "padding", "margin", "border", "blockHeadings"],
    layout: { order: BLOCK_LAYOUT_ORDER },
    text: { order: [
      "font", "size", "color", "textStyle", "textStyleSlant", DIVIDER, "align", "caps",
      "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens", DIVIDER, "outlineColor", "outlineWidth", DIVIDER,
      "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor"
    ] },
    background: { label: "ILLUMINUS.Sections.fillAndImage.label", hint: "ILLUMINUS.Sections.fillAndImage.hint", order: [
      "background", "gradientFrom", "gradientTo", "gradientAngle", "frost", DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend",
      "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge", DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
      "innerShadowSpread", "innerShadowColor", DIVIDER, "shadowOffsetX", "shadowOffsetY",
      "shadowBlur", "shadowSpread", "shadowColor"
    ] },
    padding: { order: [
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    margin: { order: [
      "marginTop", "marginBottom", "marginLeft", "marginRight"
    ] },
    border: { order: [
      "borderTopStyle", "borderTopColor", "borderTopWidth", DIVIDER, "borderBottomStyle",
      "borderBottomColor", "borderBottomWidth", DIVIDER, "borderLeftStyle", "borderLeftColor",
      "borderLeftWidth", DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
      DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
    ] },
    blockHeadings: { order: BLOCK_HEADINGS_ORDER },
  },
  tagStyles: {
    order: ["tagLayout", "text", "background", "gradientFrom", "gradientTo", "gradientAngle", "padding", "margin", "border"],
    tagLayout: { order: [
      "verticalAlign", "float", "minWidth", "lift", "wrapEdges",
      DIVIDER, "display", "flexDirection", "flexWrap", "justify", "alignItems", "gap",
      DIVIDER, "maxWidth", "minHeight", "maxHeight", "overflow", DIVIDER, "turn", "scale"
    ] },
    text: { order: [
      "font", "size", "color", "textStyle", "textStyleSlant", DIVIDER, "caps", "letterSpacing", "wordSpacing",
      "lineHeight", "wrap", "hyphens", DIVIDER, "outlineColor", "outlineWidth", DIVIDER, "textShadowOffsetX",
      "textShadowOffsetY", "textShadowBlur", "textShadowColor"
    ] },
    background: { label: "ILLUMINUS.Sections.fillAndImage.label", hint: "ILLUMINUS.Sections.fillAndImage.hint", order: [
      "background", "gradientFrom", "gradientTo", "gradientAngle", "frost", DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend",
      "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge", DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
      "innerShadowSpread", "innerShadowColor", DIVIDER, "shadowOffsetX", "shadowOffsetY",
      "shadowBlur", "shadowSpread", "shadowColor"
    ] },
    padding: { order: [
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    margin: { order: [
      "marginTop", "marginBottom", "marginLeft", "marginRight"
    ] },
    border: { order: [
      "borderTopStyle", "borderTopColor", "borderTopWidth", DIVIDER, "borderBottomStyle",
      "borderBottomColor", "borderBottomWidth", DIVIDER, "borderLeftStyle", "borderLeftColor",
      "borderLeftWidth", DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
      DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape",
      DIVIDER
    ] },
  },
  tags: {
    order: ["tagLayout", "text", "background", "gradientFrom", "gradientTo", "gradientAngle", "padding", "margin", "border"],
    tagLayout: { order: [
      "verticalAlign", "float", "minWidth", "lift", "wrapEdges",
      DIVIDER, "display", "flexDirection", "flexWrap", "justify", "alignItems", "gap",
      DIVIDER, "maxWidth", "minHeight", "maxHeight", "overflow", DIVIDER, "turn", "scale"
    ] },
    text: { order: [
      "font", "size", "color", "textStyle", "textStyleSlant", DIVIDER, "caps", "letterSpacing", "wordSpacing",
      "lineHeight", "wrap", "hyphens", DIVIDER, "outlineColor", "outlineWidth", DIVIDER, "textShadowOffsetX",
      "textShadowOffsetY", "textShadowBlur", "textShadowColor"
    ] },
    background: { label: "ILLUMINUS.Sections.fillAndImage.label", hint: "ILLUMINUS.Sections.fillAndImage.hint", order: [
      "background", "gradientFrom", "gradientTo", "gradientAngle", "frost", DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend",
      "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge", DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
      "innerShadowSpread", "innerShadowColor", DIVIDER, "shadowOffsetX", "shadowOffsetY",
      "shadowBlur", "shadowSpread", "shadowColor"
    ] },
    padding: { order: [
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    margin: { order: [
      "marginTop", "marginBottom", "marginLeft", "marginRight"
    ] },
    border: { order: [
      "borderTopStyle", "borderTopColor", "borderTopWidth", DIVIDER, "borderBottomStyle",
      "borderBottomColor", "borderBottomWidth", DIVIDER, "borderLeftStyle", "borderLeftColor",
      "borderLeftWidth", DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
      DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape",
      DIVIDER
    ] },
  },
  imageStyles: {
    order: ["layout", "padding", "margin", "border", "caption"],
    layout: { order: [
      "opacity", "background", "gradientFrom", "gradientTo", "gradientAngle", "frost", DIVIDER, DIVIDER, "shadowOffsetX", "shadowOffsetY",
      "shadowBlur", "shadowSpread", "shadowColor", "float", "width", "align", "clear", "flip",
      DIVIDER, "pictureShape", "pictureCrop", "pictureFrom", DIVIDER,
      "texture", "textureFit", "texturePosition", "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
      DIVIDER, "display", "minWidth", "maxWidth", "minHeight", "maxHeight", "overflow",
      DIVIDER, "position", "offsetTop", "offsetLeft", "turn", "scale", DIVIDER,
      "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur", "innerShadowSpread",
      "innerShadowColor"
    ] },
    padding: { order: [
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    margin: { order: [
      "marginTop", "marginBottom"
    ] },
    border: { order: [
      "borderTopStyle", "borderTopColor", "borderTopWidth", DIVIDER, "borderBottomStyle",
      "borderBottomColor", "borderBottomWidth", DIVIDER, "borderLeftStyle", "borderLeftColor",
      "borderLeftWidth", DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
      DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
    ] },
    caption: { label: "ILLUMINUS.Sections.imageCaption.label", hint: "ILLUMINUS.Sections.imageCaption.hint", order: [
      "captionFont", "captionSize", "captionColor", "captionTextStyle",
      "captionTextStyleSlant", DIVIDER, "captionAlign", "captionCaps", DIVIDER, "captionOutlineColor",
      "captionOutlineWidth", DIVIDER, "captionTextShadowOffsetX", "captionTextShadowOffsetY",
      "captionTextShadowBlur", "captionTextShadowColor", "captionSpacing"
    ] },
  },
  sidebar: {
    order: ["layout", "background", "gradientFrom", "gradientTo", "gradientAngle", "padding", "border", "category", "number", "entries",
      "subHeadings", "search", "buttons"],
    layout: { order: [
      "sidebarWidth"
    ] },
    background: { label: "ILLUMINUS.Sections.fillAndImage.label", hint: "ILLUMINUS.Sections.fillAndImage.hint", order: [
      "background", "gradientFrom", "gradientTo", "gradientAngle", "frost", DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend",
      "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge", DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
      "innerShadowSpread", "innerShadowColor", DIVIDER, "shadowOffsetX", "shadowOffsetY",
      "shadowBlur", "shadowSpread", "shadowColor"
    ] },
    padding: { order: [
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    border: { order: [
      "borderTopStyle", "borderTopColor", "borderTopWidth", DIVIDER, "borderBottomStyle",
      "borderBottomColor", "borderBottomWidth", DIVIDER, "borderLeftStyle", "borderLeftColor",
      "borderLeftWidth", DIVIDER, "borderRightStyle", "borderRightColor", "borderRightWidth",
      DIVIDER, "cornerTopLeft", "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
    ] },
    number: { order: [
      "numberShown", "numberWidth", "numberAlign", "numberSize", "numberColor",
      "numberTextStyle", "numberTextStyleSlant"
    ] },
    entries: { order: [
      "font", "size", "color", "textStyle", "textStyleSlant", DIVIDER, "align", "caps",
      "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens", DIVIDER, "outlineColor", "outlineWidth",
      DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor",
      DIVIDER, "entryBackground", "entryGradientFrom", "entryGradientTo", "entryGradientAngle", "entryFrost", DIVIDER, "entryTexture", "entryTextureFit",
      "entryTexturePosition", "entryTextureBlend", "entryTextureOpacity", "entryTextureBlur", "entryTextureBrightness", "entryTextureContrast", "entryTextureSaturation", "entryTextureAge", DIVIDER,
      "entryInnerShadowOffsetX", "entryInnerShadowOffsetY", "entryInnerShadowBlur",
      "entryInnerShadowSpread", "entryInnerShadowColor", DIVIDER, "entryShadowOffsetX",
      "entryShadowOffsetY", "entryShadowBlur", "entryShadowSpread", "entryShadowColor",
      DIVIDER, "entryPaddingTop", "entryPaddingBottom", "entryPaddingLeft",
      "entryPaddingRight", DIVIDER, "entryMarginTop", "entryMarginBottom", "entryMarginLeft",
      "entryMarginRight", DIVIDER, "entryBorderTopStyle", "entryBorderTopColor",
      "entryBorderTopWidth", DIVIDER, "entryBorderBottomStyle", "entryBorderBottomColor",
      "entryBorderBottomWidth", DIVIDER, "entryBorderLeftStyle", "entryBorderLeftColor",
      "entryBorderLeftWidth", DIVIDER, "entryBorderRightStyle", "entryBorderRightColor",
      "entryBorderRightWidth", DIVIDER, "entryCornerTopLeft", "entryCornerTopRight",
      "entryCornerBottomLeft", "entryCornerBottomRight", "entryCornerShape"
    ] },
    subHeadings: { order: [
      "headingFont", "headingSize", "headingColor", "headingTextStyle",
      "headingTextStyleSlant", DIVIDER, "headingLineHeight", "headingWrap", "headingHyphens", "headingIndent", DIVIDER,
      "headingOutlineColor", "headingOutlineWidth", DIVIDER, "headingTextShadowOffsetX",
      "headingTextShadowOffsetY", "headingTextShadowBlur", "headingTextShadowColor", DIVIDER,
      "headingBackground", "headingGradientFrom", "headingGradientTo", "headingGradientAngle", "headingFrost", DIVIDER, "headingTexture", "headingTextureFit",
      "headingTexturePosition", "headingTextureBlend", "headingTextureOpacity", "headingTextureBlur", "headingTextureBrightness", "headingTextureContrast", "headingTextureSaturation", "headingTextureAge", DIVIDER,
      "headingInnerShadowOffsetX", "headingInnerShadowOffsetY", "headingInnerShadowBlur",
      "headingInnerShadowSpread", "headingInnerShadowColor", DIVIDER, "headingShadowOffsetX",
      "headingShadowOffsetY", "headingShadowBlur", "headingShadowSpread", "headingShadowColor",
      DIVIDER, "headingPaddingTop", "headingPaddingBottom", "headingPaddingLeft",
      "headingPaddingRight", DIVIDER, "headingMarginTop", "headingMarginBottom",
      "headingMarginLeft", "headingMarginRight", DIVIDER, "headingBorderTopStyle",
      "headingBorderTopColor", "headingBorderTopWidth", DIVIDER, "headingBorderBottomStyle",
      "headingBorderBottomColor", "headingBorderBottomWidth", DIVIDER,
      "headingBorderLeftStyle", "headingBorderLeftColor", "headingBorderLeftWidth", DIVIDER,
      "headingBorderRightStyle", "headingBorderRightColor", "headingBorderRightWidth", DIVIDER,
      "headingCornerTopLeft", "headingCornerTopRight", "headingCornerBottomLeft",
      "headingCornerBottomRight", "headingCornerShape"
    ] },
    category: { order: [
      "categoryFont", "categorySize", "categoryColor", "categoryTextStyle",
      "categoryTextStyleSlant", DIVIDER, "categoryAlign", "categoryCaps",
      "categoryLetterSpacing", "categoryWordSpacing", DIVIDER, "categoryOutlineColor", "categoryOutlineWidth",
      DIVIDER, "categoryTextShadowOffsetX", "categoryTextShadowOffsetY",
      "categoryTextShadowBlur", "categoryTextShadowColor", DIVIDER, "categoryBackground", "categoryGradientFrom", "categoryGradientTo", "categoryGradientAngle", "categoryFrost",
      DIVIDER, "categoryTexture", "categoryTextureFit", "categoryTexturePosition",
      "categoryTextureBlend", "categoryTextureOpacity", "categoryTextureBlur", "categoryTextureBrightness", "categoryTextureContrast", "categoryTextureSaturation", "categoryTextureAge", DIVIDER, "categoryInnerShadowOffsetX",
      "categoryInnerShadowOffsetY", "categoryInnerShadowBlur", "categoryInnerShadowSpread",
      "categoryInnerShadowColor", DIVIDER, "categoryShadowOffsetX", "categoryShadowOffsetY",
      "categoryShadowBlur", "categoryShadowSpread", "categoryShadowColor", DIVIDER,
      "categoryPaddingTop", "categoryPaddingBottom", "categoryPaddingLeft",
      "categoryPaddingRight", DIVIDER, "categoryMarginTop", "categoryMarginBottom",
      "categoryMarginLeft", "categoryMarginRight", DIVIDER, "categoryBorderTopStyle",
      "categoryBorderTopColor", "categoryBorderTopWidth", DIVIDER, "categoryBorderBottomStyle",
      "categoryBorderBottomColor", "categoryBorderBottomWidth", DIVIDER,
      "categoryBorderLeftStyle", "categoryBorderLeftColor", "categoryBorderLeftWidth", DIVIDER,
      "categoryBorderRightStyle", "categoryBorderRightColor", "categoryBorderRightWidth",
      DIVIDER, "categoryCornerTopLeft", "categoryCornerTopRight", "categoryCornerBottomLeft",
      "categoryCornerBottomRight", "categoryCornerShape"
    ] },
    search: { order: [
      "searchSize", "searchPlaceholderColor", "searchColor", DIVIDER, "searchBackground", "searchGradientFrom", "searchGradientTo", "searchGradientAngle", "searchFrost",
      DIVIDER, "searchTexture", "searchTextureFit", "searchTexturePosition",
      "searchTextureBlend", "searchTextureOpacity", "searchTextureBlur", "searchTextureBrightness", "searchTextureContrast", "searchTextureSaturation", "searchTextureAge", DIVIDER, "searchInnerShadowOffsetX",
      "searchInnerShadowOffsetY", "searchInnerShadowBlur", "searchInnerShadowSpread",
      "searchInnerShadowColor", DIVIDER, "searchShadowOffsetX", "searchShadowOffsetY",
      "searchShadowBlur", "searchShadowSpread", "searchShadowColor", DIVIDER,
      "searchBorderTopStyle", "searchBorderTopColor", "searchBorderTopWidth", DIVIDER,
      "searchBorderBottomStyle", "searchBorderBottomColor", "searchBorderBottomWidth", DIVIDER,
      "searchBorderLeftStyle", "searchBorderLeftColor", "searchBorderLeftWidth", DIVIDER,
      "searchBorderRightStyle", "searchBorderRightColor", "searchBorderRightWidth", DIVIDER,
      "searchCornerTopLeft", "searchCornerTopRight", "searchCornerBottomLeft",
      "searchCornerBottomRight", "searchCornerShape"
    ] },
    buttons: { order: [
      "buttonColor", "buttonBorderColor", DIVIDER, "buttonBackground", "buttonGradientFrom", "buttonGradientTo", "buttonGradientAngle", "buttonFrost", DIVIDER,
      "buttonTexture", "buttonTextureFit", "buttonTexturePosition", "buttonTextureBlend",
      "buttonTextureOpacity", "buttonTextureBlur", "buttonTextureBrightness", "buttonTextureContrast", "buttonTextureSaturation", "buttonTextureAge", DIVIDER, "buttonInnerShadowOffsetX", "buttonInnerShadowOffsetY",
      "buttonInnerShadowBlur", "buttonInnerShadowSpread", "buttonInnerShadowColor", DIVIDER,
      "buttonShadowOffsetX", "buttonShadowOffsetY", "buttonShadowBlur", "buttonShadowSpread",
      "buttonShadowColor", DIVIDER, "buttonCornerTopLeft", "buttonCornerTopRight",
      "buttonCornerBottomLeft", "buttonCornerBottomRight", "buttonCornerShape", "buttonBorderWidth", DIVIDER
    ] },
  },
  window: {
    order: ["frameSize", "frame", "titleBar", "headerButtons", "pageButton"],
    frameSize: { label: "ILLUMINUS.Sections.layout.label", hint: "ILLUMINUS.Sections.layout.hint", order: [
      "frameMinWidth", "frameMaxWidth"
    ] },
    frame: { order: [
      "background", "gradientFrom", "gradientTo", "gradientAngle", "frost", DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend",
      "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge", DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
      "innerShadowSpread", "innerShadowColor", DIVIDER, "shadowOffsetX", "shadowOffsetY",
      "shadowBlur", "shadowSpread", "shadowColor", DIVIDER, "borderTopStyle", "borderTopColor",
      "borderTopWidth", DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
      DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth", DIVIDER,
      "borderRightStyle", "borderRightColor", "borderRightWidth", DIVIDER, "cornerTopLeft",
      "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
    ] },
    titleBar: { order: [
      "font", "size", "color", "textStyle", "textStyleSlant", DIVIDER, "align", "caps",
      "letterSpacing", "wordSpacing", DIVIDER, "outlineColor", "outlineWidth", DIVIDER, "textShadowOffsetX",
      "textShadowOffsetY", "textShadowBlur", "textShadowColor", DIVIDER, "titleBarBackground", "titleBarGradientFrom", "titleBarGradientTo", "titleBarGradientAngle", "titleBarFrost",
      DIVIDER, "titleBarTexture", "titleBarTextureFit", "titleBarTexturePosition",
      "titleBarTextureBlend", "titleBarTextureOpacity", "titleBarTextureBlur", "titleBarTextureBrightness", "titleBarTextureContrast", "titleBarTextureSaturation", "titleBarTextureAge", DIVIDER, "titleBarInnerShadowOffsetX",
      "titleBarInnerShadowOffsetY", "titleBarInnerShadowBlur", "titleBarInnerShadowSpread",
      "titleBarInnerShadowColor", DIVIDER, "titleBarShadowOffsetX", "titleBarShadowOffsetY",
      "titleBarShadowBlur", "titleBarShadowSpread", "titleBarShadowColor", DIVIDER,
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    headerButtons: { order: [
      "headerButtonSize", "headerButtonColor", DIVIDER, "headerButtonBackground", "headerButtonGradientFrom", "headerButtonGradientTo", "headerButtonGradientAngle", "headerButtonFrost", DIVIDER,
      "headerButtonTexture", "headerButtonTextureFit", "headerButtonTexturePosition",
      "headerButtonTextureBlend", "headerButtonTextureOpacity", "headerButtonTextureBlur", "headerButtonTextureBrightness", "headerButtonTextureContrast", "headerButtonTextureSaturation", "headerButtonTextureAge", DIVIDER,
      "headerButtonInnerShadowOffsetX", "headerButtonInnerShadowOffsetY",
      "headerButtonInnerShadowBlur", "headerButtonInnerShadowSpread",
      "headerButtonInnerShadowColor", DIVIDER, "headerButtonShadowOffsetX",
      "headerButtonShadowOffsetY", "headerButtonShadowBlur", "headerButtonShadowSpread",
      "headerButtonShadowColor", DIVIDER, "headerButtonBorderTopStyle",
      "headerButtonBorderTopColor", "headerButtonBorderTopWidth", DIVIDER,
      "headerButtonBorderBottomStyle", "headerButtonBorderBottomColor",
      "headerButtonBorderBottomWidth", DIVIDER, "headerButtonBorderLeftStyle",
      "headerButtonBorderLeftColor", "headerButtonBorderLeftWidth", DIVIDER,
      "headerButtonBorderRightStyle", "headerButtonBorderRightColor",
      "headerButtonBorderRightWidth", DIVIDER, "headerButtonCornerTopLeft",
      "headerButtonCornerTopRight", "headerButtonCornerBottomLeft",
      "headerButtonCornerBottomRight", "headerButtonCornerShape"
    ] },
    pageButton: { order: [
      "pageButtonAnchor", "pageButtonSide", "pageButtonOffset", "pageButtonTop", "pageButtonHoldTop",
      DIVIDER, "pageButtonSize", "pageButtonColor",
      "pageButtonBackground", "pageButtonGradientFrom", "pageButtonGradientTo", "pageButtonGradientAngle", "pageButtonFrost", DIVIDER, "pageButtonTexture", "pageButtonTextureFit",
      "pageButtonTexturePosition", "pageButtonTextureBlend", "pageButtonTextureOpacity", "pageButtonTextureBlur", "pageButtonTextureBrightness", "pageButtonTextureContrast", "pageButtonTextureSaturation", "pageButtonTextureAge",
      DIVIDER, "pageButtonInnerShadowOffsetX", "pageButtonInnerShadowOffsetY",
      "pageButtonInnerShadowBlur", "pageButtonInnerShadowSpread", "pageButtonInnerShadowColor",
      DIVIDER, "pageButtonShadowOffsetX", "pageButtonShadowOffsetY", "pageButtonShadowBlur",
      "pageButtonShadowSpread", "pageButtonShadowColor", DIVIDER, "pageButtonBorderTopStyle",
      "pageButtonBorderTopColor", "pageButtonBorderTopWidth", DIVIDER,
      "pageButtonBorderBottomStyle", "pageButtonBorderBottomColor",
      "pageButtonBorderBottomWidth", DIVIDER, "pageButtonBorderLeftStyle",
      "pageButtonBorderLeftColor", "pageButtonBorderLeftWidth", DIVIDER,
      "pageButtonBorderRightStyle", "pageButtonBorderRightColor", "pageButtonBorderRightWidth",
      DIVIDER, "pageButtonCornerTopLeft", "pageButtonCornerTopRight",
      "pageButtonCornerBottomLeft", "pageButtonCornerBottomRight", "pageButtonCornerShape", DIVIDER
    ] },
  },
  editor: {
    order: ["frameSize", "frame", "titleBar", "headerButtons", "settingsBar", "pageFields",
      "toolbar", "toolbarIcons", "dropdowns", "dropdownList", "dropdownItems"],
    dropdownList: { order: [
      "listBackground", "listGradientFrom", "listGradientTo", "listGradientAngle", "listFrost", DIVIDER, "listTexture", "listTextureFit", "listTexturePosition",
      "listTextureBlend", "listTextureOpacity", "listTextureBlur", "listTextureBrightness", "listTextureContrast", "listTextureSaturation", "listTextureAge",
      DIVIDER, "listInnerShadowOffsetX", "listInnerShadowOffsetY", "listInnerShadowBlur",
      "listInnerShadowSpread", "listInnerShadowColor",
      DIVIDER, "listShadowOffsetX", "listShadowOffsetY", "listShadowBlur", "listShadowSpread",
      "listShadowColor",
      DIVIDER, "listPaddingTop", "listPaddingBottom", "listPaddingLeft", "listPaddingRight",
      DIVIDER, "listBorderTopStyle", "listBorderTopColor", "listBorderTopWidth",
      DIVIDER, "listBorderBottomStyle", "listBorderBottomColor", "listBorderBottomWidth",
      DIVIDER, "listBorderLeftStyle", "listBorderLeftColor", "listBorderLeftWidth",
      DIVIDER, "listBorderRightStyle", "listBorderRightColor", "listBorderRightWidth",
      DIVIDER, "listCornerTopLeft", "listCornerTopRight", "listCornerBottomLeft",
      "listCornerBottomRight", "listCornerShape"
    ] },
    dropdownItems: { order: [
      "itemFont", "itemSize", "itemColor", "itemTextStyle", "itemTextStyleSlant",
      DIVIDER, "itemOutlineColor", "itemOutlineWidth",
      DIVIDER, "itemTextShadowOffsetX", "itemTextShadowOffsetY", "itemTextShadowBlur",
      "itemTextShadowColor",
      DIVIDER, "itemBackground", "itemGradientFrom", "itemGradientTo", "itemGradientAngle", "itemFrost",
      DIVIDER, "itemPaddingTop", "itemPaddingBottom", "itemPaddingLeft", "itemPaddingRight",
      DIVIDER, "itemCornerTopLeft", "itemCornerTopRight", "itemCornerBottomLeft",
      "itemCornerBottomRight", "itemCornerShape",
      DIVIDER, "itemDividerColor"
    ] },
    settingsBar: { order: [
      "settingsBarFont", "settingsBarSize", "settingsBarColor", "settingsBarTextStyle",
      "settingsBarTextStyleSlant", DIVIDER, "settingsBarAlign", "settingsBarCaps",
      "settingsBarLetterSpacing", "settingsBarWordSpacing", "settingsBarLineHeight", "settingsBarWrap", "settingsBarHyphens",
      DIVIDER, "settingsBarOutlineColor", "settingsBarOutlineWidth",
      DIVIDER, "settingsBarTextShadowOffsetX", "settingsBarTextShadowOffsetY",
      "settingsBarTextShadowBlur", "settingsBarTextShadowColor",
      DIVIDER, "settingsBarBackground", "settingsBarGradientFrom", "settingsBarGradientTo", "settingsBarGradientAngle", "settingsBarFrost", DIVIDER, "settingsBarTexture", "settingsBarTextureFit",
      "settingsBarTexturePosition", "settingsBarTextureBlend", "settingsBarTextureOpacity", "settingsBarTextureBlur", "settingsBarTextureBrightness", "settingsBarTextureContrast", "settingsBarTextureSaturation", "settingsBarTextureAge",
      DIVIDER, "settingsBarInnerShadowOffsetX", "settingsBarInnerShadowOffsetY",
      "settingsBarInnerShadowBlur", "settingsBarInnerShadowSpread", "settingsBarInnerShadowColor",
      DIVIDER, "settingsBarShadowOffsetX", "settingsBarShadowOffsetY", "settingsBarShadowBlur",
      "settingsBarShadowSpread", "settingsBarShadowColor",
      DIVIDER, "settingsBarPaddingTop", "settingsBarPaddingBottom", "settingsBarPaddingLeft",
      "settingsBarPaddingRight",
      DIVIDER, "settingsBarMarginTop", "settingsBarMarginBottom", "settingsBarMarginLeft",
      "settingsBarMarginRight",
      DIVIDER, "settingsBarBorderTopStyle", "settingsBarBorderTopColor", "settingsBarBorderTopWidth",
      DIVIDER, "settingsBarBorderBottomStyle", "settingsBarBorderBottomColor",
      "settingsBarBorderBottomWidth",
      DIVIDER, "settingsBarBorderLeftStyle", "settingsBarBorderLeftColor", "settingsBarBorderLeftWidth",
      DIVIDER, "settingsBarBorderRightStyle", "settingsBarBorderRightColor",
      "settingsBarBorderRightWidth",
      DIVIDER, "settingsBarCornerTopLeft", "settingsBarCornerTopRight",
      "settingsBarCornerBottomLeft", "settingsBarCornerBottomRight", "settingsBarCornerShape"
    ] },
    frameSize: { label: "ILLUMINUS.Sections.layout.label", hint: "ILLUMINUS.Sections.layout.hint", order: [
      "frameMinWidth", "frameMaxWidth"
    ] },
    frame: { order: [
      "background", "gradientFrom", "gradientTo", "gradientAngle", "frost", DIVIDER, "texture", "textureFit", "texturePosition", "textureBlend",
      "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge", DIVIDER, "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur",
      "innerShadowSpread", "innerShadowColor", DIVIDER, "shadowOffsetX", "shadowOffsetY",
      "shadowBlur", "shadowSpread", "shadowColor", DIVIDER, "borderTopStyle", "borderTopColor",
      "borderTopWidth", DIVIDER, "borderBottomStyle", "borderBottomColor", "borderBottomWidth",
      DIVIDER, "borderLeftStyle", "borderLeftColor", "borderLeftWidth", DIVIDER,
      "borderRightStyle", "borderRightColor", "borderRightWidth", DIVIDER, "cornerTopLeft",
      "cornerTopRight", "cornerBottomLeft", "cornerBottomRight", "cornerShape"
    ] },
    titleBar: { order: [
      "titleBarBackground", "titleBarGradientFrom", "titleBarGradientTo", "titleBarGradientAngle", "titleBarFrost", DIVIDER, "font", "size", "color", "textStyle", "textStyleSlant",
      DIVIDER, "align", "caps", "letterSpacing", "wordSpacing", DIVIDER, "outlineColor", "outlineWidth",
      DIVIDER, "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur", "textShadowColor",
      DIVIDER, "titleBarTexture", "titleBarTextureFit", "titleBarTexturePosition",
      "titleBarTextureBlend", "titleBarTextureOpacity", "titleBarTextureBlur", "titleBarTextureBrightness", "titleBarTextureContrast", "titleBarTextureSaturation", "titleBarTextureAge", DIVIDER, "titleBarInnerShadowOffsetX",
      "titleBarInnerShadowOffsetY", "titleBarInnerShadowBlur", "titleBarInnerShadowSpread",
      "titleBarInnerShadowColor", DIVIDER, "titleBarShadowOffsetX", "titleBarShadowOffsetY",
      "titleBarShadowBlur", "titleBarShadowSpread", "titleBarShadowColor", DIVIDER,
      "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"
    ] },
    headerButtons: { order: [
      "headerButtonSize", "headerButtonColor", "headerButtonBackground", "headerButtonGradientFrom", "headerButtonGradientTo", "headerButtonGradientAngle", "headerButtonFrost", DIVIDER,
      "headerButtonTexture", "headerButtonTextureFit", "headerButtonTexturePosition",
      "headerButtonTextureBlend", "headerButtonTextureOpacity", "headerButtonTextureBlur", "headerButtonTextureBrightness", "headerButtonTextureContrast", "headerButtonTextureSaturation", "headerButtonTextureAge", DIVIDER,
      "headerButtonInnerShadowOffsetX", "headerButtonInnerShadowOffsetY",
      "headerButtonInnerShadowBlur", "headerButtonInnerShadowSpread",
      "headerButtonInnerShadowColor", DIVIDER, "headerButtonShadowOffsetX",
      "headerButtonShadowOffsetY", "headerButtonShadowBlur", "headerButtonShadowSpread",
      "headerButtonShadowColor", DIVIDER, "headerButtonBorderTopStyle",
      "headerButtonBorderTopColor", "headerButtonBorderTopWidth", DIVIDER,
      "headerButtonBorderBottomStyle", "headerButtonBorderBottomColor",
      "headerButtonBorderBottomWidth", DIVIDER, "headerButtonBorderLeftStyle",
      "headerButtonBorderLeftColor", "headerButtonBorderLeftWidth", DIVIDER,
      "headerButtonBorderRightStyle", "headerButtonBorderRightColor",
      "headerButtonBorderRightWidth", DIVIDER, "headerButtonCornerTopLeft",
      "headerButtonCornerTopRight", "headerButtonCornerBottomLeft",
      "headerButtonCornerBottomRight", "headerButtonCornerShape"
    ] },
    toolbar: { order: [
      "toolbarBackground", "toolbarGradientFrom", "toolbarGradientTo", "toolbarGradientAngle", "toolbarFrost", DIVIDER, "toolbarTexture", "toolbarTextureFit",
      "toolbarTexturePosition", "toolbarTextureBlend", "toolbarTextureOpacity", "toolbarTextureBlur", "toolbarTextureBrightness", "toolbarTextureContrast", "toolbarTextureSaturation", "toolbarTextureAge", DIVIDER,
      "toolbarInnerShadowOffsetX", "toolbarInnerShadowOffsetY", "toolbarInnerShadowBlur",
      "toolbarInnerShadowSpread", "toolbarInnerShadowColor", DIVIDER, "toolbarShadowOffsetX",
      "toolbarShadowOffsetY", "toolbarShadowBlur", "toolbarShadowSpread", "toolbarShadowColor",
      DIVIDER, "toolbarPaddingTop", "toolbarPaddingBottom", "toolbarPaddingLeft",
      "toolbarPaddingRight", DIVIDER, "toolbarBorderTopStyle", "toolbarBorderTopColor",
      "toolbarBorderTopWidth", DIVIDER, "toolbarBorderBottomStyle", "toolbarBorderBottomColor",
      "toolbarBorderBottomWidth", DIVIDER, "toolbarBorderLeftStyle", "toolbarBorderLeftColor",
      "toolbarBorderLeftWidth", DIVIDER, "toolbarBorderRightStyle", "toolbarBorderRightColor",
      "toolbarBorderRightWidth", DIVIDER, "toolbarCornerTopLeft", "toolbarCornerTopRight",
      "toolbarCornerBottomLeft", "toolbarCornerBottomRight", "toolbarCornerShape"
    ] },
    toolbarIcons: { order: [
      "toolbarSize", "toolbarColor", DIVIDER, "toolbarButtonBackground", "toolbarButtonGradientFrom", "toolbarButtonGradientTo", "toolbarButtonGradientAngle", "toolbarButtonFrost",
      DIVIDER, "toolbarButtonTexture", "toolbarButtonTextureFit", "toolbarButtonTexturePosition",
      "toolbarButtonTextureBlend", "toolbarButtonTextureOpacity", "toolbarButtonTextureBlur", "toolbarButtonTextureBrightness", "toolbarButtonTextureContrast", "toolbarButtonTextureSaturation", "toolbarButtonTextureAge",
      DIVIDER, "toolbarButtonInnerShadowOffsetX", "toolbarButtonInnerShadowOffsetY",
      "toolbarButtonInnerShadowBlur", "toolbarButtonInnerShadowSpread", "toolbarButtonInnerShadowColor",
      DIVIDER, "toolbarButtonShadowOffsetX", "toolbarButtonShadowOffsetY", "toolbarButtonShadowBlur",
      "toolbarButtonShadowSpread", "toolbarButtonShadowColor",
      DIVIDER, "toolbarButtonPaddingTop", "toolbarButtonPaddingBottom", "toolbarButtonPaddingLeft",
      "toolbarButtonPaddingRight",
      DIVIDER, "toolbarButtonBorderTopStyle", "toolbarButtonBorderTopColor", "toolbarButtonBorderTopWidth",
      DIVIDER, "toolbarButtonBorderBottomStyle", "toolbarButtonBorderBottomColor",
      "toolbarButtonBorderBottomWidth",
      DIVIDER, "toolbarButtonBorderLeftStyle", "toolbarButtonBorderLeftColor", "toolbarButtonBorderLeftWidth",
      DIVIDER, "toolbarButtonBorderRightStyle", "toolbarButtonBorderRightColor",
      "toolbarButtonBorderRightWidth",
      DIVIDER, "toolbarButtonCornerTopLeft", "toolbarButtonCornerTopRight",
      "toolbarButtonCornerBottomLeft", "toolbarButtonCornerBottomRight", "toolbarButtonCornerShape"
    ] },
  },
};

for (const [key, layout] of Object.entries(LAYOUTS)) {
  for (const group of GROUPS.filter((one) => (one.family ?? one.id) === key)) {
    const home = new Map();
    for (const section of group.sections) {
      for (const field of section.fields) home.set(field.name, section);
    }
    for (const [id, plan] of Object.entries(layout)) {
      if (id === "order") continue;
      const section = group.sections.find((one) => one.id === id);
      if (!section) throw new Error(`${group.id}: no category "${id}" to lay out`);
      if (plan.label) section.label = plan.label;
      if (plan.hint) section.hint = plan.hint;
      section.order = plan.order;
      // Anything named here that lived in another category moves, along with
      // nothing else: what a category holds is what its order says.
      for (const name of plan.order) {
        if (name === DIVIDER) continue;
        const from = home.get(name);
        if (!from) throw new Error(`${group.id}.${id}: no control called "${name}"`);
        if (from === section) continue;
        const field = from.fields.find((one) => one.name === name);
        from.fields = from.fields.filter((one) => one !== field);
        section.fields.push(field);
        home.set(name, section);
      }
    }
    // A table may lay out categories without restating the part's own order of
    // them — which is what an entry does when it exists only to share a list
    // with another part, as the plain box shares its treatments' two.
    if (layout.order) {
      group.order = layout.order;
      // A category the layout does not name is one the part no longer has; its
      // controls have been moved out by now, so an empty one simply goes.
      group.sections = group.sections.filter((section) =>
        layout.order.includes(section.id) || section.fields.length);
      const stray = group.sections.find((section) => !layout.order.includes(section.id));
      if (stray) throw new Error(`${group.id}: "${stray.id}" has controls but no place in the layout`);
    }
  }
}

/* -------------------------------------------- */
/*  Parts that hold parts of their own            */
/* -------------------------------------------- */

/**
 * Categories lifted out of the part that held them, into parts of their own.
 *
 * The contents panel and the page editor are the two largest things a style can
 * say anything about — seven hundred and nine hundred settings apiece — and
 * both were one part. A reader looking for the search box's fill had one entry
 * in the tree standing for all of it.
 *
 * They are split the way the page is: the thing itself keeps what is true of
 * the whole of it (its fill, its edges, the room inside it), and each piece it
 * holds becomes a part with its own entry, its own count and its own hovered
 * state. Every setting keeps the name it had — only the part it belongs to
 * changes — so a migration is a table of which category went where.
 *
 * Run after the layout pass, because that is what settles which category holds
 * what.
 */
export const SPLIT = {
  sidebar: [
    { id: "sidebarEntries", icon: "fa-solid fa-file-lines", sections: ["entries"] },
    { id: "sidebarHeadings", icon: "fa-solid fa-list-tree", sections: ["subHeadings"] },
    { id: "sidebarCategories", icon: "fa-solid fa-folder", sections: ["category"] },
    { id: "sidebarSearch", icon: "fa-solid fa-magnifying-glass", sections: ["search"] },
    { id: "sidebarButtons", icon: "fa-solid fa-square-caret-down", sections: ["buttons"] },
    { id: "sidebarNumbers", icon: "fa-solid fa-hashtag", sections: ["number"] }
  ],
  editor: [
    { id: "editorSettingsBar", icon: "fa-solid fa-sliders", sections: ["settingsBar", "pageFields"] },
    { id: "editorDropdowns", icon: "fa-solid fa-caret-down",
      sections: ["dropdowns", "dropdownList", "dropdownItems"] },
    { id: "editorToolbar", icon: "fa-solid fa-toolbox", sections: ["toolbar", "toolbarIcons"] }
  ]
};

/** Which part each moved category now belongs to, for the migration to read. */
export const SPLIT_HOME = Object.fromEntries(
  Object.entries(SPLIT).flatMap(([parentId, parts]) =>
    parts.flatMap((part) => part.sections.map((sectionId) => [`${parentId}.${sectionId}`, part.id]))));

for (const [parentId, parts] of Object.entries(SPLIT)) {
  const parent = GROUPS.find((one) => one.id === parentId);
  if (!parent) throw new Error(`nothing called "${parentId}" to split`);
  const at = GROUPS.indexOf(parent);
  const made = [];
  for (const part of parts) {
    const taken = part.sections.map((id) => {
      const section = parent.sections.find((one) => one.id === id);
      if (!section) throw new Error(`${parentId}: no category "${id}" to lift out`);
      return section;
    });
    parent.sections = parent.sections.filter((one) => !taken.includes(one));
    made.push({
      id: part.id,
      icon: part.icon,
      // Where the part it came from sits, since it is part of that thing.
      strip: parent.strip,
      order: taken.map((one) => one.id),
      sections: taken
    });
  }
  parent.order = parent.order?.filter((id) => parent.sections.some((one) => one.id === id));
  GROUPS.splice(at + 1, 0, ...made);
}

/** Whether a control names a hovered state, in either spelling. */
export function isHoveredField(name) {
  return /hover/i.test(name);
}

/**
 * The ordinary control a hovered one stands in for, by name.
 *
 * Both spellings occur — `hoverColor` as well as `buttonHoverColor` — so the
 * word is taken out wherever it sits and the capital it leaves behind is put
 * back down.
 */
export function ordinaryNameFor(name) {
  const stripped = name.replace(/hover/i, "");
  if (!stripped) return null;
  return /[a-z]/.test(name[0]) ? stripped[0].toLowerCase() + stripped.slice(1) : stripped;
}

/**
 * A hovered control whose ordinary counterpart lives in another section.
 *
 * The contents panel lists its entries in one section and states how they look
 * when pointed at in the next, because the pointed-at entry and the current
 * page belong together. Everything else pairs inside its own section.
 */
const HOVER_TWIN_ELSEWHERE = new Map([["sidebarEntries.hoverColor", "color"]]);

/**
 * The field a hovered control falls back to when its part's hovered state is
 * switched off, or null when the ordinary element paints nothing there.
 *
 * Only the same section is searched, so that a hovered entry fill does not fall
 * back to the fill of the panel it sits in — two different things that happen
 * to share a name.
 */
export function ordinaryTwinFor(group, hovered) {
  const wanted = HOVER_TWIN_ELSEWHERE.get(`${group.id}.${hovered.name}`)
    ?? ordinaryNameFor(hovered.name);
  if (!wanted) return null;
  const own = group.sections.find((section) => section.fields.includes(hovered));
  const searched = HOVER_TWIN_ELSEWHERE.has(`${group.id}.${hovered.name}`)
    ? group.sections
    : [own].filter(Boolean);
  for (const section of searched) {
    const twin = section.fields.find((field) => field.name === wanted);
    if (twin) return twin;
  }
  return null;
}

for (const group of GROUPS) {
  const taken = new Set(group.sections.flatMap((section) => section.fields.map((field) => field.name)));
  for (const section of group.sections) {
      // Every section of every part, the window frame and the contents panel
      // included. They were left out on the grounds that neither is hovered as
      // an object — but a panel a pointer is inside is a thing that can answer
      // to it, and deciding for somebody which of their settings could
      // usefully change under the pointer is not ours to do.

      // A section that states a hovered control is about something that is
      // pointed at, so every paint control it has gets a counterpart — under
      // its own prefix, since that is how it is named: a sub-heading's outline
      // is `headingOutlineWidth`, and its hovered twin `headingHoverOutlineWidth`.
      // A section that states one gets a twin for *everything* it holds, not
      // only its paint. A size or a spacing that changes under the pointer
      // moves the page, which is why this was once paint only — but whether
      // that is worth doing belongs to whoever is building the style, and a
      // control quietly governing both states at once was not a choice at all.
      //
      // Elsewhere only the paint is shadowed, matched by name.
      const stateControl = (name) => /^(hover|active)/.test(name) || /(Hover|Active)[A-Z]/.test(name);
      // Everything the section holds. `stated` only decides whether a section
      // of the window or the panel takes part at all — those two are not
      // hovered as objects, so only the parts of them that say they are.
      const wanted = section.fields.filter((original) =>
        !stateControl(original.name) && !original.chrome && !original.noTwin);

      for (const original of wanted) {
        // Named by putting the state in front of the whole control's name.
        // Splitting a name to slip the word into the middle needs to know where
        // the name's own prefix ends, and it cannot be told: `outlineWidth` is
        // one word for one thing, not "outline" wearing "Width".
        const hovered = hoverNameFor(original.name);
        // Never shadow a control the schema already spells out itself — the
        // sidebar and the window state their hovered colors by hand, in the
        // other spelling, and one control per thing is the point.
        const own = original.name.match(/^[a-z]+(?=[A-Z])/)?.[0] ?? "";
        const infix = own ? `${own}Hover${original.name.slice(own.length)}` : hovered;
        if (taken.has(hovered) || taken.has(infix)) continue;
        taken.add(hovered);
        section.fields.push(stateTwin(original, hovered, "hover"));
      }
  }

}

/**
 * The two lists in the contents panel answer to being chosen as well as to
 * being pointed at.
 *
 * A listed page can be the page being read, and a listed heading can be the one
 * a reader clicked — states of their own, and not the same thing as a pointer
 * passing over them. Both sections stated a handful of Selected controls by
 * hand, a lettering color and a fill and an edge color, and every other control
 * in the section governed the chosen entry and the rest at once: setting the
 * corner rounding of the page being read was not something a style could say.
 *
 * Derived exactly as the pointed-at twins are and just as silent until it is
 * set, so a style that says nothing about the chosen entry paints it as it
 * paints the others.
 */
/**
 * The space inside a thing and the space around it, in one category.
 *
 * They were two — Inner Spacing and Outer Spacing — because each was four
 * controls one under another and eight in a row read as a wall. Drawn as a box
 * they are one question with eight answers: the inner four inside the box and
 * the outer four around it, each where it belongs. A category cannot hold half
 * a picture, so the two are merged wherever a part has both.
 */
for (const group of GROUPS) {
  const inner = group.sections.find((section) => section.id === "padding");
  const outer = group.sections.find((section) => section.id === "margin");
  if (!inner) continue;
  // Named for what it is either way: a category holding only the space inside
  // draws the same box with nothing around it, and calling one part's "Inner
  // Spacing" what another calls "Spacing" would be two names for one picture.
  inner.id = "spacing";
  // The part's own order names its categories, so it follows the rename whether
  // or not there is an outer half to merge in.
  if (group.order) group.order = group.order.map((id) => (id === "padding" ? "spacing" : id));
  if (!outer) continue;
  inner.fields = [...inner.fields, ...outer.fields];
  // The order each stated becomes one, inner first: a laid-out category must
  // name every control it holds, and these two were laid out apart.
  if (inner.order || outer.order) {
    inner.order = [...(inner.order ?? inner.fields.map((f) => f.name)),
      ...(outer.order ?? outer.fields.map((f) => f.name))];
  }
  if (outer.dividers?.size) {
    inner.dividers = new Set([...(inner.dividers ?? []), ...outer.dividers]);
  }
  group.sections = group.sections.filter((section) => section !== outer);
  // A part that lays itself out names its categories and their controls, so both
  // lists follow the merge rather than being rewritten by hand forty times.
  if (group.order) group.order = group.order.filter((id) => id !== "margin");
}

/**
 * An edge and the corners it turns, in one category.
 *
 * Same reasoning as the spacing above: they are one picture — a box with a
 * thickness on each edge and a radius at each corner — and a category cannot
 * hold half of one. Most parts already keep them together; this is for the rest.
 */
for (const group of GROUPS) {
  const edges = group.sections.find((section) => section.id === "border");
  const corners = group.sections.find((section) => section.id === "corners");
  if (!edges || !corners) continue;
  edges.fields = [...edges.fields, ...corners.fields];
  if (edges.order || corners.order) {
    edges.order = [...(edges.order ?? edges.fields.map((f) => f.name)),
      ...(corners.order ?? corners.fields.map((f) => f.name))];
  }
  if (corners.dividers?.size) {
    edges.dividers = new Set([...(edges.dividers ?? []), ...corners.dividers]);
  }
  group.sections = group.sections.filter((section) => section !== corners);
  if (group.order) group.order = group.order.filter((id) => id !== "corners");
}

const SELECTED_SECTIONS = new Set(["sidebarEntries.entries", "sidebarHeadings.subHeadings"]);

for (const group of GROUPS) {
  for (const section of group.sections) {
    if (!SELECTED_SECTIONS.has(`${group.id}.${section.id}`)) continue;
    const taken = new Set(section.fields.map((field) => field.name));
    const stated = (name) => /^(hover|active)/.test(name) || /(Hover|Active)[A-Z]/.test(name);
    for (const original of section.fields.filter((field) =>
      !stated(field.name) && !field.chrome && !field.noTwin && !field.noSelected)) {
      // Both spellings are already in use here — `activeColor` beside
      // `entryActiveBackground` — so a control the schema states itself is
      // left alone whichever way round it was written.
      const selected = stateNameFor("active", original.name);
      const own = original.name.match(/^[a-z]+(?=[A-Z])/)?.[0] ?? "";
      const infix = own ? `${own}Active${original.name.slice(own.length)}` : selected;
      if (taken.has(selected) || taken.has(infix)) continue;
      taken.add(selected);
      section.fields.push(stateTwin(original, selected, "active"));
    }
  }
}

/* -------------------------------------------- */
/*  One order, everywhere                       */
/* -------------------------------------------- */

/**
 * Every part reads the same way, so that knowing where a control lives on one of
 * them is knowing where it lives on all of them: what the element is made of
 * first — its text, then its fill, its inner spacing, its edges, its shadow,
 * the room around it, and how much room it takes — and after that the parts
 * that live inside it, roughly in the order you meet them reading down the page.
 *
 * A part lists whichever of these it has and skips the rest, and the two
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
  "marks", "code", "codeBlock", "marker", "definitions",
  // The element itself, from the inside out
  "background", "padding", "border", "corners", "shadow", "innerShadow",
  "glow", "margin", "layout", "tagLayout",
  // The parts inside it
  "chip", "blockHeadings", "header", "rows", "cellPadding", "cellBorder",
  "tableCaption", "caption", "media", "collapsible", "revealed",
  "revealButton", "dividers", "fold",
  // The contents panel, then the window
  "number", "entries", "subHeadings", "category", "search", "buttons",
  "frame", "frameSize", "titleBar", "headerButtons", "pageButton", "toolbar"
];

/**
 * And within a section that more than one part carries, the controls come in one
 * order too. Only the shared sections are listed: a section that exists on a
 * single part has nothing to be consistent with, and its author's order is
 * usually the meaningful one.
 *
 * Sections built by `spacingFields`, `borderFields` and their like are already
 * identical wherever they appear, and are left out.
 */
/** Whether a name belongs to a state rather than to the ordinary control. */
const stateNamed = (name) => /^(hover|active)|(Hover|Active)(?=[A-Z])/.test(name);

const FIELD_ORDER = {
  text: [
    "font", "size", "color", "textColor", "textStyle", "textStyleSlant", "outlineWidth",
    "outlineColor", "textShadowOffsetX", "textShadowOffsetY", "textShadowBlur",
    "textShadowColor", "caps", "letterSpacing", "wordSpacing", "lineHeight", "wrap", "hyphens",
    "align", "verticalAlign", "width"
  ],
  background: [
    "background", "texture", "textureFit", "texturePosition",
    "textureBlend", "textureOpacity", "textureBlur", "textureBrightness", "textureContrast", "textureSaturation", "textureAge",
    // A shadow is derived beside every picture, so the shared Fill section
    // carries one wherever it appears.
    "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowSpread", "shadowColor",
    "innerShadowOffsetX", "innerShadowOffsetY", "innerShadowBlur", "innerShadowSpread",
    "innerShadowColor"
  ],
  layout: [
    "shown", "float", "width", "maxWidth", "sidebarWidth", "align", "clear",
    "flip", "pictureShape", "pictureCrop", "pictureFrom",
    "opacity", "indent", "itemSpacing", "whenEmpty"
  ],
  tagLayout: ["float", "minWidth", "verticalAlign", "lift"],
  caption: [
    "captionFont", "captionSize", "captionColor", "captionTextStyle",
    "captionTextStyleSlant", "captionOutlineWidth", "captionOutlineColor", "captionTextShadowOffsetX",
    "captionTextShadowOffsetY", "captionTextShadowBlur", "captionTextShadowColor",
    "captionCaps", "captionAlign", "captionSpacing"
  ]
};

/**
 * The order the parts of one thing are set in, wherever they are set.
 *
 * `FIELD_ORDER` says it for the sections every part shares, by naming controls
 * outright. A section with its own vocabulary — a table's header row, a
 * definition's term — spells the same properties with a prefix, so the order is
 * read off the suffix instead. Controls whose suffix is not listed keep the
 * order their author gave them, after the ones that are.
 */
const SUFFIX_ORDER = [
  "Font", "Size", "Color", "TextStyle", "TextStyleSlant",
  "OutlineWidth", "OutlineColor",
  "TextShadowOffsetX", "TextShadowOffsetY", "TextShadowBlur", "TextShadowColor",
  "Caps", "LetterSpacing", "WordSpacing", "LineHeight", "Wrap", "Hyphens", "Align", "VerticalAlign"
];

/**
 * The word a control's name starts with, where the rest of it is a control this
 * order knows about.
 *
 * Without that condition `outlineWidth` reads as "outline" wearing "Width", and
 * a section's outline is sorted into a group of its own — which is how Outline
 * and Text Shadow came to sit at opposite ends of the contents panel's entry.
 */
const knownSuffix = (text) => SUFFIX_ORDER.some((known) =>
  known === text || known === `${text[0]?.toUpperCase()}${text.slice(1)}`);

const prefixOf = (name) => {
  // The whole name first: `outlineColor` is one control, and reading it as
  // "outline" wearing "Color" — both of which are known — sorted a section's
  // outline color away from its outline thickness, with the shadows between.
  if (knownSuffix(name)) return "";
  const lead = name.match(/^[a-z]+(?=[A-Z])/)?.[0] ?? "";
  return lead && knownSuffix(name.slice(lead.length)) ? lead : "";
};

/** How far down the shared order a control's suffix sits, or Infinity. */
const suffixRank = (name, prefix) => {
  const suffix = prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name;
  const at = SUFFIX_ORDER.findIndex((known) =>
    suffix === known || suffix === known[0].toLowerCase() + known.slice(1));
  return at < 0 ? Infinity : at;
};

for (const group of GROUPS) {
  for (const section of group.sections) {
    if (!(group.order ?? SECTION_ORDER).includes(section.id)) {
      throw new Error(`${group.id}: section "${section.id}" has no place in ${group.order ? "this part's own order" : "SECTION_ORDER"}`);
    }
    // A section may state its own order, and put a divider between the runs it
    // reads in: "---" in the list is a line drawn across the part before the
    // control that follows it. The shared pass below is what every other section
    // uses; this is for a part somebody has laid out by hand.
    if (section.order) {
      const wanted = section.order.filter((name) => name !== DIVIDER);
      const missing = section.fields.filter((field) =>
        !isHoverName(field.name) && !stateNamed(field.name) && !field.chrome
        && !wanted.includes(field.name));
      if (missing.length) {
        throw new Error(`${group.id}.${section.id}: "${missing[0].name}" is not in the section's own order`);
      }
      const place = (name) => {
        const at = wanted.indexOf(name);
        return at < 0 ? wanted.length : at;
      };
      section.fields.sort((a, b) => place(a.name) - place(b.name));
      // The divider belongs to the control it precedes, which is where the
      // editor draws it — so it travels with that control however the states
      // shuffle the rest.
      section.dividers = new Set();
      for (let i = 0; i < section.order.length; i += 1) {
        if (section.order[i] !== DIVIDER) continue;
        const next = section.order.slice(i + 1).find((name) => name !== DIVIDER);
        if (next) section.dividers.add(next);
      }
    }
    const order = FIELD_ORDER[section.id];
    if (section.order) {
      // Already placed.
    } else if (order) {
      for (const field of section.fields) {
        // A hovered control is placed against its own below, not by this list.
        if (order.includes(field.name) || isHoverName(field.name)) continue;
        throw new Error(`${group.id}.${section.id}: "${field.name}" has no place in FIELD_ORDER.${section.id}`);
      }
      section.fields.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    } else {
      // Grouped by the thing they belong to, in the order those things first
      // appear, and inside each group in the same order every other section
      // uses. A table's header row read Fill, Text Color, Typeface, Text Size
      // while every plain Text section read Typeface, Text Size, Text Color.
      const groups = [];
      for (const field of section.fields) {
        const prefix = prefixOf(field.name);
        const found = groups.find((one) => one.prefix === prefix);
        if (found) found.fields.push(field);
        else groups.push({ prefix, fields: [field] });
      }
      for (const one of groups) {
        one.fields = one.fields
          .map((field, index) => ({ field, index, rank: suffixRank(field.name, one.prefix) }))
          .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
          .map((entry) => entry.field);
      }
      section.fields = groups.flatMap((one) => one.fields);
    }

    // A control's other states sit against it, in the order the switch offers
    // them: ordinary, pointed at, selected. Switching states then hides controls
    // without shuffling the ones that stay, and a part reads the same whichever
    // state is on show.
    // Both spellings of a state occur — `hoverColor` and `buttonHoverColor` —
    // so the word is taken out wherever it sits.
    const stemOf = (name) => {
      const stripped = name.replace(/^(hover|active)/, "").replace(/(Hover|Active)(?=[A-Z])/, "");
      if (stripped === name || !stripped) return name;
      return stripped[0].toLowerCase() + stripped.slice(1);
    };
    const has = new Set(section.fields.map((field) => field.name));
    const ordered = [];
    for (const field of section.fields) {
      const stem = stemOf(field.name);
      // A state's control whose ordinary counterpart is in this section waits
      // for it; one without a counterpart stands where it is.
      if (stem !== field.name && has.has(stem)) continue;
      ordered.push(field);
      for (const state of ["hover", "active"]) {
        const twin = section.fields.find((other) =>
          other.name !== field.name && stemOf(other.name) === field.name
          && new RegExp(`^${state}|${state[0].toUpperCase()}${state.slice(1)}`).test(other.name));
        if (twin) ordered.push(twin);
      }
    }
    section.fields = ordered;
  }
  // A part may state the order of its own sections, for one laid out by hand;
  // every other part takes the shared one, which is what keeps them alike.
  const sections = group.order ?? SECTION_ORDER;
  group.sections.sort((a, b) => sections.indexOf(a.id) - sections.indexOf(b.id));
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
