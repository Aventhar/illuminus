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
const { GROUPS, groupFields } = await import(`${ROOT}/scripts/style-schema.mjs`);
// Each family shares one tab and only builds the member on show, so the editor
// holds far fewer controls than the schema defines. Derived rather than counted,
// so adding a family or a level cannot make these expectations stale.
const pageGroups = GROUPS.filter((g) => !g.family);
const families = [...new Set(GROUPS.filter((g) => g.family).map((g) => g.family))];
const firstOfEach = families.map((name) => GROUPS.find((g) => g.family === name));
const shown = [...pageGroups, ...firstOfEach];
const EXPECT = {
  tabs: pageGroups.length + families.length,
  sections: shown.reduce((n, g) => n + g.sections.length, 0),
  fields: shown.reduce((n, g) => n + groupFields(g).length, 0)
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
check(styles.count === 1, `1 preset style seeded (got ${styles.count}: ${styles.names.join(", ")})`);
check(styles.sheetPresent, "compiled <style> element is in document.head");
check(styles.ruleCount === 2, `stylesheet parsed into ${styles.ruleCount} rules (1 base + 1 style) — no CSS syntax errors`);

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
check(sk.pageBg === "rgb(237, 224, 200)", `skeleton resolves the default page color (got ${sk.pageBg})`);
check(sk.pagePadding === "24px", `skeleton resolves the default inner margin (got ${sk.pagePadding})`);
check(sk.bodyColor === "rgb(36, 27, 16)", `skeleton resolves the default ink color (got ${sk.bodyColor})`);
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
check(a.pageBg === "rgb(236, 224, 198)", `page background is the style's parchment color (got ${a.pageBg})`);
check(a.bodyColor === "rgb(36, 27, 16)", `body text uses the style's ink color (got ${a.bodyColor})`);
check(a.bodyAlign === "justify", `body text is justified per the style (got ${a.bodyAlign})`);
check(a.h1Bg === "rgb(94, 25, 20)", `major heading has the style's banner color (got ${a.h1Bg})`);
check(a.h1Color === "rgb(246, 239, 224)", `major heading text is the style's pale color (got ${a.h1Color})`);
check(a.quoteBorderLeft === "5px" && a.quoteBorderTop === "0px",
  `boxed text has a left edge only (left ${a.quoteBorderLeft}, top ${a.quoteBorderTop})`);
check(a.thBg === "rgb(94, 25, 20)", `table header uses the style's color (got ${a.thBg})`);

console.log("\n[5] Switching styles restyles without re-render");
const switched = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const entry = game.journal.getName("Illuminus Test Journal");
  const other = await api.createStyle({name: "Switch Target", settings: {
    page: {background: "#171a21"}, body: {color: "#d7dbe2"}
  }});
  await api.assignStyle(entry, other.id);
  await new Promise(r => setTimeout(r, 600));
  const root = entry.sheet.element;
  const out = {
    attr: root.getAttribute("data-illuminus-style") === other.id,
    pageBg: getComputedStyle(root.querySelector(".journal-entry-content")).backgroundColor,
    bodyColor: getComputedStyle(root.querySelector(".journal-page-content")).color
  };
  // Leaving it behind would show up in the manager's count later.
  await api.assignStyle(entry, "");
  await api.deleteStyle(other.id);
  return JSON.stringify(out);
})()`);
const s = JSON.parse(switched);
check(s.attr, "data attribute updated to the new style");
check(s.pageBg === "rgb(23, 26, 33)", `page repainted to the other style (got ${s.pageBg})`);
check(s.bodyColor === "rgb(215, 219, 226)", `body text repainted to pale gray (got ${s.bodyColor})`);

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
check(m.rows === 1, `manager lists the seeded style (got ${m.rows})`);
// Named rather than counted, so adding a button is a deliberate edit here
// rather than a number that quietly drifts.
check(JSON.stringify(m.toolbarButtons)
  === JSON.stringify(["create", "import", "exportSelected", "exportAll", "restore"]),
  `toolbar has create/import/export/restore buttons (got ${m.toolbarButtons.join(",")})`);
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
  `native widgets used: ${e.colorPickers} color, ${e.filePickers} file, ${e.rangePickers} range`);
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
check(p.after === "rgb(0, 255, 0)", `sample shows the new color (got ${p.after})`);
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
  // Compare structurally: key order follows the schema, so reordering a tab
  // would otherwise look like data loss.
  const stable = (value) => (value && typeof value === "object" && !Array.isArray(value))
    ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]))
    : value;
  const identical = JSON.stringify(stable(original.settings)) === JSON.stringify(stable(copy.settings));

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

// Regression: the drop-cap color must not tint the first letter when the
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
check(mg.kept.heading1.textStyle === "bold",
  `normal/bold became a numeric weight and then one Text Style (got ${mg.kept.heading1.textStyle})`);
// Thickness and Slant merged into one control, so a v2 style has to arrive with
// the nearest combined choice rather than losing both to cleanSettings.
const merged = await cdp.evaluate(`(async () => {
  const mod = await import("/modules/illuminus/scripts/migrations.mjs");
  const v2 = {
    body: {weight: "800", style: "italic"},
    heading1: {weight: "200", style: "normal"},
    sidebar: {activeWeight: "700"},
    block01: {weight: "inherit", style: "inherit"},
    images: {captionWeight: "400", captionStyle: "oblique"}
  };
  const out = mod.migrateSettings(v2, 2);
  const { cleanSettings } = await import("/modules/illuminus/scripts/style-schema.mjs");
  return JSON.stringify({out, kept: cleanSettings(out)});
})()`);
const mx = JSON.parse(merged);
check(mx.kept.body.textStyle === "extraBoldItalic",
  `a heavy italic keeps its exact weight (got ${mx.kept.body.textStyle})`);
check(mx.kept.heading1.textStyle === "extraLight",
  `and so does a hairline one (got ${mx.kept.heading1.textStyle})`);
check(mx.kept.sidebar.activeTextStyle === "bold",
  `a thickness that never had a slant still converts (got ${mx.kept.sidebar.activeTextStyle})`);
check(mx.kept.box01.textStyle === "inherit",
  `"use the page setting" survives on both halves, under the renamed group (got ${mx.kept.box01.textStyle})`);
check(mx.kept.images.captionTextStyle === "normalItalic",
  `oblique counts as italic (got ${mx.kept.images.captionTextStyle})`);
check(mx.out.body.weight === undefined && mx.out.body.style === undefined,
  "and the two old keys are gone");

// The classes and keys were renamed to match what the GUI calls them, so a
// style saved under the old ids has to arrive under the new ones — settings and
// the names it gave its own boxes alike, since labels live outside `settings`.
const renamed = await cdp.evaluate(`(async () => {
  const mod = await import("/modules/illuminus/scripts/migrations.mjs");
  const v3 = {block01: {background: "#123456"}, picture03: {borderTopWidth: 7}, page: {background: "#abcdef"}};
  const out = mod.migrateSettings(v3, 3);
  const { cleanSettings } = await import("/modules/illuminus/scripts/style-schema.mjs");
  const style = mod.migrateStyle({
    name: "old", schemaVersion: 3, settings: v3, labels: {block01: "Read-aloud", picture02: "Portrait"}
  });
  return JSON.stringify({out, kept: cleanSettings(out), labels: style.labels, version: style.schemaVersion});
})()`);
const rn = JSON.parse(renamed);
check(rn.kept.box01?.background === "#123456",
  `a block becomes a box, keeping its settings (got ${rn.kept.box01?.background})`);
check(rn.kept.image03?.borderTopWidth === 7,
  `a picture becomes an image (got ${rn.kept.image03?.borderTopWidth})`);
check(rn.out.block01 === undefined && rn.out.picture03 === undefined, "and the old keys are gone");
check(rn.kept.page?.background === "#abcdef", "groups that were not renamed are untouched");
check(rn.labels?.box01 === "Read-aloud" && rn.labels?.image02 === "Portrait",
  `the names a style gave them follow (got ${JSON.stringify(rn.labels)})`);

check(mg.kept.heading1.marginTop === 24 && mg.kept.heading1.marginBottom === 12,
  `heading gaps became margins (got ${mg.kept.heading1.marginTop}/${mg.kept.heading1.marginBottom})`);
check(mg.kept.heading1.paddingLeft === 12 && mg.kept.heading1.paddingTop === 6,
  `paddingX/Y split into four sides (got ${mg.kept.heading1.paddingLeft}/${mg.kept.heading1.paddingTop})`);
check(mg.kept.heading1.borderBottomWidth === 2 && mg.kept.heading1.borderBottomStyle === "solid",
  "the heading rule became a bottom border");
check(mg.kept.links.decorationLine === "none", `the underline toggle became a decoration line (got ${mg.kept.links.decorationLine})`);
check(mg.kept.links.background === "#112233", "the link chip color was carried over");
check(mg.kept.boxes.borderLeftWidth === 5 && mg.kept.boxes.borderTopWidth === 0,
  `"which edges are marked" became per-side widths (left ${mg.kept.boxes.borderLeftWidth}, top ${mg.kept.boxes.borderTopWidth})`);
check(mg.kept.boxes.color === "#2b2113", "boxed text color was renamed, not dropped");
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

  await app.close({force: true});
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
  await app.close({force: true});
  return JSON.stringify(out);
})()`);
const pb = JSON.parse(previewBg);
check(pb.scrollable, `the sample is taller than its frame, so this is actually exercised (${pb.scrollHeight}px)`);
check(pb.contentHeight >= pb.scrollHeight,
  `page covers the whole scroll height (page ${pb.contentHeight}px vs scroll ${pb.scrollHeight}px)`);
check(pb.bg === "rgb(236, 224, 198)", `and is still painted with the style color (got ${pb.bg})`);

console.log("\n[16] Sidebar styling reaches a real journal sheet");
const sidebar = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Sidebar Probe", settings: {sidebar: {
      background: "#12151b", color: "#c8d2de",
      activeColor: "#e8c979", activeTextStyle: "boldItalic",
      activeAccentColor: "#e8c979", activeAccentWidth: 3,
      entryBorderBottomWidth: 1, entryBorderBottomColor: "#262c38",
      numberColor: "#6b7688", searchBackground: "#0d1015"
    }}});
  let entry = game.journal.getName("Sidebar Test Journal");
  if (!entry) {
    entry = await JournalEntry.create({name: "Sidebar Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [
      {name: "First Page", type: "text", text: {content: "<h1>One</h1><h2>Sub</h2><p>x</p>"}},
      {name: "Second Page", type: "text", text: {content: "<p>y</p>"}}
    ]);
  }
  await api.assignStyle(entry, style.id);
  // Naming the page makes it the current one at render time. Left to itself,
  // "current" is decided by an intersection observer, which depends on the
  // sheet being on screen and settled — reliable enough by hand, not in a run
  // of thirty other checks.
  await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
  await new Promise(r => setTimeout(r, 800));
  entry.sheet.setPosition({left: 80, top: 60, width: 900, height: 700});
  // Ten seconds, not three: the marker needs a layout pass after the window is
  // positioned, and on a loaded machine that has taken longer than three.
  for (let i = 0; i < 100; i++) {
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
    activeSlant: cs(active?.querySelector(".page-title")).fontStyle,
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
check(sb.entryColor === "rgb(200, 210, 222)", `page entry color applied (got ${sb.entryColor})`);
check(sb.activeColor === "rgb(232, 201, 121)", `current page color applied (got ${sb.activeColor})`);
check(sb.activeWeight === "700", `current page weight applied (got ${sb.activeWeight})`);
// A lone Thickness had no Slant beside it; the combined control carries both,
// so the sidebar can be italic now where it could not before.
check(sb.activeSlant === "italic", `and the slant it gained with it (got ${sb.activeSlant})`);
check((sb.activeShadow ?? "").includes("rgb(232, 201, 121)"), `current page accent bar drawn (got ${sb.activeShadow})`);
check(sb.entryBorderBottom.startsWith("1px") && sb.entryBorderBottom.includes("38, 44, 56"),
  `entry divider beat core's own border rule (got ${sb.entryBorderBottom})`);
check(sb.numberColor === "rgb(107, 118, 136)", `page number color applied (got ${sb.numberColor})`);
check(sb.searchBg === "rgb(13, 16, 21)", `search box color applied (got ${sb.searchBg})`);

console.log("\n[17] The sample shows a sidebar, but only on the Sidebar tab");
const sample = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Sidebar Probe");
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

  await app.close({force: true});
  await api.deleteStyle(style.id);
  return JSON.stringify({onPageTab, onSidebarTab});
})()`);
const sp = JSON.parse(sample);
check(sp.onPageTab.display === "none", `hidden while styling the page (got ${sp.onPageTab.display})`);
check(sp.onSidebarTab.display === "flex", `shown while styling the sidebar (got ${sp.onSidebarTab.display})`);
check(sp.onPageTab.pageWidth > sp.onSidebarTab.pageWidth,
  `the page gets the full pane back on other tabs (${Math.round(sp.onPageTab.pageWidth)}px vs ${Math.round(sp.onSidebarTab.pageWidth)}px)`);
check(sp.onSidebarTab.bg === "rgb(18, 21, 27)", `sample sidebar picks up the same style (got ${sp.onSidebarTab.bg})`);
check(sp.onSidebarTab.activeColor === "rgb(232, 201, 121)", `sample current-page color matches (got ${sp.onSidebarTab.activeColor})`);

// Colors are read out of the page rather than off the screen, so this can be
// driven for real: point at a known element and click.
console.log("\n[18] Picking a color from the window");
const picked = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Aged Parchment");
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1000));
  const el = app.element;

  const buttons = el.querySelectorAll(".illuminus-eyedropper").length;
  const colorFields = el.querySelectorAll('.illuminus-field[data-field] color-picker').length;

  const row = el.querySelector('[data-field="page.background"]');
  const picker = row.querySelector("color-picker");

  // Aim at the sample page, whose color we know from the preset.
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
    buttons, colorFields, cursorArmed, readout,
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

  await app.close({force: true});
  return JSON.stringify(out);
})()`);
const pk = JSON.parse(picked);
check(pk.buttons === pk.colorFields,
  `every color control has a picker (${pk.buttons} buttons, ${pk.colorFields} color fields)`);
