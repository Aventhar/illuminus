import { STYLED_CLASS, STYLE_ATTR } from "./constants.mjs";
import { GROUPS, allFields, cssVarFor } from "./style-schema.mjs";
import { stateBase } from "./run-names.mjs";

/**
 * Turns style data into CSS custom property declarations.
 *
 * Nothing here emits selectors or properties of its own — the visual rules live
 * in `styles/illuminus.css` and consume these variables. That split means a
 * style can never introduce an arbitrary CSS rule, only supply values to rules
 * the module already ships.
 */

/**
 * Strip anything that could terminate a declaration and escape a style's values
 * into the surrounding stylesheet. Values reach here from imported files as
 * well as the GUI, so this is a trust boundary, not a formality.
 * @param {string} value
 * @returns {string}
 */
function sanitize(value) {
  return String(value)
    .replace(/[;{}<>\\]/g, "")
    .replace(/\/\*|\*\//g, "")
    .replace(/@import/gi, "")
    .replace(/expression\s*\(/gi, "")
    .trim();
}

/**
 * Accept only paths that cannot escape into a script or another origin, and
 * make them resolvable from a stylesheet.
 *
 * Foundry's file picker returns paths relative to the data root, such as
 * `worlds/my-world/art/paper.webp`. A relative `url()` inside a stylesheet
 * resolves against the *stylesheet's* location, not the page, so that path
 * would be looked for under `modules/illuminus/styles/`. Making it
 * root-relative fixes it; `getRoute` also prepends a server's routePrefix when
 * one is configured. Outside Foundry (the validation tooling) a leading slash
 * is equivalent.
 *
 * @param {string} path
 * @returns {string|null}  The safe path, or null if it should be ignored.
 */
function sanitizePath(path) {
  const clean = sanitize(path).replace(/["')(]/g, "");
  if (!clean) return null;
  if (/^(https?:)?\/\//i.test(clean)) return clean;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return null; // reject javascript:, data:, and friends
  if (clean.startsWith("/")) return clean;
  return globalThis.foundry?.utils?.getRoute?.(clean) ?? `/${clean}`;
}

/**
 * Sanitizer for values produced by a field's own `emit` function. Those are
 * module-authored CSS fragments that legitimately contain quotes and escape
 * sequences — a bullet glyph is emitted as `"\2726  "` — so only characters
 * that could end the declaration or open a comment are removed.
 * @param {string} value
 * @returns {string}
 */
function sanitizeEmitted(value) {
  return String(value)
    .replace(/[;{}<>]/g, "")
    .replace(/\/\*|\*\//g, "")
    .trim();
}

/** Quote a font family name and append a fallback so text never disappears. */
function fontValue(value, fallback) {
  const clean = sanitize(value).replace(/["']/g, "");
  return clean ? `"${clean}", ${fallback}` : "inherit";
}

/**
 * Render one field's value as CSS.
 * @param {object} field  A schema field definition.
 * @param {any} value     The value held by the style for that field.
 * @returns {Record<string, string>|null}  Suffix-keyed CSS values (the empty
 *   string keys the field's base custom property), or null to emit nothing.
 */
export function fieldToCss(field, value) {
  // "Nothing to say at zero" is a statement about the value, so it is answered
  // before asking how that value would be written. The other way round, a field
  // with an `emit` of its own never reached this at all — and a derived twin
  // holds zero to mean silence, so every twin of such a field spoke the moment
  // a pointer arrived: a gradient turned to 0°, and Size emitted `scale(0)`,
  // which collapsed whatever was pointed at to nothing.
  if (field.type === "number" && field.emitZero === false && Number(value) === 0) return null;
  // A choice says it the same way, with an empty value, and for the same
  // reason. An `emit` answers a value it does not recognize with a sensible
  // one — which is right for the ordinary control, where a stray value should
  // still paint something — but a twin holding nothing is not a stray value,
  // and that answer then wins the very fallback chain meant to reach past it.
  // 276 twins spoke this way. Pointing at a background picture re-tiled and
  // re-cornered it, bold lettering came back at 400, small caps fell away, a
  // drop cap collapsed, and a list took the browser's own bullet — every one of
  // them from a control nobody had touched. No ordinary choice defaults to
  // empty, so this can only ever be a twin with nothing to say.
  if (field.type === "select" && (value === "" || value === null || value === undefined)) return null;
  // A field may take full control of how it maps onto CSS.
  if (field.emit) {
    const emitted = field.emit(value);
    if (emitted === null || emitted === undefined) return null;
    // An empty value is not a value: a custom property declared as `--x: ;` is
    // *defined*, so `var(--x, fallback)` resolves to nothing rather than to the
    // fallback — and the property it feeds falls back to its initial value
    // instead of to the ordinary one. That is how an unset hovered underline
    // came to rub out the link's underline the moment a pointer touched it.
    if (typeof emitted !== "object") {
      const css = sanitizeEmitted(emitted);
      return css === "" ? null : { "": css };
    }
    const out = {};
    for (const [suffix, css] of Object.entries(emitted)) {
      const clean = sanitizeEmitted(css);
      if (clean !== "") out[suffix] = clean;
    }
    return Object.keys(out).length ? out : null;
  }

  switch (field.type) {
    case "color":
      return /^#[0-9a-f]{3,8}$/i.test(String(value)) ? { "": String(value) } : null;
    case "image": {
      const path = sanitizePath(value);
      // A picture nobody chose is `none` on an ordinary control — that is how a
      // texture is taken off again — but silence on a derived twin, which has
      // to reach past itself to the ordinary picture. Emitting `none` there
      // took the picture away the moment a pointer arrived, on every fill that
      // carries one.
      // Two places one picture can be painted, and `compileDeclarations` decides
      // which: the layer over the padding box, or the element's own background,
      // where it runs under a border. Both are named here so the wiring check
      // can see them; there they are made complements, since laying a picture
      // down twice is not the same picture.
      const both = (css) => field.under === false ? { "": css } : { "": css, under: css };
      if (!path) return field.twin ? null : both("none");
      return both(`url("${path}")`);
    }
    case "font":
      // A state's own typeface says nothing until it is chosen, so the rule it
      // feeds falls back to the ordinary one rather than to "inherit".
      if (!value && field.emitEmpty === false) return null;
      return { "": fontValue(value, field.fallback) };
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      // A hovered thickness of zero means "say nothing", so the `:hover` rule
      // falls back to the ordinary value rather than rubbing it out.
      if (n === 0 && field.emitZero === false) return null;
      if (n === 0 && field.zeroAs) return { "": field.zeroAs };
      return { "": `${n}${field.unit ?? ""}` };
    }
    case "select":
      return field.choices.includes(value) ? { "": sanitize(value) } : null;
    case "toggle-state":
      return null;
    case "toggle":
      return { "": sanitize(value ? field.on : field.off) };
    default:
      return { "": sanitize(value) };
  }
}


/**
 * Compile the declarations for a single style.
 * @param {object} settings  A style's settings object.
 * @param {object} [options]
 * @param {boolean} [options.withDefaults]  Emit schema defaults for unset fields too.
 * @returns {string} Newline-separated `--var: value;` declarations.
 */
/** What a picture looks like when nothing has been done to it. */
const UNTOUCHED = {
  Opacity: 100, Blur: 0, Brightness: 100, Contrast: 100, Saturation: 100, Age: 0
};

/**
 * The picture again, for the strip of it that runs under the border — or
 * nothing, where that copy could not be honest.
 *
 * A border that lets anything through shows the element's own background, and
 * the picture is not on the element: it rides on a layer over the padding box,
 * so a `double` border on a textured surface runs a band of flat fill between
 * its two strokes. The picture cannot be moved onto the border box — a layer
 * paints above the host's border and swallows it, and drawing the frame on the
 * layer puts the frame through the layer's blend. So the *element* paints a
 * second copy, clipped to the border box as its fill already is, and the layer
 * covers it everywhere else.
 *
 * The two copies agree exactly on a blend, which is measured rather than
 * assumed: `background-blend-mode` against the element's own fill computes
 * pixel for pixel what `mix-blend-mode` computes against an isolated backdrop
 * of the same fill. They cannot agree on **strength or a filter** — a
 * background layer takes neither — so where either is set this answers `none`
 * and the band goes back to being the fill. Better a surface that is plainly
 * one thing than a border showing a brighter, sharper copy of the picture
 * beside it.
 *
 * A state's own picture is asked about its own strength and filters, and falls
 * back to the ordinary ones, because that is the chain the rule reading them is
 * written as.
 */
function underCopy(group, field, settings, withDefaults) {
  const stem = field.name;
  const held = group.sections.flatMap((section) => section.fields);
  for (const [part, untouched] of Object.entries(UNTOUCHED)) {
    const own = held.find((one) => one.name === `${stem}${part}`);
    if (!own) continue;
    let value = settings?.[group.id]?.[`${stem}${part}`];
    if (value === undefined) value = withDefaults ? own.default : undefined;
    if (value === undefined || value === "") {
      const plain = stateBase(`${stem}${part}`);
      const ordinary = plain === `${stem}${part}` ? null : held.find((one) => one.name === plain);
      value = ordinary ? settings?.[group.id]?.[plain] ?? ordinary.default : own.default;
    }
    if (Number(value) !== untouched) return "none";
  }
  return null;
}

export function compileDeclarations(settings, { withDefaults = false } = {}) {
  const lines = [];
  for (const { group, field } of allFields()) {
    const raw = settings?.[group.id]?.[field.name];
    const value = raw === undefined ? (withDefaults ? field.default : undefined) : raw;
    if (value === undefined) continue;
    let emitted = fieldToCss(field, value);
    if (!emitted) continue;
    // A picture is published for one of two places, never both: the element's
    // own background, where it runs under the border, or the layer over the
    // padding box, where a strength and a filter can reach it. Painting it in
    // both would lay it down twice, which is not the same picture — an overlay
    // applied twice is not an overlay.
    if (/[Tt]exture$/.test(field.name) && emitted.under) {
      emitted = underCopy(group, field, settings, withDefaults)
        ? { ...emitted, under: "none" } : { ...emitted, "": "none" };
    }
    for (const [suffix, css] of Object.entries(emitted)) {
      // Nothing rather than an empty declaration, for the same reason.
      if (css === "" || css === null || css === undefined) continue;
      lines.push(`  ${cssVarFor(group.id, field, suffix)}: ${css};`);
    }
  }
  return lines.join("\n");
}

/** Escape a style id for safe use inside an attribute selector. */
function escapeId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, "");
}

/** The selector that scopes a style's variables to sheets using it. */
export function selectorFor(id) {
  return `.${STYLED_CLASS}[${STYLE_ATTR}="${escapeId(id)}"]`;
}

/**
 * Compile one style into a scoped rule.
 * @param {object} style  A style record with `id` and `settings`.
 * @returns {string}
 */
export function compileStyle(style) {
  if (!escapeId(style?.id ?? "")) return "";
  const declarations = compileDeclarations(style.settings);
  if (!declarations) return "";
  return `${selectorFor(style.id)} {\n${declarations}\n}`;
}

/**
 * The base rule carrying every schema default, so each var() in the skeleton
 * stylesheet resolves even for a style that only sets a handful of fields.
 * @returns {string}
 */
export function compileBaseRule() {
  return `.${STYLED_CLASS} {\n${compileDeclarations({}, { withDefaults: true })}\n}`;
}

/**
 * Compile the whole style store into one stylesheet.
 * @param {Record<string, object>} styles  Style records keyed by id.
 * @returns {string}
 */
export function compileAll(styles) {
  const rules = [compileBaseRule()];
  for (const style of Object.values(styles ?? {})) {
    const rule = compileStyle(style);
    if (rule) rules.push(rule);
  }
  return rules.join("\n\n");
}

/** Group ids in schema order, for callers that need a stable tab ordering. */
export const GROUP_IDS = GROUPS.map((g) => g.id);
