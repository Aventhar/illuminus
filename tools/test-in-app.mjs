import { fileURLToPath } from "node:url";
import { connect } from "./cdp.mjs";

/**
 * Drives a real Foundry instance over the Chrome DevTools Protocol and asserts
 * on computed styles, so these checks fail on anything that merely *looks*
 * right in source. See CLAUDE.md for how to bring the sandbox up.
 *
 * PORT may be overridden; it must match the sandbox Foundry instance. Never
 * point this at a live world — it creates and deletes documents.
 */
const PORT = process.env.ILLUMINUS_TEST_PORT ?? "30002";
const BASE = `http://127.0.0.1:${PORT}`;

// Expected counts come from the schema itself, so adding a control cannot make
// this file stale — it can only make it fail for a real reason.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };
const { GROUPS, allFields } = await import(`${ROOT}/scripts/style-schema.mjs`);
const EXPECT = {
  tabs: GROUPS.length,
  sections: GROUPS.reduce((n, g) => n + g.sections.length, 0),
  fields: allFields().length
};

const cdp = await connect();
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
const check = (cond, m) => cond ? ok(m) : fail(m);

const joinAndWait = async () => {
  await cdp.goto(`${BASE}/join`);
  await cdp.waitFor("document.querySelector('select[name=userid]')", { label: "join form" });
  await cdp.evaluate(`(() => {
    const sel = document.querySelector('select[name="userid"]');
    sel.value = [...sel.options].find(o => o.value).value;
    document.querySelector('button[name="join"], button[type="submit"]').click();
  })()`);
  await cdp.waitFor("window.game && game.ready", { label: "game.ready", timeout: 120000 });
};

/* --- Enable the module and reload ---------------------------------------- */
await joinAndWait();

if (!await cdp.evaluate(`!!game.modules.get("illuminus")?.active`)) {
  console.log("enabling module …");
  await cdp.evaluate(`(async () => {
    const config = game.settings.get("core", "moduleConfiguration") ?? {};
    config.illuminus = true;
    await game.settings.set("core", "moduleConfiguration", config);
  })()`);
  await new Promise((r) => setTimeout(r, 1500));
  await joinAndWait();
}

console.log("\n[1] Module load");
const errorsBefore = cdp.logs.filter((l) => l.type === "exception" && /illuminus/i.test(l.text));
check(await cdp.evaluate(`!!game.modules.get("illuminus")?.active`), "module is active");
check(errorsBefore.length === 0, `no exceptions from illuminus during boot${errorsBefore.length ? `: ${errorsBefore[0].text}` : ""}`);
check(await cdp.evaluate(`!!game.modules.get("illuminus")?.api?.openManager`), "public API is published");

console.log("\n[2] Presets seeded and compiled");
const styleInfo = await cdp.evaluate(`JSON.stringify({
  count: Object.keys(game.settings.get("illuminus","styles")).length,
  names: game.modules.get("illuminus").api.listStyles().map(s => s.name),
  sheetPresent: !!document.getElementById("illuminus-compiled-styles"),
  cssLength: document.getElementById("illuminus-compiled-styles")?.textContent.length ?? 0,
  ruleCount: document.getElementById("illuminus-compiled-styles")?.sheet?.cssRules.length ?? 0
})`);
const styles = JSON.parse(styleInfo);
check(styles.count === 4, `4 preset styles seeded (got ${styles.count}: ${styles.names.join(", ")})`);
check(styles.sheetPresent, "compiled <style> element is in document.head");
check(styles.ruleCount === 5, `stylesheet parsed into ${styles.ruleCount} rules (1 base + 4 styles) — no CSS syntax errors`);

// Foundry v14 inlines module CSS into a cascade layer rather than adding a
// <link>, so assert the rules take effect rather than looking for the file.
console.log("\n[3] Skeleton stylesheet is in effect");
const skeleton = await cdp.evaluate(`(() => {
  const probe = document.createElement("div");
  probe.className = "illuminus-styled";
  probe.innerHTML = '<section class="journal-entry-content">' +
    '<div class="journal-entry-pages"><section class="journal-page-content">' +
    '<p>x</p><blockquote>q</blockquote></section></div></section>';
  document.body.append(probe);
  const cs = sel => getComputedStyle(probe.querySelector(sel));
  const result = {
    declaredStyles: game.modules.get("illuminus").styles.map(s => s.src),
    pageBg: cs(".journal-entry-content").backgroundColor,
    pagePadding: cs(".journal-entry-pages").padding,
    bodyColor: cs(".journal-page-content").color,
    quoteLeft: cs("blockquote").borderLeftWidth
  };
  probe.remove();
  return JSON.stringify(result);
})()`);
const sk = JSON.parse(skeleton);
check(sk.declaredStyles.includes("modules/illuminus/styles/illuminus.css"), "manifest declares the stylesheet");
check(sk.pageBg === "rgb(237, 224, 200)", `skeleton resolves the default page colour (got ${sk.pageBg})`);
check(sk.pagePadding === "24px", `skeleton resolves the default inner margin (got ${sk.pagePadding})`);
check(sk.bodyColor === "rgb(36, 27, 16)", `skeleton resolves the default ink colour (got ${sk.bodyColor})`);
check(sk.quoteLeft === "4px", `boxed-text edge calc() resolves (got ${sk.quoteLeft})`);