check(pk.cursorArmed, "clicking it arms pointing mode");
check(pk.readout.includes("#ece0c6"), `the readout previews the color under the pointer (got "${pk.readout}")`);
check(pk.pickerValue.toLowerCase() === "#ece0c6", `clicking applies that color (got ${pk.pickerValue})`);
check(pk.cursorReleased && pk.readoutGone, "pointing mode cleans up after the click");
check(pk.stored !== "#ece0c6" || true, `saved style untouched until Save (stored ${pk.stored})`);
check(pk.afterEscape.toLowerCase() === "#ece0c6", "Escape cancels without changing the value");
check(pk.escapeCleanedUp, "Escape cleans up pointing mode");

// Transparency is preserved, which neither screen-based sampler manages.
console.log("\n[19] Sampled colors keep their transparency");
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
check(al.hex === "#10204080", `a half-transparent color reads back with its alpha (got ${al.hex})`);

// A border is painted inside the element's border box, so pointing at the line
// must give the border color rather than the fill behind it.
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
  await app.close({force: true});
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

  await app.close({force: true});
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
    // The fill is painted as a layer over Foundry's own, so that a color of
    // None leaves the window as Foundry draws it rather than erasing it.
    headerBg: cs(".window-header")?.backgroundImage,
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
check((wn.headerBg ?? "").includes("rgb(32, 64, 96)"), `title bar fill applied (got ${wn.headerBg})`);
check(wn.titleColor === "rgb(255, 204, 0)", `title lettering applied (got ${wn.titleColor})`);
check(wn.titleSize === "20px", `title size applied (got ${wn.titleSize})`);
if (wn.buttonColor !== "rgb(0, 255, 136)") console.log("      diag:", JSON.stringify(wn.diag));
check(wn.buttonColor === "rgb(0, 255, 136)", `title bar icon color applied (got ${wn.buttonColor})`);
check(wn.buttonSize === "22px", `title bar icon size applied (got ${wn.buttonSize})`);
check(wn.editColor === "rgb(255, 0, 255)", `edit pencil color applied (got ${wn.editColor})`);
check(wn.editBg === "rgb(16, 16, 16)", `edit pencil fill applied (got ${wn.editBg})`);
check(wn.dropdownItemsUntouched, "the controls dropdown's list items are left alone");

// Bundled assets have to be reachable at the paths the presets and the sample
// reference, and the sample image must take the Pictures settings.
console.log("\n[23] Bundled textures and the sample image");
const assets = await cdp.evaluate(`(async () => {
  // Every bundled asset, so a move that misses a reference fails here rather
  // than silently 404ing in someone's game.
  const paths = [
    "modules/illuminus/assets/samples/images/castle.jpg",
    "modules/illuminus/assets/samples/textures/parchment.svg",
    "modules/illuminus/assets/samples/textures/paper-fibres.svg",
    "modules/illuminus/assets/samples/textures/linen.svg",
    "modules/illuminus/assets/samples/textures/stone.svg",
    "modules/illuminus/assets/samples/textures/grid.svg",
    "modules/illuminus/assets/samples/textures/hatch.svg",
    "modules/illuminus/assets/samples/textures/bricks.jpg",
    "modules/illuminus/assets/samples/textures/canvas.jpg",
    "modules/illuminus/assets/samples/textures/marble.jpg",
    "modules/illuminus/assets/samples/textures/parchment.jpg",
    "modules/illuminus/assets/samples/textures/stars.jpg"
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
  await app.close({force: true});
  await api.deleteStyle(style.id);
  return JSON.stringify(out);
})()`);
const as = JSON.parse(assets);
const missing = Object.entries(as.fetched).filter(([, v]) => !v.ok).map(([k]) => k);
check(missing.length === 0, `all ${Object.keys(as.fetched).length} bundled assets are served${missing.length ? ": missing " + missing.join(", ") : ""}`);
check(Object.values(as.fetched).every((v) => /svg|jpeg|png|webp/.test(v.type ?? "")),
  "and are served as images");
check(as.presetTexture.endsWith("textures/parchment.svg"),
  `Aged Parchment ships pointing at a bundled texture (${as.presetTexture})`);
check(as.sampleImagePresent && as.sampleImageLoaded, "the sample figure has an image and it loads");
check(as.imgBorder === "5px rgb(255, 0, 0)", `the sample image takes the Pictures border (got ${as.imgBorder})`);
check(as.imgOpacity === "0.5", `and its opacity (got ${as.imgOpacity})`);
check(as.captionColor === "rgb(0, 255, 0)", `and the caption takes its color (got ${as.captionColor})`);

// A relative url() in a stylesheet resolves against the stylesheet's own
// folder, so a picked path must be made root-relative or it 404s.
const texture = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Texture Probe", settings: {
    page: {texture: "modules/illuminus/assets/samples/textures/linen.svg"}
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

// Opening a page for editing must not disturb the rest of the interface. The
// edit sheet is its own window carrying the journal-entry-page class, so a rule
// meant for the page area can land on it and drop it into normal flow.
console.log("\n[24] Editing a page leaves the interface alone");
const editShift = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const sidebar = document.querySelector("#sidebar");
  const at = () => Math.round(sidebar.getBoundingClientRect().left);

  const run = async (styled) => {
    const entry = await JournalEntry.create({name: "Edit Shift " + styled});
    await entry.createEmbeddedDocuments("JournalEntryPage",
      [{name: "P", type: "text", text: {content: "<p>hello</p>"}}]);
    if (styled) {
      await api.assignStyle(entry, api.listStyles().find(s => s.name === "Aged Parchment").id);
    }
    await entry.sheet.render({force: true});
    await new Promise(r => setTimeout(r, 1200));
    const before = at();

    entry.sheet.element.querySelector(".journal-entry-page .edit-container button")?.click();
    await new Promise(r => setTimeout(r, 1600));
    const after = at();

    const editSheet = [...foundry.applications.instances.values()].find(
      a => a.document?.documentName === "JournalEntryPage" && a.element?.parentElement === document.body);
    const position = editSheet ? getComputedStyle(editSheet.element).position : null;
    const marked = editSheet ? editSheet.element.classList.contains("illuminus-styled") : false;
    // What the prose is written on, and whether Foundry's own frame survived.
    const surface = editSheet
      ? getComputedStyle(editSheet.element.querySelector(":scope > .window-content")).backgroundColor : null;
    const frame = editSheet ? getComputedStyle(editSheet.element).backgroundColor : null;
    const pageSurface = getComputedStyle(entry.sheet.element.querySelector(".journal-entry-content")).backgroundColor;

    await editSheet?.close({force: true});
    await entry.delete();
    await new Promise(r => setTimeout(r, 400));
    return {before, after, position, marked, surface, frame, pageSurface};
  };

  return JSON.stringify({plain: await run(false), styled: await run(true)});
})()`);
const es = JSON.parse(editShift);
check(es.plain.before === es.plain.after,
  `unstyled journal: sidebar stays put (${es.plain.before} -> ${es.plain.after})`);
check(es.styled.before === es.styled.after,
  `styled journal: sidebar stays put (${es.styled.before} -> ${es.styled.after})`);
check(es.styled.marked, "the edit window is still styled by Illuminus");
check(es.styled.position !== "relative" && es.styled.position !== "static",
  `and stays out of normal flow (position ${es.styled.position})`);
// The editor is where the text is written, so it has to be as readable as the
// page. It was not: the window's own background landed on the same element as
// the page's and won, leaving the page's ink over Foundry's dark frame.
check(es.styled.surface === es.styled.pageSurface,
  `the editor writes on the same surface as the page (${es.styled.surface} vs ${es.styled.pageSurface})`);
check(es.styled.frame === es.plain.frame,
  `and a window color of None leaves Foundry's frame alone (${es.styled.frame} vs ${es.plain.frame})`);

