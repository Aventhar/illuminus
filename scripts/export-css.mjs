import { log } from "./constants.mjs";

/**
 * Gather the CSS that is actually painting a journal, for an export that has no
 * Illuminus style to bake in.
 *
 * A published adventure does not look the way it does because of Foundry — it
 * looks that way because of the game system's stylesheet, and often the module's
 * own on top of that. "Export it as it looks" therefore means carrying
 * whatever is applied at the time, from wherever it came.
 *
 * Copying every loaded stylesheet would work and would be megabytes of rules
 * for windows, chat, and a sidebar that are not in the export. So each rule is
 * tested against the markup that is being exported, and only the ones that hit
 * are kept. The test is a real selector match against a real parsed document,
 * not a guess at what a selector means.
 *
 * Three things are worth knowing before changing any of this:
 *
 *   - **State pseudo-classes are stripped for the test, not from the rule.** A
 *     `:hover` rule matches nothing in a document nobody is pointing at, but it
 *     is exactly the rule a reader will want when they do point at something.
 *   - **Cascade layers must survive.** Foundry puts its own CSS in layers and
 *     relies on their order; a rule lifted out of its layer wins fights it used
 *     to lose. Layer blocks are rebuilt around what they held, and the
 *     statement that declares the order is always kept.
 *   - **Variables usually hang off `html` or `body`** — theme classes, system
 *     palettes. The exported document therefore carries the same classes on
 *     those two elements, or half the colors resolve to nothing.
 */

/** Pseudo-classes that describe a moment rather than a shape. */
const STATE_PSEUDO = /:{1,2}(hover|active|focus|focus-visible|focus-within|visited|target|checked|disabled|enabled|placeholder-shown|autofill|-moz-[a-z-]+|-webkit-[a-z-]+)\b(\([^)]*\))?/g;

/** Pseudo-elements, which never match an element on their own. */
const PSEUDO_ELEMENT = /::[a-z-]+(\([^)]*\))?/g;

/**
 * A selector reduced to the part that can be tested against a static document.
 * Returns null when nothing testable is left, which means "keep it".
 */
function testable(selector) {
  const stripped = selector.replace(PSEUDO_ELEMENT, "").replace(STATE_PSEUDO, "").trim();
  if (!stripped || /^[>+~]/.test(stripped)) return null;
  return stripped;
}

/** Whether any part of a comma-joined selector matches any exported page. */
function matches(selector, docs) {
  for (const one of selector.split(",")) {
    const probe = testable(one);
    // Unreadable after stripping: keep it rather than lose styling to a
    // selector this code did not understand.
    if (probe === null) return true;
    for (const doc of docs) {
      try {
        // querySelector never returns the root, so it is asked separately —
        // and `:root` rules are where most of the variables live.
        if (doc.documentElement.matches(probe) || doc.querySelector(probe)) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

/**
 * Walk a list of rules, keeping the ones that apply.
 * @returns {{css: string[], kept: number}}
 */
function keepFrom(rules, docs, depth = 0) {
  const css = [];
  let kept = 0;
  for (const rule of rules) {
    // Plain rule: the whole question is whether anything matches it.
    if (rule instanceof CSSStyleRule) {
      if (!matches(rule.selectorText, docs)) continue;
      css.push(rule.cssText);
      kept += 1;
      continue;
    }

    // A group: keep the wrapper only if something inside survived.
    const inner = rule.cssRules && !(rule instanceof CSSKeyframesRule)
      ? keepFrom(rule.cssRules, docs, depth + 1)
      : null;
    if (inner) {
      if (!inner.kept) continue;
      const head = rule.conditionText !== undefined
        ? `@${rule.constructor.name.replace(/^CSS|Rule$/g, "").toLowerCase()} ${rule.conditionText}`
        : (rule instanceof CSSLayerBlockRule ? `@layer ${rule.name}` : null);
      css.push(head ? `${head} {\n${inner.css.join("\n")}\n}` : inner.css.join("\n"));
      kept += inner.kept;
      continue;
    }

    // Fonts and animations are small, named from elsewhere, and cheap to keep
    // whole — working out which are referenced costs more than carrying them.
    if (rule instanceof CSSFontFaceRule || rule instanceof CSSKeyframesRule
      || rule instanceof CSSLayerStatementRule || rule instanceof CSSPropertyRule) {
      css.push(rule.cssText);
      kept += 1;
    }
  }
  return { css, kept };
}

/** Where a stylesheet came from, worded for a person. */
function sourceOf(sheet) {
  const href = sheet.href ?? "";
  // A <style> element rather than a file: the module's own compiled values are
  // the ones that matter here, and they say so in their id.
  if (!href) {
    const id = sheet.ownerNode?.id ?? "";
    if (id.includes("illuminus")) return game.modules.get("illuminus")?.title ?? "Illuminus";
    return game.i18n.localize("ILLUMINUS.Export.SourceFoundry");
  }
  const module = href.match(/\/modules\/([^/]+)\//)?.[1];
  if (module) return game.modules.get(module)?.title ?? module;
  const system = href.match(/\/systems\/([^/]+)\//)?.[1];
  if (system) return game.system.title ?? system;
  if (href.includes("/worlds/")) return game.world.title ?? game.world.id;
  return game.i18n.localize("ILLUMINUS.Export.SourceFoundry");
}

/**
 * The CSS that applies to a piece of markup, gathered from everything loaded.
 *
 * @param {string|string[]} html  The exported documents' markup. Every page in
 *   the export is tested, since a rule needed by one is needed by the archive.
 * @param {object} [options]
 * @param {string[]} [options.skip]  Sheets whose href contains any of these are
 *   ignored.
 * @returns {{css: string, sources: string[], rules: number}}
 */
export function collectAppliedCss(html, { skip = [] } = {}) {
  const docs = [html].flat().map((markup) => new DOMParser().parseFromString(markup, "text/html"));
  const blocks = [];
  const sources = new Set();
  let rules = 0;

  for (const sheet of document.styleSheets) {
    const href = sheet.href ?? "";
    if (skip.some((fragment) => href.includes(fragment))) continue;
    let list;
    try {
      list = sheet.cssRules;
    } catch (error) {
      // Only a cross-origin sheet can refuse, and a self-hosted Foundry has
      // none — but a world served fonts from elsewhere would land here.
      log.warn(`export: could not read a stylesheet (${error.message})`);
      continue;
    }
    const found = keepFrom(list, docs);
    if (!found.kept) continue;
    blocks.push(`/* ${sourceOf(sheet)} */\n${found.css.join("\n")}`);
    sources.add(sourceOf(sheet));
    rules += found.kept;
  }

  return { css: blocks.join("\n\n"), sources: [...sources], rules };
}

/**
 * The theme classes, which Foundry also puts on each application window — so an
 * exported document that mirrors a window has to wear them as well.
 */
export function themeClasses() {
  const all = `${document.documentElement.className} ${document.body.className}`.split(/\s+/);
  return [...new Set(all.filter((name) => /^(themed|theme-[\w-]+)$/.test(name)))].join(" ");
}

/**
 * The classes Foundry keeps on `html` and `body`.
 *
 * Themes and system palettes define their variables against these, so an export
 * that leaves them off gets the shapes right and the colors wrong.
 */
export function rootClasses() {
  return {
    html: document.documentElement.className,
    body: document.body.className
  };
}