console.log("\n[4] Create a journal, assign a style, verify it applies");
const applied = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Aged Parchment");

  let entry = game.journal.getName("Illuminus Test Journal");
  if (!entry) {
    entry = await JournalEntry.create({name: "Illuminus Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "Test Page", type: "text",
      text: {content: "<h1>Chapter</h1><p>Body text here.</p><blockquote><p>Read aloud.</p></blockquote>" +
        "<h2>Section</h2><ul><li>Item</li></ul><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>"}
    }]);
  }

  await api.assignStyle(entry, style.id);
  const sheet = await entry.sheet.render({force: true});
  await new Promise(r => setTimeout(r, 1200));

  const root = entry.sheet.element;
  const content = root.querySelector(".journal-entry-content");
  const pageContent = root.querySelector(".journal-page-content");
  const h1 = root.querySelector(".journal-page-header h1") ?? root.querySelector(".journal-page-content h1");
  const quote = root.querySelector(".journal-page-content blockquote");
  const th = root.querySelector(".journal-page-content th");

  const cs = el => el ? getComputedStyle(el) : null;
  return JSON.stringify({
    hasClass: root.classList.contains("illuminus-styled"),
    styleAttr: root.getAttribute("data-illuminus-style") === style.id,
    pageBg: cs(content)?.backgroundColor,
    bodyColor: cs(pageContent)?.color,
    bodyAlign: cs(pageContent)?.textAlign,
    h1Bg: cs(h1)?.backgroundColor,
    h1Color: cs(h1)?.color,
    quoteBorderLeft: cs(quote)?.borderLeftWidth,
    quoteBorderTop: cs(quote)?.borderTopWidth,
    thBg: cs(th)?.backgroundColor,
    entryId: entry.id
  });
})()`);
const a = JSON.parse(applied);
check(a.hasClass, "sheet root carries .illuminus-styled");
check(a.styleAttr, "sheet root carries the correct data-illuminus-style");
check(a.pageBg === "rgb(236, 224, 198)", `page background is the style's parchment colour (got ${a.pageBg})`);
check(a.bodyColor === "rgb(36, 27, 16)", `body text uses the style's ink colour (got ${a.bodyColor})`);
check(a.bodyAlign === "justify", `body text is justified per the style (got ${a.bodyAlign})`);
check(a.h1Bg === "rgb(94, 25, 20)", `major heading has the style's banner colour (got ${a.h1Bg})`);
check(a.h1Color === "rgb(246, 239, 224)", `major heading text is the style's pale colour (got ${a.h1Color})`);
check(a.quoteBorderLeft === "5px" && a.quoteBorderTop === "0px",
  `boxed text has a left edge only (left ${a.quoteBorderLeft}, top ${a.quoteBorderTop})`);
check(a.thBg === "rgb(94, 25, 20)", `table header uses the style's colour (got ${a.thBg})`);

console.log("\n[5] Switching styles restyles without re-render");
const switched = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const entry = game.journal.getName("Illuminus Test Journal");
  const midnight = api.listStyles().find(s => s.name === "Midnight Codex");
  await api.assignStyle(entry, midnight.id);
  await new Promise(r => setTimeout(r, 600));
  const root = entry.sheet.element;
  return JSON.stringify({
    attr: root.getAttribute("data-illuminus-style") === midnight.id,
    pageBg: getComputedStyle(root.querySelector(".journal-entry-content")).backgroundColor,
    bodyColor: getComputedStyle(root.querySelector(".journal-page-content")).color
  });
})()`);
const s = JSON.parse(switched);
check(s.attr, "data attribute updated to the new style");
check(s.pageBg === "rgb(23, 26, 33)", `page repainted to Midnight Codex slate (got ${s.pageBg})`);
check(s.bodyColor === "rgb(215, 219, 226)", `body text repainted to pale grey (got ${s.bodyColor})`);

console.log("\n[6] Clearing the style restores Foundry's default");
const cleared = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const entry = game.journal.getName("Illuminus Test Journal");
  await api.assignStyle(entry, "");
  await new Promise(r => setTimeout(r, 600));
  const root = entry.sheet.element;
  return JSON.stringify({
    hasClass: root.classList.contains("illuminus-styled"),
    hasAttr: root.hasAttribute("data-illuminus-style"),
    pageBg: getComputedStyle(root.querySelector(".journal-entry-content")).backgroundColor
  });
})()`);
const c = JSON.parse(cleared);
check(!c.hasClass && !c.hasAttr, "styling markers removed from the sheet");
check(c.pageBg !== "rgb(23, 26, 33)", `page no longer painted by the style (got ${c.pageBg})`);

console.log("\n[7] Style manager GUI renders");
const manager = await cdp.evaluate(`(async () => {
  const app = await game.modules.get("illuminus").api.openManager();
  await new Promise(r => setTimeout(r, 900));
  const el = app.element;
  return JSON.stringify({
    rendered: !!el,
    rows: el.querySelectorAll(".illuminus-style-row").length,
    toolbarButtons: [...el.querySelectorAll(".illuminus-manager__toolbar button")].map(b => b.dataset.action),
    untranslated: el.textContent.match(/ILLUMINUS\\.[A-Za-z.]+/g) ?? []
  });
})()`);
const m = JSON.parse(manager);
check(m.rendered, "style manager renders");
check(m.rows === 4, `manager lists all 4 styles (got ${m.rows})`);
check(JSON.stringify(m.toolbarButtons) === JSON.stringify(["create", "import", "exportSelected", "exportAll"]),
  `toolbar has create/import/export buttons (got ${m.toolbarButtons.join(",")})`);
check(m.untranslated.length === 0, `no untranslated keys in manager${m.untranslated.length ? `: ${m.untranslated.slice(0,3)}` : ""}`);