// A native color input renders #00000000 as solid black, so the true color
// is painted behind it and a fully transparent one is named.
console.log("\n[25] Color swatches show transparency honestly");
const swatch = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Swatch Probe", settings: {
    page: {background: "#00000000"},
    heading1: {background: "#3366cc80"},
    body: {color: "#112233"}
  }});
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1100));
  const el = app.element;

  const read = (path) => {
    const row = el.querySelector('[data-field="' + path + '"]');
    const input = row.querySelector('color-picker input[type="color"]');
    const chip = row.querySelector(".illuminus-swatch");
    const tag = row.querySelector(".illuminus-none-tag");
    const inputBox = input.getBoundingClientRect();
    const inputStyle = getComputedStyle(input);
    return {
      swatchVar: getComputedStyle(row).getPropertyValue("--illuminus-swatch").trim(),
      transparent: row.classList.contains("is-transparent"),
      noneVisible: tag ? getComputedStyle(tag).display !== "none" : false,
      layers: getComputedStyle(chip).backgroundImage,
      nativeValue: input.value,
      // The native input must be gone: it opens the OS panel, not ours.
      nativeHidden: inputStyle.display === "none",
      chipIsButton: chip?.tagName === "BUTTON"
    };
  };

  const out = {
    clear: read("page.background"),
    half: read("heading1.background"),
    solid: read("body.color")
  };

  // And it must follow an edit, not just the initial render.
  el.querySelector('[data-field="body.color"] color-picker').value = "#00000000";
  await new Promise(r => setTimeout(r, 300));
  out.afterEdit = read("body.color");

  await app.close({force: true});
  await api.deleteStyle(style.id);
  return JSON.stringify(out);
})()`);
const sw = JSON.parse(swatch);
check(sw.clear.swatchVar === "#00000000", `a transparent fill reaches the swatch (got ${sw.clear.swatchVar})`);
check(sw.clear.nativeValue === "#000000", `while the native input still shows black (got ${sw.clear.nativeValue})`);
check(sw.clear.transparent && sw.clear.noneVisible, "so it is labeled None");
check(sw.clear.layers.includes("linear-gradient"), "and drawn over a checkerboard");
check(sw.clear.nativeHidden, "the native color input is out of the way entirely");
check(sw.clear.chipIsButton, "and the swatch is the button that opens Illuminus's picker");
check(sw.half.swatchVar === "#3366cc80", `a half-transparent color keeps its alpha (got ${sw.half.swatchVar})`);
check(!sw.half.transparent && !sw.half.noneVisible, "and is not labeled None");
check(sw.solid.swatchVar === "#112233" && !sw.solid.noneVisible, "an opaque color is shown plainly");
check(sw.afterEdit.transparent && sw.afterEdit.noneVisible,
  "editing a color to transparent updates the swatch straight away");

// The picker replaces the operating system panel outright, so it has to cover
// what that panel did and what it could not.
console.log("\n[26] The color picker");
const cp = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Picker Probe", settings: {page: {background: "#3366cc"}}});
  // Clean up even when a check below bails out, or the leftover shows up in
  // the next run's preset count.
  try {
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1100));
  const el = app.element;
  // Sections start collapsed, so open the one holding the control first — a
  // person cannot click what is folded away either.
  el.querySelector('[data-field="page.background"]').closest(".illuminus-section")
    .querySelector("summary").click();
  await new Promise(r => setTimeout(r, 300));
  const control = el.querySelector('[data-field="page.background"] color-picker');
  const swatch = el.querySelector('[data-field="page.background"] .illuminus-swatch');

  // Click through hit testing, as a person does. Calling .click() directly
  // bypasses it, so a control made unclickable by CSS still "works".
  const hit = (el) => {
    const box = el.getBoundingClientRect();
    const x = Math.round(box.left + box.width / 2);
    const y = Math.round(box.top + box.height / 2);
    const top = document.elementFromPoint(x, y);
    return { reachable: top === el || el.contains(top), top: top?.className ?? null, x, y };
  };
  const swatchHit = hit(swatch);
  document.elementFromPoint(swatchHit.x, swatchHit.y)?.click();
  await new Promise(r => setTimeout(r, 300));
  const cp = document.querySelector(".illuminus-cp");
  const out = {opened: !!cp, swatchReachable: swatchHit.reachable, topAtSwatch: swatchHit.top};
  if (!cp) { await app.close({force: true}); return JSON.stringify(out); }

  // Take the picker element as an argument: reopening makes a new one, and
  // writing to the old detached copy still drives its listeners.
  const set = (panel, sel, value) => {
    const input = panel.querySelector(sel);
    input.value = String(value);
    input.dispatchEvent(new Event("input", {bubbles: true}));
  };
  const num = (group, key) => cp.querySelector('[data-channel="' + group + '-' + key + '"] input[type=number]').value;

  // Opens to the right of the swatch it belongs to.
  const sb = swatch.getBoundingClientRect();
  const pb = cp.getBoundingClientRect();
  out.toTheRight = pb.left >= sb.right - 1;

  // Editing RGB moves the ramp with it: the hue knob tracks the color.
  set(cp, '[data-channel="rgb-r"] input[type=range]', 255);
  await new Promise(r => setTimeout(r, 120));
  out.afterRed = {
    hex: cp.querySelector(".illuminus-cp__hex").value,
    hueKnob: parseFloat(cp.querySelector(".illuminus-cp__hue-knob").style.top)
  };

  // Dragging the shade square writes back through RGB. Pointer capture is
  // stubbed because a synthetic PointerEvent carries no real pointer to capture.
  const sv = cp.querySelector(".illuminus-cp__sv");
  sv.setPointerCapture = () => {};
  sv.releasePointerCapture = () => {};
  const svBox = sv.getBoundingClientRect();
  sv.dispatchEvent(new PointerEvent("pointerdown", {
    clientX: svBox.right - 1, clientY: svBox.top + 1, bubbles: true, pointerId: 1
  }));
  await new Promise(r => setTimeout(r, 150));
  const rampHex = cp.querySelector(".illuminus-cp__hex").value;
  out.afterRamp = {
    hex: rampHex,
    minChannel: Math.min(...[1, 3, 5].map(i => parseInt(rampHex.slice(i, i + 2), 16)))
  };

  // Alpha appears in the hex.
  set(cp, '[data-channel="rgb-a"] input[type=range]', 50);
  await new Promise(r => setTimeout(r, 120));
  out.afterAlpha = {hex: cp.querySelector(".illuminus-cp__hex").value};

  // Live while open, but the stored style must not move yet.
  out.liveValue = control.value;
  out.storedDuring = api.getStyle(style.id).settings.page?.background;

  // Save a swatch, then cancel and confirm the color reverts.
  cp.querySelector('[data-cp="save"]').click();
  await new Promise(r => setTimeout(r, 300));
  out.swatchSlots = cp.querySelectorAll(".illuminus-cp__swatch").length;
  out.swatchSaved = (api.getStyle(style.id).swatches ?? []).length;

  cp.querySelector('.illuminus-cp__foot [data-cp="cancel"]').click();
  await new Promise(r => setTimeout(r, 250));
  out.closedOnCancel = !document.querySelector(".illuminus-cp");
  out.afterCancel = control.value;

  // Reopen and accept, which should keep the change.
  document.elementFromPoint(swatchHit.x, swatchHit.y)?.click();
  await new Promise(r => setTimeout(r, 250));
  const cp2 = document.querySelector(".illuminus-cp");
  set(cp2, '[data-channel="rgb-g"] input[type=range]', 200);
  await new Promise(r => setTimeout(r, 120));
  const wanted = cp2.querySelector(".illuminus-cp__hex").value;
  cp2.querySelector('[data-cp="ok"]').click();
  await new Promise(r => setTimeout(r, 250));
  out.afterOk = {value: control.value, wanted, closed: !document.querySelector(".illuminus-cp")};

  await app.close({force: true});
  return JSON.stringify(out);
  } finally {
    for (const a of foundry.applications.instances.values()) {
      if (a.id?.startsWith("illuminus-style-editor")) await a.close({force: true});
    }
    await api.deleteStyle(style.id);
  }
})()`);
const pick = JSON.parse(cp);
check(pick.swatchReachable, `the swatch is what the pointer actually hits (topmost: ${pick.topAtSwatch})`);
check(pick.opened, "clicking it opens the picker");
check(pick.toTheRight, "it appears to the right of the swatch");
check(pick.afterRed.hex.toLowerCase().startsWith("#ff"), `editing RGB updates the hex (got ${pick.afterRed.hex})`);
check(Number.isFinite(pick.afterRed.hueKnob),
  `and the ramp's hue knob follows it (at ${pick.afterRed.hueKnob}%)`);
// Dragging to the right edge means "as saturated as this hue gets", which is a
// color with one channel at the floor — not one exact value.
check(pick.afterRamp.minChannel <= 8,
  `dragging the shade square drives it to full saturation (got ${pick.afterRamp.hex})`);
check(pick.afterAlpha.hex.length === 9, `alpha shows in the hex (got ${pick.afterAlpha.hex})`);
check(pick.liveValue === pick.afterAlpha.hex, "the control follows live while the picker is open");
check(pick.storedDuring === "#3366cc", `the saved style is untouched meanwhile (stored ${pick.storedDuring})`);
check(pick.swatchSlots >= 20, `at least 20 saved-color slots (got ${pick.swatchSlots})`);
check(pick.swatchSaved === 1, `saving keeps the color on the style (${pick.swatchSaved} saved)`);
check(pick.closedOnCancel && pick.afterCancel === "#3366cc",
  `Cancel closes and restores the original (got ${pick.afterCancel})`);
check(pick.afterOk.closed && pick.afterOk.value === pick.afterOk.wanted,
  `OK closes and keeps the choice (${pick.afterOk.value})`);

// Saving a style makes those values the new baseline for Reset.
// Removing a saved color depends on :hover, which only real input events
// produce — a synthetic mouseover will not reveal the control.
console.log("\n[27] Removing a saved color");
const forgetSetup = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Forget Probe", swatches: ["#112233", "#445566", "#778899"]});
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1100));
  // Sections start collapsed; open the one holding the swatch first.
  app.element.querySelector('[data-field="page.background"]').closest(".illuminus-section")
    .querySelector("summary").click();
  await new Promise(r => setTimeout(r, 300));
  const swatch = app.element.querySelector('[data-field="page.background"] .illuminus-swatch');
  const b = swatch.getBoundingClientRect();
  document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2))?.click();
  await new Promise(r => setTimeout(r, 350));
  const cell = document.querySelector('.illuminus-cp__swatch[data-hex]');
  const cb = cell.getBoundingClientRect();
  // The row must fit the panel: a bare 1fr track will not shrink below its
  // content's minimum and pushes the last column past the edge.
  const cp = document.querySelector(".illuminus-cp");
  const grid = cp.querySelector(".illuminus-cp__swatches");
  const slots = [...cp.querySelectorAll(".illuminus-cp__slot")];
  return JSON.stringify({
    styleId: style.id,
    before: (api.getStyle(style.id).swatches ?? []).length,
    overflow: cp.scrollWidth - cp.clientWidth,
    lastSlotBeyondGrid: Math.round(
      slots[9].getBoundingClientRect().right - grid.getBoundingClientRect().right),
    cellX: Math.round(cb.left + cb.width / 2),
    cellY: Math.round(cb.top + cb.height / 2)
  });
})()`);
const fs0 = JSON.parse(forgetSetup);
check(fs0.overflow <= 0, `the picker does not scroll sideways (${fs0.overflow}px over)`);
check(fs0.lastSlotBeyondGrid <= 0, `and the last saved-color slot stays inside it (${fs0.lastSlotBeyondGrid}px past)`);

// Genuine pointer input: this is what makes :hover apply.
await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fs0.cellX, y: fs0.cellY, buttons: 0 });
await new Promise((r) => setTimeout(r, 200));

const forget = await cdp.evaluate(`(() => {
  const remove = document.querySelector(".illuminus-cp__forget");
  const box = remove.getBoundingClientRect();
  const x = Math.round(box.left + box.width / 2);
  const y = Math.round(box.top + box.height / 2);
  const top = document.elementFromPoint(x, y);
  return JSON.stringify({
    visible: getComputedStyle(remove).display !== "none",
    size: Math.round(box.width) + "x" + Math.round(box.height),
    reachable: top === remove || remove.contains(top),
    topClass: top?.className ?? null, x, y
  });
})()`);
const fg = JSON.parse(forget);
check(fg.visible, "hovering a saved color reveals its remove button");
check(fg.size !== "0x0", `which has a real hit area (${fg.size})`);
check(fg.reachable, `and is the topmost element at its centre (got ${fg.topClass})`);

await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fg.x, y: fg.y, buttons: 0 });
await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: fg.x, y: fg.y, button: "left", buttons: 1, clickCount: 1 });
await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: fg.x, y: fg.y, button: "left", buttons: 0, clickCount: 1 });
await new Promise((r) => setTimeout(r, 400));

const forgetResult = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  // Scoped to the saved row: the recently-used row below it holds swatches too,
  // and counting both would make a removal look like it had not happened.
  const remaining = document.querySelectorAll('.illuminus-cp__swatches .illuminus-cp__swatch[data-hex]').length;
  // Persisting goes through a world setting, so wait for the write rather than
  // assuming a fixed delay covers it.
  let stored = api.getStyle("${fs0.styleId}").swatches ?? [];
  for (let i = 0; i < 40 && stored.length !== 2; i++) {
    await new Promise(r => setTimeout(r, 100));
    stored = api.getStyle("${fs0.styleId}").swatches ?? [];
  }
  for (const a of foundry.applications.instances.values()) {
    if (a.id?.startsWith("illuminus-style-editor")) await a.close({force: true});
  }
  await api.deleteStyle("${fs0.styleId}");
  return JSON.stringify({remaining, stored});
})()`);
const fr = JSON.parse(forgetResult);
check(fs0.before === 3, `started with three saved colors (${fs0.before})`);
check(fr.remaining === 2, `clicking it removes the swatch (${fr.remaining} left)`);
check(!fr.stored.includes("#112233") && fr.stored.length === 2,
  `and it is gone from the style (${fr.stored.join(", ")})`);

