import { MODULE_ID, STYLED_CLASS, STYLE_ATTR, log } from "./constants.mjs";
import { allFields } from "./style-schema.mjs";
import { compileBaseRule, compileStyle } from "./style-compiler.mjs";
import { getStyle, getAssignedStyleId } from "./style-store.mjs";
import { makeZip, saveFile } from "./zip.mjs";
import { collectAppliedCss, rootClasses, themeClasses } from "./export-css.mjs";

/**
 * Export styled journals as a folder of web pages that owe nothing to Foundry
 * or to this module.
 *
 * The whole design rests on one decision: **the export mirrors Foundry's own
 * markup.** A window holding a contents panel beside a page, a page holding an
 * article, an article holding a header and a content section — the same
 * elements with the same class names the sheet uses. Every rule in
 * `illuminus.css` then applies to the exported file unchanged, and a style that
 * looks right in Foundry looks right in a browser without a second set of
 * selectors that could drift out of step with the first.
 *
 * It also means the parts of a style that are *about* the application — the
 * window frame, the title bar, the contents panel — are not lost on the way
 * out. What you styled is what gets exported.
 *
 * Three things do not survive, and each is a decision rather than a limitation:
 *
 *   - **Links to documents that are not journals.** An actor or an item has no
 *     page to point at, so the link is unwrapped into its own text. A dead
 *     anchor would look identical and behave worse, by inviting a click.
 *   - **Inline rolls and system enrichers.** Their enriched text is already the
 *     readable form — "DC 20 Reflex" — which is what a person reads out anyway.
 *   - **Unrevealed secrets**, unless asked for. Foundry's own enricher drops
 *     them, so a GM aside cannot leak into a player handout by default.
 */

/** Turn a name into something safe on every filesystem and in every zip. */
function slug(name, fallback = "page") {
  return String(name ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || fallback;
}

/** Escape text for insertion into markup. */
function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
  ));
}

/**
 * Collects every file an export needs, keeping one copy of each.
 *
 * A picture used on four pages is fetched once and stored once; the same
 * original path always maps to the same name inside the archive. Anything that
 * cannot be fetched is recorded rather than thrown, because one missing
 * portrait should not cost an author the other ninety-nine files.
 */
class AssetBag {
  #bySource = new Map();
  #taken = new Set();
  #inline;

  /** @type {string[]} Sources that could not be read. */
  missing = [];

  /**
   * @param {boolean} [inline]  Return each file as a `data:` URI rather than a
   *   path. One printable document has to carry its pictures inside it: a
   *   browser printing a page does not go looking for a folder beside it.
   */
  constructor({ inline = false } = {}) {
    this.#inline = inline;
  }