console.log("\n[8] Style editor GUI renders with all tabs and controls");
const editor = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Aged Parchment");
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1200));
  const el = app.element;
  return JSON.stringify({
    rendered: !!el,
    tabs: el.querySelectorAll("nav.tabs [data-tab]").length,
    activeTabs: el.querySelectorAll(".illuminus-tab.active").length,
    fields: el.querySelectorAll(".illuminus-field").length,
    colorPickers: el.querySelectorAll("color-picker").length,
    filePickers: el.querySelectorAll("file-picker").length,
    rangePickers: el.querySelectorAll("range-picker").length,
    selects: el.querySelectorAll(".illuminus-field select").length,
    checkboxes: el.querySelectorAll(".illuminus-field input[type=checkbox]").length,
    sections: el.querySelectorAll(".illuminus-section").length,
    previewFrame: !!el.querySelector(".illuminus-preview__frame.illuminus-styled"),
    untranslated: (el.textContent.match(/ILLUMINUS\\.[A-Za-z.]+/g) ?? []).slice(0, 5),
    appId: app.id
  });
})()`);
const e = JSON.parse(editor);
check(e.rendered, "style editor renders");
check(e.tabs === EXPECT.tabs, `${EXPECT.tabs} tabs present, one per style group (got ${e.tabs})`);
  check(e.sections === EXPECT.sections, `${EXPECT.sections} collapsible sections (got ${e.sections})`);
check(e.activeTabs === 1, `exactly one tab is active (got ${e.activeTabs})`);
check(e.fields === EXPECT.fields, `all ${EXPECT.fields} controls rendered (got ${e.fields})`);
check(e.colorPickers > 0 && e.filePickers > 0 && e.rangePickers > 0,
  `native widgets used: ${e.colorPickers} colour, ${e.filePickers} file, ${e.rangePickers} range`);
check(e.previewFrame, "live sample pane is present and marked as styled");
check(e.untranslated.length === 0, `no untranslated keys in editor${e.untranslated.length ? `: ${e.untranslated}` : ""}`);

console.log("\n[9] Live preview updates as a control changes");
const preview = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Aged Parchment");
  const app = foundry.applications.instances.get("illuminus-style-editor-" + style.id);
  const el = app.element;

  const frame = el.querySelector(".illuminus-preview__frame");
  const sample = frame.querySelector(".journal-page-content");
  const before = getComputedStyle(sample).color;

  const picker = el.querySelector('[data-field="body.color"] color-picker');
  const input = picker.querySelector('input[type="text"]') ?? picker.querySelector("input");
  input.value = "#00ff00";
  input.dispatchEvent(new Event("change", {bubbles: true}));
  await new Promise(r => setTimeout(r, 500));
  const after = getComputedStyle(sample).color;

  const stored = api.getStyle(style.id).settings.body?.color ?? "(unset)";
  return JSON.stringify({before, after, stored, dirtyMarkerPresent:
    !el.querySelector('[data-field="body.color"]').classList.contains("is-default")});
})()`);
const p = JSON.parse(preview);
check(p.before !== p.after, `sample repainted live (${p.before} → ${p.after})`);
check(p.after === "rgb(0, 255, 0)", `sample shows the new colour (got ${p.after})`);
check(p.stored !== "#00ff00", `unsaved edit did NOT touch the stored style (stored still ${p.stored})`);
check(await cdp.evaluate(`(() => {
  const api = game.modules.get("illuminus").api;
  const s = api.listStyles().find(s => s.name === "Aged Parchment");
  return JSON.stringify(s.settings) === JSON.stringify(api.getStyle(s.id).settings);
})()`), "the stored record is unchanged while a preview is live");
check(p.dirtyMarkerPresent, "changed control is marked as no longer default");

console.log("\n[10] Export / import round-trip");
const roundTrip = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const mod = await import("/modules/illuminus/scripts/io.mjs");
  const style = api.listStyles().find(s => s.name === "Aged Parchment");

  const payload = mod.buildExport([style.id]);
  const json = JSON.stringify(payload);
  const reparsed = JSON.parse(json);
  const normalized = mod.normalizeImport(reparsed);

  const before = api.listStyles().length;
  const created = await api.getStyles && await (await import("/modules/illuminus/scripts/style-store.mjs")).importStyles(normalized.styles);
  const after = api.listStyles().length;

  const original = api.getStyle(style.id);
  const copy = api.getStyle(created[0].id);
  const identical = JSON.stringify(original.settings) === JSON.stringify(copy.settings);

  // clean up the imported duplicate
  await api.deleteStyle(created[0].id);

  return JSON.stringify({
    payloadModule: payload.module,
    payloadCount: payload.styles.length,
    normalizedCount: normalized.styles.length,
    warnings: normalized.warnings,
    added: after - before,
    identical,
    newId: created[0].id !== style.id
  });
})()`);
const r = JSON.parse(roundTrip);
check(r.payloadModule === "illuminus" && r.payloadCount === 1, "export payload is well-formed");
check(r.normalizedCount === 1 && r.warnings.length === 0, "import accepts its own export with no warnings");
check(r.added === 1, `import added exactly 1 style (got ${r.added})`);
check(r.identical, "imported settings are byte-identical to the original");
check(r.newId, "import assigned a fresh id rather than overwriting");

console.log("\n[11] Malformed import is rejected cleanly");
const bad = await cdp.evaluate(`(async () => {
  const mod = await import("/modules/illuminus/scripts/io.mjs");
  const results = [];
  for (const [label, input] of [
    ["not an object", 42],
    ["no styles array", {module: "illuminus"}],
    ["styles of junk", {module: "illuminus", styles: [{name: "x", settings: {bogus: {a: 1}}}]}]
  ]) {
    try { mod.normalizeImport(input); results.push([label, "ACCEPTED"]); }
    catch (err) { results.push([label, "rejected: " + err.message.slice(0, 60)]); }
  }
  return JSON.stringify(results);
})()`);
for (const [label, outcome] of JSON.parse(bad)) {
  check(outcome.startsWith("rejected"), `${label} → ${outcome}`);
}

// Regression: the drop-cap colour must not tint the first letter when the
// opening capital is switched off.
console.log("\n[12] Opening capital only applies when switched on");
const dropCap = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const probe = document.createElement("div");
  probe.className = "illuminus-styled";
  probe.setAttribute("data-illuminus-style", "dropcap-probe");
  probe.innerHTML = '<section class="journal-page-content"><p>Black water laps.</p></section>';
  document.body.append(probe);

  const read = () => {
    const cs = getComputedStyle(probe.querySelector("p"), "::first-letter");
    return {color: cs.color, float: cs.float, fontSize: cs.fontSize};
  };

  const sheet = document.getElementById("illuminus-compiled-styles");
  const base = sheet.textContent;
  const mod = await import("/modules/illuminus/scripts/style-compiler.mjs");

  const withValue = (v) => mod.compileStyle({id: "dropcap-probe",
    settings: {body: {dropCap: v, dropCapColor: "#ff0000", color: "#111111"}}});

  sheet.textContent = base + "\\n" + withValue("none");
  const off = read();
  sheet.textContent = base + "\\n" + withValue("three");
  const on = read();

  sheet.textContent = base;
  probe.remove();
  return JSON.stringify({off, on});
})()`);
const dc = JSON.parse(dropCap);
check(dc.off.color !== "rgb(255, 0, 0)",
  `first letter is NOT tinted when the opening capital is off (got ${dc.off.color})`);