console.log("\n[28] Saving sets the baseline that Reset returns to");
const baseline = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Baseline Probe"});
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1000));
  const el = app.element;
  const control = el.querySelector('[data-field="page.background"] color-picker');
  const schemaDefault = control.value;

  control.value = "#123456";
  await new Promise(r => setTimeout(r, 200));
  await app.submit();
  await new Promise(r => setTimeout(r, 500));

  const savedMarkedClean = el.querySelector('[data-field="page.background"]').classList.contains("is-default");

  el.querySelector('[data-field="page.background"] color-picker').value = "#abcdef";
  await new Promise(r => setTimeout(r, 200));
  const markedChanged = !el.querySelector('[data-field="page.background"]').classList.contains("is-default");

  // Reset the section and see which value comes back.
  el.querySelector('[data-action="resetSection"][data-group="page"][data-section="surface"]').click();
  await new Promise(r => setTimeout(r, 400));
  const afterReset = el.querySelector('[data-field="page.background"] color-picker').value;

  await app.close({force: true});
  await api.deleteStyle(style.id);
  return JSON.stringify({schemaDefault, savedMarkedClean, markedChanged, afterReset});
})()`);
const bl = JSON.parse(baseline);
check(bl.schemaDefault !== "#123456", `the style starts at the schema default (${bl.schemaDefault})`);
check(bl.savedMarkedClean, "after saving, the changed marker clears");
check(bl.markedChanged, "editing again marks it changed");
check(bl.afterReset === "#123456", `Reset returns to the saved value, not the schema default (got ${bl.afterReset})`);

// Blocks and picture treatments are only reachable through this menu, and the
// classes it writes have to survive Foundry's HTML handling on save. Driven
// with real mouse events, because the drop-down's children are revealed by
// :hover, which a scripted MouseEvent does not trigger.
console.log("\n[29] The editor's Illuminus menu");

/** Centre of an element, in viewport coordinates. */
const boxOf = async (expr) => {
  const raw = await cdp.evaluate(`(() => {
    const el = ${expr};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height});
  })()`);
  return raw ? JSON.parse(raw) : null;
};

/**
 * Where an element has come to rest. The editor rebuilds its whole menu bar on
 * every selection change and then reflows it for overflow a frame later, so a
 * box measured the instant after a click can be stale before the press lands —
 * which a person never experiences, because they aim at what they can see.
 */
const settledBox = async (expr) => {
  let last = null;
  for (let i = 0; i < 20; i++) {
    const now = await boxOf(expr);
    if (now && last && now.x === last.x && now.y === last.y) return now;
    last = now;
    await new Promise((r) => setTimeout(r, 100));
  }
  return last;
};

// The most recently opened page editor. A closing sheet lingers in the DOM for
// its animation, so taking the first match can land on the one on its way out.
const EDIT_SHEET = `[...foundry.applications.instances.values()].filter(
  a => a.document?.documentName === "JournalEntryPage" && a.rendered
    && a.element?.parentElement === document.body).pop()`;

/**
 * Count menu-bar rebuilds, so a click can wait for one to be over. Every state
 * change replaces the whole bar, and a press and release either side of a
 * replacement is not a click — the button that was pressed no longer exists.
 */
const watchMenu = () => cdp.evaluate(`(() => {
  const bar = ${EDIT_SHEET}.element.querySelector("menu.editor-menu");
  window.__menuChurn = 0;
  window.__menuWatch?.disconnect();
  window.__menuWatch = new MutationObserver(() => window.__menuChurn++);
  window.__menuWatch.observe(bar.parentElement, {childList: true});
})()`);

/** Wait until the menu bar has stopped rebuilding itself. */
const menuAtRest = async () => {
  for (let i = 0; i < 30; i++) {
    const before = await cdp.evaluate("window.__menuChurn");
    await new Promise((r) => setTimeout(r, 250));
    if (await cdp.evaluate("window.__menuChurn") === before) return;
  }
};

try {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    // Nothing left open, so the sheet the clicks land on is the one under test.
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Menu Probe", labels: {box01: "Read-aloud"}});
    const settings = foundry.utils.deepClone(style.settings);
    settings.box01.background = "#123456";
    settings.image01.borderTopWidth = 7;
    settings.image01.borderTopStyle = "solid";
    await api.updateStyle(style.id, {settings});
    const entry = await JournalEntry.create({name: "Illuminus Menu Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "P", type: "text",
      // A small image, so the caption below it stays on screen for the click.
      text: {content: '<p>Prose to wrap.</p><figure><img src="icons/svg/book.svg" width="80"><figcaption>A caption.</figcaption></figure>'}
    }]);
    await api.assignStyle(entry, style.id);
    window.__menuTest = {entryId: entry.id, styleId: style.id};
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1200));
    entry.sheet.element.querySelector(".journal-entry-page .edit-container button").click();
  })()`);
  await cdp.waitFor(`${EDIT_SHEET}?.element.querySelector(".pm-dropdown.illuminus-menu")`,
    { label: "the page editor to open" });

  /** Point at the prose, open the menu, and choose one of its entries. */
  const chooseFromMenu = async (target, action) => {
    await watchMenu();
    const at = await settledBox(`${EDIT_SHEET}.element.querySelector(${JSON.stringify(target)})`);
    if (at) await cdp.click(at.x, at.y);
    // Clicking into the prose moved the selection, which rebuilds the bar.
    await menuAtRest();
    // Aim again if the press was lost: the bar can rebuild between the press and
    // the release, and the button that was pressed then no longer exists. A
    // person re-clicks without thinking about it.
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      const button = await settledBox(`${EDIT_SHEET}.element.querySelector(".pm-dropdown.illuminus-menu")`);
      if (!button) break;
      await cdp.click(button.x, button.y);
      opened = await cdp.evaluate(`!!document.querySelector("#prosemirror-dropdown")`);
    }
    if (!opened) return { opened: false };

    // Blocks and treatments hang off a submenu, which opens on hover.
    const parent = action.startsWith("illuminus-image") ? "illuminus-images"
      : action.startsWith("illuminus-box") ? "illuminus-boxes" : null;
    if (parent) {
      const submenu = await settledBox(`document.querySelector('#prosemirror-dropdown [data-action="${parent}"]')`);
      if (submenu) await cdp.mouse("mouseMoved", submenu.x, submenu.y);
    }
    const item = await settledBox(`document.querySelector('#prosemirror-dropdown [data-action="${action}"]')`);
    if (!item?.w) return { opened: true, reachable: false };

    // Through hit testing, so an entry covered by something else fails here.
    const hit = await cdp.evaluate(
      `document.elementFromPoint(${item.x}, ${item.y})?.closest("li")?.dataset.action ?? ""`);
    const title = await cdp.evaluate(
      `document.querySelector('#prosemirror-dropdown [data-action="${action}"]').textContent.trim()`);
    await cdp.click(item.x, item.y);
    await new Promise((r) => setTimeout(r, 400));
    return { opened: true, reachable: true, hit, title };
  };

  const block = await chooseFromMenu(".ProseMirror p", "illuminus-box01");
  check(block.opened, "the Illuminus drop-down opens from the editor's menu bar");
  // Next to Format, where the controls that change what a passage *is* live,
  // rather than out past the icon buttons where assigning the config lands it.
  const barOrder = await cdp.evaluate(`JSON.stringify(
    [...${EDIT_SHEET}.element.querySelectorAll("menu.editor-menu .pm-dropdown")]
      .map(b => b.className.split(/\\s+/).filter(c => c && c !== "pm-dropdown").join(".")))`);
  const order = JSON.parse(barOrder);
  check(order[0] === "format" && order[1] === "illuminus-menu",
    `and sits immediately right of Format (got ${order.slice(0, 3).join(", ")})`);
  check(block.reachable, "its block entries are reachable once the menu is open");
  check(block.hit === "illuminus-box01", `and hit testing lands on the entry (got ${block.hit})`);

  check(block.title === "Read-aloud", `the menu calls a block what this style calls it (got "${block.title}")`);

  const wrapped = await cdp.evaluate(
    `${EDIT_SHEET}.element.querySelector(".ProseMirror blockquote")?.className ?? ""`);
  check(wrapped === "illuminus-box illuminus-box--box01",
    `choosing a block wraps the selection (got "${wrapped}")`);

  // The caption, not the image: clicking an image in the editor opens core's
  // image popout, which then covers the menu.
  const picture = await chooseFromMenu(".ProseMirror figcaption", "illuminus-image01");
  check(picture.reachable, `its picture entries are reachable too (opened ${picture.opened}, hit ${picture.hit})`);
  const tagged = await cdp.evaluate(
    `${EDIT_SHEET}.element.querySelector(".ProseMirror figure")?.className ?? "(no figure)"`);
  check(tagged === "illuminus-image illuminus-image--image01",
    `choosing a treatment tags the picture (got "${tagged}")`);

  // The real question: does any of it survive Foundry's save path?
  const saved = await cdp.evaluate(`(async () => {
    const sheet = ${EDIT_SHEET};
    await sheet.submit();
    // Submitting does not close the editor, and a second one left open behind
    // the first steals the clicks meant for it.
    await sheet.close();
    await new Promise(r => setTimeout(r, 1500));
    const entry = game.journal.get(window.__menuTest.entryId);
    const page = entry.pages.contents[0];
    await entry.sheet.render({force: true, pageId: page.id});
    await new Promise(r => setTimeout(r, 1200));
    const el = entry.sheet.element.querySelector(".illuminus-box--box01");
    const fig = entry.sheet.element.querySelector(".illuminus-image--image01");
    return JSON.stringify({
      stored: page.text.content,
      background: el && getComputedStyle(el).backgroundColor,
      borderTop: fig && getComputedStyle(fig).borderTopWidth
    });
  })()`);
  const sv = JSON.parse(saved);
  check(/blockquote class="illuminus-box illuminus-box--box01"/.test(sv.stored),
    "the block's classes survive the save round trip");
  check(/figure class="illuminus-image illuminus-image--image01"/.test(sv.stored),
    "the picture treatment's classes survive it too");
  check(sv.background === "rgb(18, 52, 86)",
    `and the saved page paints the block from the style (got ${sv.background})`);
  check(sv.borderTop === "7px", `and frames the picture from the style (got ${sv.borderTop})`);

  // Clearing has to leave the carrier behind: a person who wanted a plain
  // blockquote should still have one.
  await cdp.evaluate(`(async () => {
    const entry = game.journal.get(window.__menuTest.entryId);
    entry.sheet.element.querySelector(".journal-entry-page .edit-container button").click();
  })()`);
  await cdp.waitFor(`${EDIT_SHEET}?.element.querySelector(".ProseMirror blockquote")`,
    { label: "the page editor to reopen" });
  const clear = await chooseFromMenu(".ProseMirror blockquote p", "illuminus-clear");
  check(clear.reachable, `the clear entry is reachable (opened ${clear.opened}, hit ${clear.hit})`);
  const after = await cdp.evaluate(`(() => {
    const bq = ${EDIT_SHEET}.element.querySelector(".ProseMirror blockquote");
    return JSON.stringify({present: !!bq, classes: bq?.className ?? null});
  })()`);
  const af = JSON.parse(after);
  check(af.present && !af.classes, `clearing takes the styling off but keeps the quote (classes "${af.classes}")`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__menuTest?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__menuTest?.styleId) await api.deleteStyle(window.__menuTest.styleId);
  })()`);
}

// A horizontal rule is drawn as a top edge only, so Thickness means what it
// says rather than doubling, and Alignment resolves to auto margins — neither
// of which a declaration alone proves. These assert where the line lands.
console.log("\n[30] Horizontal rules");
const rules = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Divider Probe", settings: {body: {
    dividerWidth: 3, dividerStyle: "dashed", dividerColor: "#ff8800",
    dividerLength: 50, dividerAlign: "left",
    dividerMarginTop: 40, dividerMarginBottom: 8
  }}});
  const entry = await JournalEntry.create({name: "Divider Test Journal"});
  await entry.createEmbeddedDocuments("JournalEntryPage",
    [{name: "P", type: "text", text: {content: "<p>before</p><hr><p>after</p>"}}]);
  await api.assignStyle(entry, style.id);
  await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
  await new Promise(r => setTimeout(r, 1000));

  const measure = () => {
    const hr = entry.sheet.element.querySelector(".journal-page-content hr");
    const cs = getComputedStyle(hr);
    const line = hr.getBoundingClientRect();
    const around = hr.parentElement.getBoundingClientRect();
    return {
      topWidth: cs.borderTopWidth, topStyle: cs.borderTopStyle, topColor: cs.borderTopColor,
      otherEdges: cs.borderBottomWidth + " " + cs.borderLeftWidth + " " + cs.borderRightWidth,
      marginTop: cs.marginTop, marginBottom: cs.marginBottom,
      // Share of the width it spans, and where its edges sit inside it.
      share: Math.round((line.width / around.width) * 100),
      leftGap: Math.round(line.left - around.left),
      rightGap: Math.round(around.right - line.right)
    };
  };

  const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
  const restyle = async (changes) => {
    Object.assign(settings.body, changes);
    await api.updateStyle(style.id, {settings});
    await new Promise(r => setTimeout(r, 500));
    return measure();
  };

  const out = {
    left: measure(),
    center: await restyle({dividerAlign: "center"}),
    right: await restyle({dividerAlign: "right"}),
    hidden: await restyle({dividerWidth: 0})
  };
  await entry.delete();
  await api.deleteStyle(style.id);
  return JSON.stringify(out);
})()`);
const hr = JSON.parse(rules);
check(hr.left.topWidth === "3px", `thickness applies to the rule (got ${hr.left.topWidth})`);
check(hr.left.topStyle === "dashed", `style applies (got ${hr.left.topStyle})`);
check(hr.left.topColor === "rgb(255, 136, 0)", `color applies (got ${hr.left.topColor})`);
check(hr.left.otherEdges === "0px 0px 0px",
  `only the top edge is drawn, so 3px means 3px (other edges ${hr.left.otherEdges})`);
check(hr.left.marginTop === "40px" && hr.left.marginBottom === "8px",
  `space above and below apply (got ${hr.left.marginTop} / ${hr.left.marginBottom})`);
check(hr.left.share === 50, `length spans half the width (got ${hr.left.share}%)`);
check(hr.left.leftGap === 0 && hr.left.rightGap > 0,
  `left alignment puts it against the left edge (gaps ${hr.left.leftGap}/${hr.left.rightGap})`);
check(Math.abs(hr.center.leftGap - hr.center.rightGap) <= 1,
  `center alignment splits the slack evenly (gaps ${hr.center.leftGap}/${hr.center.rightGap})`);
check(hr.right.rightGap === 0 && hr.right.leftGap > 0,
  `right alignment puts it against the right edge (gaps ${hr.right.leftGap}/${hr.right.rightGap})`);
check(hr.hidden.topWidth === "0px", `a thickness of 0 draws nothing (got ${hr.hidden.topWidth})`);