  get files() {
    return [...this.#bySource.values()].map(({ path, bytes }) => ({ path, data: bytes }));
  }

  get count() {
    return this.#bySource.size;
  }

  /**
   * Fetch one file and place it in the archive.
   * @param {string} source  A path or URL as it appears in the markup.
   * @param {string} folder  Where it goes: images, fonts, media.
   * @returns {Promise<string|null>}  Its path inside the archive, or null.
   */
  async add(source, folder = "images") {
    const clean = String(source ?? "").trim();
    if (!clean || clean.startsWith("data:")) return null;
    if (this.#bySource.has(clean)) return this.#bySource.get(clean).path;

    let bytes;
    try {
      const response = await fetch(clean);
      if (!response.ok) throw new Error(`${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      log.warn(`export: could not read ${clean} (${error.message})`);
      this.missing.push(clean);
      return null;
    }

    // The original filename, kept recognizable but made safe: a stranger's
    // asset names travel through a zip, an unzipper, and a filesystem.
    const raw = decodeURIComponent(clean.split("?")[0].split("/").pop() ?? "file");
    const dot = raw.lastIndexOf(".");
    const extension = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    let name = `${slug(dot > 0 ? raw.slice(0, dot) : raw, "file")}${extension ? `.${extension}` : ""}`;
    for (let n = 2; this.#taken.has(`${folder}/${name}`); n++) {
      name = `${slug(dot > 0 ? raw.slice(0, dot) : raw, "file")}-${n}${extension ? `.${extension}` : ""}`;
    }

    const path = this.#inline
      ? `data:${mimeOf(extension)};base64,${base64(bytes)}`
      : `assets/${folder}/${name}`;
    this.#taken.add(`${folder}/${name}`);
    this.#bySource.set(clean, { path, bytes });
    return path;
  }
}

/** Enough of a MIME table for the things a journal actually holds. */
function mimeOf(extension) {
  return {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp3: "audio/mpeg", ogg: "audio/ogg", webm: "video/webm", mp4: "video/mp4"
  }[extension] ?? "application/octet-stream";
}

/** Bytes as base64, in chunks so a large picture cannot blow the stack. */
function base64(bytes) {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 8192) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return btoa(binary);
}

/* -------------------------------------------- */
/*  Page content                                */
/* -------------------------------------------- */

/** The document kind a uuid names, worded for a reader: "Actor", "Roll Table". */
function documentLabel(uuid) {
  try {
    const { type } = foundry.utils.parseUuid(uuid) ?? {};
    const label = type && getDocumentClass(type)?.metadata?.label;
    return label ? game.i18n.localize(label) : "";
  } catch {
    return "";
  }
}

/**
 * Rewrite one page's enriched HTML for a life outside Foundry.
 *
 * @param {string} html          Enriched content.
 * @param {object} context
 * @param {Map<string,string>} context.pageLinks  Page uuid -> href in the export.
 * @param {AssetBag} context.assets
 * @param {object} context.report
 * @returns {Promise<string>}
 */
async function rewriteContent(html, { pageLinks, assets, report, headings, prefix = "" }) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const root = doc.body;
  let pictures = 0;

  // Every heading gets a name, so a contents page has somewhere to point.
  // Numbered rather than slugged alone: two sections called "Treasure" are
  // common and would otherwise share an anchor.
  for (const [index, heading] of [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].entries()) {
    const text = heading.textContent.trim();
    if (!heading.id) heading.id = `${prefix}h${index + 1}-${slug(text, "heading")}`;
    headings?.push({ level: Number(heading.tagName[1]), text, id: heading.id });
  }

  // Anything that only does something in Foundry: reveal buttons, copy buttons,
  // the controls core prints inside collapsible sections.
  for (const button of root.querySelectorAll("button")) button.remove();

  for (const link of root.querySelectorAll("a")) {
    const uuid = link.dataset.uuid ?? "";
    const target = uuid && pageLinks.get(uuid);
    if (target) {
      link.setAttribute("href", target);
      link.classList.add("illuminus-page-link");
      for (const name of Object.keys({ ...link.dataset })) delete link.dataset[name];
      continue;
    }
    // An external link is already a link that works.
    if (/^(https?:)?\/\//i.test(link.getAttribute("href") ?? "")) continue;

    const span = doc.createElement("span");
    span.className = `illuminus-ref ${link.className}`.trim();
    span.innerHTML = link.innerHTML;
    const kind = documentLabel(uuid);
    const title = kind
      ? game.i18n.format("ILLUMINUS.Export.Reference", { kind, name: link.textContent.trim() })
      : link.textContent.trim();
    if (title) span.setAttribute("title", title);
    link.replaceWith(span);
    report.flattened += 1;
  }

  for (const element of root.querySelectorAll("img, source, video, audio")) {
    const source = element.getAttribute("src");
    if (!source) continue;
    const folder = element.tagName === "IMG" ? "images" : "media";
    const path = await assets.add(new URL(source, document.baseURI).href, folder);
    if (!path) continue;
    element.setAttribute("src", path);

    // Clicking a picture in Foundry opens it at its full size, so clicking one
    // here opens it over the page. Left alone if it is already inside a link,
    // which the author put there on purpose.
    //
    // It opens *in the document* rather than in a tab of its own, and that is
    // not a preference: in a single-file export the picture is a `data:` URI,
    // and browsers refuse to navigate to one at the top level — the tab opens
    // blank. A link to an anchor works in every export, needs no script, and
    // is closer to what Foundry does anyway.
    if (element.tagName !== "IMG" || element.closest("a")) continue;
    const host = element.closest("figure") ?? wrap(doc, element, "span", "illuminus-picture");
    host.id ||= `${prefix}picture-${++pictures}`;

    const link = doc.createElement("a");
    link.className = "illuminus-picture-link";
    link.setAttribute("href", `#${host.id}`);
    element.replaceWith(link);
    link.append(element);

    // A backdrop behind the opened picture: clicking anywhere puts it away.
    // `#!` matches nothing, which closes it without jumping to the top.
    const close = doc.createElement("a");
    close.className = "illuminus-picture-close";
    close.setAttribute("href", "#!");
    close.setAttribute("aria-label", game.i18n.localize("ILLUMINUS.Buttons.Close"));
    host.append(close);
  }

  return root.innerHTML;
}

/** Put an element inside a new one, in its place. */
function wrap(doc, element, tag, className) {
  const wrapper = doc.createElement(tag);
  wrapper.className = className;
  element.replaceWith(wrapper);
  wrapper.append(element);
  return wrapper;
}

/** One page, as the sheet renders it: a header carrying the name, then content. */
function pageMarkup(page, content) {
  const level = page.title?.level ?? 1;
  const header = page.title?.show === false
    ? ""
    : `<header class="journal-page-header"><h${level}>${esc(page.name)}</h${level}></header>\n`;
  // A picture page's content element is a figure rather than a section, which
  // is core's own markup and what the Images tab is written against.
  const tag = page.type === "image" ? "figure" : "section";
  return `<article class="journal-entry-page ${esc(page.type)}" id="page-${esc(page.id)}" data-page-id="${esc(page.id)}">
${header}<${tag} class="journal-page-content">
${content}
</${tag}>
</article>`;
}

/**
 * A picture page, which carries no markup of its own — just a file and a line
 * underneath it.
 */
async function imagePageMarkup(page, assets) {
  const src = page.src ? await assets.add(new URL(page.src, document.baseURI).href, "images") : null;
  const caption = page.image?.caption;
  const id = `picture-p${esc(page.id)}`;
  return [
    src ? `<span class="illuminus-picture" id="${id}">`
      + `<a class="illuminus-picture-link" href="#${id}">`
      + `<img src="${esc(src)}" alt="${esc(page.name)}"></a>`
      + `<a class="illuminus-picture-close" href="#!" aria-label="${
        esc(game.i18n.localize("ILLUMINUS.Buttons.Close"))}"></a></span>` : "",
    caption ? `<figcaption>${esc(caption)}</figcaption>` : ""
  ].filter(Boolean).join("\n");
}

/* -------------------------------------------- */
/*  Document chrome                             */
/* -------------------------------------------- */

/**
 * The contents panel, listing every journal in the export and every page in it.
 *
 * This is the same markup Foundry's own panel uses, so the Sidebar tab's
 * settings — the panel fill, its width, how an entry looks, the category rows —
 * carry into the export without a single extra rule.
 */
function sidebarMarkup(plan, currentEntryId) {
  const parts = [];
  for (const journal of plan.journals) {
    if (plan.journals.length > 1) {
      parts.push(`<li class="category"><strong>${esc(journal.entry.name)}</strong></li>`);
    }
    for (const [index, page] of journal.pages.entries()) {
      const href = journal.entry.id === currentEntryId
        ? `#page-${esc(page.id)}`
        : `${journal.file}#page-${esc(page.id)}`;
      parts.push(`<li class="page" data-page-id="${esc(page.id)}">`
        + `<a class="page-heading" href="${href}">`
        + `<span class="page-index">${index + 1}</span>`
        + `<span class="page-title">${esc(page.name)}</span></a></li>`);
    }
  }
  return `<aside class="sidebar journal-sidebar flexcol">
<nav class="toc">
<ol>
${parts.join("\n")}
</ol>
</nav>
</aside>`;
}

/**
 * A contents page, for a document that has to stand on its own.
 *
 * The contents panel is navigation, and navigation does not print — so a single
 * document opens with a list instead. Two decisions make it worth having:
 *
 * Each entry is written as *the same heading tag as the thing it points at*, so
 * the style paints it without a single rule of its own: a page title styled as a
 * heading 1 is listed as a heading 1, and a section inside it as whatever it is.
 * The list therefore looks like the document it precedes, and its tiers are the
 * document's own tiers rather than an invented set.
 *
 * And every entry is a link. A browser printing to PDF turns a link to an
 * anchor into a real PDF link, so the contents page works on paper as well as
 * on screen — which is most of what bookmarks would have been for.
 */
function contentsMarkup(plan, { depth = 3, link = (_journal, id) => `#${id}` } = {}) {
  const entries = [];
  for (const journal of plan.journals) {
    if (plan.journals.length > 1) {
      entries.push({ journal, level: 1, text: journal.entry.name, id: `journal-${journal.entry.id}` });
    }
    for (const { page, found } of journal.headings ?? []) {
      entries.push({
        journal,
        level: page.title?.level ?? 1,
        text: page.name,
        id: `page-${page.id}`,
        page: true
      });
      for (const heading of found) {
        if (heading.level > depth) continue;
        entries.push({ ...heading, journal, level: Math.min(6, heading.level + 1) });
      }
    }
  }
  if (entries.length < 2) return "";

  const lines = entries.map(({ level, text, id, journal }) =>
    `<h${level} class="illuminus-contents__entry" data-depth="${level}">`
    + `<a href="${esc(link(journal, id))}">${esc(text)}</a></h${level}>`).join("\n");

  return `<article class="journal-entry-page text illuminus-contents">
<header class="journal-page-header"><h1>${esc(game.i18n.localize("ILLUMINUS.Export.Contents"))}</h1></header>
<section class="journal-page-content">
<nav class="illuminus-contents__list">
${lines}
</nav>
</section>
</article>`;
}

/**
 * One complete HTML file.
 *
 * The outer element carries both the marker class and the `application` class,
 * because that is what the window styling attaches to — an export of a style
 * with a green window frame has a green frame.
 *
 * It also carries `expanded`, which is a *state* rather than a structure: core
 * hides the page titles in the contents panel unless the sheet says its panel
 * is open, so an export without it lists page numbers and nothing else.
 */
function documentMarkup({ title, styleId, sidebar, pages, cssHref, css, lang, chrome }) {
  return `<!doctype html>
<html lang="${esc(lang)}"${chrome.html ? ` class="${esc(chrome.html)}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${esc(MODULE_ID)}">
<title>${esc(title)}</title>
${css ? `<style>\n${css}\n</style>` : `<link rel="stylesheet" href="${esc(cssHref)}">`}
</head>
<body${chrome.body ? ` class="${esc(chrome.body)}"` : ""}>
<div class="illuminus-export sheet journal-entry application expanded ${esc(chrome.root)}"${
  styleId ? ` ${STYLE_ATTR}="${esc(styleId)}"` : ""}>
${sidebar}
<section class="journal-entry-content flexcol">
<header class="journal-header"><h1 class="title">${esc(title)}</h1></header>
<div class="journal-entry-pages">
${pages}
</div>
</section>
</div>
</body>
</html>
`;
}

/* -------------------------------------------- */
/*  Stylesheet                                  */
/* -------------------------------------------- */

/** Read one of the module's own stylesheets. */
async function moduleFile(path) {
  const response = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/${path}`));
  if (!response.ok) throw new Error(`could not read ${path}`);
  return response.text();
}

/**
 * `@font-face` rules for the fonts this style asks for, and the font files to
 * go with them.
 *
 * A family with no files of its own — Arial, Courier New — is one the reader's
 * own machine already has, and needs nothing said about it.
 */
/**
 * The typefaces a page falls back to, as Foundry itself states them — the whole
 * stack rather than a guess at one, so an export matches the application down
 * to which face a reader without the font file ends up with.
 */
function defaultStack() {
  return getComputedStyle(document.body).fontFamily || "Signika, sans-serif";
}

/** The first named family in that stack: the one with a file to copy. */
function defaultFamily() {
  return defaultStack().split(",")[0].replace(/["']/g, "").trim() || "Signika";
}

async function fontRules(style, assets) {
  // The typeface the page falls back to counts as one the export needs. Most
  // text settings mean "use the journal's own", which resolves against
  // Foundry's stylesheet — so without this the lettering silently becomes
  // whatever serif the reader's browser reaches for first.
  const families = new Set([defaultFamily()]);
  for (const { group, field } of allFields()) {
    if (field.type !== "font") continue;
    const value = style.settings?.[group.id]?.[field.name];
    if (value) families.add(String(value));
  }

  const defined = { ...CONFIG.fontDefinitions, ...(game.settings.get("core", "fonts") ?? {}) };
  // Stated as a stack, so a family with no file of its own — Arial, Courier
  // New — still lands somewhere sensible, and so does one whose file could not
  // be read.
  const rules = [`body {\n  font-family: ${defaultStack()};\n}`];
  let count = 0;
  for (const family of families) {
    for (const face of defined[family]?.fonts ?? []) {
      const source = face.urls?.[0];
      if (!source) continue;
      const path = await assets.add(new URL(source, document.baseURI).href, "fonts");
      if (!path) continue;
      count += 1;
      rules.push(`@font-face {
  font-family: "${family}";
  src: url("${path}");
  font-weight: ${face.weight ?? "400"};
  font-style: ${face.style ?? "normal"};
  font-display: swap;
}`);
    }
  }
  return { css: rules.join("\n\n"), count };
}

/**
 * The whole stylesheet for an export: what the module always ships, then the
 * one style's own values, with every picture it names pulled into the archive.
 */
async function buildStylesheet(style, assets, report) {
  const fonts = await fontRules(style, assets);
  report.fonts = fonts.count;
  const parts = [
    await moduleFile("styles/illuminus-export.css"),
    fonts.css,
    await moduleFile("styles/illuminus.css"),
    await moduleFile("styles/illuminus-generated.css"),
    compileBaseRule(),
    compileStyle(style)
  ];

  return carryPictures(parts.filter(Boolean).join("\n\n"), assets);
}

/**
 * Every picture a stylesheet names, pulled into the archive.
 *
 * Gathered from the finished CSS rather than from the schema, so a picture
 * reaches the export however it got into the rules — a style's texture, a game
 * system's border, an icon behind a heading.
 */
async function carryPictures(css, assets) {
  const sources = new Set();
  for (const [, , source] of css.matchAll(/url\((["']?)([^"')]+)\1\)/g)) sources.add(source);
  for (const source of sources) {
    if (source.startsWith("data:") || source.startsWith("#")) continue;
    let resolved;
    try {
      resolved = new URL(source, document.baseURI).href;
    } catch {
      continue;
    }
    const folder = /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(source) ? "fonts" : "images";
    const path = await assets.add(resolved, folder);
    if (!path) continue;
    // A file is one level down from the stylesheet, which lives in styles/. A
    // picture carried inside the document is not anywhere, and prefixing it
    // turns a working data: URI into a broken relative path.
    css = css.replaceAll(source, path.startsWith("data:") ? path : `../${path}`);
  }
  return css;
}

/**
 * The stylesheet for an export with no style chosen: whatever is painting these
 * journals right now, gathered from every sheet the page has loaded and cut
 * down to the rules that touch the exported markup.
 *
 * This is what carries a game system's look — the reason a Pathfinder module
 * exports looking like a Pathfinder module rather than like plain HTML.
 */
async function buildAppliedStylesheet(documents, assets, report) {
  const found = collectAppliedCss(documents);
  report.sources = found.sources;
  report.rules = found.rules;
  log.debug(`export: kept ${found.rules} rules from ${found.sources.length} source(s)`);
  // Everything gathered goes inside one cascade layer, and the module's own
  // export rules stay outside it. An unlayered rule beats a layered one however
  // specific the layered one is, which is the only way to win against selectors
  // like `.sheet.journal-entry.application .journal-sidebar` without writing
  // longer selectors here than there — the same mechanism Foundry uses to let
  // modules override core.
  const css = [
    `@layer illuminus-source {\n${found.css}\n}`,
    await moduleFile("styles/illuminus-export.css")
  ].join("\n\n");
  return carryPictures(css, assets);
}

/* -------------------------------------------- */
/*  The export itself                           */
/* -------------------------------------------- */

/** The kinds of page that can become a web page: words, and pictures. */
const EXPORTABLE = new Set(["text", "image"]);

/** The pages of a journal that should travel, in the order they are listed. */
function exportablePages(entry) {
  return entry.pages.contents
    .filter((page) => EXPORTABLE.has(page.type) && page.testUserPermission(game.user, "OBSERVER"))
    .sort((a, b) => a.sort - b.sort);
}

/**
 * The pages that cannot, counted so the author is told rather than left to
 * notice. A video or a PDF page is a player, not a page: carrying it would mean
 * carrying the file it plays, and an export is meant to be something you can
 * send to someone.
 */
function skippedPages(entry) {
  return entry.pages.contents
    .filter((page) => !EXPORTABLE.has(page.type) && page.testUserPermission(game.user, "OBSERVER"));
}

/**
 * Build a standalone web copy of one or more journals.
 *
 * @param {object} options
 * @param {string} [options.styleId]    The style to bake in. Empty for each
 *   journal's own look, taken from whatever is painting it in Foundry.
 * @param {string[]} options.entryIds   Journals to export.
 * @param {boolean} [options.secrets]   Include unrevealed secret passages.
 * @param {boolean} [options.pageBackground]  Print the page's own surface —
 *   its colour and its picture — rather than leaving the paper white.
 * @param {"folder"|"file"|"print"} [options.format]  A folder of pages, one
 *   self-contained page, or one page built to be printed. The last two are the
 *   same document: a thing you can print is a thing you can email, and a
 *   printer will not go looking for a folder of pictures beside the file.
 * @returns {Promise<{blob: Blob, filename: string, report: object, html?: string}|null>}
 */
export async function buildHtmlExport({
  styleId, entryIds, secrets = false, format = "folder", pageBackground = false
}) {
  const onePage = format !== "folder";
  // No style means "as it looks now", which is a different question: the CSS is
  // gathered from the page rather than compiled from a style.
  const style = styleId ? getStyle(styleId) : null;
  if (styleId && !style) return null;

  const entries = entryIds.map((id) => game.journal.get(id)).filter(Boolean);
  if (!entries.length) return null;

  // Names first: every file has to know what the others are called before any
  // of them can be written, because they all carry the same contents panel.
  const taken = new Set();
  const single = entries.length === 1;
  const plan = { journals: [] };
  for (const entry of entries) {
    // One page means one file, so nothing is named after anything: every link
    // is an anchor within the document.
    let file = onePage ? "" : (single ? "index.html" : `${slug(entry.name, "journal")}.html`);
    for (let n = 2; file && taken.has(file); n++) file = `${slug(entry.name, "journal")}-${n}.html`;
    taken.add(file);
    plan.journals.push({ entry, file, pages: exportablePages(entry) });
  }

  const pageLinks = new Map();
  for (const journal of plan.journals) {
    for (const page of journal.pages) {
      pageLinks.set(page.uuid, `${journal.file}#page-${page.id}`);
    }
  }

  const assets = new AssetBag({ inline: onePage });
  const report = {
    flattened: 0,
    journals: plan.journals.length,
    pages: 0,
    skipped: entries.reduce((n, entry) => n + skippedPages(entry).length, 0),
    missing: assets.missing
  };
  const files = [];

  // One name and one set of classes for every file in the export.
  const sheetName = `styles/${slug(style?.name ?? "journal", "style")}.css`;
  // Without a chosen style the export leans on the page's own CSS, which hangs
  // its colors off the theme classes Foundry keeps on html and body.
  const chrome = style
    ? { root: STYLED_CLASS, html: "", body: "" }
    : { root: themeClasses(), ...rootClasses() };
  // Only printing leaves it out, but the class is written whatever the format:
  // a saved page is one somebody may print later.
  if (pageBackground) chrome.root = `${chrome.root} illuminus-print-background`.trim();

  /**
   * Which style a document wears. With one chosen, all of them wear it; with
   * none, each journal keeps its own — a styled journal looks styled in Foundry,
   * so it should look styled in the export.
   */
  const styleFor = (entry) => (style ? style.id : (entry ? getAssignedStyleId(entry) ?? "" : ""));
  const page = (title, entry, sidebar, pages, css) => {
    const id = styleFor(entry);
    return documentMarkup({
      title, sidebar, pages, css, cssHref: sheetName, lang: game.i18n.lang ?? "en",
      styleId: id,
      chrome: { ...chrome, root: [chrome.root, id ? STYLED_CLASS : ""].filter(Boolean).join(" ") }
    });
  };

  for (const journal of plan.journals) {
    const sidebar = sidebarMarkup(plan, journal.entry.id);
    const rendered = [];
    for (const page of journal.pages) {
      if (page.type === "image") {
        rendered.push(pageMarkup(page, await imagePageMarkup(page, assets)));
        report.pages += 1;
        continue;
      }
      const enriched = await CONFIG.ux.TextEditor.enrichHTML(page.text.content ?? "", {
        secrets,
        relativeTo: page
      });
      // Links inside this file point at anchors rather than at the file itself.
      const local = new Map([...pageLinks].map(([uuid, href]) => [
        uuid, href.startsWith(journal.file) ? href.slice(journal.file.length) : href
      ]));
      const found = [];
      rendered.push(pageMarkup(page, await rewriteContent(enriched, {
        // Started with a letter: a Foundry id may begin with a digit, which is
        // a perfectly good HTML id and not a valid CSS identifier — so anything
        // that later wants to name one in a selector would quietly fail.
        pageLinks: local, assets, report, headings: found, prefix: `p${page.id}-`
      })));
      journal.headings = (journal.headings ?? []).concat({ page, found });
      report.pages += 1;
    }

    if (onePage) {
      // Kept for the second pass rather than written: a single document is
      // built once its whole contents are known.
      journal.rendered = rendered;
      continue;
    }
    files.push({
      path: journal.file,
      data: page(journal.entry.name, journal.entry, sidebar, rendered.join("\n"))
    });
  }

  if (onePage) {
    const title = single
      ? entries[0].name
      : game.i18n.format("ILLUMINUS.Export.ManyTitle", { count: entries.length });
    const sidebar = sidebarMarkup(plan, null);
    // Each journal keeps its own name above its pages, which is the only thing
    // the contents panel was saying that the page itself was not.
    const body = [
      contentsMarkup(plan),
      ...plan.journals.map((journal) => (plan.journals.length > 1
        ? `<article class="journal-entry-page text illuminus-export__journal" id="journal-${esc(journal.entry.id)}">`
          + `<header class="journal-page-header"><h1>${esc(journal.entry.name)}</h1></header></article>\n`
          + journal.rendered.join("\n")
        : journal.rendered.join("\n")))
    ].filter(Boolean).join("\n");

    // Built twice: the stylesheet is chosen by what the markup contains, and
    // the markup then carries the stylesheet.
    const probe = page(title, plan.journals[0]?.entry, sidebar, body);
    const css = style
      ? await buildStylesheet(style, assets, report)
      : await buildAppliedStylesheet([probe], assets, report);
    const html = page(title, plan.journals[0]?.entry, sidebar, body, css);

    report.assets = assets.count;
    const name = `${slug(single ? entries[0].name : (style?.name ?? "journals"), "journals")}.html`;
    return { blob: new Blob([html], { type: "text/html" }), filename: name, report, html };
  }

  if (!single) {
    // The same contents page a printed document opens with, pointing at files
    // rather than at anchors — one list, written once, styled by the style.
    const contents = contentsMarkup(plan, { link: (journal, id) => `${journal.file}#${id}` });
    files.push({
      path: "index.html",
      data: page(
        game.i18n.localize("ILLUMINUS.Export.Contents"), plan.journals[0]?.entry, sidebarMarkup(plan, null),
        contents || `<article class="journal-entry-page text"><section class="journal-page-content">`
          + `<h1>${esc(game.i18n.localize("ILLUMINUS.Export.Contents"))}</h1></section></article>`
      )
    });
  }

  // The stylesheet is built last: gathering the pages is what fills the archive
  // with pictures, and — without a style — what there is to match rules against.
  files.push({
    path: sheetName,
    data: style
      ? await buildStylesheet(style, assets, report)
      : await buildAppliedStylesheet(files.map((file) => file.data), assets, report)
  });

  report.assets = assets.count;
  const blob = await makeZip([...files, ...assets.files]);
  const filename = single
    ? `${slug(entries[0].name, "journal")}.zip`
    : `${slug(style?.name ?? "journals", "illuminus")}-journals.zip`;
  return { blob, filename, report };
}

/**
 * Print a built document, without opening a window to do it.
 *
 * This is the whole of the PDF export, and deliberately so: every browser
 * already prints to PDF, and the print dialog is where a person chooses paper
 * size, margins, and whether backgrounds are inked. Producing a PDF ourselves
 * would mean laying the pages out a second time, in a second engine, and
 * getting a worse answer.
 *
 * It prints a frame rather than a new tab, which is not a detail: building the
 * export takes seconds and asks a question first, so by the time there is
 * anything to show, the click that asked for it is long over and a pop-up
 * blocker refuses — and Foundry's desktop app refuses whatever the timing. A
 * frame needs no permission and shows the same print preview.
 *
 * If printing cannot be started at all, the file is saved instead, so the work
 * is never lost to a failed dialog.
 */
/**
 * Whether whatever is printing will write the PDF itself.
 *
 * This decides one thing and nothing else: whether the contents page's entries
 * are still links in the file that comes out. Chromium writes its own PDF from
 * the print preview and keeps a document's internal links. Safari and Foundry's
 * desktop application have no writer of their own — they hand the job to the
 * operating system's print panel, and its "Save as PDF" flattens the links (and
 * is also why the filename cannot be typed there).
 *
 * Nothing in the document changes this: the same markup printed both ways
 * produces the same annotations, so the difference is entirely downstream.
 */
function keepsPdfLinks() {
  const agent = navigator.userAgent;
  if (/Electron/i.test(agent)) return false;
  return /Chrome\/\d/.test(agent);
}

function printDocument(built, target) {
  // Written into the document rather than loaded from a blob URL, and that is
  // the fix for a whole family of failures rather than a preference. A print
  // preview is rendered by a *second* renderer, which reads the page again — so
  // a document that lives at a URL we later revoke, or at a blob URL a browser
  // will not navigate a top-level window to, produces a PDF that will not open.
  // A document written straight in has no URL to lose.
  const write = (view) => {
    view.document.open();
    view.document.write(built.html);
    view.document.close();
  };

  // A window of its own, when one could be had. The document being printed is
  // then the top-level one, which is what makes a browser name the file after
  // it and keep the contents page's links working in the PDF.
  if (target && !target.closed) {
    write(target);
    const start = () => {
      if (target.closed) return;
      target.focus();
      target.print();
    };
    // Fonts decide the line breaks, and line breaks decide the page breaks.
    (target.document.fonts?.ready ?? Promise.resolve()).then(start, start);
    return;
  }

  // No window to be had: print a frame instead, which needs no permission.
  const frame = document.createElement("iframe");
  frame.className = "illuminus-print-frame";
  frame.setAttribute("aria-hidden", "true");

  // Printing a frame names the job after *this* document rather than the one
  // being printed, which leaves a reader with Foundry's title where the
  // journal's name should be. Lent for the duration and given back after.
  const ownTitle = document.title;
  const done = () => {
    frame.remove();
    document.title = ownTitle;
  };

  document.body.append(frame);
  const view = frame.contentWindow;
  write(view);

  const print = () => {
    try {
      document.title = view.document.title || ownTitle;
      view.focus();
      view.print();
    } catch (error) {
      log.warn("export: printing was refused", error);
      saveFile(built.blob, built.filename);
      ui.notifications.warn(game.i18n.localize("ILLUMINUS.Export.PopupBlocked"));
      done();
    }
  };
  (view.document.fonts?.ready ?? Promise.resolve()).then(print, print);
  // The frame has to outlive the dialog, which is modal and gives no promise:
  // taken away when printing ends, and on a long timer in case it never does.
  view.addEventListener("afterprint", done, { once: true });
  setTimeout(() => { if (frame.isConnected) done(); }, 300000);
}

/**
 * Build an export and hand it to the browser, saying afterwards what did not
 * survive the trip — an author should not have to open the archive to find out
 * that fourteen references are text now.
 */
export async function exportJournalsAsHtml(options) {
  const built = await buildHtmlExport(options);
  if (!built) {
    ui.notifications.warn(game.i18n.localize("ILLUMINUS.Notifications.NothingToExport"));
    return null;
  }
  // Said before the dialog appears, because a modal print window with no
  // warning reads as something having gone wrong.
  if (options.format === "print") {
    ui.notifications.info(game.i18n.localize("ILLUMINUS.Export.Printing"));
    if (!keepsPdfLinks()) ui.notifications.warn(game.i18n.localize("ILLUMINUS.Export.DesktopLinks"));
    printDocument(built, options.target);
  }
  else saveFile(built.blob, built.filename);
  ui.notifications.info(game.i18n.format("ILLUMINUS.Export.Done", {
    pages: built.report.pages,
    assets: built.report.assets
  }));
  if (built.report.flattened) {
    ui.notifications.info(game.i18n.format("ILLUMINUS.Export.Flattened", { count: built.report.flattened }));
  }
  if (built.report.skipped) {
    ui.notifications.warn(game.i18n.format("ILLUMINUS.Export.Skipped", { count: built.report.skipped }));
  }
  if (built.report.fonts) {
    ui.notifications.info(game.i18n.format("ILLUMINUS.Export.Fonts", { count: built.report.fonts }));
  }
  if (built.report.missing.length) {
    ui.notifications.warn(game.i18n.format("ILLUMINUS.Export.Missing", { count: built.report.missing.length }));
  }
  log.info(`exported ${built.report.pages} page(s) to ${built.filename}`, built.report);
  return built;
}