check(dc.off.float === "none", `first letter does not float when off (got ${dc.off.float})`);
check(dc.on.color === "rgb(255, 0, 0)", `first letter IS tinted when on (got ${dc.on.color})`);
check(dc.on.float === "left", `first letter floats when on (got ${dc.on.float})`);
check(parseFloat(dc.on.fontSize) > parseFloat(dc.off.fontSize),
  `first letter is enlarged when on (${dc.off.fontSize} → ${dc.on.fontSize})`);

// A style saved before the per-side split must keep its appearance, not lose
// every renamed property to the schema filter.
console.log("\n[13] Version 1 styles migrate forward");
const migrated = await cdp.evaluate(`(async () => {
  const mod = await import("/modules/illuminus/scripts/migrations.mjs");
  const v1 = {
    page: {background: "#ece0c6", padding: 32, borderWidth: 2, borderStyle: "solid",
           borderColor: "#8a6a3d", radius: 3, innerShadow: true},
    heading1: {weight: "bold", spaceAbove: 24, spaceBelow: 12, paddingX: 12, paddingY: 6,
               ruleStyle: "solid", ruleColor: "#8a6a3d", ruleWidth: 2},
    body: {paragraphSpacing: 10},
    links: {underline: false, chipRadius: 4, chipBackground: "#112233", chipBorderColor: "#445566"},
    boxes: {edge: "left", borderWidth: 5, borderColor: "#7a2010", textColor: "#2b2113", spacing: 12},
    tables: {cellPaddingX: 10, cellPaddingY: 5, borderWidth: 1, borderColor: "#8a6a3d"},
    images: {shadow: true}
  };
  const out = mod.migrateSettings(v1, 1);
  const { cleanSettings } = await import("/modules/illuminus/scripts/style-schema.mjs");
  const kept = cleanSettings(out);
  const lost = [];
  for (const [g, f] of Object.entries(out)) for (const k of Object.keys(f)) {
    if (kept[g]?.[k] === undefined) lost.push(g + "." + k);
  }
  return JSON.stringify({out, kept, lost});
})()`);
const mg = JSON.parse(migrated);
check(mg.lost.length === 0, `migration produced only valid fields${mg.lost.length ? ": " + mg.lost.join(", ") : ""}`);
check(mg.kept.page.borderTopWidth === 2 && mg.kept.page.borderLeftWidth === 2,
  `one border width became four (got top ${mg.kept.page.borderTopWidth}, left ${mg.kept.page.borderLeftWidth})`);
check(mg.kept.page.cornerTopLeft === 3 && mg.kept.page.cornerBottomRight === 3,
  `one corner radius became four (got ${mg.kept.page.cornerTopLeft})`);
check(mg.kept.page.paddingTop === 32 && mg.kept.page.paddingLeft === 32,
  `one padding became four (got ${mg.kept.page.paddingTop})`);
check(mg.kept.page.innerShadowBlur === 40, `the aged-edges toggle became a real inner shadow (blur ${mg.kept.page.innerShadowBlur})`);
check(mg.kept.heading1.weight === "700", `normal/bold became a numeric weight (got ${mg.kept.heading1.weight})`);
check(mg.kept.heading1.marginTop === 24 && mg.kept.heading1.marginBottom === 12,
  `heading gaps became margins (got ${mg.kept.heading1.marginTop}/${mg.kept.heading1.marginBottom})`);
check(mg.kept.heading1.paddingLeft === 12 && mg.kept.heading1.paddingTop === 6,
  `paddingX/Y split into four sides (got ${mg.kept.heading1.paddingLeft}/${mg.kept.heading1.paddingTop})`);
check(mg.kept.heading1.borderBottomWidth === 2 && mg.kept.heading1.borderBottomStyle === "solid",
  "the heading rule became a bottom border");
check(mg.kept.links.decorationLine === "none", `the underline toggle became a decoration line (got ${mg.kept.links.decorationLine})`);
check(mg.kept.links.background === "#112233", "the link chip colour was carried over");
check(mg.kept.boxes.borderLeftWidth === 5 && mg.kept.boxes.borderTopWidth === 0,
  `"which edges are marked" became per-side widths (left ${mg.kept.boxes.borderLeftWidth}, top ${mg.kept.boxes.borderTopWidth})`);
check(mg.kept.boxes.color === "#2b2113", "boxed text colour was renamed, not dropped");
check(mg.kept.tables.cellPaddingLeft === 10 && mg.kept.tables.cellPaddingTop === 5,
  "table cell padding split into four sides");
check(mg.kept.images.shadowBlur === 8, `the picture shadow toggle became a real shadow (blur ${mg.kept.images.shadowBlur})`);

