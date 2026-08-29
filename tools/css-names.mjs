/**
 * The CSS a control writes, in CSS's own words.
 *
 * Illuminus names everything in plain language on purpose — "Top Thickness",
 * never `border-top-width` — and this is the other half of the bargain, for
 * somebody who already knows CSS and wants to know which property a control
 * feeds. It is read rather than written: the answer comes from the stylesheets
 * themselves, by finding the declaration each custom property lands in, so a
 * rule that changes takes its wording with it and nobody has to remember.
 *
 * Three things it has to work out on the way:
 *
 * - **A shorthand names its parts by position**, and each part has a longhand
 *   of its own — which is the property a person actually wants named. Reading
 *   `padding: var(a) var(b) var(c) var(d)` gives `padding-top` for the first
 *   rather than `padding` four times. A state's rule wraps the ordinary
 *   variable inside the twin's fallback, so the positions are the *outermost*
 *   calls, and there are two per position.
 * - **A control that emits several properties suffixes its variable**, so
 *   `--x-texture-fit` is found through `--x-texture-fit-size` and
 *   `--x-texture-fit-repeat`.
 * - **Some feed one of core's own variables**, which is the honest answer for
 *   those: the width of the contents panel is `--sidebar-width-expanded`.
 *
 * Where several controls feed one property — the five parts of a shadow, the
 * two ends of a gradient — the property alone would name all of them the same,
 * so each is qualified by what tells it apart from its siblings.
 */

const SIDES = ["top", "right", "bottom", "left"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** Shorthands whose positions have longhands worth naming instead. */
const SHORTHAND = {
  padding: (i) => `padding-${SIDES[i]}`,
  margin: (i) => `margin-${SIDES[i]}`,
  "border-width": (i) => `border-${SIDES[i]}-width`,
  "border-style": (i) => `border-${SIDES[i]}-style`,
  "border-color": (i) => `border-${SIDES[i]}-color`,
  "border-radius": (i) => `border-${CORNERS[i]}-radius`,
  inset: (i) => SIDES[i]
};

/**
 * The few a stylesheet cannot answer for, because what they feed is decided at
 * render or folded into another control's value. Kept small and stated rather
 * than guessed; `validate.mjs` fails if a new one appears.
 */
const BY_HAND = {
  pageButtonAnchor: "left / right",
  pageButtonOffset: "left / right",
  dropCapColor: "color"
};

const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Read both stylesheets once: which declaration each custom property lands in. */
export function readStylesheets(css) {
  const usedBy = new Map();
  const aliases = new Map();
  const note = (name, prop) => {
    if (!usedBy.has(name)) usedBy.set(name, new Set());
    usedBy.get(name).add(prop);
  };
  const declaration = /(^|[;{])\s*(--[a-z0-9-]+|[a-z-]+)\s*:\s*([^;}]*)/g;
  let found;
  while ((found = declaration.exec(css))) {
    const property = found[2];
    const value = found[3];
    const ours = [...value.matchAll(/var\(\s*(--ill-[a-z0-9-]+)/g)].map((m) => m[1]);
    if (!ours.length) continue;
    if (property.startsWith("--")) {
      for (const name of ours) aliases.set(name, property);
      continue;
    }
    const expand = SHORTHAND[property];
    if (expand && ours.length >= 4) {
      const step = ours.length / 4 >= 2 ? Math.round(ours.length / 4) : 1;
      for (let i = 0; i < 4; i++) note(ours[i * step], expand(i));
    } else {
      for (const name of ours) note(name, property);
    }
  }
  return { usedBy, aliases };
}

/** Every CSS property one custom property feeds, or null if none does. */
export function propertiesFor(sheets, variable) {
  const { usedBy, aliases } = sheets;
  if (usedBy.has(variable)) return [...usedBy.get(variable)];
  const suffixed = [...usedBy.keys()].filter((name) => name.startsWith(`${variable}-`));
  if (suffixed.length) {
    return [...new Set(suffixed.flatMap((name) => [...usedBy.get(name)]))];
  }
  const alias = aliases.get(variable);
  if (alias) return usedBy.has(alias) ? [...usedBy.get(alias)] : [alias];
  return null;
}

/**
 * What tells a control apart from the others feeding the same property.
 *
 * The five parts of a shadow all land in `box-shadow`, so the property alone
 * would name them all the same. What each one *is* is whatever its own name
 * says that the property does not already: `shadowBlur` against `box-shadow`
 * leaves "blur", and `innerShadowBlur` leaves "inner blur".
 *
 * Read from the property rather than from the siblings, which is what makes it
 * the same wherever a control appears. Comparing against siblings gave a
 * different answer in each section — the contents panel holds a second control
 * feeding `color`, so its Color came out as "color (color)" while every other
 * tab's read "color".
 */
function qualifier(name, property) {
  const inProperty = new Set(property.split(/[^a-z]+/i).filter(Boolean));
  const words = kebab(name.charAt(0).toLowerCase() + name.slice(1))
    .split("-").filter((word) => word && !inProperty.has(word));
  return words.join("-");
}

/**
 * The CSS wording for every control, keyed `<group>.<field>`.
 * @param {object[]} groups   The schema's groups.
 * @param {string} css        Both stylesheets, joined.
 * @param {Function} varFor   `cssVarFor` from the schema.
 * @returns {{names: Map<string, string>, missing: string[]}}
 */
export function cssNames(groups, css, varFor) {
  const sheets = readStylesheets(css);
  const names = new Map();
  const missing = [];
  for (const group of groups) {
    for (const section of group.sections ?? []) {
      // Which controls in this section feed which property, so that siblings
      // sharing one can be told apart.
      const byProperty = new Map();
      const found = new Map();
      // A state's control writes the same property its ordinary one does, in a
      // rule of its own — so it takes the same wording, and stays out of the
      // comparison that tells siblings apart. Left in, every control was
      // qualified against its own twin and came out as "max-width (max-width)".
      const ordinary = (section.fields ?? []).filter((field) => !field.twin);
      for (const field of ordinary) {
        const properties = BY_HAND[field.name]
          ? [BY_HAND[field.name]]
          : propertiesFor(sheets, varFor(group.id, field));
        if (!properties) {
          // A control that answers a question no value can — where an element
          // hangs, which member a family is showing — writes no CSS at all, and
          // has nothing to be named in CSS's words.
          if (!field.noCss && !field.chrome) missing.push(`${group.id}.${field.name}`);
          continue;
        }
        found.set(field.name, properties);
        const key = properties.join(" / ");
        if (!byProperty.has(key)) byProperty.set(key, []);
        byProperty.get(key).push(field.name);
      }
      for (const [name, properties] of found) {
        const key = properties.join(" / ");
        // Named plainly where the property says it all, and told apart only
        // where a section really does feed one property from several controls.
        const part = byProperty.get(key).length > 1 ? qualifier(name, key) : "";
        names.set(`${group.id}.${name}`, part ? `${key} (${part})` : key);
      }
      for (const field of section.fields ?? []) {
        if (!field.twin) continue;
        const said = names.get(`${group.id}.${field.origin}`);
        if (said) names.set(`${group.id}.${field.name}`, said);
        else if (!field.noCss && !field.chrome) missing.push(`${group.id}.${field.name}`);
      }
    }
  }
  return { names, missing };
}