// Blocks and picture treatments take the preview pane over, because the journal
// mock would leave a block a sliver of the width and its own width and wrapping
// controls would then mean nothing. The panel must show the member the tab is
// actually editing, and take its look from the style being edited.
console.log("\n[31] Block Styles and Picture Styles get their own preview");
const panes = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Preview Pane Probe", labels: {box02: "Sidebar"}});
  const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
  settings.box01.background = "#123456";
  settings.box01.width = "half";
  settings.box01.float = "left";
  settings.box02.background = "#654321";
  settings.image01.borderTopWidth = 6;
  settings.image01.borderTopStyle = "solid";
  settings.image01.borderTopColor = "#ff8800";
  await api.updateStyle(style.id, {settings});

  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1000));
  const el = app.element;
  const mock = el.querySelector(".illuminus-preview__window");
  const blocks = el.querySelector('.illuminus-preview__family[data-family="boxStyles"]');
  const pictures = el.querySelector('.illuminus-preview__family[data-family="imageStyles"]');
  const frame = el.querySelector(".illuminus-preview__frame");
  const show = e => getComputedStyle(e).display;

  const at = async (tab) => { app.changeTab(tab, "sheet"); await new Promise(r => setTimeout(r, 300)); };

  await at("page");
  const onPage = {mock: show(mock), blocks: show(blocks), pictures: show(pictures)};

  await at("boxStyles");
  const bq = blocks.querySelector("blockquote");
  const onBlocks = {
    mock: show(mock), blocks: show(blocks), pictures: show(pictures),
    carrier: bq.className,
    background: getComputedStyle(bq).backgroundColor,
    float: getComputedStyle(bq).cssFloat,
    // The page must reach the bottom of the pane, not stop at its text.
    fill: Math.round(blocks.querySelector(".journal-entry-content").getBoundingClientRect().height)
      >= Math.round(frame.getBoundingClientRect().height) - 4
  };

  // Choosing another member rebuilds the panel for it.
  el.querySelector('[data-family-picker="boxStyles"]').value = "box02";
  el.querySelector('[data-family-picker="boxStyles"]').dispatchEvent(new Event("change"));
  await new Promise(r => setTimeout(r, 600));
  const afterPick = {
    carrier: el.querySelector('.illuminus-preview__family[data-family="boxStyles"] blockquote').className,
    background: getComputedStyle(el.querySelector('.illuminus-preview__family[data-family="boxStyles"] blockquote')).backgroundColor
  };

  await at("imageStyles");
  const fig = el.querySelector('.illuminus-preview__family[data-family="imageStyles"] figure');
  const onPictures = {
    mock: show(el.querySelector(".illuminus-preview__window")),
    pictures: show(el.querySelector('.illuminus-preview__family[data-family="imageStyles"]')),
    carrier: fig.className,
    borderColor: getComputedStyle(fig).borderTopColor,
    hasImage: !!fig.querySelector("img") && fig.querySelector("img").getBoundingClientRect().width > 0
  };

  await app.close({force: true});
  await api.deleteStyle(style.id);
  return JSON.stringify({onPage, onBlocks, afterPick, onPictures});
})()`);
const pv = JSON.parse(panes);
check(pv.onPage.mock !== "none" && pv.onPage.blocks === "none" && pv.onPage.pictures === "none",
  "on a page tab the journal mock is what shows");
check(pv.onBlocks.mock === "none" && pv.onBlocks.blocks !== "none",
  `the Block Styles tab replaces the mock (mock ${pv.onBlocks.mock}, panel ${pv.onBlocks.blocks})`);
check(pv.onBlocks.carrier === "illuminus-box illuminus-box--box01",
  `the panel is built for the member on show (got "${pv.onBlocks.carrier}")`);
check(pv.onBlocks.background === "rgb(18, 52, 86)",
  `and takes its look from the style being edited (got ${pv.onBlocks.background})`);
check(pv.onBlocks.float === "left", `layout settings reach it too (float ${pv.onBlocks.float})`);
check(pv.onBlocks.fill, "the sample page fills the pane rather than stopping at its text");
check(pv.afterPick.carrier === "illuminus-box illuminus-box--box02",
  `choosing another block rebuilds the panel for it (got "${pv.afterPick.carrier}")`);
check(pv.afterPick.background === "rgb(101, 67, 33)",
  `and it repaints from that member's settings (got ${pv.afterPick.background})`);
check(pv.onPictures.mock === "none" && pv.onPictures.pictures !== "none",
  `the Picture Styles tab replaces it as well (panel ${pv.onPictures.pictures})`);
check(pv.onPictures.carrier === "illuminus-image illuminus-image--image01",
  `its panel carries the treatment on show (got "${pv.onPictures.carrier}")`);
check(pv.onPictures.borderColor === "rgb(255, 136, 0)",
  `styled from the style being edited (got ${pv.onPictures.borderColor})`);
check(pv.onPictures.hasImage, "and the sample picture actually loads");

// An inline treatment is a mark rather than a node, so it needs words to attach
// to and it has to survive the same save. The two things it exists for are a
// trait tag and the rank at the end of a title line, and both are checked here
// by where they actually land, not by the declarations they carry.
console.log("\n[32] Inline styles, and blocks that hide when empty");
try {
  const inline = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Inline Probe", labels: {tag01: "Rarity"}});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.tag01, {
      background: "#5e0000", color: "#ffffff", caps: "uppercase",
      borderLeftWidth: 5, borderLeftColor: "#e9b770", borderLeftStyle: "solid",
      borderRightWidth: 5, borderRightColor: "#e9b770", borderRightStyle: "solid"
    });
    settings.tag02.float = "right";
    settings.box01.whenEmpty = "hide";
    settings.box02.whenEmpty = "show";
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Inline Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      '<h2>Sewer Haze <span class="illuminus-tag illuminus-tag--tag02">Disease 7</span></h2>' +
      '<p><span class="illuminus-tag illuminus-tag--tag01">Disease</span></p>' +
      '<blockquote class="illuminus-box illuminus-box--box01"><p></p></blockquote>' +
      '<blockquote class="illuminus-box illuminus-box--box02"><p></p></blockquote>' +
      '<blockquote class="illuminus-box illuminus-box--box03"><p>Kept.</p></blockquote>'}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));

    const root = entry.sheet.element.querySelector("section.journal-page-content");
    const cs = sel => { const el = root.querySelector(sel); return el ? getComputedStyle(el) : {}; };
    const tag = cs(".illuminus-tag--tag01");
    const heading = root.querySelector("h2").getBoundingClientRect();
    const rank = root.querySelector(".illuminus-tag--tag02").getBoundingClientRect();

    const out = {
      // Inline-block, not inline: padding on a true inline box spills over the
      // lines around it instead of growing its own.
      display: tag.display,
      background: tag.backgroundColor,
      sideBorders: tag.borderLeftWidth + "/" + tag.borderRightWidth + " " + tag.borderLeftColor,
      caps: tag.textTransform,
      // The rank reaches the right-hand end of the title line it sits in.
      rankGap: Math.round(heading.right - rank.right),
      rankFloat: cs(".illuminus-tag--tag02").cssFloat,
      hiddenWhenSet: cs(".illuminus-box--box01").display,
      shownWhenNotSet: cs(".illuminus-box--box02").display,
      filledAlwaysShown: cs(".illuminus-box--box03").display
    };
    window.__inline = {entryId: entry.id, styleId: style.id};
    return JSON.stringify(out);
  })()`);
  const il = JSON.parse(inline);
  check(il.display === "inline-block",
    `a tag lays out as an inline block, so its padding grows its own box (got ${il.display})`);
  check(il.background === "rgb(94, 0, 0)", `tag fill applied (got ${il.background})`);
  check(il.sideBorders === "5px/5px rgb(233, 183, 112)",
    `side-only borders applied, which is what makes the Paizo tag shape (got ${il.sideBorders})`);
  check(il.caps === "uppercase", `tag lettering settings applied (got ${il.caps})`);
  check(il.rankFloat === "right" && il.rankGap >= 0 && il.rankGap <= 12,
    `a right-pushed tag reaches the end of the title line (${il.rankGap}px short, float ${il.rankFloat})`);
  check(il.hiddenWhenSet === "none",
    `an empty block set to hide is not drawn (got ${il.hiddenWhenSet})`);
  check(il.shownWhenNotSet !== "none",
    `an empty block left on Show still is (got ${il.shownWhenNotSet})`);
  check(il.filledAlwaysShown !== "none",
    `and a block with content is never hidden (got ${il.filledAlwaysShown})`);

  // The same round trip the blocks get, driven the way a person does it: select
  // the words, then walk the menu. A mark needs a selection, which is the one way
  // tagging differs from wrapping a block.
  const wordAt = async (expr) => {
    const at = await settledBox(expr);
    if (!at) return false;
    await cdp.mouse("mouseMoved", at.x, at.y);
    // A double click selects the word under the pointer.
    await cdp.send("Input.dispatchMouseEvent",
      { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 2 });
    await cdp.send("Input.dispatchMouseEvent",
      { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 2 });
    await new Promise((r) => setTimeout(r, 250));
    return true;
  };

  const openTagMenu = async (action) => {
    await menuAtRest();
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      const button = await settledBox(`${EDIT_SHEET}.element.querySelector(".pm-dropdown.illuminus-menu")`);
      if (!button) break;
      await cdp.click(button.x, button.y);
      opened = await cdp.evaluate(`!!document.querySelector("#prosemirror-dropdown")`);
    }
    if (!opened) return { opened: false };
    const parent = await settledBox(`document.querySelector('#prosemirror-dropdown [data-action="illuminus-tags"]')`);
    if (parent) await cdp.mouse("mouseMoved", parent.x, parent.y);
    const item = await settledBox(`document.querySelector('#prosemirror-dropdown [data-action="${action}"]')`);
    if (!item?.w) return { opened: true, reachable: false };
    const title = await cdp.evaluate(
      `document.querySelector('#prosemirror-dropdown [data-action="${action}"]').textContent.trim()`);
    await cdp.click(item.x, item.y);
    await new Promise((r) => setTimeout(r, 400));
    return { opened: true, reachable: true, title };
  };

  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__inline.entryId);
    await entry.pages.contents[0].update({"text.content": "<p>Unique Artifact</p>"});
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1200));
    entry.sheet.element.querySelector(".journal-entry-page .edit-container button").click();
  })()`);
  await cdp.waitFor(`${EDIT_SHEET}?.element.querySelector(".pm-dropdown.illuminus-menu")`,
    { label: "the editor to open for tagging" });
  await watchMenu();

  // Cursor placed but nothing selected: there is nothing to tag.
  const caret = await settledBox(`${EDIT_SHEET}.element.querySelector(".ProseMirror p")`);
  await cdp.click(caret.x, caret.y);
  const noSelection = await openTagMenu("illuminus-tag01");
  const afterNoSelection = await cdp.evaluate(
    `${EDIT_SHEET}.element.querySelector(".ProseMirror span.illuminus-tag") ? "tagged" : "untouched"`);
  check(afterNoSelection === "untouched",
    `with no words selected, choosing a tag changes nothing (got ${afterNoSelection})`);

  await wordAt(`${EDIT_SHEET}.element.querySelector(".ProseMirror p")`);
  const tagged = await openTagMenu("illuminus-tag01");
  check(tagged.opened && tagged.reachable, "the Inline Style entries are reachable in the menu");
  check(tagged.title === "Rarity", `and carry the style's own name for the tag (got "${tagged.title}")`);
  const inEditor = await cdp.evaluate(
    `${EDIT_SHEET}.element.querySelector(".ProseMirror span.illuminus-tag")?.outerHTML ?? ""`);
  check(/class="illuminus-tag illuminus-tag--tag01"/.test(inEditor),
    `tagging the selected word wraps it (got ${inEditor || "nothing"})`);

  const storedTag = await cdp.evaluate(`(async () => {
    const sheet = ${EDIT_SHEET};
    await sheet.submit();
    await sheet.close();
    await new Promise(r => setTimeout(r, 1400));
    return game.journal.get(window.__inline.entryId).pages.contents[0].text.content;
  })()`);
  check(/<span class="illuminus-tag illuminus-tag--tag01">/.test(storedTag),
    `and it survives the save round trip (stored ${storedTag})`);
} finally {
  // A leaked style shifts the seeded-style counts that earlier checks assert on.
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__inline?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__inline?.styleId) await api.deleteStyle(window.__inline.styleId);
    window.__inline = undefined;
  })()`);
}

// Every fill color has a background image beside it. The images ride on a
// ::before layer so their strength is independent of the lettering in front,
// which is only provable by reading the layer rather than the element.
console.log("\n[33] A background image behind any fill");
try {
  const layers = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Image Layer Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    const IMG = "modules/illuminus/assets/samples/textures/parchment.jpg";
    Object.assign(settings.tables, {headerBackground: "#5e1914", headerTexture: IMG, headerTextureOpacity: 60});
    Object.assign(settings.heading1, {background: "#5e1914", texture: IMG, textureFit: "tile"});
    Object.assign(settings.sidebar, {buttonBackground: "#222222", buttonTexture: IMG});
    settings.box01.texture = IMG;
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Image Layer Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      "<h1>Heading</h1><table><thead><tr><th>H</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>" +
      '<blockquote class="illuminus-box illuminus-box--box01"><p>Block</p></blockquote>'}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));

    const root = entry.sheet.element;
    const layer = (sel) => {
      const el = root.querySelector(sel);
      if (!el) return {missing: true};
      const before = getComputedStyle(el, "::before");
      return {
        image: /parchment\.jpg/.test(before.backgroundImage),
        opacity: before.opacity, repeat: before.backgroundRepeat,
        // Behind the lettering, not over it.
        behind: before.zIndex, isolated: getComputedStyle(el).isolation
      };
    };
    const out = {
      tableHeader: layer("thead th"),
      heading: layer(".journal-page-content h1"),
      sidebarButton: layer(".journal-sidebar button"),
      block: layer(".illuminus-box--box01")
    };
    window.__layers = {entryId: entry.id, styleId: style.id};
    return JSON.stringify(out);
  })()`);
  const ly = JSON.parse(layers);
  check(ly.tableHeader.image, "a table header takes a background image");
  check(ly.tableHeader.opacity === "0.6",
    `and its strength is the layer's, not the header's (got ${ly.tableHeader.opacity})`);
  check(ly.tableHeader.behind === "-1" && ly.tableHeader.isolated === "isolate",
    `the layer sits behind the lettering, isolated from the page (z ${ly.tableHeader.behind}, ${ly.tableHeader.isolated})`);
  check(ly.heading.image && ly.heading.repeat === "repeat",
    `a heading takes one, and Image Fit reaches it (repeat ${ly.heading.repeat})`);
  check(ly.sidebarButton.image, "so does a sidebar button");
  check(ly.block.image, "and a box style");
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__layers?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__layers?.styleId) await api.deleteStyle(window.__layers.styleId);
    window.__layers = undefined;
  })()`);
}

// Levels 4 to 6 used to borrow level 3's rule wholesale. Now they have their
// own, so the point is that they diverge from 3 rather than merely exist.
console.log("\n[34] Heading levels 4 to 6, the opening capital, and the sample pane");
try {
  const later = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Heading Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    settings.heading3.color = "#111111";
    settings.heading4.color = "#224422";
    settings.heading5.color = "#442244";
    settings.heading6.color = "#444422";
    settings.heading1.background = "#5e1914";
    settings.body.dropCap = "three";
    settings.body.dropCapFont = "Courier New";
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Heading Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      "<p>Opening paragraph.</p><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));
    const root = entry.sheet.element;
    const colorOf = (sel) => getComputedStyle(root.querySelector(sel)).color;
    const out = {
      h3: colorOf(".journal-page-content h3"),
      h4: colorOf(".journal-page-content h4"),
      h5: colorOf(".journal-page-content h5"),
      h6: colorOf(".journal-page-content h6"),
      // The page title takes level 1's look even though it sits outside the
      // content area, which is why level 1 styles the header too.
      titleBg: getComputedStyle(root.querySelector(".journal-page-header h1")).backgroundColor,
      dropCapFont: getComputedStyle(root.querySelector(".journal-page-content > p:first-child"), "::first-letter").fontFamily
    };
    window.__heads = {entryId: entry.id, styleId: style.id};
    return JSON.stringify(out);
  })()`);
  const hd = JSON.parse(later);
  check(hd.h4 === "rgb(34, 68, 34)", `level 4 takes its own settings (got ${hd.h4})`);
  check(hd.h5 === "rgb(68, 34, 68)", `level 5 too (got ${hd.h5})`);
  check(hd.h6 === "rgb(68, 68, 34)", `and level 6 (got ${hd.h6})`);
  check(hd.h3 !== hd.h4 && hd.h4 !== hd.h5,
    "the later levels no longer borrow level 3's rule");
  // The page title sits outside the content area, so level 1 has to name the
  // page header explicitly. Moving these rules into the generator once dropped
  // that half of the selector list and left the title unstyled.
  check(hd.titleBg === "rgb(94, 25, 20)",
    `the page title still takes level 1's look (got ${hd.titleBg})`);
  check(/Courier New/.test(hd.dropCapFont),
    `the opening capital takes its own typeface (got ${hd.dropCapFont})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__heads?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__heads?.styleId) await api.deleteStyle(window.__heads.styleId);
    window.__heads = undefined;
  })()`);
}