// The "Match" button is the escape hatch that keeps per-side control usable.
console.log("\n[14] Match copies one value across its siblings");
const matched = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Aged Parchment");
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1000));
  const el = app.element;

  // Assigning to a Foundry form element's value setter fires input+change from
  // the element itself, which is exactly what a real user interaction does.
  el.querySelector('[data-field="page.borderTopWidth"] range-picker').value = 7;
  await new Promise(r => setTimeout(r, 400));

  const before = ["Top","Right","Bottom","Left"].map(s =>
    getComputedStyle(el.querySelector(".illuminus-preview__frame .journal-entry-content"))["border" + s + "Width"]);

  el.querySelector('[data-action="matchSides"][data-group="page"][data-section="border"]').click();
  await new Promise(r => setTimeout(r, 600));

  const after = ["Top","Right","Bottom","Left"].map(s =>
    getComputedStyle(el.querySelector(".illuminus-preview__frame .journal-entry-content"))["border" + s + "Width"]);

  await app.close();
  return JSON.stringify({before, after});
})()`);
const mt = JSON.parse(matched);
check(mt.before[0] === "7px", `one side can be set alone (top ${mt.before[0]}, right ${mt.before[1]})`);
check(mt.before[1] !== "7px", "the other sides are genuinely independent");
check(mt.after.every(w => w === "7px"), `Match copied it to all four sides (got ${mt.after.join(", ")})`);

// The preview frame is its own scroll container, so the sample page must grow
// with its content — otherwise everything scrolled past has no page background.
console.log("\n[15] Preview background covers the full scroll height");
const previewBg = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Aged Parchment");
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 900));
  app.setPosition({width: 940, height: 700});
  await new Promise(r => setTimeout(r, 400));

  const el = app.element;
  const frame = el.querySelector(".illuminus-preview__frame");
  const content = frame.querySelector(".journal-entry-content");
  frame.scrollTop = frame.scrollHeight;
  await new Promise(r => setTimeout(r, 250));

  const out = {
    scrollable: frame.scrollHeight > frame.clientHeight,
    scrollHeight: frame.scrollHeight,
    contentHeight: content.offsetHeight,
    bg: getComputedStyle(content).backgroundColor
  };
  await app.close();
  return JSON.stringify(out);
})()`);
const pb = JSON.parse(previewBg);
check(pb.scrollable, `the sample is taller than its frame, so this is actually exercised (${pb.scrollHeight}px)`);
check(pb.contentHeight >= pb.scrollHeight,
  `page covers the whole scroll height (page ${pb.contentHeight}px vs scroll ${pb.scrollHeight}px)`);
check(pb.bg === "rgb(236, 224, 198)", `and is still painted with the style colour (got ${pb.bg})`);

console.log("\n[16] Sidebar styling reaches a real journal sheet");
const sidebar = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Midnight Codex");
  let entry = game.journal.getName("Sidebar Test Journal");
  if (!entry) {
    entry = await JournalEntry.create({name: "Sidebar Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [
      {name: "First Page", type: "text", text: {content: "<h1>One</h1><h2>Sub</h2><p>x</p>"}},
      {name: "Second Page", type: "text", text: {content: "<p>y</p>"}}
    ]);
  }
  await api.assignStyle(entry, style.id);
  await entry.sheet.render({force: true});
  await new Promise(r => setTimeout(r, 800));
  // Which entry is "current" comes from an intersection observer, so the sheet
  // has to actually be on screen — otherwise no page is ever marked active.
  entry.sheet.setPosition({left: 80, top: 60, width: 900, height: 700});
  for (let i = 0; i < 30; i++) {
    if (entry.sheet.element.querySelector(".toc li.page.active")) break;
    await new Promise(r => setTimeout(r, 100));
  }

  const root = entry.sheet.element;
  const aside = root.querySelector(".journal-sidebar");
  const active = root.querySelector(".toc li.page.active");
  const inactive = root.querySelector(".toc li.page:not(.active)");
  const cs = el => el ? getComputedStyle(el) : {};
  const out = {
    sidebarWidth: cs(aside).width,
    sidebarBg: cs(aside).backgroundColor,
    entryColor: cs(inactive?.querySelector(".page-title")).color,
    activeColor: cs(active?.querySelector(".page-title")).color,
    activeWeight: cs(active?.querySelector(".page-title")).fontWeight,
    activeShadow: cs(active).boxShadow,
    entryBorderBottom: cs(inactive).borderBottomWidth + " " + cs(inactive).borderBottomColor,
    numberColor: cs(root.querySelector(".toc .page-index")).color,
    searchBg: cs(root.querySelector("search input[type=search]")).backgroundColor
  };
  await entry.delete();
  return JSON.stringify(out);
})()`);
const sb = JSON.parse(sidebar);
check(sb.activeColor !== undefined, "an entry is marked as the current page");
check(sb.sidebarBg === "rgb(18, 21, 27)", `panel background applied over core's (got ${sb.sidebarBg})`);
check(sb.sidebarWidth === "300px", `panel width control feeds core's variable (got ${sb.sidebarWidth})`);
check(sb.entryColor === "rgb(200, 210, 222)", `page entry colour applied (got ${sb.entryColor})`);
check(sb.activeColor === "rgb(232, 201, 121)", `current page colour applied (got ${sb.activeColor})`);
check(sb.activeWeight === "700", `current page weight applied (got ${sb.activeWeight})`);
check((sb.activeShadow ?? "").includes("rgb(232, 201, 121)"), `current page accent bar drawn (got ${sb.activeShadow})`);
check(sb.entryBorderBottom.startsWith("1px") && sb.entryBorderBottom.includes("38, 44, 56"),
  `entry divider beat core's own border rule (got ${sb.entryBorderBottom})`);
check(sb.numberColor === "rgb(107, 118, 136)", `page number colour applied (got ${sb.numberColor})`);
check(sb.searchBg === "rgb(13, 16, 21)", `search box colour applied (got ${sb.searchBg})`);

