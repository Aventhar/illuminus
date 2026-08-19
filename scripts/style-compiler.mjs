import { STYLED_CLASS, STYLE_ATTR } from "./constants.mjs";
import { GROUPS, allFields, cssVarFor, isHoveredField, ordinaryTwinFor } from "./style-schema.mjs";

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
  // A field may take full control of how it maps onto CSS.
  if (field.emit) {
    const emitted = field.emit(value);
    if (emitted === null || emitted === undefined) return null;
    if (typeof emitted !== "object") return { "": sanitizeEmitted(emitted) };
    const out = {};
    for (const [suffix, css] of Object.entries(emitted)) out[suffix] = sanitizeEmitted(css);
    return out;
  }

  switch (field.type) {
    case "color":
      return /^#[0-9a-f]{3,8}$/i.test(String(value)) ? { "": String(value) } : null;
    case "image": {
      const path = sanitizePath(value);
      return { "": path ? `url("${path}")` : "none" };
    }
    case "font":
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
    case "toggle":
      return { "": sanitize(value ? field.on : field.off) };
    default:
      return { "": sanitize(value) };
  }
}

/**
 * What a hovered control says while its tab's hovered state is switched off.
 *
 * Nothing at all, usually: a derived hovered control starts empty, so the
 * skeleton paints nothing for it and the `:hover` rule falls through to the
 * ordinary value on its own. The contents panel and the window are the
 * exception — their hovered colors are written by hand and ship with real
 * values, which the skeleton does paint, so switching the state off has to say
 * something louder than nothing: point each one at the ordinary control it
 * stands in for, or at what the ordinary element paints where there is no such
 * control (nothing at all).
 */
function unhovered(group, field) {
  const asShipped = fieldToCss(field, field.default);
  if (!asShipped || !Object.values(asShipped).some((value) => value !== "")) return [];
  const twin = ordinaryTwinFor(group, field);
  if (twin) {
    return Object.keys(asShipped).map((suffix) =>
      `  ${cssVarFor(group.id, field, suffix)}: var(${cssVarFor(group.id, twin, suffix)});`);
  }
  const neutral = { color: "transparent", image: "none" }[field.type];
  if (!neutral) return [];
  return [`  ${cssVarFor(group.id, field)}: ${neutral};`];
}

/**
 * Compile the declarations for a single style.
 * @param {object} settings  A style's settings object.
 * @param {object} [options]
 * @param {boolean} [options.withDefaults]  Emit schema defaults for unset fields too.
 * @returns {string} Newline-separated `--var: value;` declarations.
 */
export function compileDeclarations(settings, { withDefaults = false } = {}) {
  const lines = [];
  // A tab whose hovered state is switched off emits none of its hovered values,
  // and the `:hover` rules then fall through to the ordinary ones — which is
  // exactly what "nothing happens when you point at it" means. Done here rather
  // than in the stylesheet because CSS cannot decline to apply a rule.
  // Unset means the tab's own default rather than anything about this call:
  // most tabs start switched off, because their hovered controls are derived
  // and empty, while the sidebar and the window start on, because theirs are
  // written by hand and carry real colors.
  const startsOff = new Map();
  for (const { group, field } of allFields()) {
    if (field.name === "hoverOff") startsOff.set(group.id, field.default);
  }
  const hoverOff = (groupId) => {
    const stored = settings?.[groupId]?.hoverOff;
    return stored === undefined ? Boolean(startsOff.get(groupId)) : Boolean(stored);
  };
  for (const { group, field } of allFields()) {
    if (isHoveredField(field.name) && hoverOff(group.id)) {
      lines.push(...unhovered(group, field));
      continue;
    }
    const raw = settings?.[group.id]?.[field.name];
    const value = raw === undefined ? (withDefaults ? field.default : undefined) : raw;
    if (value === undefined) continue;
    const emitted = fieldToCss(field, value);
    if (!emitted) continue;
    for (const [suffix, css] of Object.entries(emitted)) {
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