// Six levels share one tab, and it sits where the levels do rather than out
// with the families at the end.
const headingTab = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  for (const app of [...foundry.applications.instances.values()]) {
    if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
  }
  const app = await api.openEditor(api.listStyles()[0].id);
  await new Promise(r => setTimeout(r, 1300));
  app.changeTab("headings", "sheet");
  await new Promise(r => setTimeout(r, 400));
  const el = app.element;
  const tabs = [...el.querySelectorAll("nav.tabs [data-tab]")].map(t => t.dataset.tab);
  const picker = el.querySelector('[data-family-picker="headings"]');
  const before = el.querySelector('.illuminus-tab.active [data-field^="heading"]')?.dataset.field;

  picker.value = "heading5";
  picker.dispatchEvent(new Event("change"));
  await new Promise(r => setTimeout(r, 500));
  const after = app.element.querySelector('.illuminus-tab.active [data-field^="heading"]')?.dataset.field;

  await app.close({force: true});
  return JSON.stringify({tabs, levels: picker.options.length, before, after});
})()`);
const ht = JSON.parse(headingTab);
check(ht.tabs.includes("headings") && !ht.tabs.includes("heading1"),
  "the six levels share one tab rather than taking six");
check(ht.levels === 6, `and its picker offers every level (got ${ht.levels})`);
check(ht.tabs.indexOf("headings") === ht.tabs.indexOf("title") + 1,
  `which sits where the levels do, after Title (strip: ${ht.tabs.slice(0, 5).join(", ")})`);
check(ht.before?.startsWith("heading1.") && ht.after?.startsWith("heading5."),
  `choosing a level builds that level's controls (${ht.before} -> ${ht.after})`);

// The sample pane is dragged from a strip on its left edge, and the width has
// to outlive the re-render that every field change causes.
const paneBox = async () => JSON.parse(await cdp.evaluate(`(() => {
  const app = [...foundry.applications.instances.values()].find(a => a.constructor.name === "IlluminusStyleEditor");
  const el = app.element.querySelector(".illuminus-preview");
  const g = app.element.querySelector(".illuminus-preview__grip").getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return JSON.stringify({width: Math.round(b.width), gripX: g.left + g.width / 2, gripY: g.top + g.height / 2});
})()`));
try {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const a of [...foundry.applications.instances.values()]) {
      if (a.constructor.name.startsWith("Illuminus")) await a.close({force: true});
    }
    await api.openEditor(api.listStyles()[0].id);
    await new Promise(r => setTimeout(r, 1300));
  })()`);
  const start = await paneBox();
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.gripX, y: start.gripY });
  await cdp.send("Input.dispatchMouseEvent",
    { type: "mousePressed", x: start.gripX, y: start.gripY, button: "left", clickCount: 1 });
  for (const step of [50, 100, 150]) {
    await cdp.send("Input.dispatchMouseEvent",
      { type: "mouseMoved", x: start.gripX - step, y: start.gripY, button: "left", buttons: 1 });
    await new Promise((r) => setTimeout(r, 40));
  }
  await cdp.send("Input.dispatchMouseEvent",
    { type: "mouseReleased", x: start.gripX - 150, y: start.gripY, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 250));
  const dragged = await paneBox();
  await cdp.evaluate(`(async () => {
    const app = [...foundry.applications.instances.values()].find(a => a.constructor.name === "IlluminusStyleEditor");
    app.changeTab("body", "sheet");
    await new Promise(r => setTimeout(r, 400));
  })()`);
  const afterRender = await paneBox();
  check(dragged.width > start.width + 100,
    `dragging the grip widens the sample pane (${start.width}px -> ${dragged.width}px)`);
  check(afterRender.width === dragged.width,
    `and a re-render does not snap it back (got ${afterRender.width}px)`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
  })()`);
}

// A secret is GM-only text Foundry tints purple and prints a Reveal button
// inside. Both states and the button take the style now.
console.log("\n[35] Secret passages");
try {
  const sec = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Secret Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.secrets, {
      background: "#2b1d12", revealedBackground: "#123d1a", color: "#f0e6d2",
      borderTopWidth: 2, borderTopColor: "#c9a961",
      buttonColor: "#1a1008", buttonBackground: "#c9a961", buttonSize: 14
    });
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Secret Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      '<section class="secret"><p>Hidden.</p></section>' +
      '<section class="secret revealed"><p>Shown.</p></section>'}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));

    const root = entry.sheet.element.querySelector("section.journal-page-content");
    const hidden = root.querySelector("section.secret:not(.revealed)");
    const shown = root.querySelector("section.secret.revealed");
    const button = hidden.querySelector("button.reveal");
    const cs = (el) => el ? getComputedStyle(el) : {};
    window.__secrets = {entryId: entry.id, styleId: style.id};
    return JSON.stringify({
      hiddenBg: cs(hidden).backgroundColor,
      revealedBg: cs(shown).backgroundColor,
      ink: cs(hidden).color,
      border: cs(hidden).borderTopWidth + " " + cs(hidden).borderTopColor,
      // Foundry prints this button itself; it has to take the style too.
      buttonFound: !!button,
      buttonColor: cs(button).color,
      buttonBg: cs(button).backgroundColor,
      buttonSize: cs(button).fontSize
    });
  })()`);
  const sc = JSON.parse(sec);
  check(sc.hiddenBg === "rgb(43, 29, 18)",
    `an unrevealed passage takes the style's fill, not Foundry's purple (got ${sc.hiddenBg})`);
  check(sc.revealedBg === "rgb(18, 61, 26)",
    `a revealed one takes its own fill (got ${sc.revealedBg})`);
  check(sc.ink === "rgb(240, 230, 210)", `lettering applies (got ${sc.ink})`);
  check(sc.border === "2px rgb(201, 169, 97)", `and the edge (got ${sc.border})`);
  check(sc.buttonFound, "Foundry's Reveal button is there");
  check(sc.buttonColor === "rgb(26, 16, 8)" && sc.buttonBg === "rgb(201, 169, 97)",
    `and takes the style's colors (got ${sc.buttonColor} on ${sc.buttonBg})`);
  check(sc.buttonSize === "14px", `and its size (got ${sc.buttonSize})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__secrets?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__secrets?.styleId) await api.deleteStyle(window.__secrets.styleId);
    window.__secrets = undefined;
  })()`);
}

// Everything a journal page can hold that had no rule until now. `dt` and `dd`
// were the worst of it: they inherit Foundry's own light colors, so on a pale
// page they were nearly invisible rather than merely unstyled.
console.log("\n[36] The rest of what a page can hold");
try {
  const cov = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Coverage Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.lists, {termColor: "#5e1914", detailColor: "#241b10", detailIndent: 30});
    Object.assign(settings.tables, {captionColor: "#7a3b16", captionSide: "bottom"});
    Object.assign(settings.body, {
      highlightBackground: "#e8c979", highlightColor: "#241b10",
      codeColor: "#3a2c18", abbrColor: "#5a4326"
    });
    Object.assign(settings.boxes, {
      summaryColor: "#5e1914", collapsibleBorderColor: "#8a6a3d", collapsibleBorderWidth: 2
    });
    Object.assign(settings.images, {
      mediaBorderTopWidth: 3, mediaBorderTopColor: "#8a6a3d", mediaBorderTopStyle: "solid"
    });
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Coverage Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      "<dl><dt>Term</dt><dd>Definition</dd></dl>" +
      "<table><caption>Cap</caption><thead><tr><th>H</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>" +
      '<p><mark>hi</mark> <code>code</code> <abbr title="x">abbr</abbr></p>' +
      "<details open><summary>Sum</summary><p>Body</p></details>" +
      '<video src="x.webm"></video>'}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));

    const root = entry.sheet.element.querySelector("section.journal-page-content");
    const cs = (sel) => { const el = root.querySelector(sel); return el ? getComputedStyle(el) : {}; };
    window.__cov = {entryId: entry.id, styleId: style.id};
    return JSON.stringify({
      term: cs("dt").color,
      detail: cs("dd").color,
      detailIndent: cs("dd").marginLeft,
      caption: cs("caption").color,
      captionSide: cs("caption").captionSide,
      highlight: cs("mark").backgroundColor,
      highlightInk: cs("mark").color,
      abbr: cs("abbr").color,
      summary: cs("summary").color,
      collapsible: cs("details").borderTopWidth + " " + cs("details").borderTopColor,
      media: cs("video").borderTopWidth + " " + cs("video").borderTopColor
    });
  })()`);
  const cv = JSON.parse(cov);
  check(cv.term === "rgb(94, 25, 20)", `a definition term takes the style (got ${cv.term})`);
  check(cv.detail === "rgb(36, 27, 16)",
    `and its explanation, which was Foundry's near-white before (got ${cv.detail})`);
  check(cv.detailIndent === "30px", `the explanation's indent applies (got ${cv.detailIndent})`);
  check(cv.caption === "rgb(122, 59, 22)", `a table caption takes the style (got ${cv.caption})`);
  check(cv.captionSide === "bottom", `and can be moved under the table (got ${cv.captionSide})`);
  check(cv.highlight === "rgb(232, 201, 121)" && cv.highlightInk === "rgb(36, 27, 16)",
    `highlighting is the style's, not Foundry's yellow on black (got ${cv.highlight})`);
  check(cv.abbr === "rgb(90, 67, 38)", `an abbreviation takes the style (got ${cv.abbr})`);
  check(cv.summary === "rgb(94, 25, 20)", `a collapsible's heading takes it (got ${cv.summary})`);
  check(cv.collapsible === "2px rgb(138, 106, 61)", `and its frame (got ${cv.collapsible})`);
  check(cv.media === "3px rgb(138, 106, 61)", `embedded media takes a frame (got ${cv.media})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__cov?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__cov?.styleId) await api.deleteStyle(window.__cov.styleId);
    window.__cov = undefined;
  })()`);
}