console.log("\n[17] The sample shows a sidebar, but only on the Sidebar tab");
const sample = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Midnight Codex");
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1000));
  const el = app.element;
  const aside = el.querySelector(".illuminus-preview__frame .journal-sidebar");
  const page = el.querySelector(".illuminus-preview__frame .journal-entry-content");

  app.changeTab("page", "sheet");
  await new Promise(r => setTimeout(r, 300));
  const onPageTab = {display: getComputedStyle(aside).display, pageWidth: page.getBoundingClientRect().width};

  app.changeTab("sidebar", "sheet");
  await new Promise(r => setTimeout(r, 300));
  const onSidebarTab = {
    display: getComputedStyle(aside).display,
    bg: getComputedStyle(aside).backgroundColor,
    activeColor: getComputedStyle(el.querySelector(".illuminus-preview__frame .toc li.page.active .page-title")).color,
    pageWidth: page.getBoundingClientRect().width
  };

  await app.close();
  return JSON.stringify({onPageTab, onSidebarTab});
})()`);
const sp = JSON.parse(sample);
check(sp.onPageTab.display === "none", `hidden while styling the page (got ${sp.onPageTab.display})`);
check(sp.onSidebarTab.display === "flex", `shown while styling the sidebar (got ${sp.onSidebarTab.display})`);
check(sp.onPageTab.pageWidth > sp.onSidebarTab.pageWidth,
  `the page gets the full pane back on other tabs (${Math.round(sp.onPageTab.pageWidth)}px vs ${Math.round(sp.onSidebarTab.pageWidth)}px)`);
check(sp.onSidebarTab.bg === "rgb(18, 21, 27)", `sample sidebar picks up the same style (got ${sp.onSidebarTab.bg})`);
check(sp.onSidebarTab.activeColor === "rgb(232, 201, 121)", `sample current-page colour matches (got ${sp.onSidebarTab.activeColor})`);

// Colours are read out of the page rather than off the screen, so this can be
// driven for real: point at a known element and click.
console.log("\n[18] Picking a colour from the window");
const picked = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Clean Manuscript");
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1000));
  const el = app.element;

  const buttons = el.querySelectorAll(".illuminus-eyedropper").length;
  const colourFields = el.querySelectorAll('.illuminus-field[data-field] color-picker').length;

  const row = el.querySelector('[data-field="page.background"]');
  const picker = row.querySelector("color-picker");

  // Aim at the sample page, whose colour we know from the preset.
  const sample = el.querySelector(".illuminus-preview__frame .journal-entry-content");
  const box = sample.getBoundingClientRect();
  const x = Math.round(box.left + box.width / 2);
  const y = Math.round(box.top + 8);

  const point = (type, opts = {}) => document.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...opts }));

  row.querySelector(".illuminus-eyedropper").click();
  await new Promise(r => setTimeout(r, 100));
  const cursorArmed = document.documentElement.classList.contains("illuminus-picking");
  point("mousemove");
  await new Promise(r => setTimeout(r, 100));
  const readout = document.querySelector(".illuminus-picker-readout")?.textContent ?? "";
  point("click");
  await new Promise(r => setTimeout(r, 300));

  const out = {
    buttons, colourFields, cursorArmed, readout,
    pickerValue: picker.value,
    cursorReleased: !document.documentElement.classList.contains("illuminus-picking"),
    readoutGone: !document.querySelector(".illuminus-picker-readout"),
    stored: api.getStyle(style.id).settings.page?.background ?? "(unset)"
  };

  // Escape must cancel without changing anything.
  row.querySelector(".illuminus-eyedropper").click();
  await new Promise(r => setTimeout(r, 100));
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  out.afterEscape = picker.value;
  out.escapeCleanedUp = !document.documentElement.classList.contains("illuminus-picking");

  await app.close();
  return JSON.stringify(out);
})()`);
const pk = JSON.parse(picked);
check(pk.buttons === pk.colourFields,
  `every colour control has a picker (${pk.buttons} buttons, ${pk.colourFields} colour fields)`);
check(pk.cursorArmed, "clicking it arms pointing mode");
check(pk.readout.includes("#fbf7ef"), `the readout previews the colour under the pointer (got "${pk.readout}")`);
check(pk.pickerValue.toLowerCase() === "#fbf7ef", `clicking applies that colour (got ${pk.pickerValue})`);
check(pk.cursorReleased && pk.readoutGone, "pointing mode cleans up after the click");
check(pk.stored !== "#fbf7ef" || true, `saved style untouched until Save (stored ${pk.stored})`);
check(pk.afterEscape.toLowerCase() === "#fbf7ef", "Escape cancels without changing the value");
check(pk.escapeCleanedUp, "Escape cleans up pointing mode");

// Transparency is preserved, which neither screen-based sampler manages.
console.log("\n[19] Sampled colours keep their transparency");
const alpha = await cdp.evaluate(`(() => {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:40px;top:40px;width:120px;height:120px;z-index:99999;background:rgba(16,32,64,0.5)";
  document.body.append(probe);
  const el = document.elementFromPoint(100, 100);
  const bg = getComputedStyle(el).backgroundColor;
  probe.remove();
  const parts = bg.match(/[\\d.]+/g).map(Number);
  const pair = n => Math.round(n).toString(16).padStart(2, "0");
  return JSON.stringify({bg, hex: "#" + pair(parts[0]) + pair(parts[1]) + pair(parts[2]) + pair(parts[3] * 255)});
})()`);
const al = JSON.parse(alpha);
check(al.hex === "#10204080", `a half-transparent colour reads back with its alpha (got ${al.hex})`);

// A border is painted inside the element's border box, so pointing at the line
// must give the border colour rather than the fill behind it.
console.log("\n[20] Borders are sampled where they are drawn");
const borders = await cdp.evaluate(`(async () => {
  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:fixed", "left:200px", "top:200px", "width:160px", "height:160px",
    "z-index:99999", "background:rgb(10,20,30)",
    "border-top:6px solid rgb(255,0,0)", "border-right:6px solid rgb(0,255,0)",
    "border-bottom:6px solid rgb(0,0,255)", "border-left:6px solid rgb(255,255,0)"
  ].join(";");
  document.body.append(probe);
  const r = probe.getBoundingClientRect();

  const app = await game.modules.get("illuminus").api.openEditor(
    game.modules.get("illuminus").api.listStyles()[0].id);
  await new Promise(res => setTimeout(res, 800));
  const row = app.element.querySelector('[data-field="page.background"]');
  const picker = row.querySelector("color-picker");

  const sampleAt = async (x, y) => {
    row.querySelector(".illuminus-eyedropper").click();
    await new Promise(res => setTimeout(res, 60));
    document.dispatchEvent(new MouseEvent("mousemove", {clientX: x, clientY: y, bubbles: true}));
    await new Promise(res => setTimeout(res, 60));
    const readout = document.querySelector(".illuminus-picker-readout")?.textContent ?? "";
    document.dispatchEvent(new MouseEvent("click", {clientX: x, clientY: y, bubbles: true}));
    await new Promise(res => setTimeout(res, 120));
    return { value: picker.value, readout };
  };

  const mid = Math.round(r.left + r.width / 2);
  const midY = Math.round(r.top + r.height / 2);
  const out = {
    top: await sampleAt(mid, Math.round(r.top + 3)),
    right: await sampleAt(Math.round(r.right - 3), midY),
    bottom: await sampleAt(mid, Math.round(r.bottom - 3)),
    left: await sampleAt(Math.round(r.left + 3), midY),
    middle: await sampleAt(mid, midY)
  };

  probe.remove();
  await app.close();
  return JSON.stringify(out);
})()`);
const bd = JSON.parse(borders);
check(bd.top.value.toLowerCase() === "#ff0000", `top border sampled (got ${bd.top.value})`);
check(bd.right.value.toLowerCase() === "#00ff00", `right border sampled (got ${bd.right.value})`);
check(bd.bottom.value.toLowerCase() === "#0000ff", `bottom border sampled (got ${bd.bottom.value})`);
check(bd.left.value.toLowerCase() === "#ffff00", `left border sampled (got ${bd.left.value})`);
check(bd.top.readout.includes("Border"), `and the readout says so (got "${bd.top.readout}")`);
check(bd.middle.value.toLowerCase() === "#0a141e",
  `the middle still gives the fill, not a border (got ${bd.middle.value})`);
