import { MODULE_ID, STYLED_CLASS, STYLE_ATTR, log } from "./constants.mjs";
import { allFields } from "./style-schema.mjs";
import { compileBaseRule, compileStyle } from "./style-compiler.mjs";
import { getStyle } from "./style-store.mjs";
import { makeZip, saveZip } from "./zip.mjs";

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

  /** @type {string[]} Sources that could not be read. */
  missing = [];

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

    const path = `assets/${folder}/${name}`;
    this.#taken.add(`${folder}/${name}`);
    this.#bySource.set(clean, { path, bytes });
    return path;
  }
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
async function rewriteContent(html, { pageLinks, assets, report }) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const root = doc.body;

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
    if (path) element.setAttribute("src", path);
  }

  return root.innerHTML;
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
  return [
    src ? `<img src="${esc(src)}" alt="${esc(page.name)}">` : "",
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
 * One complete HTML file.
 *
 * The outer element carries both the marker class and the `application` class,
 * because that is what the window styling attaches to — an export of a style
 * with a green window frame has a green frame.
 */
function documentMarkup({ title, styleId, sidebar, pages, cssHref, lang }) {
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${esc(MODULE_ID)}">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${esc(cssHref)}">
</head>
<body>
<div class="illuminus-export sheet journal-entry application ${STYLED_CLASS}" ${STYLE_ATTR}="${esc(styleId)}">
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

  let css = parts.filter(Boolean).join("\n\n");

  // Textures and background pictures are named inside the values, so they are
  // gathered from the finished stylesheet rather than from the schema — that
  // way a picture reaches the archive however it got into the CSS.
  const sources = new Set();
  for (const [, , source] of css.matchAll(/url\((["']?)([^"')]+)\1\)/g)) sources.add(source);
  for (const source of sources) {
    if (source.startsWith("data:")) continue;
    const path = await assets.add(new URL(source, document.baseURI).href, "images");
    // One level down from the stylesheet, which lives in styles/.
    if (path) css = css.replaceAll(source, `../${path}`);
  }
  return css;
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
 * @param {string} options.styleId      The style to bake in.
 * @param {string[]} options.entryIds   Journals to export.
 * @param {boolean} [options.secrets]   Include unrevealed secret passages.
 * @returns {Promise<{blob: Blob, filename: string, report: object}|null>}
 */
export async function buildHtmlExport({ styleId, entryIds, secrets = false }) {
  const style = getStyle(styleId);
  if (!style) return null;

  const entries = entryIds.map((id) => game.journal.get(id)).filter(Boolean);
  if (!entries.length) return null;

  // Names first: every file has to know what the others are called before any
  // of them can be written, because they all carry the same contents panel.
  const taken = new Set();
  const single = entries.length === 1;
  const plan = { journals: [] };
  for (const entry of entries) {
    let file = single ? "index.html" : `${slug(entry.name, "journal")}.html`;
    for (let n = 2; taken.has(file); n++) file = `${slug(entry.name, "journal")}-${n}.html`;
    taken.add(file);
    plan.journals.push({ entry, file, pages: exportablePages(entry) });
  }

  const pageLinks = new Map();
  for (const journal of plan.journals) {
    for (const page of journal.pages) {
      pageLinks.set(page.uuid, `${journal.file}#page-${page.id}`);
    }
  }

  const assets = new AssetBag();
  const report = {
    flattened: 0,
    journals: plan.journals.length,
    pages: 0,
    skipped: entries.reduce((n, entry) => n + skippedPages(entry).length, 0),
    missing: assets.missing
  };
  const files = [];

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
      rendered.push(pageMarkup(page, await rewriteContent(enriched, { pageLinks: local, assets, report })));
      report.pages += 1;
    }

    files.push({
      path: journal.file,
      data: documentMarkup({
        title: journal.entry.name,
        styleId: style.id,
        sidebar,
        pages: rendered.join("\n"),
        cssHref: `styles/${slug(style.name, "style")}.css`,
        lang: game.i18n.lang ?? "en"
      })
    });
  }

  // The stylesheet is built last: gathering the pages is what fills the archive
  // with pictures, and the fonts are named by the style itself.
  files.push({ path: `styles/${slug(style.name, "style")}.css`, data: await buildStylesheet(style, assets, report) });

  if (!single) {
    files.push({
      path: "index.html",
      data: documentMarkup({
        title: game.i18n.localize("ILLUMINUS.Export.Contents"),
        styleId: style.id,
        sidebar: sidebarMarkup(plan, null),
        pages: `<article class="journal-entry-page text"><section class="journal-page-content">`
          + `<h1>${esc(game.i18n.localize("ILLUMINUS.Export.Contents"))}</h1>\n<ul>`
          + plan.journals.map((j) => `<li><a href="${j.file}">${esc(j.entry.name)}</a></li>`).join("\n")
          + `</ul></section></article>`,
        cssHref: `styles/${slug(style.name, "style")}.css`,
        lang: game.i18n.lang ?? "en"
      })
    });
  }

  report.assets = assets.count;
  const blob = await makeZip([...files, ...assets.files]);
  const filename = single
    ? `${slug(entries[0].name, "journal")}.zip`
    : `${slug(style.name, "illuminus")}-journals.zip`;
  return { blob, filename, report };
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
  saveZip(built.blob, built.filename);
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