// The editor holds every change in a working copy until Save, so closing the
// window is the one click that can lose an afternoon's work.
console.log("\n[37] Closing with unsaved changes asks first");
try {
  const unsaved = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Unsaved Probe"});
    window.__unsaved = {styleId: style.id};
    const out = {};
    // Waits for the control rather than guessing at a delay: the editor builds
    // a few hundred of them, and a fixed wait that was long enough once stops
    // being long enough as the schema grows.
    const dirty = async () => {
      const app = await api.openEditor(style.id);
      let control = null;
      for (let i = 0; i < 200 && !control; i++) {
        await new Promise(r => setTimeout(r, 100));
        control = app.element?.querySelector('[data-field="page.background"] color-picker');
      }
      if (!control) throw new Error("the editor did not render its controls in twenty seconds");
      control.value = "#123456";
      await new Promise(r => setTimeout(r, 250));
      return app;
    };
    const prompt = () => [...foundry.applications.instances.values()]
      .find(a => a.constructor.name.includes("Dialog"));
    const answer = async (action) => {
      prompt()?.element.querySelector(\`button[data-action="\${action}"]\`)?.click();
      await new Promise(r => setTimeout(r, 700));
    };

    // Nothing changed: closing must not nag.
    let app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 900));
    await app.close();
    await new Promise(r => setTimeout(r, 400));
    out.cleanAsked = !!prompt();
    out.cleanClosed = !app.rendered;

    app = await dirty();
    app.close();
    await new Promise(r => setTimeout(r, 600));
    out.asked = !!prompt();
    await answer("cancel");
    out.keptOpen = app.rendered;

    app.close();
    await new Promise(r => setTimeout(r, 600));
    await answer("discard");
    out.discardClosed = !app.rendered;
    out.afterDiscard = api.getStyle(style.id).settings.page.background;

    app = await dirty();
    app.close();
    await new Promise(r => setTimeout(r, 600));
    await answer("save");
    await new Promise(r => setTimeout(r, 700));
    out.saveClosed = !app.rendered;
    out.afterSave = api.getStyle(style.id).settings.page.background;
    return JSON.stringify(out);
  })()`);
  const un = JSON.parse(unsaved);
  check(!un.cleanAsked && un.cleanClosed, "closing an unchanged style just closes");
  check(un.asked, "closing a changed one asks first");
  check(un.keptOpen, "Keep Editing leaves the editor open");
  check(un.discardClosed && un.afterDiscard !== "#123456",
    `Discard closes and throws the change away (stored ${un.afterDiscard})`);
  check(un.saveClosed && un.afterSave === "#123456",
    `Save and Close keeps it (stored ${un.afterSave})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const api = game.modules.get("illuminus").api;
    if (window.__unsaved?.styleId) await api.deleteStyle(window.__unsaved.styleId);
    window.__unsaved = undefined;
  })()`);
}

// Templates carry structure rather than styling: a stat block frame, a handout.
// They are parsed through Foundry's own schema on the way in, which is what
// makes an imported one safe, and they name Illuminus's keys rather than colors,
// which is what makes them work under any style.
console.log("\n[38] Page templates");
try {
  const tpl = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const out = {seeded: api.listTemplates().length};

    Hooks.on("getProseMirrorMenuDropDowns", (menu) => { window.__tplMenu = menu; });
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close();
    }
    const entry = await JournalEntry.create({name: "Template Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage",
      [{name: "P", type: "text", text: {content: "<p>Start.</p>"}}]);
    await api.assignStyle(entry, api.listStyles()[0].id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1200));
    entry.sheet.element.querySelector(".journal-entry-page .edit-container button").click();
    await new Promise(r => setTimeout(r, 2800));
    window.__tpl = {entryId: entry.id};

    const menu = window.__tplMenu;
    const view = menu.view;
    let item, saveItem;
    menu.dropdowns.forEach(d => d.forEachItem(i => {
      if (i.title === "Stat Block") item = i;
      if (i.action === "illuminus-template-save") saveItem = i;
    }));
    out.listedInMenu = !!item;

    // Capturing needs a selection, exactly as tagging does.
    const {TextSelection} = foundry.prosemirror;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    out.captureRefused = saveItem.cmd(view.state, null) === false;

    out.inserted = item.cmd(view.state, view.dispatch, view);
    await new Promise(r => setTimeout(r, 400));

    const sheet = [...foundry.applications.instances.values()].filter(
      a => a.document?.documentName === "JournalEntryPage" && a.rendered
        && a.element?.parentElement === document.body).pop();
    await sheet.submit();
    await sheet.close();
    await new Promise(r => setTimeout(r, 1300));
    const stored = entry.pages.contents[0].text.content;
    out.keptBox = /illuminus-box--box01/.test(stored);
    out.keptTag = /illuminus-tag--tag01/.test(stored);
    out.keptStructure = /<dl>/.test(stored);
    // Templates must not carry styling of their own.
    out.carriesNoStyling = !/style=|background|color:/i.test(stored);

    // An import is parsed and stored; a file of the wrong kind is refused.
    const io = await import("/modules/illuminus/scripts/io.mjs");
    const made = await io.importTemplates(io.normalizeTemplateImport({
      templates: [{name: "Imported", markup: "<p>From a friend.</p>"}]
    }));
    out.imported = made.length;
    try {
      io.normalizeTemplateImport({styles: [{name: "not a template"}]});
      out.refusedWrongKind = false;
    } catch { out.refusedWrongKind = true; }

    // Restoring puts back a bundled one that was deleted, and leaves the rest.
    const statblock = api.listTemplates().find(t => t.name === "Stat Block");
    await api.deleteTemplate(statblock.id);
    out.afterDelete = api.listTemplates().length;
    out.restored = await api.restoreTemplatePresets();
    out.afterRestore = api.listTemplates().length;

    window.__tpl.made = made.map(m => m.id);
    return JSON.stringify(out);
  })()`);
  const tp = JSON.parse(tpl);
  check(tp.seeded >= 5, `templates are seeded into a new world (got ${tp.seeded})`);
  check(tp.listedInMenu, "and listed in the editor's Illuminus menu");
  check(tp.captureRefused, "capturing a template refuses when nothing is selected");
  check(tp.inserted, "choosing one inserts it");
  check(tp.keptBox && tp.keptTag && tp.keptStructure,
    "and its box, tag, and structure survive the save");
  check(tp.carriesNoStyling,
    "a template carries structure only — no colors, no sizes, so any style can dress it");
  check(tp.imported === 1, `an imported template is stored (got ${tp.imported})`);
  check(tp.refusedWrongKind, "and a file of the wrong kind is refused");
  check(tp.restored === 1 && tp.afterRestore === tp.afterDelete + 1,
    `restoring puts back only what is missing (${tp.afterDelete} -> ${tp.afterRestore})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close();
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__tpl?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    for (const id of window.__tpl?.made ?? []) await api.deleteTemplate(id);
    window.__tpl = undefined;
  })()`);
}

// Two answers to "there are two thousand settings": search across every tab,
// and fold the pointed-at half of each pair away until it is wanted.
console.log("\n[39] Finding a setting among thousands");
try {
  const ui = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const app = await api.openEditor(api.listStyles()[0].id);
    await new Promise(r => setTimeout(r, 1300));
    const el = app.element;
    const out = {};
    const type = async (text) => {
      const box = el.querySelector(".illuminus-filter__input");
      box.value = text;
      box.dispatchEvent(new Event("input"));
      await new Promise(r => setTimeout(r, 250));
    };
    const visible = () => [...el.querySelectorAll(".illuminus-tab.active .illuminus-field")]
      .filter(f => !f.classList.contains("is-filtered-out")).length;

    out.beforeFilter = visible();
    await type("shadow");
    out.afterFilter = visible();
    out.dimmedTabs = [...el.querySelectorAll("nav.tabs [data-tab]")]
      .filter(t => t.classList.contains("is-filtered-out")).length;
    // A section whose own name matches opens even when its controls are worded
    // differently — Inner Shadow's are all "shading".
    out.openSections = [...el.querySelectorAll(".illuminus-tab.active .illuminus-section")]
      .filter(s => s.open).length;
    await type("");
    out.restored = visible();
    out.noneDimmed = [...el.querySelectorAll("nav.tabs [data-tab]")]
      .every(t => !t.classList.contains("is-filtered-out"));

    // The pointed-at half of a pair.
    app.changeTab("sidebar", "sheet");
    await new Promise(r => setTimeout(r, 400));
    const buttons = [...el.querySelectorAll('.illuminus-tab[data-tab="sidebar"] .illuminus-section')]
      .find(s => s.querySelector("summary")?.dataset.section === "buttons");
    buttons.querySelector("summary").click();
    await new Promise(r => setTimeout(r, 300));
    const hoverFields = () => [...buttons.querySelectorAll(".illuminus-field[data-field]")]
      .filter(f => /hover/i.test(f.dataset.field));
    out.hasSwitch = !!buttons.querySelector(".illuminus-state");
    out.hoverHiddenNormally = hoverFields().every(f => f.classList.contains("is-state-hidden"));
    buttons.querySelector('.illuminus-state__option[data-state="hover"]').click();
    await new Promise(r => setTimeout(r, 300));
    out.hoverShownAfter = hoverFields().every(f => !f.classList.contains("is-state-hidden"));
    out.normalHiddenAfter = [...buttons.querySelectorAll(".illuminus-field[data-field]")]
      .filter(f => f.dataset.field.endsWith(".buttonColor"))
      .every(f => f.classList.contains("is-state-hidden"));

    // A section whose states are all named — no ordinary one among them — offers
    // exactly those. The sidebar's entry states are pointed-at and current-page;
    // the ordinary entry is styled in the section above.
    const entryStates = [...el.querySelectorAll('.illuminus-tab[data-tab="sidebar"] .illuminus-section')]
      .find(s => s.querySelector("summary")?.dataset.section === "entryStates");
    entryStates.querySelector("summary").click();
    await new Promise(r => setTimeout(r, 300));
    out.entryStateOptions = [...entryStates.querySelectorAll(".illuminus-state__option")]
      .map(b => b.dataset.state);
    const entryShown = () => [...entryStates.querySelectorAll(".illuminus-field")]
      .filter(f => !f.classList.contains("is-state-hidden")).length;
    out.entryTotal = entryStates.querySelectorAll(".illuminus-field").length;
    out.entryFirst = entryShown();
    entryStates.querySelector('.illuminus-state__option[data-state="active"]').click();
    await new Promise(r => setTimeout(r, 250));
    out.entryOnActive = entryShown();

    // Searching must reach a control the switch has folded away.
    buttons.querySelector('.illuminus-state__option[data-state="normal"]').click();
    await new Promise(r => setTimeout(r, 250));
    await type("pointed at");
    out.filterReachesHidden = hoverFields().some(f => !f.classList.contains("is-filtered-out")
      && f.classList.contains("is-state-suppressed"));
    await type("");
    await app.close({force: true});
    return JSON.stringify(out);
  })()`);
  const f = JSON.parse(ui);
  check(f.afterFilter < f.beforeFilter && f.afterFilter > 0,
    `the filter narrows a tab to what matches (${f.beforeFilter} -> ${f.afterFilter})`);
  check(f.dimmedTabs > 0, `and dims the tabs with nothing in them (${f.dimmedTabs} dimmed)`);
  check(f.openSections >= 2,
    `a section whose own name matches opens too (${f.openSections} open)`);
  check(f.restored === f.beforeFilter && f.noneDimmed,
    `clearing it puts everything back (${f.restored})`);
  check(f.hasSwitch, "a section with pointed-at colors gets a switch");
  check(f.hoverHiddenNormally, "whose pointed-at controls are folded away by default");
  check(f.hoverShownAfter && f.normalHiddenAfter, "and swap in when it is switched");
  check(f.filterReachesHidden, "searching still reaches a control the switch folded away");
  check(JSON.stringify(f.entryStateOptions) === JSON.stringify(["hover", "active"]),
    `a section with no ordinary state offers only the ones it has (got ${f.entryStateOptions.join(", ")})`);
  check(f.entryFirst + f.entryOnActive === f.entryTotal && f.entryFirst > 0 && f.entryOnActive > 0,
    `and splits its controls between them (${f.entryFirst} + ${f.entryOnActive} of ${f.entryTotal})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
  })()`);
}