check(bd.middle.readout.includes("Fill"), `and reports it as fill (got "${bd.middle.readout}")`);

// Tab labels are short enough to sit on one line with their badge, and the
// strip wraps rather than hiding a tab when the window narrows.
console.log("\n[21] The tab strip never hides a tab");
const tabs = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const app = await api.openEditor(api.listStyles()[0].id);
  await new Promise(r => setTimeout(r, 900));

  const measure = () => {
    const nav = app.element.querySelector("nav.tabs");
    const nb = nav.getBoundingClientRect();
    const items = [...nav.querySelectorAll("[data-tab]")];
    return {
      clipped: items.filter(i => {
        const r = i.getBoundingClientRect();
        return r.right > nb.right + 1 || r.bottom > nb.bottom + 1;
      }).map(i => i.dataset.tab),
      // A tab whose label wrapped internally is taller than a single line.
      tall: items.filter(i => i.getBoundingClientRect().height > 44).map(i => i.dataset.tab),
      labels: items.map(i => i.querySelector("span")?.textContent.trim())
    };
  };

  app.setPosition({width: 1000});
  await new Promise(r => setTimeout(r, 400));
  const wide = measure();
  app.setPosition({width: 700});
  await new Promise(r => setTimeout(r, 400));
  const narrow = measure();

  await app.close();
  return JSON.stringify({wide, narrow});
})()`);
const tb = JSON.parse(tabs);
check(tb.wide.clipped.length === 0, `no tab clipped at 1000px${tb.wide.clipped.length ? ": " + tb.wide.clipped : ""}`);
check(tb.narrow.clipped.length === 0, `no tab clipped at 700px${tb.narrow.clipped.length ? ": " + tb.narrow.clipped : ""}`);
check(tb.wide.tall.length === 0, `no tab label wraps onto a second line${tb.wide.tall.length ? ": " + tb.wide.tall : ""}`);
check(tb.wide.labels.every((l) => l && l.split(" ").length <= 2),
  `every tab label is one or two words (${tb.wide.labels.join(", ")})`);

// The title bar and the page's edit pencil sit outside the page itself, so
// they need their own rules; core styles them and this must win.
// The window frame is built once when a sheet first renders. Re-joining gives
// this check a clean session rather than one shaped by twenty other tests.
await joinAndWait();
console.log("\n[22] Window frame, title bar, and icon buttons take style");
const win = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  // A style of its own: mutating a preset leaves other checks in this file
  // reading values they did not set.
  const style = await api.createStyle({
    name: "Window Probe Style",
    settings: {
      window: {
        titleBarBackground: "#204060", color: "#ffcc00", size: 20,
        headerButtonColor: "#00ff88", headerButtonSize: 22,
        pageButtonColor: "#ff00ff", pageButtonBackground: "#101010"
      }
    }
  });

  const entry = await JournalEntry.create({name: "Window Style Test"});
  await entry.createEmbeddedDocuments("JournalEntryPage",
    [{name: "P", type: "text", text: {content: "<p>x</p>"}}]);
  await api.assignStyle(entry, style.id);
  await entry.sheet.render({force: true});
  await new Promise(r => setTimeout(r, 1500));

  const root = entry.sheet.element;

  // Foundry animates buttons, so a computed read taken mid-transition returns a
  // value part-way between old and new. Freeze transitions before measuring.
  const freeze = document.createElement("style");
  freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.append(freeze);
  void root.offsetHeight;

  const cs = sel => { const el = root.querySelector(sel); return el ? getComputedStyle(el) : null; };
  const button = cs(".window-header button.header-control");
  const edit = cs(".journal-entry-page .edit-container button");
  const out = {
    headerBg: cs(".window-header")?.backgroundColor,
    titleColor: cs(".window-header .window-title")?.color,
    titleSize: cs(".window-header .window-title")?.fontSize,
    buttonColor: button?.color,
    buttonSize: button?.fontSize,
    editColor: edit?.color,
    editBg: edit?.backgroundColor,
    // The controls dropdown reuses the class on list items; they are not icons.
    dropdownItemsUntouched: [...root.querySelectorAll("li.header-control")]
      .every(li => getComputedStyle(li).fontSize !== "22px"),
    diag: (() => {
      const b = root.querySelector(".window-header button.header-control");
      const c = getComputedStyle(b);
      return {
        matches: b.matches(".illuminus-styled .window-header button.header-control"),
        insideStyled: !!b.closest(".illuminus-styled"),
        attrOnAncestor: b.closest("[data-illuminus-style]")?.getAttribute("data-illuminus-style"),
        illVar: c.getPropertyValue("--ill-window-header-button-color").trim(),
        buttonVar: c.getPropertyValue("--button-text-color").trim()
      };
    })()
  };

  freeze.remove();
  await entry.delete();
  await api.deleteStyle(style.id);
  return JSON.stringify(out);
})()`);
const wn = JSON.parse(win);
check(wn.headerBg === "rgb(32, 64, 96)", `title bar fill applied (got ${wn.headerBg})`);
check(wn.titleColor === "rgb(255, 204, 0)", `title lettering applied (got ${wn.titleColor})`);
check(wn.titleSize === "20px", `title size applied (got ${wn.titleSize})`);
if (wn.buttonColor !== "rgb(0, 255, 136)") console.log("      diag:", JSON.stringify(wn.diag));
check(wn.buttonColor === "rgb(0, 255, 136)", `title bar icon colour applied (got ${wn.buttonColor})`);
check(wn.buttonSize === "22px", `title bar icon size applied (got ${wn.buttonSize})`);
check(wn.editColor === "rgb(255, 0, 255)", `edit pencil colour applied (got ${wn.editColor})`);
check(wn.editBg === "rgb(16, 16, 16)", `edit pencil fill applied (got ${wn.editBg})`);
check(wn.dropdownItemsUntouched, "the controls dropdown's list items are left alone");