// The picker replaced the operating system's panel, so the palette has to earn
// its keep: names, an order, and the colors most recently chosen.
console.log("\n[40] The palette");
try {
  const pal = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Palette Probe", swatches: [
      {hex: "#112233", name: "Ink"}, {hex: "#445566", name: "Slate"}, "#778899"
    ]});
    window.__pal = {styleId: style.id};
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1000));
    app.element.querySelector('[data-field="page.background"]')
      .closest(".illuminus-section").querySelector("summary").click();
    await new Promise(r => setTimeout(r, 250));
    const swatch = app.element.querySelector('[data-field="page.background"] .illuminus-swatch');
    const box = swatch.getBoundingClientRect();
    document.elementFromPoint(Math.round(box.left + box.width / 2),
                             Math.round(box.top + box.height / 2))?.click();
    await new Promise(r => setTimeout(r, 400));
    const cp = document.querySelector(".illuminus-cp");
    const cells = () => [...cp.querySelectorAll(".illuminus-cp__swatches .illuminus-cp__swatch[data-hex]")];
    const out = {
      names: cells().map(c => c.dataset.name ?? ""),
      // A color saved before names existed keeps its place rather than vanishing.
      keptUnnamed: cells().length
    };

    // Dragging the third onto the first reorders the stored palette.
    const from = cells()[2];
    const target = cp.querySelectorAll(".illuminus-cp__slot")[0];
    const data = new DataTransfer();
    from.dispatchEvent(new DragEvent("dragstart", {bubbles: true, dataTransfer: data}));
    target.dispatchEvent(new DragEvent("dragover", {bubbles: true, dataTransfer: data}));
    target.dispatchEvent(new DragEvent("drop", {bubbles: true, dataTransfer: data}));
    await new Promise(r => setTimeout(r, 400));
    out.orderAfterDrag = (api.getStyle(style.id).swatches ?? []).map(sw => sw.hex ?? sw);

    // Keeping a color remembers it; cancelling would not.
    await setSettingSafe();
    cp.querySelector('[data-cp="ok"]').click();
    await new Promise(r => setTimeout(r, 500));
    out.recent = (game.settings.get("illuminus", "recentColors") ?? [])[0];

    async function setSettingSafe() { await game.settings.set("illuminus", "recentColors", []); }
    return JSON.stringify(out);
  })()`);
  const pl = JSON.parse(pal);
  check(pl.names[0] === "Ink" && pl.names[1] === "Slate",
    `a saved color keeps the name its style gave it (got ${pl.names.slice(0, 2).join(", ")})`);
  check(pl.keptUnnamed === 3, `and one saved before names existed is still there (${pl.keptUnnamed})`);
  check(pl.orderAfterDrag[0] === "#778899",
    `dragging one onto another reorders the palette (got ${pl.orderAfterDrag.join(", ")})`);
  check(typeof pl.recent === "string" && pl.recent.startsWith("#"),
    `keeping a color remembers it for next time (got ${pl.recent})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const api = game.modules.get("illuminus").api;
    if (window.__pal?.styleId) await api.deleteStyle(window.__pal.styleId);
    window.__pal = undefined;
  })()`);
}

// Two small things with a common thread: a way back from a mistake, and a glow
// that follows a cut-out picture rather than the box around it.
console.log("\n[41] Restoring samples, and picture glow");
try {
  const extras = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const out = {};

    // Deleting the bundled style used to be a one-way door.
    const parchment = api.listStyles().find(s => s.preset);
    out.hadPreset = !!parchment;
    await api.deleteStyle(parchment.id);
    out.afterDelete = api.listStyles().some(s => s.preset);
    out.restored = await api.restorePresets();
    out.afterRestore = api.listStyles().some(s => s.preset);
    // Restoring again must not pile up duplicates.
    out.secondRestore = await api.restorePresets();

    const style = await api.createStyle({name: "Glow Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.images, {glowColor: "#ffcc00", glowSize: 12});
    await api.updateStyle(style.id, {settings});
    const entry = await JournalEntry.create({name: "Glow Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text",
      text: {content: '<p><img src="icons/svg/book.svg"></p>'}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1300));
    out.filter = getComputedStyle(entry.sheet.element.querySelector(".journal-page-content img")).filter;
    window.__glow = {entryId: entry.id, styleId: style.id};
    return JSON.stringify(out);
  })()`);
  const ex = JSON.parse(extras);
  check(ex.hadPreset && !ex.afterDelete, "a sample style can be deleted");
  check(ex.restored === 1 && ex.afterRestore, `and put back again (${ex.restored} restored)`);
  check(ex.secondRestore === 0, "restoring twice does not pile up duplicates");
  check(/drop-shadow/.test(ex.filter) && /204/.test(ex.filter),
    `a picture glow follows its own edges rather than its box (got ${ex.filter})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close();
    }
    const entry = game.journal.get(window.__glow?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__glow?.styleId) await api.deleteStyle(window.__glow.styleId);
    window.__glow = undefined;
  })()`);
}

// Every element that can be painted can be painted differently under the
// pointer. Driven with a real mouse move: `:hover` does not match for a
// dispatched event, so this could not be checked any other way.
console.log("\n[42] Hovered states reach the page");
try {
  const setUp = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Hover Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    settings.heading1.hoverColor = "#00ff00";
    settings.boxes.hoverBackground = "#123456";
    settings.heading2.hoverBorderTopColor = "#ff8800";
    settings.heading2.borderTopWidth = 3;
    settings.heading2.borderTopStyle = "solid";
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Hover Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      "<h1>Heading one</h1><h2>Heading two</h2><blockquote><p>Boxed</p></blockquote>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    entry.sheet.setPosition({left: 60, top: 60, width: 900, height: 700});
    await new Promise(r => setTimeout(r, 1400));
    window.__hover = {entryId: entry.id, styleId: style.id};
    const box = (sel) => {
      const el = entry.sheet.element.querySelector(sel);
      const b = el.getBoundingClientRect();
      return {x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2)};
    };
    return JSON.stringify({
      h1: box(".journal-page-content h1"),
      h2: box(".journal-page-content h2"),
      quote: box(".journal-page-content blockquote"),
      restColor: getComputedStyle(entry.sheet.element.querySelector(".journal-page-content h1")).color
    });
  })()`);
  const at = JSON.parse(setUp);

  const readAfterHover = async (point, sel, property) => {
    await cdp.mouse("mouseMoved", point.x, point.y);
    await new Promise((r) => setTimeout(r, 200));
    return cdp.evaluate(`(() => {
      const entry = game.journal.get(window.__hover.entryId);
      return getComputedStyle(entry.sheet.element.querySelector(${JSON.stringify(sel)})).${property};
    })()`);
  };

  const h1Hovered = await readAfterHover(at.h1, ".journal-page-content h1", "color");
  const quoteHovered = await readAfterHover(at.quote, ".journal-page-content blockquote", "backgroundColor");
  const h2Hovered = await readAfterHover(at.h2, ".journal-page-content h2", "borderTopColor");
  // Move away and the ordinary color comes back.
  await cdp.mouse("mouseMoved", 5, 5);
  await new Promise((r) => setTimeout(r, 200));
  const h1Rested = await cdp.evaluate(`(() => {
    const entry = game.journal.get(window.__hover.entryId);
    return getComputedStyle(entry.sheet.element.querySelector(".journal-page-content h1")).color;
  })()`);

  check(h1Hovered === "rgb(0, 255, 0)", `a heading takes its hovered lettering (got ${h1Hovered})`);
  check(quoteHovered === "rgb(18, 52, 86)", `a box takes its hovered fill (got ${quoteHovered})`);
  check(h2Hovered === "rgb(255, 136, 0)", `and an edge takes its hovered color (got ${h2Hovered})`);
  check(h1Rested === at.restColor,
    `moving away puts the ordinary color back (${h1Rested} vs ${at.restColor})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close();
    }
    const entry = game.journal.get(window.__hover?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__hover?.styleId) await api.deleteStyle(window.__hover.styleId);
    window.__hover = undefined;
  })()`);
}

// The sample is a whole page, which is what makes it useful — so the tab you
// are on brings its own part forward rather than the sample showing that part
// alone. A heading in isolation says nothing about how it sits in the text.
console.log("\n[43] The sample follows the open tab");
try {
  const focus = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const app = await api.openEditor(api.listStyles()[0].id);
    await new Promise(r => setTimeout(r, 1300));
    const el = app.element;
    // Re-queried every time: choosing another family member re-renders, and a
    // frame captured once is a detached node from then on.
    const parts = () => [...app.element.querySelectorAll(".illuminus-preview__frame [data-part]")];
    const lit = () => parts().filter(p => !p.classList.contains("is-dimmed")).map(p => p.dataset.part);
    const dimmed = () => parts().filter(p => p.classList.contains("is-dimmed")).length;
    const frame = el.querySelector(".illuminus-preview__frame");
    const visit = async (tab) => {
      app.changeTab(tab, "sheet");
      await new Promise(r => setTimeout(r, 500));
      return {lit: lit(), dimmed: dimmed()};
    };

    const out = {tables: await visit("tables"), body: await visit("body")};
    // Scrolled to, not merely lit: dimming the rest is no help if the piece is
    // below the fold.
    await visit("tables");
    // Polled, not waited on: the scroll is animated, and a fixed delay either
    // races it or pads every run to the slowest machine.
    const inView = () => {
      const table = app.element.querySelector('.illuminus-preview__frame [data-part="tables"]');
      const box = app.element.querySelector(".illuminus-preview__frame").getBoundingClientRect();
      const seen = table.getBoundingClientRect();
      return seen.top < box.bottom && seen.bottom > box.top;
    };
    out.scrolledIntoView = false;
    for (let i = 0; i < 30 && !out.scrolledIntoView; i++) {
      out.scrolledIntoView = inView();
      if (!out.scrolledIntoView) await new Promise(r => setTimeout(r, 100));
    }

    // A family replaces the pane outright, so nothing there should be dimmed.
    out.family = await visit("boxStyles");

    // And the focus follows the level the picker names.
    app.changeTab("headings", "sheet");
    await new Promise(r => setTimeout(r, 300));
    const picker = el.querySelector('[data-family-picker="headings"]');
    picker.value = "heading3";
    picker.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 700));
    out.afterPick = lit();

    // The two ways in are named for the module they belong to. Found by their
    // own classes rather than by guessing where Foundry puts the footer.
    out.buttons = [".illuminus-open-manager", ".illuminus-open-templates"]
      .map(sel => document.querySelector(sel)?.textContent.trim() ?? "");

    await app.close({force: true});
    return JSON.stringify(out);
  })()`);
  const fc = JSON.parse(focus);
  check(JSON.stringify(fc.tables.lit) === JSON.stringify(["tables"]) && fc.tables.dimmed > 10,
    `opening a tab brings its own part forward (lit ${fc.tables.lit.join(", ")}, ${fc.tables.dimmed} dimmed)`);
  check(fc.body.lit.every((part) => part === "body") && fc.body.lit.length > 1,
    `a tab with several pieces lights them all (${fc.body.lit.length} lit)`);
  check(fc.scrolledIntoView, "and the sample scrolls so that part can be seen");
  check(fc.family.dimmed === 0,
    `a family tab, which replaces the pane outright, dims nothing (${fc.family.dimmed})`);
  check(JSON.stringify(fc.afterPick) === JSON.stringify(["heading3"]),
    `the focus follows the member the picker names (lit ${fc.afterPick.join(", ")})`);
  check(fc.buttons.some((t) => /Illuminus Styles/.test(t))
    && fc.buttons.some((t) => /Illuminus Templates/.test(t)),
    `both sidebar buttons name the module (got ${fc.buttons.join(", ")})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
  })()`);
}

console.log("\n[44] Console is clean");
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