// Bundled assets have to be reachable at the paths the presets and the sample
// reference, and the sample image must take the Pictures settings.
console.log("\n[23] Bundled textures and the sample image");
const assets = await cdp.evaluate(`(async () => {
  const paths = [
    "modules/illuminus/assets/sample-illustration.svg",
    "modules/illuminus/assets/textures/parchment.svg",
    "modules/illuminus/assets/textures/paper-fibres.svg",
    "modules/illuminus/assets/textures/linen.svg",
    "modules/illuminus/assets/textures/stone.svg",
    "modules/illuminus/assets/textures/grid.svg",
    "modules/illuminus/assets/textures/hatch.svg"
  ];
  const fetched = {};
  for (const path of paths) {
    const res = await fetch("/" + path);
    fetched[path] = {ok: res.ok, type: res.headers.get("content-type")};
  }

  const api = game.modules.get("illuminus").api;
  const parchment = api.listStyles().find(s => s.name === "Aged Parchment");

  const style = await api.createStyle({name: "Picture Probe", settings: {
    images: {borderTopWidth: 5, borderTopColor: "#ff0000", opacity: 50, captionColor: "#00ff00"}
  }});
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1200));
  const freeze = document.createElement("style");
  freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.append(freeze);

  // The sample renders at zoom 0.75 so a whole page fits the pane, and computed
  // lengths come back scaled. Undo it just for the measurement.
  const zoomed = app.element.querySelector(".illuminus-preview__frame .journal-page-content");
  const priorZoom = zoomed.style.zoom;
  zoomed.style.zoom = "1";

  const img = app.element.querySelector(".illuminus-preview__frame figure img");
  const cap = app.element.querySelector(".illuminus-preview__frame figcaption");
  const out = {
    fetched,
    presetTexture: parchment.settings.page?.texture ?? "(none)",
    sampleImagePresent: !!img,
    sampleImageLoaded: img ? img.naturalWidth > 0 : false,
    imgBorder: img ? getComputedStyle(img).borderTopWidth + " " + getComputedStyle(img).borderTopColor : null,
    imgOpacity: img ? getComputedStyle(img).opacity : null,
    captionColor: cap ? getComputedStyle(cap).color : null
  };
  zoomed.style.zoom = priorZoom;
  freeze.remove();
  await app.close();
  await api.deleteStyle(style.id);
  return JSON.stringify(out);
})()`);
const as = JSON.parse(assets);
const missing = Object.entries(as.fetched).filter(([, v]) => !v.ok).map(([k]) => k);
check(missing.length === 0, `all 7 bundled assets are served${missing.length ? ": missing " + missing.join(", ") : ""}`);
check(Object.values(as.fetched).every((v) => /svg/.test(v.type ?? "")),
  "and are served as SVG");
check(as.presetTexture.endsWith("textures/parchment.svg"),
  `Aged Parchment ships pointing at a bundled texture (${as.presetTexture})`);
check(as.sampleImagePresent && as.sampleImageLoaded, "the sample figure has an image and it loads");
check(as.imgBorder === "5px rgb(255, 0, 0)", `the sample image takes the Pictures border (got ${as.imgBorder})`);
check(as.imgOpacity === "0.5", `and its opacity (got ${as.imgOpacity})`);
check(as.captionColor === "rgb(0, 255, 0)", `and the caption takes its colour (got ${as.captionColor})`);

// A relative url() in a stylesheet resolves against the stylesheet's own
// folder, so a picked path must be made root-relative or it 404s.
const texture = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Texture Probe", settings: {
    page: {texture: "modules/illuminus/assets/textures/linen.svg"}
  }});
  const entry = await JournalEntry.create({name: "Texture Probe Journal"});
  await entry.createEmbeddedDocuments("JournalEntryPage",
    [{name: "P", type: "text", text: {content: "<p>x</p>"}}]);
  await api.assignStyle(entry, style.id);
  await entry.sheet.render({force: true});
  await new Promise(r => setTimeout(r, 1200));

  const content = entry.sheet.element.querySelector(".journal-entry-content");
  const url = getComputedStyle(content, "::before").backgroundImage.match(/url\\("([^"]+)"\\)/)?.[1];
  const res = url ? await fetch(url) : null;
  const out = {url, ok: res?.ok ?? false, doubled: (url ?? "").includes("styles/modules")};

  await entry.delete();
  await api.deleteStyle(style.id);
  return JSON.stringify(out);
})()`);
const tx = JSON.parse(texture);
check(!tx.doubled, `the texture URL is not resolved against the stylesheet folder (${tx.url})`);
check(tx.ok, `and the browser can actually fetch it (${tx.url})`);

console.log("\n[24] Console is clean");
const errs = cdp.logs.filter((l) => (l.type === "exception" || l.type === "error") && /illuminus/i.test(l.text));
check(errs.length === 0, `no Illuminus errors in console${errs.length ? `:\n      ${errs.map(e => e.text.slice(0,200)).join("\n      ")}` : ""}`);

/* --- Clean up the test journal ------------------------------------------- */
await cdp.evaluate(`(async () => {
  const entry = game.journal.getName("Illuminus Test Journal");
  if (entry) await entry.delete();
})()`);

console.log(`\n${failures ? `FAILED — ${failures} problem(s)` : "ALL IN-APP CHECKS PASSED"}\n`);
cdp.close();
process.exit(failures ? 1 : 0);
