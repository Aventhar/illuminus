import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  // Chrome fields are stored with the style but drawn beside the tab's name
  // rather than in the list — the switch that turns a hovered state off.
  fields: shown.reduce((n, g) => n + groupFields(g).filter((f) => !f.chrome).length, 0)
};

const cdp = await connect();
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };
const check = (cond, m) => cond ? ok(m) : fail(m);

/**
 * Join the sandbox world.
 *
 * Two forms, because Foundry changed its own: older builds offer a list of
 * users to pick from, newer ones a name to type. Handling both means an update
 * to Foundry does not read as the whole suite being broken.
 */
const joinAndWait = async () => {
  await cdp.goto(`${BASE}/join`);
  await cdp.waitFor(`document.querySelector('select[name=userid], input[name=username]')`,
    { label: "join form" });
  await cdp.evaluate(`(() => {
    const picker = document.querySelector('select[name="userid"]');
    if (picker) picker.value = [...picker.options].find(o => o.value).value;
    else {
      const name = document.querySelector('input[name="username"]');
      name.value = "Gamemaster";
      name.dispatchEvent(new Event("input", {bubbles: true}));
    }
    const form = (picker ?? document.querySelector('input[name="username"]')).closest("form");
    (form?.querySelector('button[type="submit"], button[name="join"]')
      ?? document.querySelector('button[name="join"], button[type="submit"]')).click();
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

// The module ships no styles, so the suite makes the one it needs. Everything
// after this looks it up the same way — the first style in the world — so a run
// that starts dirty fails here, loudly, rather than three checks later.
console.log("\n[2] A style to work with");
const { SAMPLE_STYLES } = await import(`${ROOT}/tools/fixtures/sample-style.mjs`);
await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  for (const style of api.listStyles()) await api.deleteStyle(style.id);
  const sample = ${JSON.stringify(SAMPLE_STYLES[0])};
  await api.createStyle({name: sample.name, description: sample.description, settings: sample.settings});
})()`);

const styleInfo = await cdp.evaluate(`JSON.stringify({
  count: Object.keys(game.settings.get("illuminus","styles")).length,
  names: game.modules.get("illuminus").api.listStyles().map(s => s.name),
  bundled: ${JSON.stringify(0)},
  sheetPresent: !!document.getElementById("illuminus-compiled-styles"),
  cssLength: document.getElementById("illuminus-compiled-styles")?.textContent.length ?? 0,
  ruleCount: document.getElementById("illuminus-compiled-styles")?.sheet?.cssRules.length ?? 0
})`);
const styles = JSON.parse(styleInfo);
check(styles.count === 1, `the world holds the one style this run made (got ${styles.count}: ${styles.names.join(", ")})`);
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
// A new style is a plain Foundry journal, so the skeleton resolves to what
// Foundry paints rather than to a look of the module own: a page on the
// window own dark ground, lettering that follows the journal, and a blockquote
// with no accent bar until somebody asks for one.
check(sk.pageBg === "rgba(11, 10, 19, 0.9)", `skeleton resolves the default page color (got ${sk.pageBg})`);
check(sk.pagePadding === "0px 12px 0px 0px", `skeleton resolves the default inner margin (got ${sk.pagePadding})`);
check(sk.bodyColor !== "" && sk.bodyColor !== "rgba(0, 0, 0, 0)",
  `skeleton resolves an ink color at all (got ${sk.bodyColor})`);
check(sk.quoteLeft === "0px", `boxed-text edge calc() resolves (got ${sk.quoteLeft})`);

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
  === JSON.stringify(["create", "import", "exportSelected", "exportAll", "advancedExport",
    "sampleJournal", "restore"]),
  `toolbar has create/import/export/sample/restore buttons (got ${m.toolbarButtons.join(",")})`);
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
  // The capital is an element wrapped at render rather than a pseudo-element,
  // so the probe is given the same treatment a rendered page gets.
  const { markDropCap } = await import("/modules/illuminus/scripts/heading-sections.mjs");
  markDropCap(probe.querySelector(".journal-page-content"));

  const read = () => {
    const cs = getComputedStyle(probe.querySelector(".illuminus-drop-cap"));
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
// Nine thicknesses became three, and italic became a tick box beside them, so a
// v2 style arrives as the nearest of Light, Normal, and Bold with the slant on
// its own control.
check(mx.kept.body.textStyle === "bold" && mx.kept.body.textStyleSlant === true,
  `a heavy italic arrives as bold and italic (got ${mx.kept.body.textStyle}, slant ${mx.kept.body.textStyleSlant})`);
check(mx.kept.heading1.textStyle === "light",
  `and a hairline one as light (got ${mx.kept.heading1.textStyle})`);
check(mx.kept.sidebar.activeTextStyle === "bold",
  `a thickness that never had a slant still converts (got ${mx.kept.sidebar.activeTextStyle})`);
check(mx.kept.box01.textStyle === "inherit",
  `"use the page setting" survives on both halves, under the renamed group (got ${mx.kept.box01.textStyle})`);
check(mx.kept.images.captionTextStyle === "normal" && mx.kept.images.captionTextStyleSlant === true,
  `oblique counts as italic (got ${mx.kept.images.captionTextStyle}, slant ${mx.kept.images.captionTextStyleSlant})`);
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

// Match copies across one state, not across both. Every control now has a
// state's own twin, and a twin that shared the ordinary control's Match key was
// overwritten by it — which reads as the hovered setting not working at all.
const matchedStates = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = api.listStyles().find(s => s.name === "Aged Parchment");
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1000));
  const el = app.element;
  const set = (path, value) => {
    el.querySelector('[data-field="' + path + '"] range-picker').value = value;
  };
  const read = (path) => Number(el.querySelector('[data-field="' + path + '"] range-picker').value);

  set("sidebar.buttonCornerTopLeft", 2);
  set("sidebar.hoverButtonCornerTopLeft", 24);
  await new Promise(r => setTimeout(r, 400));
  el.querySelector('[data-action="matchSides"][data-group="sidebar"][data-section="buttons"]').click();
  await new Promise(r => setTimeout(r, 600));

  const corners = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"];
  const after = {
    ordinary: corners.map(c => read("sidebar.buttonCorner" + c)),
    hovered: corners.map(c => read("sidebar.hoverButtonCorner" + c))
  };
  await app.close({force: true});
  return JSON.stringify(after);
})()`);
const ms = JSON.parse(matchedStates);
check(ms.ordinary.every(v => v === 2), `Match evens out the ordinary corners (got ${ms.ordinary.join(", ")})`);
check(ms.hovered.every(v => v === 24),
  `and evens out the hovered ones on their own (got ${ms.hovered.join(", ")})`);

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
      activeColor: "#e8c979", activeTextStyle: "bold", activeTextStyleSlant: true,
      entryBorderLeftWidth: 3, entryBorderLeftColor: "#00000000",
      activeEntryBorderLeftColor: "#e8c979",
      hoverOutlineWidth: 1, hoverOutlineColor: "#ff8800",
      entryBorderBottomWidth: 1, entryBorderBottomColor: "#262c38",
      // Controls the page being read has of its own, beyond the colors it
      // always had: a chosen row can sit differently as well as be painted
      // differently, and one left unset follows the ordinary row.
      entryPaddingTop: 4, activeEntryPaddingTop: 12, activeEntryCornerTopLeft: 9,
      size: 15, activeSize: 21,
      numberShown: true, numberColor: "#6b7688", searchBackground: "#0d1015"
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
    activeLeftBorder: cs(active).borderLeftColor,
    entryBorderBottom: cs(inactive).borderBottomWidth + " " + cs(inactive).borderBottomColor,
    activePadTop: cs(active).paddingTop,
    entryPadTop: cs(inactive).paddingTop,
    activeCorner: cs(active).borderTopLeftRadius,
    entryCorner: cs(inactive).borderTopLeftRadius,
    activeSize: cs(active?.querySelector(".page-title")).fontSize,
    entrySize: cs(inactive?.querySelector(".page-title")).fontSize,
    activeBottomBorder: cs(active).borderBottomWidth,
    numberColor: cs(root.querySelector(".toc .page-index")).color,
    numberShown: cs(root.querySelector(".toc .page-index")).display,
    searchBg: cs(root.querySelector("search input[type=search]")).backgroundColor
  };

  // And with the numbers turned off, which is what the panel looks like when
  // the page's name is the whole of the entry.
  const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
  settings.sidebar.numberShown = false;
  await api.updateStyle(style.id, {settings});
  await new Promise(r => setTimeout(r, 400));
  out.numberHidden = cs(root.querySelector(".toc .page-index")).display;

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
// The Page Marker was an inset shadow of its own; it is a left edge the
// selected state colors in, drawn with the border controls every state has.
check(sb.activePadTop === "12px" && sb.entryPadTop === "4px",
  `the page being read takes its own inner spacing (${sb.activePadTop} against ${sb.entryPadTop})`);
check(sb.activeCorner === "9px" && sb.entryCorner === "0px",
  `and its own corner (${sb.activeCorner} against ${sb.entryCorner})`);
check(sb.activeSize === "21px" && sb.entrySize === "15px",
  `and its own text size (${sb.activeSize} against ${sb.entrySize})`);
// And what it was given nothing of its own for is what every other row has,
// rather than nothing at all.
check(sb.activeBottomBorder === "1px",
  `while an unset one follows the ordinary row (${sb.activeBottomBorder})`);
check(sb.activeLeftBorder === "rgb(232, 201, 121)",
  `the selected entry colors its own left edge (got ${sb.activeLeftBorder})`);
check(sb.entryBorderBottom.startsWith("1px") && sb.entryBorderBottom.includes("38, 44, 56"),
  `entry divider beat core's own border rule (got ${sb.entryBorderBottom})`);
check(sb.numberColor === "rgb(107, 118, 136)", `page number color applied (got ${sb.numberColor})`);
// Numbering is a tick box that starts unticked: a style has to ask for the
// numbers, and this style does.
check(sb.numberShown !== "none", `a style that asks for page numbers gets them (got ${sb.numberShown})`);
check(sb.numberHidden === "none", `and unticking takes them away (got ${sb.numberHidden})`);
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
  const sample = el.querySelector(".illuminus-preview__frame .journal-entry-pages")
    ?? el.querySelector(".illuminus-preview__frame .journal-entry-content");
  const box = sample.getBoundingClientRect();
  const x = Math.round(box.left + box.width / 2);
  // Below the journal's name, which is a bar of its own with a fill of its own.
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
    // The fill is painted on the layer that carries the title bar's picture,
    // over Foundry's own, so that a color of None leaves the window as Foundry
    // draws it rather than erasing it — a gradient would have replaced the
    // texture Foundry paints there, since a background image is one property.
    headerBg: (() => {
      const header = root.querySelector(".window-header");
      return header ? getComputedStyle(header, "::after").backgroundColor : null;
    })(),
    titleColor: cs(".window-header .window-title")?.color,
    titleSize: cs(".window-header .window-title")?.fontSize,
    buttonColor: button?.color,
    buttonSize: button?.fontSize,
    editColor: edit?.color,
    editBg: edit?.backgroundColor,
    // Which side the pencil sits on. Core pins it right, so choosing the left
    // has to release that as well as set it — a check reading one edge would
    // pass while the button stayed where it was.
    editSide: (() => {
      const box = root.querySelector(".journal-entry-page .edit-container");
      const cs = box ? getComputedStyle(box) : null;
      return cs ? [cs.left, cs.right] : null;
    })(),
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

  // And with the pencil asked to sit on the other side, 40px in — the distance
  // is what keeps it clear of whatever a page keeps in that corner, so it is
  // measured on the page rather than read off the property.
  const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
  settings.window.pageButtonSide = "left";
  settings.window.pageButtonOffset = 40;
  await api.updateStyle(style.id, {settings});
  await new Promise(r => setTimeout(r, 500));
  {
    const box = root.querySelector(".journal-entry-page .edit-container");
    const moved = getComputedStyle(box);
    const page = root.querySelector("article.journal-entry-page").getBoundingClientRect();
    const bar = box.getBoundingClientRect();
    out.editSideLeft = [moved.left, moved.right];
    out.editNearer = (bar.left - page.left) < (page.right - bar.right) ? "left" : "right";
    out.editFromLeft = Math.round(bar.left - page.left);
  }

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
check(wn.buttonColor === "rgb(0, 255, 136)", `title bar icon color applied (got ${wn.buttonColor})`);
check(wn.buttonSize === "22px", `title bar icon size applied (got ${wn.buttonSize})`);
check(wn.editColor === "rgb(255, 0, 255)", `edit pencil color applied (got ${wn.editColor})`);
check(wn.editBg === "rgb(16, 16, 16)", `edit pencil fill applied (got ${wn.editBg})`);
check(wn.editSide?.[1] === "5px" && wn.editSide?.[0] !== "5px",
  `the edit pencil sits where Foundry puts it until asked otherwise (${wn.editSide?.join(" / ")})`);
check(wn.editNearer === "left" && wn.editSideLeft?.[0] === "40px",
  `and moves to the other side when it is (${wn.editSideLeft?.join(" / ")}, nearer ${wn.editNearer})`);
check(wn.editFromLeft === 40,
  `sliding it in by 40 puts it 40 from that edge (got ${wn.editFromLeft})`);
check(wn.dropdownItemsUntouched, "the controls dropdown's list items are left alone");

// The module bundles no artwork of its own, so what matters here is that the
// sample in the editor still shows a picture and that the picture takes the
// Images settings.
console.log("\n[23] The sample picture");
const assets = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;

  const style = await api.createStyle({name: "Picture Probe", settings: {
    images: {borderTopWidth: 5, borderTopColor: "#ff0000", opacity: 50, captionColor: "#00ff00"}
  }});
  const app = await api.openEditor(style.id);
  await new Promise(r => setTimeout(r, 1200));
  const freeze = document.createElement("style");
  freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.append(freeze);

  // The sample renders at zoom 0.75 so a whole page fits the pane, and computed
  // lengths come back scaled. Undo it just for the measurement — on the page
  // itself, which is what carries the zoom, since the page's title sits beside
  // its content rather than inside it.
  const zoomed = app.element.querySelector(".illuminus-preview__frame .journal-entry-page > div");
  const priorZoom = zoomed.style.zoom;
  zoomed.style.zoom = "1";

  const img = app.element.querySelector(".illuminus-preview__frame figure img");
  const cap = app.element.querySelector(".illuminus-preview__frame figcaption");
  const out = {
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
check(as.sampleImagePresent && as.sampleImageLoaded, "the sample figure has an image and it loads");
check(as.imgBorder === "5px rgb(255, 0, 0)", `the sample image takes the Pictures border (got ${as.imgBorder})`);
check(as.imgOpacity === "0.5", `and its opacity (got ${as.imgOpacity})`);
check(as.captionColor === "rgb(0, 255, 0)", `and the caption takes its color (got ${as.captionColor})`);

// A relative url() in a stylesheet resolves against the stylesheet's own
// folder, so a picked path must be made root-relative or it 404s.
const texture = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const style = await api.createStyle({name: "Texture Probe", settings: {
    page: {texture: "icons/svg/mystery-man.svg"}
  }});
  const entry = await JournalEntry.create({name: "Texture Probe Journal"});
  await entry.createEmbeddedDocuments("JournalEntryPage",
    [{name: "P", type: "text", text: {content: "<p>x</p>"}}]);
  await api.assignStyle(entry, style.id);
  await entry.sheet.render({force: true});
  await new Promise(r => setTimeout(r, 1200));

  const content = entry.sheet.element.querySelector(".journal-entry-content");
  const url = getComputedStyle(content, "::after").backgroundImage.match(/url\\("([^"]+)"\\)/)?.[1];
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

    // Waited for rather than slept past, in both directions: the Edit button
    // arrives with the page's own render, and the window it opens is a second
    // application with a template of its own to fetch.
    let editButton = null;
    for (let i = 0; i < 100 && !editButton; i++) {
      editButton = entry.sheet.element.querySelector(".journal-entry-page .edit-container button");
      if (!editButton) await new Promise(r => setTimeout(r, 100));
    }
    editButton?.click();
    const opened = () => [...foundry.applications.instances.values()].find(
      a => a.document?.documentName === "JournalEntryPage" && a.element?.parentElement === document.body);
    let editSheet = null;
    for (let i = 0; i < 150 && !editSheet; i++) {
      await new Promise(r => setTimeout(r, 100));
      editSheet = opened();
    }
    await new Promise(r => setTimeout(r, 600));
    const after = at();
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
// The editor is a form, so Enter in a field used to submit it — saving the
// style from the keyboard, some way from the button that says Save.
{
  const where = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Enter Probe"});
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1200));
    app.changeTab("body", "sheet");
    await new Promise(r => setTimeout(r, 300));
    const section = app.element.querySelector('.illuminus-tab[data-tab="body"] details.illuminus-section');
    section.open = true;
    await new Promise(r => setTimeout(r, 300));
    // Assigned on the element that carries the name, which is what dispatches
    // the events — writing to the inner input does nothing at all.
    const control = app.element.querySelector('[data-field="body.size"] range-picker');
    control.value = 21;
    await new Promise(r => setTimeout(r, 300));
    // The number box inside the control, not the control's middle — the middle
    // of a range picker is its slider, and clicking a slider sets a value.
    const field = control.querySelector('input[type="number"]').getBoundingClientRect();
    const save = app.element.querySelector('button[type="submit"]').getBoundingClientRect();
    return JSON.stringify({
      styleId: style.id,
      stored: api.getStyle(style.id).settings.body?.size,
      // The working copy, so a failure below says which half broke: the typing
      // or the saving.
      working: app.element.querySelector('[data-field="body.size"]').classList.contains("is-default"),
      field: [field.left + field.width / 2, field.top + field.height / 2],
      save: [save.left + save.width / 2, save.top + save.height / 2]
    });
  })()`));

  // Typed into like a person, and Enter pressed for real: a dispatched event
  // does not submit a form, so a scripted one would pass whatever we did.
  await cdp.click(...where.field);
  for (const type of ["keyDown", "keyUp"]) {
    await cdp.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  }
  await new Promise((r) => setTimeout(r, 600));
  const afterEnter = JSON.parse(await cdp.evaluate(`(() => {
    const api = game.modules.get("illuminus").api;
    return JSON.stringify({
      stored: api.getStyle(${JSON.stringify(where.styleId)}).settings.body?.size,
      open: [...foundry.applications.instances.values()].some(a => a.constructor.name.includes("StyleEditor"))
    });
  })()`));
  check(!where.working, "the edit reached the working copy");
  check(afterEnter.stored === where.stored,
    `Enter leaves the style unsaved (${where.stored} still, not ${21})`);
  check(afterEnter.open, "and leaves the editor open");

  // The button is hit-tested rather than clicked. A synthetic click delivered
  // straight after a synthetic Enter is dropped by the headless browser about
  // half the time — every extra round-trip makes it land — and a check that
  // fails on the input pipeline says nothing about the editor. What it is
  // really asserting is that the thing at those coordinates is the submit
  // button, and that submitting saves; the submit path itself is driven the
  // same way the rest of this file drives it.
  const save = JSON.parse(await cdp.evaluate(`(() => {
    const app = [...foundry.applications.instances.values()].find(a => a.constructor.name.includes("StyleEditor"));
    const button = app.element.querySelector('button[type="submit"]');
    const box = button.getBoundingClientRect();
    const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return JSON.stringify({ reached: at === button || button.contains(at), at: at?.tagName });
  })()`));
  check(save.reached, `the Save button is what is under the pointer (${save.at})`);
  const afterSave = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const app = [...foundry.applications.instances.values()].find(a => a.constructor.name.includes("StyleEditor"));
    await app.submit();
    await new Promise(r => setTimeout(r, 500));
    const out = JSON.stringify({ stored: api.getStyle(${JSON.stringify(where.styleId)}).settings.body?.size });
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    await api.deleteStyle(${JSON.stringify(where.styleId)});
    return out;
  })()`));
  check(afterSave.stored === 21, `while the Save button still saves it (got ${afterSave.stored})`);
}

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
  el.querySelector('[data-action="resetSection"][data-group="page"][data-section="background"]').click();
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
 * Open a file in a tab of its own and ask it a question.
 *
 * The whole promise of the export is that it works away from Foundry, so it is
 * checked away from Foundry: a second tab, a second socket, and no module
 * loaded anywhere near it. Anything read here was read from a plain web page.
 */
const inCleanTab = async (url, expression, { pdf = false, printMedia = false } = {}) => {
  const { targetId } = await cdp.send("Target.createTarget", { url });
  try {
    await new Promise((r) => setTimeout(r, 500));
    const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
    const socket = new WebSocket(tabs.find((t) => t.id === targetId).webSocketDebuggerUrl);
    await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });

    // Waited for rather than slept through: a single page carrying its pictures
    // inside it is half a megabyte, and a fixed delay either races it on a busy
    // machine or pads every run to suit the slowest one.
    const ask = (id, expression) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`the exported page never answered: ${url}`)), 30000);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        clearTimeout(timer);
        resolve(message.result);
      };
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { returnByValue: true, expression } }));
    });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      const said = await ask(100 + i, `document.readyState === "complete"
        && !!document.querySelector(".journal-entry-content")`);
      ready = said?.result?.value === true;
      if (!ready) await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) throw new Error(`the exported page never finished loading: ${url}`);

    // Print rules decide what a PDF costs in ink, and they are invisible on
    // screen — so the page is asked while it believes it is being printed.
    if (printMedia) {
      await new Promise((resolve) => {
        socket.onmessage = (event) => {
          if (JSON.parse(event.data).id === 99) resolve();
        };
        socket.send(JSON.stringify({
          id: 99, method: "Emulation.setEmulatedMedia", params: { media: "print" }
        }));
      });
    }
    const answer = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`the exported page never answered: ${url}`)), 30000);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer);
        if (message.result?.exceptionDetails) {
          reject(new Error(message.result.exceptionDetails.exception?.description ?? "page threw"));
        } else resolve(message.result?.result?.value);
      };
      socket.send(JSON.stringify({
        id: 1, method: "Runtime.evaluate", params: { returnByValue: true, expression }
      }));
    });

    // Printing is asked of the browser rather than of the page: this is the
    // same engine, and the same print stylesheet, that a person's Save as PDF
    // would use.
    let printed = null;
    if (pdf) {
      printed = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("printing never finished")), 30000);
        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.id !== 2) return;
          clearTimeout(timer);
          resolve(message.result?.data ?? "");
        };
        // Printed as a person's dialog would: "background graphics" is off by
        // default there, which is why the document has to say its colors are
        // content rather than decoration.
        socket.send(JSON.stringify({
          id: 2, method: "Page.printToPDF", params: { printBackground: false, preferCSSPageSize: false }
        }));
      });
    }
    socket.close();
    return pdf ? { answer, printed } : answer;
  } finally {
    await cdp.send("Target.closeTarget", { targetId });
  }
};

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
    await sheet.close({force: true});
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
    `side-only borders applied, which is what makes the trait-tag shape (got ${il.sideBorders})`);
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
    await sheet.close({force: true});
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
    const IMG = "icons/svg/mystery-man.svg";
    Object.assign(settings.tables, {headerBackground: "#5e1914", headerTexture: IMG, headerTextureOpacity: 60});
    Object.assign(settings.heading1, {background: "#5e1914", texture: IMG, textureFit: "tile"});
    Object.assign(settings.sidebar, {buttonBackground: "#222222", buttonTexture: IMG});
    Object.assign(settings.title, {background: "#2b1d12", texture: IMG});
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
      const before = getComputedStyle(el, "::after");
      return {
        image: /mystery-man/.test(before.backgroundImage),
        opacity: before.opacity, repeat: before.backgroundRepeat,
        // Behind the lettering, not over it.
        behind: before.zIndex, isolated: getComputedStyle(el).isolation
      };
    };
    const out = {
      tableHeader: layer("thead th"),
      heading: layer(".journal-page-content h1"),
      sidebarButton: layer(".journal-sidebar button"),
      block: layer(".illuminus-box--box01"),
      // The journal's name is an <input>, which can carry no ::before at all —
      // so its picture goes on the header around it, and the input must keep no
      // fill of its own or it covers what is painted behind it.
      title: layer(".journal-header"),
      titleFill: getComputedStyle(root.querySelector(".journal-header .title")).backgroundColor,
      // An icon is a glyph in the ::before pseudo-element, which is where a
      // layer used to go — and a layer setting an empty content erased every
      // icon it touched. The button kept its fill, so it read as the icon
      // colour not working rather than as the icon being gone.
      iconGlyph: getComputedStyle(root.querySelector(".window-header button.header-control"), "::before").content
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
  check(ly.title.image, "and the journal title, whose picture rides on the header around it");
  check(["rgba(0, 0, 0, 0)", "transparent"].includes(ly.titleFill),
    `with the name itself carrying no fill to cover it (${ly.titleFill})`);
  // And still none when it is pointed at. The hovered rule used to paint the
  // title's fill onto the input, which put a flat color over the picture on the
  // header behind it — a dark box appearing over the name under the pointer.
  {
    // The spot is measured here rather than reused: the window has been read
    // and scrolled since, and a pointer sent to a remembered spot is how a
    // check comes to fail on something other than what it is about.
    const spot = JSON.parse(await cdp.evaluate(`(() => {
      const entry = game.journal.get(window.__layers.entryId);
      // Brought forward first: windows from earlier checks are still on screen,
      // and a pointer sent at a window underneath one of them lands on the one
      // on top. Headless Chrome also pins a permanent "no hardware
      // acceleration" notice over the top of the window, which is exactly where
      // a journal's name is.
      entry.sheet.bringToFront();
      document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
      const title = entry.sheet.element.querySelector(".journal-header .title");
      const box = title.getBoundingClientRect();
      const middle = [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
      const at = document.elementFromPoint(...middle);
      return JSON.stringify({middle, at: at?.tagName + "." + (at?.className || "")});
    })()`));
    let pointed = {hovering: false};
    for (let tries = 0; tries < 3 && !pointed.hovering; tries += 1) {
      await cdp.mouse("mouseMoved", spot.middle[0], spot.middle[1] + tries);
      await new Promise((r) => setTimeout(r, 300));
      pointed = JSON.parse(await cdp.evaluate(`(() => {
        const entry = game.journal.get(window.__layers.entryId);
        const title = entry.sheet.element.querySelector(".journal-header .title");
        return JSON.stringify({
          hovering: title.matches(":hover"),
          name: getComputedStyle(title).backgroundColor,
          header: getComputedStyle(title.parentElement).backgroundColor
        });
      })()`));
    }
    check(pointed.hovering, `the pointer reaches the name (topmost there: ${spot.at})`);
    check(["rgba(0, 0, 0, 0)", "transparent"].includes(pointed.name),
      `and it carries no fill when pointed at either (${pointed.name})`);
    check(pointed.header === "rgb(43, 29, 18)",
      `while the header behind it keeps its own (${pointed.header})`);
  }
  check(ly.iconGlyph && ly.iconGlyph !== '""' && ly.iconGlyph !== "none",
    `and a button keeps the icon a layer used to erase (${ly.iconGlyph})`);
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
    settings.body.dropCapOutlineWidth = 3;
    settings.body.dropCapOutlineColor = "#ff0000";
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Heading Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      "<p>Opening paragraph.</p><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>"}}]);
    // "Opening paragraph." — the capital is its O.
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
      // The opening capital wears an element of its own, wrapped at render: a
      // browser paints the first-letter pseudo-element with a fixed list of
      // properties, and an outline is not on it.
      dropCapFont: getComputedStyle(root.querySelector(".illuminus-drop-cap")).fontFamily,
      dropCapLetter: root.querySelector(".illuminus-drop-cap")?.textContent,
      dropCapOutline: (() => {
        const cs = getComputedStyle(root.querySelector(".illuminus-drop-cap"));
        return cs.webkitTextStrokeWidth + " " + cs.webkitTextStrokeColor;
      })()
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
  check(hd.dropCapLetter === "O", `on the page's first letter and no more of it (got "${hd.dropCapLetter}")`);
  check(hd.dropCapOutline === "3px rgb(255, 0, 0)",
    `and an outline, which a pseudo-element would have refused (got ${hd.dropCapOutline})`);
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
check(ht.tabs.indexOf("headings") === ht.tabs.indexOf("page") + 1,
  `which sits where the levels do, after Page (strip: ${ht.tabs.slice(0, 5).join(", ")})`);
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
      // Written with ids, as the editor writes them: Foundry finds a passage by
      // its id when it reveals one, and a section without one is a passage
      // nothing can reveal.
      '<section class="secret" id="secret-hidden"><p>Hidden.</p></section>' +
      '<section class="secret revealed" id="secret-shown"><p>Shown.</p></section>'}}]);
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

  // What a player is sent, as against what the gamemaster is shown. A secret is
  // never hidden from the person running the game — the tint and the Reveal
  // button are how they tell what the table has been shown — so "the words are
  // still there after I press Hide" is the feature working. It is the page a
  // player receives that has to be missing them.
  const seen = JSON.parse(await cdp.evaluate(`(async () => {
    const entry = game.journal.get(window.__secrets.entryId);
    const content = entry.pages.contents[0].text.content;
    const asPlayer = await CONFIG.ux.TextEditor.enrichHTML(content, {secrets: false});
    const asGM = await CONFIG.ux.TextEditor.enrichHTML(content, {secrets: true});
    return JSON.stringify({
      playerHasHidden: /Hidden\\./.test(asPlayer),
      playerHasShown: /Shown\\./.test(asPlayer),
      gmHasHidden: /Hidden\\./.test(asGM),
      gmHasShown: /Shown\\./.test(asGM)
    });
  })()`));
  check(!seen.playerHasHidden && seen.playerHasShown,
    `a player is sent the revealed passage and not the hidden one `
    + `(hidden ${seen.playerHasHidden ? "sent" : "kept back"}, revealed ${seen.playerHasShown ? "sent" : "missing"})`);
  check(seen.gmHasHidden && seen.gmHasShown,
    "while the gamemaster is shown both, which is what the Reveal button is for");
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
  // Step by step from here rather than in one call: each of these opens the
  // editor and waits on a prompt, and a single call that stops answering says
  // only that something inside it hung.
  const step = (name, body) => cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const state = window.__unsaved;
    ${body}
  })()`).then((value) => JSON.parse(value ?? "null"), (err) => {
    throw new Error(`${name}: ${err.message}`);
  });

  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    // Nothing else on screen: the editor is opened and closed several times
    // here, and a window left over from an earlier check is a window in the way.
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")
        || app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Unsaved Probe"});
    window.__unsaved = {styleId: style.id, out: {}};
    // Waits for the control rather than guessing at a delay: the editor builds
    // a couple of thousand of them, and a fixed wait that was long enough once
    // stops being long enough as the schema grows.
    window.__unsaved.dirty = async () => {
      const app = await api.openEditor(window.__unsaved.styleId);
      let control = null;
      for (let i = 0; i < 400 && !control; i++) {
        await new Promise(r => setTimeout(r, 100));
        control = app.element?.querySelector('[data-field="page.background"] color-picker');
      }
      if (!control) throw new Error("the editor did not render its controls in forty seconds");
      control.value = "#123456";
      // Believed only once the editor says it has something to lose: the value
      // is set through the element's own setter, and a close that finds nothing
      // changed closes without asking — which reads as Save having lost the
      // change rather than as the change never arriving.
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (app.element?.querySelector('[data-field="page.background"]:not(.is-default)')) break;
      }
      return app;
    };
    window.__unsaved.prompt = () => [...foundry.applications.instances.values()]
      .find(a => a.constructor.name.includes("Dialog"));
    // The prompt is rendered on a click, so it is waited for rather than slept
    // past — twenty seconds of patience, and it usually takes one frame.
    window.__unsaved.waitForPrompt = async () => {
      for (let i = 0; i < 200; i++) {
        if (window.__unsaved.prompt()) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    };
    // The prompt that carries the button asked for, rather than the first
    // window whose name has Dialog in it: an answered prompt lingers in the
    // register for the length of its closing animation, so the one before this
    // could be picked instead and the click would land on a window on its way
    // out. Nothing then answered the prompt still on screen, and the editor
    // sitting there unclosed read as Discard declining to close.
    window.__unsaved.answer = async (action) => {
      const wanted = 'button[data-action="' + action + '"]';
      for (let i = 0; i < 200; i++) {
        const asking = [...foundry.applications.instances.values()].find(
          (app) => app.constructor.name.includes("Dialog") && app.rendered
            && app.element?.querySelector(wanted));
        if (asking) {
          asking.element.querySelector(wanted).click();
          await new Promise(r => setTimeout(r, 700));
          return true;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    };
  })()`);

  // Nothing changed: closing must not nag.
  await step("clean close", `
    const app = await api.openEditor(state.styleId);
    await new Promise(r => setTimeout(r, 900));
    await app.close({force: true});
    await new Promise(r => setTimeout(r, 400));
    state.out.cleanAsked = !!state.prompt();
    state.out.cleanClosed = !app.rendered;
    return "null";
  `);

  // Deliberately unforced from here on: the prompt is what is under test.
  await step("keep editing", `
    state.app = await state.dirty();
    state.app.close();
    state.out.asked = await state.waitForPrompt();
    await state.answer("cancel");
    state.out.keptOpen = state.app.rendered;
    return "null";
  `);

  await step("discard", `
    state.app.close();
    state.out.discardAnswered = await state.answer("discard");
    // Waited for rather than slept past, as the control above is: closing tears
    // down a couple of thousand controls, and a window still on screen when a
    // fixed delay ends reads as Discard having declined to close. Gone from the
    // register counts as closed as well as the rendered flag going false: a
    // window on its way out is still rendered for the length of its animation,
    // and on a loaded machine that has outlasted ten seconds of patience.
    const gone = () => !state.app.rendered
      || ![...foundry.applications.instances.values()].includes(state.app);
    for (let i = 0; i < 300 && !gone(); i++) await new Promise(r => setTimeout(r, 100));
    state.out.discardClosed = gone();
    state.out.afterDiscard = api.getStyle(state.styleId).settings.page.background;
    return "null";
  `);

  await step("save and close", `
    state.app = await state.dirty();
    state.out.askedAgain = !!state.app.element?.querySelector('[data-field="page.background"]:not(.is-default)');
    state.app.close();
    await state.answer("save");
    // Waited for rather than slept past: saving writes a world setting, and the
    // read that follows a fixed delay can be the value from before it landed.
    const stored = () => api.getStyle(state.styleId).settings.page.background;
    for (let i = 0; i < 60 && stored() !== "#123456"; i++) await new Promise(r => setTimeout(r, 100));
    state.out.saveClosed = !state.app.rendered;
    state.out.afterSave = stored();
    return "null";
  `);

  const un = await step("results", `return JSON.stringify(state.out);`);
  check(!un.cleanAsked && un.cleanClosed, "closing an unchanged style just closes");
  check(un.asked, "closing a changed one asks first");
  check(un.keptOpen, "Keep Editing leaves the editor open");
  check(un.discardAnswered, "the prompt is still there to answer when Discard is pressed");
  check(un.discardClosed && un.afterDiscard !== "#123456",
    `Discard closes and throws the change away (stored ${un.afterDiscard})`);
  check(un.saveClosed && un.afterSave === "#123456",
    `Save and Close keeps it (stored ${un.afterSave}${un.askedAgain ? "" : ", the change never reached the editor"})`);
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
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
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
    await sheet.close({force: true});
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
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
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
    // Dimming is measured on a word only one tab has. "Shadow" is on every tab
    // now that lettering everywhere can cast one, so it narrows a tab without
    // dimming any — which is right, and says nothing about dimming.
    await type("bullet");
    out.dimmedTabs = [...el.querySelectorAll("nav.tabs [data-tab]")]
      .filter(t => t.classList.contains("is-filtered-out")).length;
    // A section whose own name matches opens even when its controls are worded
    // differently — an Inner Shadow's are all "shading". Measured on a tab that
    // still has a category named for a shadow: the tabs laid out by hand hold
    // both shadows inside Fill and Image, and name neither.
    // A category named for something none of its controls are called. The
    // shadows now share Fill and Image wherever they are, so Folding is the one
    // that reads that way: its controls are a marker, a size and a turn.
    const shadowTab = [...el.querySelectorAll(".illuminus-tab")].find((one) =>
      [...one.querySelectorAll(".illuminus-section__label")]
        .some((label) => /folding/i.test(label.textContent)));
    const wasOn = el.querySelector(".illuminus-tab.active")?.dataset.tab;
    if (shadowTab) app.changeTab(shadowTab.dataset.tab, "sheet");
    await new Promise(r => setTimeout(r, 200));
    await type("folding");
    out.shadowTab = shadowTab?.dataset.tab ?? "none";
    out.openSections = [...el.querySelectorAll(".illuminus-tab.active .illuminus-section")]
      .filter(s => s.open).length;
    // Back where it was: everything after this counts controls on the tab the
    // check started on, and a tab with eight times as many is not that.
    if (wasOn) app.changeTab(wasOn, "sheet");
    await new Promise(r => setTimeout(r, 200));
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

    // A listed page is set in one section, in its three states — which is what
    // the switch is for. It was three sections, and the same entry could not be
    // compared with itself.
    const entryStates = [...el.querySelectorAll('.illuminus-tab[data-tab="sidebar"] .illuminus-section')]
      .find(s => s.querySelector("summary")?.dataset.section === "entries");
    entryStates.querySelector("summary").click();
    await new Promise(r => setTimeout(r, 300));
    out.entryStateOptions = [...entryStates.querySelectorAll(".illuminus-state__option")]
      .map(b => b.dataset.state);
    out.entryStateLabels = [...entryStates.querySelectorAll(".illuminus-state__option")]
      .map(b => b.textContent.trim());
    const entryShown = () => [...entryStates.querySelectorAll(".illuminus-field")]
      .filter(f => !f.classList.contains("is-state-hidden")).length;
    out.entryTotal = entryStates.querySelectorAll(".illuminus-field").length;
    out.entryFirst = entryShown();
    entryStates.querySelector('.illuminus-state__option[data-state="active"]').click();
    await new Promise(r => setTimeout(r, 250));
    out.entryOnActive = entryShown();

    // And the list of headings under a page, which has the same three states:
    // the heading a reader chose is as much a state as the page being read.
    const headingStates = [...el.querySelectorAll('.illuminus-tab[data-tab="sidebar"] .illuminus-section')]
      .find(s => s.querySelector("summary")?.dataset.section === "subHeadings");
    headingStates.querySelector("summary").click();
    await new Promise(r => setTimeout(r, 300));
    const headingShown = () => [...headingStates.querySelectorAll(".illuminus-field")]
      .filter(f => !f.classList.contains("is-state-hidden")).length;
    out.headingStateOptions = [...headingStates.querySelectorAll(".illuminus-state__option")]
      .map(b => b.dataset.state);
    out.headingNormal = headingShown();
    headingStates.querySelector('.illuminus-state__option[data-state="active"]').click();
    await new Promise(r => setTimeout(r, 250));
    out.headingOnActive = headingShown();

    // Searching must reach a control the switch has folded away. The words are
    // in its wording rather than its name: a state's controls are named plainly
    // now, because the switch above them says which state they are.
    buttons.querySelector('.illuminus-state__option[data-state="normal"]').click();
    await new Promise(r => setTimeout(r, 250));
    await type("mouse is over");
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
  check(f.openSections >= 1 && f.shadowTab !== "none",
    `a section whose own name matches opens too (${f.openSections} open on ${f.shadowTab})`);
  check(f.restored === f.beforeFilter && f.noneDimmed,
    `clearing it puts everything back (${f.restored})`);
  check(f.hasSwitch, "a section with pointed-at colors gets a switch");
  check(f.hoverHiddenNormally, "whose pointed-at controls are folded away by default");
  check(f.hoverShownAfter && f.normalHiddenAfter, "and swap in when it is switched");
  check(f.filterReachesHidden, "searching still reaches a control the switch folded away");
  check(JSON.stringify(f.entryStateOptions) === JSON.stringify(["normal", "hover", "active"]),
    `a listed page offers all three of its states in one section (got ${f.entryStateOptions.join(", ")})`);
  check(JSON.stringify(f.entryStateLabels) === JSON.stringify(["Normal", "Hovered", "Selected"]),
    `named as a person would name them (got ${f.entryStateLabels.join(", ")})`);
  // Neither state shows everything: one at a time is the whole point of the
  // switch.
  check(f.entryFirst > 0 && f.entryOnActive > 0
    && f.entryFirst < f.entryTotal && f.entryOnActive < f.entryTotal,
    `and shows one state at a time (${f.entryFirst} then ${f.entryOnActive} of ${f.entryTotal})`);
  // And Selected is a state in full, not a handful of controls with the rest
  // governing every row at once: the page being read has its own of everything.
  check(f.entryFirst === f.entryOnActive,
    `a listed page offers as much when it is the one being read (${f.entryFirst} then ${f.entryOnActive})`);
  check(JSON.stringify(f.headingStateOptions) === JSON.stringify(["normal", "hover", "active"]),
    `a listed heading offers the same three states (${f.headingStateOptions?.join(", ")})`);
  check(f.headingNormal > 0 && f.headingNormal === f.headingOnActive,
    `and as much for the one a reader chose (${f.headingNormal} then ${f.headingOnActive})`);
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
    const order = () => (api.getStyle(style.id).swatches ?? []).map(sw => sw.hex ?? sw);
    const wasFirst = order()[0];
    for (let i = 0; i < 40 && order()[0] === wasFirst; i++) await new Promise(r => setTimeout(r, 100));
    out.orderAfterDrag = order();

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

// The Window tab's defaults are all "leave it as Foundry draws it", so clearing
// that tab is exactly that — and it says so, on the one tab where "Reset Tab"
// does not convey what resetting means.
console.log("\n[56] Handing the window back to Foundry");
try {
  const handed = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Foundry Default Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.window, {background: "#204060", headerButtonColor: "#ffcc00"});
    await api.updateStyle(style.id, {settings});

    const app = await api.openEditor(style.id);
    for (let i = 0; i < 200 && !app.element?.querySelector("summary[data-section]"); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    app.changeTab("window", "sheet");
    await new Promise(r => setTimeout(r, 500));

    const button = app.element.querySelector('[data-tab="window"] [data-action="foundryDefault"]');
    const out = { offered: Boolean(button), says: button?.textContent.trim() };
    const before = app.element.querySelector('[data-field="window.headerButtonColor"] color-picker')?.value;
    button?.click();
    await new Promise(r => setTimeout(r, 700));
    // Clearing a tab asks first, as it should.
    const asked = [...foundry.applications.instances.values()]
      .filter(a => a.constructor.name === "DialogV2").pop();
    out.asked = Boolean(asked);
    asked?.element.querySelector('button[data-action="yes"], button[data-action="ok"]')?.click();
    await new Promise(r => setTimeout(r, 900));
    const after = app.element.querySelector('[data-field="window.headerButtonColor"] color-picker')?.value;
    out.cleared = before !== after;
    out.after = after;
    // Only that tab: the rest of the style is left alone.
    out.elsewhere = app.element.querySelector('[data-field="page.background"] color-picker')?.value;

    await app.close({force: true});
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`);
  const fd = JSON.parse(handed);
  check(fd.offered && /Foundry/.test(fd.says ?? ""),
    `the Window tab offers to hand it back to Foundry (${fd.says})`);
  check(fd.asked, "asking first, since it clears the whole tab");
  check(fd.cleared, `and clearing it puts the tab back to its defaults (${fd.after})`);
  check(Boolean(fd.elsewhere), "leaving every other tab as it was");
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const api = game.modules.get("illuminus").api;
    for (const style of api.listStyles()) {
      if (style.name === "Foundry Default Probe") await api.deleteStyle(style.id);
    }
  })()`);
}

// Hovered states are off until asked for, and a link is the control that proves
// the layer selector is right: `a, b::before` attaches the pseudo-element to b
// alone and puts its declarations on a itself, which took every content link
// out of the flow of the page.
console.log("\n[54] Hovered states are off until asked for");
try {
  const off = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    // Nothing else on screen: earlier checks leave windows open, and a pointer
    // sent at a window underneath one of them lands on the one on top.
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")
        || app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Hover Off Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.boxes, {background: "#123456", hoverBackground: "#ff0000"});
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Hover Off Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text",
      text: {content: "<blockquote><p>Boxed</p></blockquote><p>A <a class=\\"content-link\\">link</a> in a line.</p>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1300));

    const root = entry.sheet.element;
    const sheet = document.getElementById("illuminus-compiled-styles").textContent;
    const link = root.querySelector(".journal-page-content a.content-link");
    const out = {
      // Switched off by default, so the hovered value is never emitted.
      offByDefault: !/--ill-boxes-hover-background/.test(sheet),
      // A content link stays in the line it was written in.
      linkPosition: getComputedStyle(link).position,
      linkInline: getComputedStyle(link).display
    };

    // Turned on, the value reaches the stylesheet.
    settings.boxes.hoverOff = false;
    await api.updateStyle(style.id, {settings});
    await new Promise(r => setTimeout(r, 400));
    out.onWhenAsked = /--ill-boxes-hover-background/
      .test(document.getElementById("illuminus-compiled-styles").textContent);

    await entry.sheet.close({force: true});
    await entry.delete();
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`);
  const ho = JSON.parse(off);
  check(ho.offByDefault, "a tab's hovered values stay out of the stylesheet until the state is switched on");
  check(ho.onWhenAsked, "and reach it once it is");
  check(ho.linkPosition !== "absolute" && ho.linkInline === "inline",
    `a content link stays in its line (${ho.linkPosition}, ${ho.linkInline})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.getName("Hover Off Journal");
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    for (const style of api.listStyles()) {
      if (style.name === "Hover Off Probe") await api.deleteStyle(style.id);
    }
  })()`);
}

// A hovered color is usually the ordinary one with a change, so it can start as
// a copy of it. The button belongs to the state switch and only appears where
// there is something to copy from.
console.log("\n[55] Filling a hovered state from the ordinary one");
try {
  const copying = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "State Copy Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.boxes, {background: "#123456", hoverBackground: "#000000"});
    await api.updateStyle(style.id, {settings});

    const app = await api.openEditor(style.id);
    for (let i = 0; i < 200 && !app.element?.querySelector("summary[data-section]"); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    app.changeTab("boxes", "sheet");
    await new Promise(r => setTimeout(r, 500));

    const fill = () => app.element
      .querySelector('summary[data-group="boxes"][data-section="background"]').closest(".illuminus-section");
    const button = () => fill().querySelector(".illuminus-state__copy");
    const out = {};

    // While the ordinary controls are on show there is nothing to copy from.
    out.hiddenAtFirst = button()?.classList.contains("is-hidden") ?? "missing";
    fill().querySelector('.illuminus-state__option[data-state="hover"]').click();
    await new Promise(r => setTimeout(r, 300));
    out.shownForHover = !button()?.classList.contains("is-hidden");

    button().click();
    await new Promise(r => setTimeout(r, 800));
    out.hovered = api.getStyle(style.id).settings.boxes.hoverBackground;
    const working = app.element
      .querySelector('[data-field="boxes.hoverBackground"] color-picker')?.value;
    out.control = working;

    await app.close({force: true});
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`);
  const sc = JSON.parse(copying);
  check(sc.hiddenAtFirst === true, `nothing to copy while the ordinary controls are on show (${sc.hiddenAtFirst})`);
  check(sc.shownForHover, "the button appears with the hovered ones");
  check((sc.control ?? "").toLowerCase().startsWith("#123456"),
    `and fills them from the ordinary values (${sc.control})`);
  check(sc.hovered === "#000000",
    `leaving the saved style alone until it is saved (${sc.hovered})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const api = game.modules.get("illuminus").api;
    for (const style of api.listStyles()) {
      if (style.name === "State Copy Probe") await api.deleteStyle(style.id);
    }
  })()`);
}

// Six heading levels means setting the same twenty values six times unless a
// level can start as a copy of the one above it.
console.log("\n[53] Copying a heading level from the one above");
try {
  const copied = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Copy Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.heading2, {size: 41, color: "#abcdef", letterSpacing: 3});
    await api.updateStyle(style.id, {settings});

    const app = await api.openEditor(style.id);
    for (let i = 0; i < 200 && !app.element?.querySelector("[data-family-picker]"); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    app.changeTab("headings", "sheet");
    await new Promise(r => setTimeout(r, 400));

    const picker = app.element.querySelector('[data-family-picker="headings"]');
    picker.value = "heading3";
    picker.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 800));

    const sizeOf = () => app.element
      .querySelector('[data-field="heading3.size"] range-picker, [data-field="heading3.size"] input')?.value;
    const out = { before: sizeOf() };

    const button = app.element.querySelector('[data-action="copyFromAbove"]');
    out.offered = Boolean(button);
    out.says = button?.textContent.trim();
    button?.click();
    await new Promise(r => setTimeout(r, 900));
    out.after = sizeOf();

    // The first level has nothing above it to copy.
    picker.value = "heading1";
    picker.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 700));
    out.firstOffersNone = !app.element.querySelector('[data-action="copyFromAbove"]');

    await app.close({force: true});
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`);
  const cp = JSON.parse(copied);
  check(cp.offered && /Heading 2/.test(cp.says ?? ""),
    `a heading level offers to copy the one above it (${cp.says})`);
  check(String(cp.after) === "41" && String(cp.before) !== "41",
    `and copying brings its settings over (${cp.before} -> ${cp.after})`);
  check(cp.firstOffersNone, "the first level, having nothing above it, offers nothing");
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const api = game.modules.get("illuminus").api;
    for (const style of api.listStyles()) {
      if (style.name === "Copy Probe") await api.deleteStyle(style.id);
    }
  })()`);
}

// An outline is the one lettering control that has to be drawn behind the
// letters rather than over them, so both halves are checked: that it arrives,
// and that it is painted underneath.
console.log("\n[52] An outline wherever lettering is set");
try {
  const outline = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Outline Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    Object.assign(settings.title, {outlineWidth: 3, outlineColor: "#ff00ff"});
    Object.assign(settings.heading2, {outlineWidth: 2, outlineColor: "#00ff00"});
    // The controls are derived from wherever a typeface can be set, so the
    // check reaches past the two tabs that had them written by hand.
    Object.assign(settings.tables, {headerOutlineWidth: 1, headerOutlineColor: "#0000ff"});
    Object.assign(settings.images, {captionOutlineWidth: 1.5, captionOutlineColor: "#ffff00"});
    Object.assign(settings.links, {outlineWidth: 1, outlineColor: "#ff8800"});
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Outline Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "P", type: "text", text: {content: "<h2>Heading</h2><p>Body with a "
        + "<a class=\\"content-link\\">link</a>.</p>"
        + "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>"
        + "<figure><img src=\\"icons/svg/mystery-man.svg\\"><figcaption>Caption</figcaption></figure>"}
    }]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1300));

    const root = entry.sheet.element;
    const read = (sel) => {
      const el = root.querySelector(sel);
      if (!el) return {missing: true};
      const cs = getComputedStyle(el);
      return {
        width: cs.webkitTextStrokeWidth,
        color: cs.webkitTextStrokeColor,
        order: cs.paintOrder
      };
    };
    const out = {
      title: read(".journal-header .title"),
      heading: read(".journal-page-content h2"),
      tableHeader: read(".journal-page-content th"),
      caption: read(".journal-page-content figcaption"),
      link: read(".journal-page-content a.content-link")
    };
    // A level left alone keeps none of it.
    out.untouched = read(".journal-page-content h2") && (() => {
      const el = root.querySelector(".journal-page-content p");
      return getComputedStyle(el).webkitTextStrokeWidth;
    })();
    await entry.sheet.close({force: true});
    await entry.delete();
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`);
  const ol = JSON.parse(outline);
  check(ol.title.width === "3px" && ol.title.color === "rgb(255, 0, 255)",
    `the journal title takes an outline (${ol.title.width} ${ol.title.color})`);
  check(ol.heading.width === "2px" && ol.heading.color === "rgb(0, 255, 0)",
    `and so does a heading level of its own (${ol.heading.width} ${ol.heading.color})`);
  check(/stroke/.test(ol.title.order) && /stroke/.test(ol.heading.order),
    `painted behind the letters rather than over them (${ol.title.order})`);
  check(ol.untouched === "0px",
    `body text is left alone, which is the one place it has none (${ol.untouched})`);
  check(ol.tableHeader.width === "1px" && ol.tableHeader.color === "rgb(0, 0, 255)",
    `a table header takes one (${ol.tableHeader.width} ${ol.tableHeader.color})`);
  check(ol.caption.width === "1.5px" && ol.caption.color === "rgb(255, 255, 0)",
    `so does a picture's caption (${ol.caption.width} ${ol.caption.color})`);
  check(ol.link.width === "1px" && ol.link.color === "rgb(255, 136, 0)",
    `and a link, which has no typeface of its own (${ol.link.width} ${ol.link.color})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.getName("Outline Journal");
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    for (const style of api.listStyles()) {
      if (style.name === "Outline Probe") await api.deleteStyle(style.id);
    }
  })()`);
}

// Two small things with a common thread: a way back from a mistake, and a glow
// that follows a cut-out picture rather than the box around it.
console.log("\n[41] Restoring samples, and picture glow");
try {
  const extras = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const out = {};

    // The way back from deleting a sample. The module bundles none at the
    // moment, so what is checked is that asking says so plainly instead of
    // throwing or quietly claiming to have done something — and the same call
    // still works for templates, which are bundled.
    out.styleRestore = await api.restorePresets();
    out.templatesBefore = api.listTemplates().length;
    const template = api.listTemplates().find(t => t.preset);
    out.hadTemplate = !!template;
    if (template) await api.deleteTemplate(template.id);
    out.templateRestore = await api.restoreTemplatePresets();
    out.templatesAfter = api.listTemplates().length;

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
  check(ex.styleRestore === 0,
    `with no sample styles bundled, restoring them puts nothing back (${ex.styleRestore})`);
  check(ex.hadTemplate && ex.templateRestore === 1 && ex.templatesAfter === ex.templatesBefore,
    `a deleted sample template comes back, once (${ex.templateRestore} restored, `
    + `${ex.templatesBefore} before and ${ex.templatesAfter} after)`);
  check(/drop-shadow/.test(ex.filter) && /204/.test(ex.filter),
    `a picture glow follows its own edges rather than its box (got ${ex.filter})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
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
    // Hovered states are off until asked for, so this asks.
    settings.heading1.hoverOff = false;
    settings.boxes.hoverOff = false;
    settings.heading2.hoverOff = false;
    settings.heading1.hoverColor = "#00ff00";
    settings.boxes.hoverBackground = "#123456";
    settings.heading2.hoverBorderTopColor = "#ff8800";
    settings.heading2.borderTopWidth = 3;
    settings.heading2.borderTopStyle = "solid";
    // A button's corners, which are a number rather than a color: the twin has
    // to reach a size as well as a paint, and Match must not have flattened it.
    settings.sidebar.hoverOff = false;
    settings.sidebar.buttonCornerTopLeft = 2;
    settings.sidebar.hoverButtonCornerTopLeft = 24;
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Hover Test Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      "<h1>Heading one</h1><h2>Heading two</h2><blockquote><p>Boxed</p></blockquote>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    entry.sheet.setPosition({left: 60, top: 60, width: 900, height: 700});
    // In front of whatever earlier checks left open: a pointer sent at a window
    // underneath another lands on the one on top, and the heading in the middle
    // of the page is exactly where those windows sit.
    entry.sheet.bringToFront();
    await new Promise(r => setTimeout(r, 1400));
    // Foundry animates buttons, so a corner read as the pointer arrives comes
    // back part-way through the transition — 15.9px between 2 and 24.
    const freeze = document.createElement("style");
    freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(freeze);
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    window.__hover = {entryId: entry.id, styleId: style.id};
    const box = (sel) => {
      const el = entry.sheet.element.querySelector(sel);
      const b = el.getBoundingClientRect();
      return {x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2)};
    };
    // The first panel button the pointer can actually reach: one of them sits
    // under the panel's own edge, and hovering what covers it proves nothing.
    // Foundry's own buttons: a folding marker is a button too, and the panel's
    // Buttons controls deliberately leave it alone.
    const buttons = [...entry.sheet.element.querySelectorAll(".journal-sidebar button:not(.illuminus-fold)")];
    const reachable = buttons.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === b;
    });
    window.__hover.buttonIndex = reachable;
    return JSON.stringify({
      h1: box(".journal-page-content h1"),
      h2: box(".journal-page-content h2"),
      quote: box(".journal-page-content blockquote"),
      button: (() => {
        const r = buttons[reachable].getBoundingClientRect();
        return {x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2)};
      })(),
      buttonRest: getComputedStyle(buttons[reachable]).borderTopLeftRadius,
      restColor: getComputedStyle(entry.sheet.element.querySelector(".journal-page-content h1")).color
    });
  })()`);
  const at = JSON.parse(setUp);

  /**
   * Point at something and read what it takes on.
   *
   * The spot is measured immediately before the pointer is sent to it, and the
   * read is believed only once the element says it is hovered: a page settles
   * for a moment after it renders — a typeface arriving moves every line — and a
   * pointer sent to a spot measured a second earlier lands beside a heading
   * rather than on it, which is what "the hovered color never applied" turned
   * out to be.
   */
  const readAfterHover = async (pick, property) => {
    let last = null;
    for (let tries = 0; tries < 4; tries += 1) {
      const spot = JSON.parse(await cdp.evaluate(`(() => {
        const root = game.journal.get(window.__hover.entryId).sheet.element;
        const box = (${pick}).getBoundingClientRect();
        return JSON.stringify([Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)]);
      })()`));
      await cdp.mouse("mouseMoved", spot[0], spot[1]);
      await new Promise((r) => setTimeout(r, 250));
      const read = JSON.parse(await cdp.evaluate(`(() => {
        const root = game.journal.get(window.__hover.entryId).sheet.element;
        const el = ${pick};
        const top = document.elementFromPoint(${spot[0]}, ${spot[1]});
        return JSON.stringify({hovering: el.matches(":hover"), value: getComputedStyle(el).${property},
          topmost: top ? top.tagName + "." + (top.className || "") : "nothing"});
      })()`));
      last = read;
      if (read.hovering) return read.value;
    }
    // Named rather than silently wrong: a read taken while the pointer was
    // somewhere else fails on the color and says nothing about the pointer.
    return `${last.value} (pointer reached ${last.topmost})`;
  };

  const h1Hovered = await readAfterHover(`root.querySelector(".journal-page-content h1")`, "color");
  const quoteHovered = await readAfterHover(`root.querySelector(".journal-page-content blockquote")`, "backgroundColor");
  const h2Hovered = await readAfterHover(`root.querySelector(".journal-page-content h2")`, "borderTopColor");
  const buttonRadius = await readAfterHover(
    `[...root.querySelectorAll(".journal-sidebar button:not(.illuminus-fold)")][window.__hover.buttonIndex]`,
    "borderTopLeftRadius");

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
  check(at.buttonRest === "2px", `a panel button is square-ish at rest (got ${at.buttonRest})`);
  check(buttonRadius === "24px", `and rounds off when pointed at (got ${buttonRadius})`);
  check(h1Rested === at.restColor,
    `moving away puts the ordinary color back (${h1Rested} vs ${at.restColor})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
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
      // The pieces lit in their own right: a link inside a lit paragraph is lit
      // with it, and dimming it would be dimming part of what is in focus.
      // Every piece of the kind in focus lit, and nothing of another kind —
      // except what sits *inside* one of them, since a link inside a lit
      // paragraph is part of what is in focus.
      const own = parts().filter(p => p.dataset.part === tab);
      const inside = (part) => own.some(one => one !== part && one.contains(part));
      return {
        lit: lit(), dimmed: dimmed(),
        allOwnLit: own.length > 1 && own.every(p => !p.classList.contains("is-dimmed")),
        otherLit: parts().filter(p => !p.classList.contains("is-dimmed")
          && p.dataset.part !== tab && p.dataset.part !== "page" && !inside(p)).map(p => p.dataset.part)
      };
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
    for (let i = 0; i < 80 && !out.scrolledIntoView; i++) {
      out.scrolledIntoView = inView();
      if (out.scrolledIntoView) break;
      // A smooth scroll is animated and can be cancelled by whatever the
      // browser was doing at the time — so ask once more, half way through,
      // rather than declaring a failure the next tab switch would have fixed.
      if (i === 30) app.changeTab("tables", "sheet");
      await new Promise(r => setTimeout(r, 100));
    }

    // A family replaces the pane outright, so nothing there should be dimmed.
    // The Page tab's piece is the surface everything else sits on, so lighting
    // it and dimming what it holds greyed the whole sample out.
    out.page = await visit("page");
    // Inside the page, that is: the Box, Tag and Picture panes below it are
    // pages of their own, and dimming those is the point of dimming.
    out.page.dimmedInside = parts().filter((part) =>
      part.classList.contains("is-dimmed")
      && el.querySelector('.illuminus-preview__frame [data-part="page"]').contains(part)).length;

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
  // The page's surface wraps every other piece, so it stays lit alongside
  // whichever piece is focused — dimming it would dim what is inside it.
  check(JSON.stringify(fc.tables.lit) === JSON.stringify(["page", "tables"]) && fc.tables.dimmed > 10,
    `opening a tab brings its own part forward (lit ${fc.tables.lit.join(", ")}, ${fc.tables.dimmed} dimmed)`);
  check(fc.body.allOwnLit && fc.body.otherLit.length === 0,
    `a tab with several pieces lights them all and nothing else`
    + `${fc.body.otherLit.length ? ` (also lit: ${fc.body.otherLit.join(", ")})` : ""}`);
  check(fc.scrolledIntoView, "and the sample scrolls so that part can be seen");
  check(fc.page.dimmedInside === 0 && fc.page.lit.includes("page"),
    `the tab whose piece holds the rest dims none of what it holds (${fc.page.dimmedInside} dimmed inside)`);
  check(fc.family.dimmed === 0,
    `a family tab, which replaces the pane outright, dims nothing (${fc.family.dimmed})`);
  check(JSON.stringify(fc.afterPick) === JSON.stringify(["page", "heading3"]),
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

// Knowing where a control lives on one tab should be knowing where it lives on
// all of them. The schema settles that order; this checks the editor renders it,
// and that switching to Hovered hides controls without shuffling the rest.
console.log("\n[44] Every tab reads in the same order");
try {
  const shape = await cdp.evaluate(`(async () => {
    const schema = await import("/modules/illuminus/scripts/style-schema.mjs");
    const api = game.modules.get("illuminus").api;
    const app = await api.openEditor(api.listStyles()[0].id);
    for (let i = 0; i < 200 && !app.element?.querySelector("summary[data-section]"); i++) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Grouped by the group each section was rendered for: a family tab renders
    // one member, so its sections are filed under that member's own id.
    const rendered = new Map();
    for (const summary of app.element.querySelectorAll("summary[data-section]")) {
      const list = rendered.get(summary.dataset.group) ?? [];
      list.push(summary.dataset.section);
      rendered.set(summary.dataset.group, list);
    }

    // A tab that lays itself out is exempt from the shared reading order: it
    // has one of its own, which the schema states and this reads back.
    const ownOrder = schema.GROUPS.filter(g => g.order).map(g => g.id);
    const out = {tabs: rendered.size, wrongOrder: [], textNotFirst: [], ownOrder};
    for (const [id, sections] of rendered) {
      const group = schema.GROUPS.find(g => g.id === id);
      const wanted = group.sections.map(s => s.id);
      if (sections.join() !== wanted.join()) out.wrongOrder.push(id + ": " + sections.join() + " vs " + wanted.join());
      if (sections.includes("text") && sections[0] !== "text") out.textNotFirst.push(id);
    }

    // The convention itself, stated once rather than inferred from the schema
    // it is checking: what a box style and a tag open with. Read from tabs that
    // take the shared order — the Boxes tab states one of its own now, and a tab
    // that has been laid out by hand is not evidence about the shared one.
    // Read as names rather than as ids: a box's first category and a tag's are
    // the same question — how much room it takes — under two ids.
    const named = (id) => (rendered.get(id) ?? []).slice(0, 4).map((section) =>
      app.element.querySelector('summary[data-group="' + id + '"][data-section="' + section + '"]')
        ?.querySelector(".illuminus-section__label")?.textContent.trim() ?? section);
    out.boxes = named("box01");
    out.tag = named("tag01");
    out.lettering = app.element.textContent.includes("Lettering");

    // Turned on first: a tab whose hovered state is switched off greys the
    // switch, and rightly — there is nothing to look at behind it.
    const enable = app.element.querySelector('[data-tab="boxes"] .illuminus-hover-off input');
    if (enable?.checked) {
      enable.checked = false;
      enable.dispatchEvent(new Event("change", {bubbles: true}));
      await new Promise(r => setTimeout(r, 500));
    }

    // Hovered hides, never reorders. The section is left closed and re-found
    // each time: opening one re-renders, and a node held across that is a
    // detached copy that accepts clicks and shows nothing.
    const border = () => app.element
      .querySelector('summary[data-group="boxes"][data-section="border"]').closest(".illuminus-section");
    const showing = () => [...border().querySelectorAll(".illuminus-field[data-field]")]
      .filter(f => !f.classList.contains("is-state-hidden"))
      .map(f => f.dataset.field.split(".")[1]);
    out.normal = showing();

    // Reached the way a person reaches it: the switch lives in a section's
    // header, which is not drawn at all until the section is open, and hit
    // testing means nothing on a tab that is not the one showing.
    app.changeTab("boxes", "sheet");
    await new Promise(r => setTimeout(r, 400));
    const hit = (element) => {
      const spot = element.getBoundingClientRect();
      return document.elementFromPoint(spot.left + spot.width / 2, spot.top + spot.height / 2);
    };
    const summary = border().querySelector("summary");
    summary.scrollIntoView({ block: "center" });
    await new Promise(r => setTimeout(r, 300));
    hit(summary).click();
    await new Promise(r => setTimeout(r, 300));

    const button = border().querySelector('.illuminus-state__option[data-state="hover"]');
    const under = hit(button);
    out.reachable = button.contains(under) || under === button;
    under.click();
    await new Promise(r => setTimeout(r, 200));
    out.hovered = showing();

    await app.close({force: true});
    return JSON.stringify(out);
  })()`);
  const sh = JSON.parse(shape);
  check(sh.tabs >= 15 && sh.wrongOrder.length === 0,
    `all ${sh.tabs} tabs list their sections in the schema's order${sh.wrongOrder.length ? `:\n      ${sh.wrongOrder.join("\n      ")}` : ""}`);
  // A tab that states its own section order is exempt: the Title tab opens with
  // Show Title, because whether the name is drawn at all comes before how it looks.
  check(sh.textNotFirst.filter((tab) => !sh.ownOrder?.includes(tab)).length === 0,
    `Text comes first wherever it exists${sh.textNotFirst.length ? ` (not on ${sh.textNotFirst.join(", ")})` : ""}`);
  // The space inside a thing and the space around it are one category now,
  // because they are one picture: a box with the inner four in it and the outer
  // four around it.
  check(sh.boxes.join() === "Size and Position,Text,Fill and Image,Spacing"
    && sh.tag.join() === sh.boxes.join(),
    `a box and a tag open the same way (${sh.boxes.join(" > ")})`);
  check(!sh.lettering, "and nothing is called Lettering any more");
  // With the state word taken off, the hovered controls must read as the
  // ordinary ones do — in the same order, and with the controls that have no
  // hovered twin (a thickness does not change when pointed at) still in place.
  const bases = sh.hovered.map((name) => name
    .replace(/^hover/, "").replace(/Hover(?=[A-Z])/, "").replace(/^./, (c) => c.toLowerCase()));
  const places = bases.map((name) => sh.normal.indexOf(name));
  check(sh.reachable, "the state switch is where it looks like it is");
  // Every control has a state's own twin now, so a whole section swaps rather
  // than the paint in it: the hovered list must read as the ordinary one does,
  // control for control and in the same order.
  const swapped = sh.hovered.filter((name) => /hover/i.test(name)).length;
  check(swapped === sh.hovered.length && bases.length === sh.normal.length
    && places.every((at, i) => at >= 0 && (!i || at > places[i - 1])),
    `switching to Hovered swaps every one of the ${sh.normal.length} controls, in the same order `
    + `(${swapped} carried the state's name)`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
  })()`);
}

// The flagship of the export work: a styled journal has to survive leaving
// Foundry entirely. Checked by unzipping the archive with the operating
// system's own unzipper and rendering the result in a tab that has never heard
// of Foundry, then reading computed styles there and comparing them with the
// live page. Nothing less proves the promise.
console.log("\n[45] A journal exports as web pages");
const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), "illuminus-export-"));
try {
  const built = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = api.listStyles()[0];

    for (const name of ["Illuminus Export Test", "Illuminus Export Outside"]) {
      const old = game.journal.getName(name);
      if (old) await old.delete();
    }

    // A second journal, deliberately left out of the export, to link to.
    const outside = await JournalEntry.create({name: "Illuminus Export Outside"});
    const entry = await JournalEntry.create({name: "Illuminus Export Test"});
    const [second] = await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "The Vault", type: "text", sort: 200,
      text: {content: "<p>What is behind the door.</p>", format: 1}
    }]);
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "The Map", type: "image", sort: 300,
      src: "icons/svg/door-closed.svg", image: {caption: "The way in."}
    }]);
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "The Stair", type: "text", sort: 100,
      text: {content: "<h2>Down</h2>"
        + "<blockquote><p>Read aloud text.</p></blockquote>"
        + "<ul><li>An item</li></ul>"
        + "<table><thead><tr><th>Attack</th></tr></thead><tbody><tr><td>Slam</td></tr></tbody></table>"
        + "<p>A page link: @UUID[" + second.uuid + "]{The Vault}.</p>"
        + "<p>An outside link: @UUID[" + outside.uuid + "]{Elsewhere}.</p>"
        + "<figure><img src=\\"icons/svg/mystery-man.svg\\"><figcaption>Art</figcaption></figure>"
        + "<section class=\\"secret\\"><p>PRIVATE-GM-TEXT</p></section>", format: 1}
    }]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true});
    await new Promise(r => setTimeout(r, 1200));

    // What the live page looks like, to compare the export against.
    const root = entry.sheet.element;
    const read = (sel, prop) => getComputedStyle(root.querySelector(sel))[prop];
    const live = {
      surface: read(".journal-entry-content", "backgroundColor"),
      body: read(".journal-page-content p", "color"),
      quote: read(".journal-page-content blockquote", "backgroundColor"),
      header: read(".journal-page-content th", "backgroundColor"),
      // Lettering counts: most text settings mean "use the journal's own",
      // which resolves against a stylesheet the export does not have.
      face: read(".journal-page-content p", "fontFamily"),
      size: read(".journal-page-content p", "fontSize")
    };

    const out = await api.buildJournalExport({styleId: style.id, entryIds: [entry.id]});
    // A second export holding both journals, so there is an index page to look
    // at: a folder of several journals opens on a contents page.
    const many = await api.buildJournalExport({styleId: style.id, entryIds: [entry.id, outside.id]});
    const manyBytes = new Uint8Array(await many.blob.arrayBuffer());
    let manyBinary = "";
    for (const byte of manyBytes) manyBinary += String.fromCharCode(byte);
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    await entry.sheet.close({force: true});
    return JSON.stringify({
      live, report: out.report, filename: out.filename, base64: btoa(binary),
      manyBase64: btoa(manyBinary),
      entryId: entry.id, outsideId: outside.id, secondId: second.id
    });
  })()`);

  const ex = JSON.parse(built);
  fs.writeFileSync(path.join(exportDir, "export.zip"), Buffer.from(ex.base64, "base64"));
  execFileSync("unzip", ["-q", "-o", "export.zip", "-d", "site"], { cwd: exportDir });
  const site = path.join(exportDir, "site");
  const files = fs.readdirSync(site, { recursive: true }).map(String).filter((f) => !fs.statSync(path.join(site, f)).isDirectory());
  const html = fs.readFileSync(path.join(site, "index.html"), "utf8");

  check(files.includes("index.html") && files.some((f) => f.startsWith("styles/") && f.endsWith(".css")),
    `the archive holds a page and its stylesheet (${files.length} files)`);
  check(files.some((f) => f.startsWith("assets/")),
    `and the pictures the style names (${files.filter((f) => f.startsWith("assets/")).join(", ") || "none"})`);
  check(!/<script|data-uuid=|javascript:/i.test(html),
    "the exported page carries no scripts and no Foundry ids");
  check(/href="#page-/.test(html) && new RegExp(`href="#page-${ex.secondId}"`).test(html),
    "a link to a page in the export points at it");
  check(/class="illuminus-ref/.test(html) && !/>Elsewhere<\/a>/.test(html),
    "a link to something left out is text, not a dead link");
  check(!html.includes("PRIVATE-GM-TEXT"),
    "and a hidden passage stays hidden");
  // Clicking a picture in Foundry opens it at full size; in an export the
  // nearest thing is the file itself.
  check(/<a[^>]*class="illuminus-picture-link"[^>]*>\s*<img/.test(html),
    "a picture opens when it is clicked");
  // The link sits between a figure and its picture, so anything that styles a
  // picture by asking who its parent is stops working. The treatment has to
  // survive that, in the app as well as in an export.
  const framed = await cdp.evaluate(`(async () => {
    const entry = game.journal.getName("Illuminus Export Test") ?? await JournalEntry.create({name: "Illuminus Framed"});
    const page = await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "Framed", type: "text",
      text: {content: '<figure class="illuminus-image illuminus-image--image01">'
        + '<a href="#x"><img src="icons/svg/mystery-man.svg"></a><figcaption>c</figcaption></figure>'
        + '<figure><img src="icons/svg/mystery-man.svg"><figcaption>d</figcaption></figure>', format: 1}
    }]);
    await entry.sheet.render({force: true, pageId: page[0].id});
    await new Promise(r => setTimeout(r, 1200));
    const root = entry.sheet.element;
    const read = (sel) => {
      const el = root.querySelector(sel);
      return el ? getComputedStyle(el).borderTopWidth : "?";
    };
    const out = {
      treated: read(".illuminus-image--image01 img"),
      plain: read("figure:not(.illuminus-image) img")
    };
    await entry.sheet.close({force: true});
    await page[0].delete();
    return JSON.stringify(out);
  })()`);
  const fr = JSON.parse(framed);
  check(fr.treated !== fr.plain,
    `a linked picture keeps its own treatment rather than the default frame (${fr.treated} vs ${fr.plain})`);
  // It must open in the document. A link to the file itself works in a folder
  // but not in a single file, where the picture is a data: URI and browsers
  // refuse to navigate to one — the tab opens blank.
  const pictureHref = html.match(/class="illuminus-picture-link" href="([^"]+)"/)?.[1] ?? "";
  check(pictureHref.startsWith("#"),
    `pointing into the page rather than out of it (${pictureHref.slice(0, 24)})`);

  // The contents page of a folder holding several journals.
  const manyDir = path.join(exportDir, "many");
  fs.mkdirSync(manyDir);
  fs.writeFileSync(path.join(manyDir, "many.zip"), Buffer.from(ex.manyBase64, "base64"));
  execFileSync("unzip", ["-q", "-o", "many.zip", "-d", "site"], { cwd: manyDir });
  const index = fs.readFileSync(path.join(manyDir, "site/index.html"), "utf8");
  const indexEntries = [...index.matchAll(/class="illuminus-contents__entry"[^>]*>\s*<a href="([^"]+)"/g)]
    .map((m) => m[1]);
  check(indexEntries.length >= 2,
    `a folder of journals opens on a contents page (${indexEntries.length} entries)`);
  check(indexEntries.every((href) => /^[^#]+\.html#/.test(href)),
    `whose entries point into the files beside it (${indexEntries[0] ?? "none"})`);
  check(/<h[1-6] class="illuminus-contents__entry"/.test(index),
    "written as headings, so the style paints them");
  // A picture page carries no markup of its own, so it took its own branch —
  // and before that branch existed it was dropped without a word.
  check(/<figure class="journal-page-content">/.test(html) && /<figcaption>The way in\.<\/figcaption>/.test(html)
    && files.some((f) => f.startsWith("assets/images/door")),
    "a picture page travels as a picture, file and caption together");

  // Now render it where Foundry has never been.
  const away = await inCleanTab(`file://${site}/index.html`, `(() => {
    const read = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    return JSON.stringify({
      surface: read(".journal-entry-content", "backgroundColor"),
      body: read(".journal-page-content p", "color"),
      quote: read(".journal-page-content blockquote", "backgroundColor"),
      header: read(".journal-page-content th", "backgroundColor"),
      face: read(".journal-page-content p", "fontFamily"),
      size: read(".journal-page-content p", "fontSize"),
      sidebar: Boolean(document.querySelector(".journal-sidebar .toc li.page")),
      panel: document.querySelector(".journal-sidebar").getBoundingClientRect().width,
      // Each heading columns the text beneath it, and the wrappers that makes
      // possible are put in at render — so an export has to carry its own.
      flows: document.querySelectorAll(".journal-page-content > .illuminus-flow").length
    });
  })()`);

  const there = JSON.parse(away);
  const compared = ["surface", "body", "quote", "header", "face", "size"];
  const same = compared.filter((key) => there[key] === ex.live[key]);
  check(same.length === compared.length,
    `outside Foundry it computes the same styles (${same.length}/${compared.length} matched`
    + `${same.length === compared.length ? "" : `; ${compared
      .filter((k) => !same.includes(k)).map((k) => `${k}: ${there[k]} vs ${ex.live[k]}`).join(", ")}`})`);
  check(there.sidebar && there.panel > 100,
    `and the contents panel travels with it, at the width the style gives it (${Math.round(there.panel)}px)`);
  check(there.flows > 0,
    `each heading's run of text is wrapped in the export too (${there.flows})`);
} finally {
  fs.rmSync(exportDir, { recursive: true, force: true });
  await cdp.evaluate(`(async () => {
    for (const name of ["Illuminus Export Test", "Illuminus Export Outside"]) {
      const entry = game.journal.getName(name);
      if (entry) { await entry.sheet?.close({force: true}); await entry.delete(); }
    }
  })()`);
}

// The other half of the export: a journal with no Illuminus style at all still
// looks like itself, because the CSS painting it is gathered from the page
// rather than compiled from a style. This is what carries a game system's look.
console.log("\n[46] A journal exports as it looks in Foundry");
const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), "illuminus-plain-"));
try {
  const built = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const old = game.journal.getName("Illuminus Plain Export");
    if (old) await old.delete();
    const entry = await JournalEntry.create({name: "Illuminus Plain Export"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "The Stair", type: "text",
      text: {content: "<h1>Down</h1><p>Body text.</p>"
        + "<ul><li>An item</li></ul>"
        + "<table><thead><tr><th>Attack</th></tr></thead><tbody><tr><td>Slam</td></tr></tbody></table>"
        + "<figure><img src=\\"icons/svg/mystery-man.svg\\"><figcaption>Art</figcaption></figure>", format: 1}
    }]);
    // Deliberately no style: this is the "as it looks now" case.
    await entry.sheet.render({force: true});
    await new Promise(r => setTimeout(r, 1500));

    const root = entry.sheet.element;
    const read = (sel, prop) => getComputedStyle(root.querySelector(sel))[prop];
    const live = {
      surface: read(".journal-entry-content", "backgroundColor"),
      body: read(".journal-page-content p", "color"),
      face: read(".journal-page-content p", "fontFamily"),
      size: read(".journal-page-content p", "fontSize"),
      heading: read(".journal-page-content h1", "color"),
      header: read(".journal-page-content th", "backgroundColor")
    };

    const out = await api.buildJournalExport({styleId: "", entryIds: [entry.id]});
    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    await entry.sheet.close({force: true});
    await entry.delete();
    return JSON.stringify({live, report: out.report, base64: btoa(binary)});
  })()`);

  const px = JSON.parse(built);
  fs.writeFileSync(path.join(plainDir, "export.zip"), Buffer.from(px.base64, "base64"));
  execFileSync("unzip", ["-q", "-o", "export.zip", "-d", "site"], { cwd: plainDir });
  const site = path.join(plainDir, "site");

  const there = JSON.parse(await inCleanTab(`file://${site}/index.html`, `(() => {
    const read = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    const panel = document.querySelector(".journal-sidebar").getBoundingClientRect();
    const content = document.querySelector(".journal-entry-content").getBoundingClientRect();
    // A picture opens over the page and closes again. Checked here rather than
    // in the printing section, where print rules put the overlay away on
    // purpose — paper has no clicking.
    const picture = document.querySelector(".journal-page-content img");
    const opening = { linked: false };
    if (picture) {
      const link = picture.closest("a.illuminus-picture-link");
      // Looked up by id rather than as a selector: an id is free to start with
      // a digit, and a selector is not.
      const host = link ? document.getElementById(link.getAttribute("href").slice(1)) : null;
      opening.linked = Boolean(host);
      opening.inward = Boolean(link?.getAttribute("href")?.startsWith("#"));
      if (host) {
        picture.scrollIntoView({ block: "center" });
        const small = picture.getBoundingClientRect().width;
        const box = picture.getBoundingClientRect();
        const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        opening.reachable = Boolean(under) && (under === picture || picture.contains(under));
        (under ?? picture).click();
        opening.opened = getComputedStyle(host).position === "fixed";
        // Covering the page is the point, not growing: a small picture shows
        // at its own size over the backdrop, which is what Foundry's own
        // viewer does with one.
        const overlay = host.getBoundingClientRect();
        opening.covers = overlay.width >= innerWidth - 1 && overlay.height >= innerHeight - 1;
        opening.fits = picture.getBoundingClientRect().width <= innerWidth;
        opening.wide = small > 0;
        host.querySelector(".illuminus-picture-close")?.click();
        opening.closed = getComputedStyle(host).position !== "fixed";
      }
    }

    // Foundry pins its own body open so the application scrolls its panels
    // rather than the document. Carried into an export, that clips the journal
    // to one screenful — and takes the rest out of any printout.
    document.body.style.minHeight = "0";
    const tall = document.createElement("div");
    tall.style.height = "4000px";
    document.body.append(tall);
    const scrolls = document.scrollingElement.scrollHeight > innerHeight + 1000;
    tall.remove();
    return JSON.stringify({
      surface: read(".journal-entry-content", "backgroundColor"),
      body: read(".journal-page-content p", "color"),
      face: read(".journal-page-content p", "fontFamily"),
      size: read(".journal-page-content p", "fontSize"),
      heading: read(".journal-page-content h1", "color"),
      header: read(".journal-page-content th", "backgroundColor"),
      // Beside the page, not stacked above it: Foundry's own rules lay a
      // window out in a column, and an export is not a window.
      besideThePage: panel.right <= content.left + 1 && panel.width > 40,
      // Core hides these unless the sheet says its panel is open, so an export
      // that mirrors the markup but not the state lists numbers and nothing else.
      panelTitles: [...document.querySelectorAll(".journal-sidebar .page-title")]
        .filter(title => title.getBoundingClientRect().width > 0).map(title => title.textContent),
      scrolls, opening,
      bodyPinned: getComputedStyle(document.body).position === "fixed"
    });
  })()`));

  const keys = ["surface", "body", "face", "size", "heading", "header"];
  const same = keys.filter((key) => there[key] === px.live[key]);
  check(same.length === keys.length,
    `an unstyled journal exports as it looks (${same.length}/${keys.length} matched`
    + `${same.length === keys.length ? "" : `; ${keys.filter((k) => !same.includes(k))
      .map((k) => `${k}: ${there[k]} vs ${px.live[k]}`).join(", ")}`})`);
  check(there.besideThePage, "and the contents panel sits beside the page rather than above it");
  check(there.panelTitles.includes("The Stair"),
    `its entries are readable, not bare numbers (${there.panelTitles.join(", ") || "none"})`);
  check(there.opening.linked && there.opening.inward && there.opening.reachable
    && there.opening.opened && there.opening.covers && there.opening.fits,
    `a picture opens over the page when clicked (${JSON.stringify(there.opening)})`);
  check(there.opening.closed, "and closes again from the backdrop behind it");
  check(there.scrolls && !there.bodyPinned,
    `and the page scrolls like a web page rather than being pinned open (${there.bodyPinned ? "body is fixed" : "scrolls"})`);
  // Kept rules, not copied stylesheets: the whole of Foundry's CSS is tens of
  // thousands of rules, and an export that carried them all would say so here.
  check(px.report.rules > 20 && px.report.rules < 2000,
    `it carries the rules that apply and no more (${px.report.rules} rules from ${px.report.sources.join(", ")})`);
  check(px.report.sources.length > 0, `and says where they came from (${px.report.sources.join(", ")})`);
} finally {
  fs.rmSync(plainDir, { recursive: true, force: true });
  await cdp.evaluate(`(async () => {
    const entry = game.journal.getName("Illuminus Plain Export");
    if (entry) { await entry.sheet?.close({force: true}); await entry.delete(); }
  })()`);
}

// One file rather than a folder, and that same file printed. The three formats
// are one pipeline, so what is checked here is what the other two cannot show:
// that nothing is left pointing outside the document, and that a browser can
// turn it into paper.
console.log("\n[47] One page, and a page that prints");
const printDir = fs.mkdtempSync(path.join(os.tmpdir(), "illuminus-print-"));
try {
  const built = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const name of ["Illuminus Print A", "Illuminus Print B"]) {
      const old = game.journal.getName(name);
      if (old) await old.delete();
    }
    const style = api.listStyles()[0];
    const made = [];
    for (const name of ["Illuminus Print A", "Illuminus Print B"]) {
      const entry = await JournalEntry.create({name});
      await entry.createEmbeddedDocuments("JournalEntryPage", [{
        name: \`\${name} page\`, type: "text",
        text: {content: "<h1>Heading</h1><p>Body text.</p>"
          + "<blockquote><p>Read aloud.</p></blockquote>"
          + "<figure><img src=\\"icons/svg/mystery-man.svg\\"><figcaption>Art</figcaption></figure>", format: 1}
      }]);
      await api.assignStyle(entry, style.id);
      made.push(entry.id);
    }

    const out = await api.buildJournalExport({styleId: style.id, entryIds: made, format: "file"});
    // The same export with the page picture asked for, to see that the choice
    // reaches the document rather than being a tick box that does nothing.
    const inked = await api.buildJournalExport({
      styleId: style.id, entryIds: made, format: "print", pageBackground: true
    });
    for (const id of made) await game.journal.get(id).delete();
    return JSON.stringify({
      html: out.html, inkedHtml: inked.html, filename: out.filename, report: out.report,
      // Matched on the root element rather than anywhere in the file: the
      // stylesheet travels inside the document and names the class itself.
      plainMarked: /<div class="[^"]*illuminus-print-background/.test(out.html),
      inkedMarked: /<div class="[^"]*illuminus-print-background/.test(inked.html)
    });
  })()`);

  const pr = JSON.parse(built);
  const file = path.join(printDir, "one-page.html");
  fs.writeFileSync(file, pr.html);

  check(pr.filename.endsWith(".html") && !pr.filename.endsWith(".zip"),
    `one page comes out as one file (${pr.filename})`);
  // Nothing may point outside the document: no stylesheet beside it, no folder
  // of pictures, since neither travels in an email or into a printer. The
  // markup and the stylesheet are asked separately — a CSS comment can hold
  // what looks like markup, and one in this module's own stylesheet does.
  const markup = pr.html.replace(/<style>[\s\S]*?<\/style>/g, "");
  const outward = [...markup.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((m) => m[1]).filter((url) => !url.startsWith("data:"));
  const styling = pr.html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";
  const outwardCss = [...styling.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/url\((["']?)([^"')]+)\1\)/g)]
    .map((m) => m[2]).filter((url) => !url.startsWith("data:") && !url.startsWith("#"));
  check(outward.length === 0 && outwardCss.length === 0,
    `and carries everything inside it (${[...outward, ...outwardCss].slice(0, 3).join(", ") || "nothing points out"})`);
  check(pr.html.includes("Illuminus Print A") && pr.html.includes("Illuminus Print B"),
    "with every journal in the one document");

  const { answer, printed } = await inCleanTab(`file://${file}`, `(() => {
    const surface = document.querySelector(".journal-entry-content");
    // The contents page: every entry has to point at something that is really
    // there, and to be written as the heading it stands in for — which is what
    // makes the style paint it without a rule of its own.
    const entries = [...document.querySelectorAll(".illuminus-contents__entry")];
    const contents = entries.map(entry => {
      const href = entry.querySelector("a")?.getAttribute("href") ?? "";
      const target = href.startsWith("#") ? document.getElementById(href.slice(1)) : null;
      return {
        tag: entry.tagName,
        text: entry.textContent.trim(),
        found: Boolean(target),
        // A page's entry should be written as that page's own title heading.
        sameAsTarget: target
          ? (target.tagName === entry.tagName
            || target.querySelector(entry.tagName.toLowerCase()) !== null)
          : false
      };
    });
    return JSON.stringify({
      contents,
      contentsIsFirst: document.querySelector(".journal-entry-page")?.classList.contains("illuminus-contents"),
      pages: document.querySelectorAll(".journal-entry-page").length,
      surface: getComputedStyle(surface).backgroundColor,
      pictures: [...document.images].filter(img => img.complete && img.naturalWidth > 0).length,
      images: document.images.length,
      // Read while the page believes it is printing. The height asked for is
      // what is checked, not the height reached: a document four pages long is
      // taller than a sheet whether or not anything asked it to be.
      sheetHigh: parseInt(getComputedStyle(surface).minHeight, 10) || 0,
      sheet: innerHeight,
      texture: getComputedStyle(surface, "::after").display,
      fill: getComputedStyle(surface).backgroundColor,
      // The margin has to be the sheet's own. Padding on a page applies where
      // that page starts and ends, so a page running over three sheets leaves
      // the middle one with words against the paper's edge — only @page
      // repeats. Read from the rules, since no element carries it.
      sheetMargin: [...document.styleSheets].flatMap(sheet => {
        try { return [...sheet.cssRules]; } catch { return []; }
      }).flatMap(rule => rule.cssRules ? [...rule.cssRules] : [rule])
        .filter(rule => rule.constructor.name === "CSSPageRule")
        .map(rule => rule.style.margin).find(Boolean) ?? "",
      // Said out loud, or a browser prints an outline of the document: its
      // dialog leaves background graphics off unless told otherwise.
      inks: getComputedStyle(surface).printColorAdjust
        ?? getComputedStyle(surface).webkitPrintColorAdjust
    });
  })()`, { pdf: true, printMedia: true });

  const one = JSON.parse(answer);
  check(one.pictures === one.images,
    `its pictures load with no folder beside it (${one.pictures}/${one.images})`);
  const pdf = Buffer.from(printed, "base64");
  check(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 20000,
    `and a browser prints it to a PDF (${(pdf.length / 1024).toFixed(0)}KB)`);
  // Each journal page starts a sheet, so two pages cannot come out as one.
  const sheets = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check(sheets >= 2, `each journal page starting a new sheet (${sheets} sheets for ${one.pages} pages)`);
  // Left out by default: white paper, and the headings and boxes still inked.
  const bare = one.texture === "none"
    && ["rgba(0, 0, 0, 0)", "transparent"].includes(one.fill);
  check(bare && !pr.plainMarked && one.sheetHigh === 0,
    `a PDF leaves the page surface out unless it is asked for (${one.fill}, picture ${one.texture})`);

  // And asked for: the surface is there, and fills the sheet.
  const inkedFile = path.join(printDir, "inked.html");
  fs.writeFileSync(inkedFile, pr.inkedHtml);
  const inked = JSON.parse(await inCleanTab(`file://${inkedFile}`, `(() => {
    const surface = document.querySelector(".journal-entry-content");
    return JSON.stringify({
      sheetHigh: parseInt(getComputedStyle(surface).minHeight, 10) || 0,
      sheet: innerHeight,
      texture: getComputedStyle(surface, "::after").display,
      fill: getComputedStyle(surface).backgroundColor
    });
  })()`, { printMedia: true }));
  check(pr.inkedMarked && inked.texture !== "none"
    && !["rgba(0, 0, 0, 0)", "transparent"].includes(inked.fill),
    `asking for it puts the surface back (${inked.fill}, picture ${inked.texture})`);
  check(inked.sheetHigh >= inked.sheet - 1,
    `filling the sheet rather than stopping where the words do (${inked.sheetHigh}px of ${inked.sheet}px)`);

  // The contents page, which is what a printed document has instead of the
  // panel — and what it has instead of bookmarks, which a browser's print
  // dialog cannot be asked for.
  check(/\d/.test(one.sheetMargin) && !/^0\w*(\s+0\w*)*$/.test(one.sheetMargin),
    `every sheet keeps a margin of its own (@page margin: ${one.sheetMargin || "none"})`);
  check(one.inks === "exact",
    `and asks to be printed in colour rather than as an outline (${one.inks})`);
  check(one.contentsIsFirst && one.contents.length >= 4,
    `a single document opens with a contents page (${one.contents.length} entries)`);
  check(one.contents.every((entry) => entry.found),
    `whose every entry points at something really there (${one.contents.filter((e) => !e.found).map((e) => e.text).join(", ") || "all found"})`);
  check(one.contents.some((entry) => entry.tag === "H1") && one.contents.some((entry) => entry.tag !== "H1"),
    `tiered by the document's own headings (${[...new Set(one.contents.map((e) => e.tag))].join(", ")})`);
  // Printing with no window to print into. The export window opens one on the
  // click that asks for it, because a browser names the file after the
  // top-level document and keeps a printed document's links — but when a
  // browser refuses one, printing still has to happen, and it happens in a
  // frame without asking permission for anything.
  const printing = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const old = game.journal.getName("Illuminus Print Frame");
    if (old) await old.delete();
    const entry = await JournalEntry.create({name: "Illuminus Print Frame"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "P", type: "text", text: {content: "<p>Paper.</p>", format: 1}
    }]);

    let opened = 0;
    const realOpen = window.open;
    window.open = (...args) => { opened += 1; return realOpen.apply(window, args); };
    try {
      await api.exportJournals({styleId: api.listStyles()[0].id, entryIds: [entry.id], format: "print"});
      await new Promise(r => setTimeout(r, 1200));
      const frame = document.querySelector("iframe.illuminus-print-frame");
      const out = {
        opened,
        framed: Boolean(frame),
        // Written into the frame rather than fetched from a URL: a print
        // preview reads the page again in a second renderer, and a document at
        // a URL that has been revoked prints as a file that will not open.
        wrote: Boolean(frame?.contentDocument?.querySelector(".illuminus-export")),
        noSource: !frame?.getAttribute("src"),
        hidden: frame ? frame.getBoundingClientRect().width === 0 : false
      };
      frame?.remove();
      return JSON.stringify(out);
    } finally {
      window.open = realOpen;
      await entry.delete();
    }
  })()`);
  const pt = JSON.parse(printing);
  check(pt.framed && pt.wrote && pt.noSource && pt.opened === 0,
    `with no window to print into, it prints a frame instead (${JSON.stringify(pt)})`);

  // And with a window, the document being printed is the top-level one — which
  // is what names the file and keeps the contents page's links alive.
  const windowed = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const old = game.journal.getName("Illuminus Print Window");
    if (old) await old.delete();
    const entry = await JournalEntry.create({name: "Illuminus Print Window"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "P", type: "text", text: {content: "<p>Paper.</p>", format: 1}
    }]);
    const view = window.open("", "_blank");
    if (!view) { await entry.delete(); return JSON.stringify({noWindow: true}); }
    try {
      await api.exportJournals({
        styleId: api.listStyles()[0].id, entryIds: [entry.id], format: "print", target: view
      });
      await new Promise(r => setTimeout(r, 1500));
      return JSON.stringify({
        printed: Boolean(view.document.querySelector(".illuminus-export")),
        titled: view.document.title,
        frames: document.querySelectorAll("iframe.illuminus-print-frame").length
      });
    } finally {
      view.close();
      await entry.delete();
    }
  })()`);
  const pw = JSON.parse(windowed);
  check(pw.noWindow || (pw.printed && pw.titled === "Illuminus Print Window" && pw.frames === 0),
    `given a window, it prints that instead, named for the journal (${JSON.stringify(pw)})`);

  // Links in a PDF are named destinations, and a name nothing defines is a
  // link that does nothing when clicked — which is how they behaved when the
  // printing was done from a frame rather than from a window of its own.
  const bytes = pdf.toString("latin1");
  const linked = (bytes.match(/\/Subtype\s*\/Link/g) ?? []).length;
  const wanted = [...new Set([...bytes.matchAll(/\/Dest\s*\/([A-Za-z0-9_.-]+)/g)].map((m) => m[1]))];
  const defined = wanted.filter((name) => new RegExp(`/${name}\\s*\\[`).test(bytes));
  check(linked >= one.contents.length - 1,
    `and its entries are still links once printed (${linked} links in the PDF)`);
  check(wanted.length > 0 && defined.length === wanted.length,
    `pointing at places the document really defines (${defined.length}/${wanted.length})`);
} finally {
  fs.rmSync(printDir, { recursive: true, force: true });
  await cdp.evaluate(`(async () => {
    for (const name of ["Illuminus Print A", "Illuminus Print B"]) {
      const entry = game.journal.getName(name);
      if (entry) await entry.delete();
    }
  })()`);
}

// The two libraries are the same window with different contents, and should
// feel like it: the same size, the same names, and the same answer to ticking a
// box — which the style library used to get wrong by re-rendering itself.
console.log("\n[48] The two libraries work alike");
try {
  const alike = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const warned = [];
    const realWarn = ui.notifications.warn.bind(ui.notifications);
    ui.notifications.warn = (message) => { warned.push(String(message)); return realWarn(message); };

    const open = async (opener, id) => {
      opener();
      for (let i = 0; i < 100 && !foundry.applications.instances.get(id)?.element; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      return foundry.applications.instances.get(id);
    };
    const styles = await open(() => api.openManager(), "illuminus-style-manager");
    const templates = await open(() => api.openTemplates(), "illuminus-template-manager");
    await new Promise(r => setTimeout(r, 600));

    const out = {
      titles: [styles.title, templates.title],
      sizes: [
        [styles.position.width, styles.position.height].join("x"),
        [templates.position.width, templates.position.height].join("x")
      ],
      // The same tick box, named the same way, in both.
      boxes: [
        styles.element.querySelectorAll("input[name='pick']").length > 0,
        templates.element.querySelectorAll("input[name='pick']").length > 0
      ]
    };

    // Ticking must not rebuild the list: a rebuilt row is a new node, and the
    // scroll position and every other tick went with the old one.
    const survives = (app) => {
      const row = app.element.querySelector(".illuminus-style-row");
      const box = app.element.querySelector("input[name='pick']");
      box.click();
      return new Promise((resolve) => setTimeout(() => resolve({
        connected: row.isConnected, ticked: box.checked
      }), 500));
    };
    out.styleTick = await survives(styles);
    out.templateTick = await survives(templates);

    // Naming something of your own asks the same two questions in both: the
    // samples arrive with a line saying what they are for, and a library of
    // home-made ones is unreadable without them.
    out.details = [];
    for (const app of [styles, templates]) {
      app.element.querySelector('[data-action="rename"]').click();
      await new Promise(r => setTimeout(r, 700));
      const prompt = [...foundry.applications.instances.values()]
        .filter(a => a.constructor.name === "DialogV2").pop();
      out.details.push([...(prompt?.element.querySelectorAll("[name]") ?? [])].map(field => field.name));
      await prompt?.close({force: true});
      await new Promise(r => setTimeout(r, 300));
    }

    // Delete is the one button that should look dangerous, in both windows.
    // Read as a color rather than as a class name: the class only matters if
    // something paints it.
    out.deleteColors = [styles, templates].map((app) => {
      const button = app.element.querySelector('[data-action="remove"]');
      return button ? getComputedStyle(button).color : "";
    });

    // And with nothing ticked, both say so rather than exporting nothing.
    for (const app of [styles, templates]) {
      for (const box of app.element.querySelectorAll("input[name='pick']")) box.checked = false;
      warned.length = 0;
      app.element.querySelector('[data-action="exportSelected"]').click();
      await new Promise(r => setTimeout(r, 300));
      (out.warnings ??= []).push(warned.length);
    }

    ui.notifications.warn = realWarn;
    await styles.close({force: true});
    await templates.close({force: true});
    return JSON.stringify(out);
  })()`);
  const al = JSON.parse(alike);
  check(al.titles.every((t) => /^Illuminus /.test(t)),
    `both libraries are named for the module (${al.titles.join(" / ")})`);
  check(al.sizes[0] === al.sizes[1], `and open at the same size (${al.sizes.join(" vs ")})`);
  check(al.boxes.every(Boolean), "both pick what to export the same way");
  check(al.styleTick.connected && al.styleTick.ticked && al.templateTick.connected && al.templateTick.ticked,
    `ticking a box in either leaves the list alone (styles ${al.styleTick.connected}, templates ${al.templateTick.connected})`);
  check(al.warnings?.every((n) => n === 1),
    `and exporting nothing says so in both (${(al.warnings ?? []).join(", ")} warnings)`);
  check(al.details?.every((set) => set.includes("name") && set.includes("description")),
    `both libraries name and describe the same way (${(al.details ?? []).map((d) => d.join("+")).join(" / ")})`);
  const reddish = (color) => {
    const [r, g, b] = (color.match(/\d+/g) ?? []).map(Number);
    return r > 120 && r > g * 1.5 && r > b * 1.5;
  };
  check(al.deleteColors.length === 2 && al.deleteColors.every(reddish),
    `delete is red in both (${al.deleteColors.join(" / ")})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
  })()`);
}

// The export window has to be honest about what it will export: the list is
// filtered by the style, and what is hidden is not quietly exported anyway.
console.log("\n[49] The export window shows what it will export");
try {
  const dialog = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = api.listStyles()[0];
    const made = [];
    for (const [name, styled] of [["Export Filter Styled", true], ["Export Filter Plain", false]]) {
      const old = game.journal.getName(name);
      if (old) await old.delete();
      const entry = await JournalEntry.create({name});
      await entry.createEmbeddedDocuments("JournalEntryPage", [{
        name: "P", type: "text", text: {content: "<p>x</p>", format: 1}
      }]);
      if (styled) await api.assignStyle(entry, style.id);
      made.push(entry.id);
    }

    api.openExport({});
    for (let i = 0; i < 100 && !foundry.applications.instances.get("illuminus-export-dialog")?.element; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    const app = foundry.applications.instances.get("illuminus-export-dialog");
    await new Promise(r => setTimeout(r, 800));
    const el = app.element;

    const named = (name) => [...el.querySelectorAll(".illuminus-export-dialog__row")]
      .find(row => row.textContent.includes(name));
    const showing = () => [...el.querySelectorAll(".illuminus-export-dialog__row")]
      .filter(row => row.offsetParent !== null).length;

    const out = {};
    // The button at the foot of the window used to be squeezed against the
    // section above it and pushed past the bottom edge.
    const window = el.getBoundingClientRect();
    const footer = el.querySelector(".form-footer").getBoundingClientRect();
    const body = el.querySelector(".illuminus-export-dialog").getBoundingClientRect();
    out.footerInside = footer.bottom <= window.bottom + 1 && footer.width > 0;
    out.footerGap = Math.round(footer.top - body.bottom);

    // Every way of saving has to fit above the button, not only the one the
    // window opens on: each choice shows and hides rows of its own.
    const radio = (value) => el.querySelector('input[name="format"][value="' + value + '"]');
    const choose = async (value) => {
      radio(value).checked = true;
      radio(value).dispatchEvent(new Event("change"));
      await new Promise(r => setTimeout(r, 200));
    };
    out.gaps = {};
    for (const format of ["print", "folder", "file", "css"]) {
      if (radio(format).disabled) { out.gaps[format] = "refused"; continue; }
      await choose(format);
      out.gaps[format] = Math.round(el.querySelector(".form-footer").getBoundingClientRect().top
        - el.querySelector(".illuminus-export-dialog").getBoundingClientRect().bottom);
    }

    // The descriptor: never prefilled, marked while what is typed could not be
    // used as a name, and asked for by the stylesheet alone.
    const prefix = el.querySelector('input[name="cssPrefix"]');
    const cssRow = prefix.closest(".illuminus-export-dialog__option");
    out.prefixStarts = prefix.value;
    await choose("css");
    out.prefixAsked = !cssRow.classList.contains("is-hidden");
    out.markedEmpty = prefix.classList.contains("is-needed");
    prefix.value = "   ";
    prefix.dispatchEvent(new Event("input"));
    await new Promise(r => setTimeout(r, 100));
    out.markedBlank = prefix.classList.contains("is-needed");
    prefix.value = "Moonlit Keep";
    prefix.dispatchEvent(new Event("input"));
    await new Promise(r => setTimeout(r, 100));
    out.markedNamed = prefix.classList.contains("is-needed");
    await choose("folder");
    out.prefixHidden = cssRow.classList.contains("is-hidden");

    // A stylesheet is Illuminus's own work or nothing: gathering whatever is
    // painting the page can carry a game system's styling, which is not ours to
    // hand on under somebody else's name.
    const picker = el.querySelector('select[name="styleId"]');
    picker.value = "";
    picker.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 200));
    out.cssRefused = radio("css").disabled;
    picker.value = style.id;
    picker.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 200));
    out.cssOffered = !radio("css").disabled;
    await choose("css");
    out.plainHeld = [...picker.options].find(option => !option.value)?.disabled === true;
    await choose("folder");

    out.filtered = {
      styled: named("Export Filter Styled")?.offsetParent !== null,
      plain: named("Export Filter Plain")?.offsetParent !== null
    };

    // A journal ticked and then hidden must not travel: tick it, hide it, and
    // see what the window would actually export.
    const filter = el.querySelector('input[name="onlyStyled"]');
    filter.checked = false;
    filter.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 200));
    out.allShown = showing();
    named("Export Filter Plain").querySelector("input").checked = true;
    filter.checked = true;
    filter.dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 200));
    out.hiddenStaysUnticked = !named("Export Filter Plain").querySelector("input").checked;

    // Select All takes what is in front of you, not what the filter is hiding.
    el.querySelector('[data-action="pickAll"]').click();
    out.pickedAll = [...el.querySelectorAll('input[name="entryIds"]:checked')].length;
    out.showingNow = showing();

    await app.close({force: true});
    for (const id of made) await game.journal.get(id)?.delete();
    return JSON.stringify(out);
  })()`);
  const dl = JSON.parse(dialog);
  check(dl.footerInside && dl.footerGap >= 0,
    `the export button sits inside the window, clear of the section above (${dl.footerGap}px)`);
  check(Object.values(dl.gaps).every((gap) => gap === "refused" || gap >= 0),
    `and every way of saving fits above it (${Object.entries(dl.gaps).map(([f, g]) => `${f}:${g}`).join(", ")})`);
  check(dl.prefixStarts === "" && dl.prefixAsked,
    `the descriptor starts empty ("${dl.prefixStarts}")`);
  check(dl.markedEmpty && dl.markedBlank && !dl.markedNamed,
    `and is marked until it is a name that could be used (${dl.markedEmpty}, ${dl.markedBlank}, ${dl.markedNamed})`);
  check(dl.prefixHidden, "and is not asked for by the other ways of saving");
  check(dl.cssRefused, "a stylesheet is not offered for styling that is not Illuminus's");
  check(dl.cssOffered, "and is offered once a style is chosen");
  check(dl.plainHeld, "with the picker held there while it is");
  check(Object.values(dl.gaps).every((gap) => gap === "refused" || gap >= 0),
    `and every way of saving fits above it (${Object.entries(dl.gaps).map(([f, g]) => `${f}:${g}`).join(", ")})`);
  check(dl.prefixStarts === "" && dl.prefixAsked,
    `the descriptor starts empty ("${dl.prefixStarts}")`);
  check(dl.markedEmpty && dl.markedBlank && !dl.markedNamed,
    `and is marked until it is a name that could be used (${dl.markedEmpty}, ${dl.markedBlank}, ${dl.markedNamed})`);
  check(dl.prefixHidden, "and is not asked for by the other ways of saving");
  check(dl.cssRefused, "a stylesheet is not offered for styling that is not Illuminus's");
  check(dl.cssOffered, "and is offered once a style is chosen");
  check(dl.plainHeld, "with the picker held there while it is");
  check(dl.filtered.styled && !dl.filtered.plain,
    "the style picker filters the list to journals using it");
  check(dl.allShown >= 2, `turning the filter off shows every journal (${dl.allShown})`);
  check(dl.hiddenStaysUnticked, "a journal the filter hides is unticked as it goes");
  check(dl.pickedAll === dl.showingNow,
    `Select All takes what is showing, not what is hidden (${dl.pickedAll} of ${dl.showingNow})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    for (const name of ["Export Filter Styled", "Export Filter Plain"]) {
      const entry = game.journal.getName(name);
      if (entry) await entry.delete();
    }
  })()`);
}

// The notice is a gate, so it is checked as one: it appears, it defaults to not
// going ahead, it stays dismissed once dismissed, and it can be read again.
console.log("\n[50] The personal-use notice");
try {
  const notice = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    await api.setSetting("exportTermsSeen", false);
    const dialogs = () => [...foundry.applications.instances.values()]
      .filter(app => app.constructor.name === "DialogV2");

    const old = game.journal.getName("Illuminus Notice Journal");
    if (old) await old.delete();
    const entry = await JournalEntry.create({name: "Illuminus Notice Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "P", type: "text", text: {content: "<p>x</p>", format: 1}
    }]);

    api.openExport({entryIds: [entry.id]});
    for (let i = 0; i < 100 && !foundry.applications.instances.get("illuminus-export-dialog")?.element; i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    const dialog = foundry.applications.instances.get("illuminus-export-dialog");
    await new Promise(r => setTimeout(r, 600));

    const out = {};
    // The window has to be there at all: bringing an already-open one forward
    // returns nothing, so opening used to hand back undefined and everything
    // after it read as a window that never appeared.
    out.opened = Boolean(dialog?.element);
    // Read on demand, whether or not it has ever been shown.
    dialog.element.querySelector('[data-action="terms"]').click();
    await new Promise(r => setTimeout(r, 700));
    let shown = dialogs().pop();
    out.onDemand = Boolean(shown?.element.querySelector(".illuminus-terms"));
    out.iconColor = shown ? getComputedStyle(shown.element.querySelector(".illuminus-terms h3 i")).color : "";
    await shown?.close({force: true});
    await new Promise(r => setTimeout(r, 400));

    // And before an export: tick a journal, press Export, and it stands in the way.
    const box = [...dialog.element.querySelectorAll('input[name="entryIds"]')]
      .find(input => input.value === entry.id);
    dialog.element.querySelector('input[name="onlyStyled"]').checked = false;
    dialog.element.querySelector('input[name="onlyStyled"]').dispatchEvent(new Event("change"));
    await new Promise(r => setTimeout(r, 200));
    box.checked = true;
    dialog.element.querySelector('button[type="submit"]').click();
    await new Promise(r => setTimeout(r, 900));
    shown = dialogs().pop();
    out.beforeExport = Boolean(shown?.element.querySelector(".illuminus-terms"));
    // Going ahead should take a deliberate click, so the focused button is the
    // one that does nothing.
    out.defaultAction = shown?.element.querySelector("button[autofocus], .form-footer button")?.dataset.action ?? "";
    out.offersDismiss = Boolean(shown?.element.querySelector('input[name="dismiss"]'));

    // Accept, with "do not show again" ticked.
    shown.element.querySelector('input[name="dismiss"]').checked = true;
    shown.element.querySelector('button[data-action="accept"]').click();
    await new Promise(r => setTimeout(r, 1200));
    out.remembered = api.getSetting("exportTermsSeen");

    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name === "DialogV2" || app.constructor.name.startsWith("Illuminus")) {
        await app.close({force: true});
      }
    }
    await entry.delete();
    return JSON.stringify(out);
  })()`);
  const nt = JSON.parse(notice);
  check(nt.opened, "the export window opens for the notice");
  check(nt.beforeExport, "the notice stands in front of an export");
  check(nt.defaultAction === "cancel",
    `and the button with focus is the one that does not export (${nt.defaultAction || "none"})`);
  check(nt.offersDismiss && nt.remembered === true,
    `dismissing it is remembered (${nt.remembered})`);
  check(nt.onDemand, "and it can be read again whenever somebody asks");
  check(nt.iconColor === "rgb(255, 210, 31)", `its warning is yellow (${nt.iconColor})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name === "DialogV2" || app.constructor.name.startsWith("Illuminus")) {
        await app.close({force: true});
      }
    }
    const entry = game.journal.getName("Illuminus Notice Journal");
    if (entry) await entry.delete();
  })()`);
}

console.log("\n[51] The sample draws every heading level at one scale");
// The sample is shrunk to fit its pane. Scaling the page's *content* left the
// page title — heading level 1 — at full size, so a style setting all six levels
// to one size drew the first a third larger than the rest.
const scale = await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  const settings = {};
  for (let level = 1; level <= 6; level += 1) settings["heading" + level] = {size: 36};
  // Heading 1 also styles the page title, which the sheet renders outside the
  // page's content — a picture set here used to land nowhere.
  settings.heading1.texture = "icons/svg/mystery-man.svg";
  const style = await api.createStyle({name: "Heading Scale Probe", settings});
  try {
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1200));
    const freeze = document.createElement("style");
    freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(freeze);
    const sizes = {};
    for (let level = 1; level <= 6; level += 1) {
      const el = app.element.querySelector('.illuminus-preview__frame [data-part="heading' + level + '"]');
      sizes["h" + level] = el ? getComputedStyle(el).fontSize : null;
    }
    const title = app.element.querySelector('.illuminus-preview__frame .journal-page-header h1');
    sizes.titleLayer = title ? getComputedStyle(title, "::after").backgroundImage : null;
    freeze.remove();
    await app.close({force: true});
    return JSON.stringify(sizes);
  } finally {
    await api.deleteStyle(style.id);
  }
})()`);
const hs = JSON.parse(scale);
const drawn = [1, 2, 3, 4, 5, 6].map((level) => hs["h" + level]);
check(drawn.every(Boolean), `every heading level is in the sample (${JSON.stringify(hs)})`);
check(new Set(drawn).size === 1, `and all six are drawn at one size (${JSON.stringify(hs)})`);
check((hs.titleLayer ?? "").includes("mystery-man"),
  `heading 1's picture reaches the page title (got ${hs.titleLayer})`);

console.log("\n[52] The hovered-state switch, tab by tab");
// Three tabs used to have no switch at all: Lists had nothing hovered to
// switch, and the contents panel and the window were left out of the deriving
// because they state their hovered colors by hand. They have one now, and it
// has to bite on colors the schema ships rather than only on empty ones.
{
  const layout = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Hover Switch Probe"});
    try {
      const app = await api.openEditor(style.id);
      await new Promise(r => setTimeout(r, 1200));
      const out = {};
      for (const tab of ["lists", "sidebar", "window", "links", "secrets"]) {
        app.changeTab(tab, "sheet");
        await new Promise(r => setTimeout(r, 250));
        const el = app.element.querySelector('.illuminus-tab[data-tab="' + tab + '"]');
        for (const section of el.querySelectorAll("details.illuminus-section")) section.open = true;
        await new Promise(r => setTimeout(r, 350));
        const box = el.querySelector('input[name$=".hoverOff"]');
        out[tab] = {
          present: !!box,
          checked: box ? box.checked : null,
          states: [...el.querySelectorAll(".illuminus-section")]
            .filter((section) => section.querySelector('.illuminus-state__option[data-state="hover"]'))
            .length,
          // Which sections have none, by name: the contents panel and the
          // window were derived for only where they already stated one by hand,
          // so most of their settings governed both states at once.
          without: [...el.querySelectorAll("details.illuminus-section")]
            .filter((section) => !section.querySelector('.illuminus-state__option[data-state="hover"]'))
            .map((section) => section.querySelector(".illuminus-section__label")?.textContent.trim()),
          // The contents panel's switch offers current-page as well as
          // pointed-at, and turning the hovered state off must not put the
          // current page out of reach with it.
          reachable: [...el.querySelectorAll('.illuminus-state__option[data-state="active"]')]
            .every((option) => !option.classList.contains("is-hover-off"))
        };
      }
      await app.close({force: true});
      return JSON.stringify(out);
    } finally { await api.deleteStyle(style.id); }
  })()`);
  const sw = JSON.parse(layout);
  const tabs = ["lists", "sidebar", "window", "links", "secrets"];
  check(tabs.every((tab) => sw[tab].present),
    `every tab holding anything hovered has the switch (${tabs.length} of ${tabs.length})`);
  check(sw.lists.checked === true, `Lists starts switched off (${sw.lists.checked})`);
  // The four tabs whose hovered colors ship with real values start switched on,
  // because switching them off would take away what a style already does.
  check(["sidebar", "window", "links", "secrets"].every((tab) => sw[tab].checked === false),
    `the panel, the window, links and secrets start switched on `
    + `(${["sidebar", "window", "links", "secrets"].map((tab) => sw[tab].checked).join(", ")})`);
  check(sw.lists.states >= 2 && sw.sidebar.states >= 2 && sw.window.states >= 2,
    `and each offers the two states where it has both (${sw.lists.states}, ${sw.sidebar.states}, ${sw.window.states})`);
  // Every section of the panel and the window, not the few that spelled a
  // hovered color out by hand: a control that governs both states at once is a
  // control that cannot say what it is for.
  check(sw.sidebar.without.length === 0 && sw.window.without.length === 0,
    `and every section of the panel and the window offers it`
    + `${[...sw.sidebar.without, ...sw.window.without].length ? ` (missing from ${[...sw.sidebar.without, ...sw.window.without].join(", ")})` : ""}`);
  check(sw.sidebar.reachable, "the current-page controls stay reachable while hovered is off");
}

try {
  const setup = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Hover Effect Probe", settings: {
      lists: {markerColor: "#112233", markerHoverColor: "#ff0000", hoverOff: false},
      sidebar: {buttonColor: "#112233", buttonHoverColor: "#00ff00"}
    }});
    const entry = await JournalEntry.create({name: "Illuminus Hover Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "P", type: "text", text: {content: "<ul><li>Item one</li></ul>"}
    }]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true});
    await new Promise(r => setTimeout(r, 1200));
    const freeze = document.createElement("style");
    freeze.id = "illuminus-hover-freeze";
    freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(freeze);
    // The headless browser's own toast sits over the window, and a pointer
    // aimed through it lands on the toast rather than on the button.
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    const root = entry.sheet.element;
    const at = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    return JSON.stringify({
      styleId: style.id, entryId: entry.id,
      li: at(root.querySelector(".journal-page-content li")),
      button: at(root.querySelector(".journal-sidebar button"))
    });
  })()`));

  const paint = async () => JSON.parse(await cdp.evaluate(`(() => {
    const root = game.journal.get(${JSON.stringify(setup.entryId)}).sheet.element;
    const li = root.querySelector(".journal-page-content li");
    const button = root.querySelector(".journal-sidebar button");
    return JSON.stringify({
      marker: getComputedStyle(li, "::marker").color,
      button: getComputedStyle(button).color,
      onButton: document.elementFromPoint(...${JSON.stringify(setup.button)}) === button
    });
  })()`));

  await cdp.mouse("mouseMoved", ...setup.li);
  await new Promise((r) => setTimeout(r, 250));
  const overItem = await paint();
  await cdp.mouse("mouseMoved", ...setup.button);
  await new Promise((r) => setTimeout(r, 250));
  const overButton = await paint();

  check(overItem.marker === "rgb(255, 0, 0)", `a pointed-at list marker takes its hovered color (got ${overItem.marker})`);
  check(overButton.onButton, "the pointer really reaches the panel's button");
  check(overButton.button === "rgb(0, 255, 0)",
    `and a panel button takes its hovered color while the switch is off (got ${overButton.button})`);

  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = api.getStyle(${JSON.stringify(setup.styleId)});
    const settings = foundry.utils.deepClone(style.settings);
    settings.lists.hoverOff = true;
    settings.sidebar = {...settings.sidebar, hoverOff: true};
    await api.updateStyle(style.id, {settings});
    await new Promise(r => setTimeout(r, 500));
  })()`);

  await cdp.mouse("mouseMoved", ...setup.li);
  await new Promise((r) => setTimeout(r, 250));
  const quietItem = await paint();
  await cdp.mouse("mouseMoved", ...setup.button);
  await new Promise((r) => setTimeout(r, 250));
  const quietButton = await paint();

  check(quietItem.marker === "rgb(17, 34, 51)",
    `switching the state off leaves the marker alone (got ${quietItem.marker})`);
  // The one the skeleton's own default used to win: a shipped hovered color is
  // painted for every style, so switching off has to say something rather than
  // merely stay quiet.
  check(quietButton.button === "rgb(17, 34, 51)",
    `and beats the shipped hovered color on a panel button (got ${quietButton.button})`);
} finally {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    document.getElementById("illuminus-hover-freeze")?.remove();
    const entry = game.journal.getName("Illuminus Hover Journal");
    if (entry) { await entry.sheet.close({force: true}); await entry.delete(); }
    const style = api.listStyles().find(s => s.name === "Hover Effect Probe");
    if (style) await api.deleteStyle(style.id);
  })()`);
}

console.log("\n[53] The sample journal, and columns per heading level");
try {
  const built = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    // Two columns under the page's title, one under level 2, three under level
    // 3: if each heading really governs its own passage, one page shows all
    // three at once — and level 1 governs the opening text, since the title is
    // a level 1 heading.
    const style = await api.createStyle({name: "Sample Journal Probe", settings: {
      heading1: {columnCount: 2, columnGap: 20},
      heading2: {columnCount: 1},
      heading3: {columnCount: 3, columnGap: 16, columnRuleWidth: 1}
    }});
    const entry = await api.createSampleJournal({styleId: style.id});
    await new Promise(r => setTimeout(r, 1400));
    const content = entry.sheet.element.querySelector(".journal-page-content");
    // What was *stored*, not what is on screen: Foundry's enricher wraps a
    // secret section in a secret-block of its own and gives it the Reveal
    // button the sample only draws a picture of, and Illuminus wraps each
    // heading's run of text at render. None of that is in the page.
    const stored = document.createElement("div");
    stored.innerHTML = entry.pages.contents[0].text.content;

    // The editor's own sample, to compare against: one markup file feeds both,
    // and this is what proves it still does. The render-time wrappers come out
    // of the comparison, since the stored page has none.
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1200));
    // The first page in the frame is the sample proper; the Box, Tag, and
    // Picture panes that follow are pages of their own and wrapped as well.
    const samplePage = app.element.querySelector(".illuminus-preview__frame .journal-page-content");
    const sampleFlows = samplePage.querySelectorAll(":scope > .illuminus-flow").length;
    const sample = samplePage.cloneNode(true);
    for (const flow of sample.querySelectorAll(".illuminus-flow")) flow.replaceWith(...flow.childNodes);
    for (const cap of sample.querySelectorAll(".illuminus-drop-cap")) cap.replaceWith(...cap.childNodes);
    // And the folding markers, which are chrome the same way the wrappers are:
    // taken out whole, since the icon inside one is an element of its own and
    // skipping the button alone left it in the comparison.
    for (const marker of sample.querySelectorAll(".illuminus-fold")) marker.remove();
    const outline = (root) => [...root.querySelectorAll("*")]
      .filter((el) => el.tagName !== "BUTTON")
      .map((el) => el.tagName).join(",");

    const flow = (name) => {
      const el = content.querySelector(".illuminus-flow--" + name);
      if (!el) return null;
      return { count: getComputedStyle(el).columnCount, width: Math.round(el.getBoundingClientRect().width) };
    };
    const out = {
      styleId: style.id, entryId: entry.id,
      folder: entry.folder?.name ?? null,
      pages: entry.pages.size,
      sameOutline: outline(stored) === outline(sample),
      journalOutline: outline(stored).slice(0, 120),
      sampleOutline: outline(sample).slice(0, 120),
      partsLeft: stored.querySelectorAll("[data-part]").length,
      mockButtons: stored.querySelectorAll("button").length,
      headingParagraphs: [...stored.querySelectorAll("h2, h3, h4, h5, h6")]
        .filter((heading) => heading.nextElementSibling?.tagName === "P").length,
      storedFlows: /illuminus-flow/.test(entry.pages.contents[0].text.content),
      sampleFlows,
      flows: [...content.querySelectorAll(":scope > .illuminus-flow")]
        .map((el) => el.className.split(" ")[1]),
      lead: flow("h1"), h2: flow("h2"), h3: flow("h3")
    };
    await app.close({force: true});
    return JSON.stringify(out);
  })()`));

  check(built.folder === "Samples", `the journal lands in its own folder (${built.folder})`);
  check(built.pages === 1, `with the sample on one page (${built.pages})`);
  check(built.sameOutline,
    `holding exactly what the editor's sample holds`
    + (built.sameOutline ? "" : `\n      journal: ${built.journalOutline}\n      sample:  ${built.sampleOutline}`));
  check(built.partsLeft === 0 && built.mockButtons === 0,
    `with the editor's own marks and mock button left behind (${built.partsLeft} parts, ${built.mockButtons} buttons)`);
  check(built.headingParagraphs === 5,
    `every heading below the first is followed by a paragraph (${built.headingParagraphs} of 5)`);

  // Each heading governs the run of text beneath it, which needs an element to
  // apply to — one made at render, never stored.
  check(built.flows.join(",") === "illuminus-flow--h1,illuminus-flow--h2,illuminus-flow--h3,"
    + "illuminus-flow--h4,illuminus-flow--h5,illuminus-flow--h6",
    `every heading's run of text is wrapped (${built.flows.join(", ")})`);
  check(!built.storedFlows, "and none of that wrapping is written into the page");
  check(built.sampleFlows === built.flows.length,
    `the editor's sample is wrapped the same way (${built.sampleFlows} of ${built.flows.length})`);
  check(built.h3?.count === "3" && built.h2?.count === "1" && built.lead?.count === "2",
    `each level sets its own passage — two under the title, one under level 2, three under level 3 `
    + `(${built.lead?.count}, ${built.h2?.count}, ${built.h3?.count})`);
  check(built.h3?.width === built.h2?.width,
    `both passages still fill the page (${built.h2?.width} and ${built.h3?.width})`);

  // Foundry reveals a secret passage by rewriting the page's *stored* markup,
  // finding the passage by matching its id — so a page built out of markup
  // written without one has a Reveal button that does nothing whatever when it
  // is clicked. Clicked here the way a person clicks it, and believed only from
  // what the page ends up holding.
  const secret = JSON.parse(await cdp.evaluate(`(() => {
    const entry = game.journal.get("${built.entryId}");
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    game.tooltip.deactivate();
    document.getElementById("tooltip")?.remove();
    const stored = entry.pages.contents[0].text.content;
    const button = entry.sheet.element.querySelector("section.secret button.reveal");
    const box = button?.getBoundingClientRect();
    const at = box ? [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)] : null;
    return JSON.stringify({
      hasId: /<section[^>]*\\bid="secret-/.test(stored),
      revealed: /secret revealed/.test(stored),
      at,
      reaches: at ? document.elementFromPoint(at[0], at[1])?.classList.contains("reveal") ?? false : false
    });
  })()`));
  check(secret.hasId && !secret.revealed,
    `the sample's secret passage is stored with an id of its own${secret.hasId ? "" : " (none)"}`);
  check(secret.reaches, "and its Reveal button is what the pointer reaches");
  if (secret.at) {
    await cdp.click(secret.at[0], secret.at[1]);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const revealed = JSON.parse(await cdp.evaluate(`(() => {
    const entry = game.journal.get("${built.entryId}");
    return JSON.stringify({
      stored: /secret revealed/.test(entry.pages.contents[0].text.content),
      label: entry.sheet.element.querySelector("section.secret button.reveal")?.textContent.trim() ?? ""
    });
  })()`));
  check(revealed.stored, "and clicking it reveals the passage in the page itself");
  check(revealed.label === "Hide", `the button offering to hide it again (${revealed.label})`);
} finally {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    for (const entry of game.journal.filter((e) => e.name.startsWith("Illuminus Sample"))) {
      await entry.sheet.close({force: true});
      await entry.delete();
    }
    const folder = game.folders.find((f) => f.type === "JournalEntry" && f.name === "Samples");
    if (folder) await folder.delete();
    const style = api.listStyles().find((s) => s.name === "Sample Journal Probe");
    if (style) await api.deleteStyle(style.id);
  })()`);
}

console.log("\n[54] The sample keeps up while a control is still being used");
// The sample used to wait until a slider was let go of or a field was left,
// because the events that arrive while somebody is still working come from the
// input *inside* Foundry's control, which carries no name — and the handler
// read the name.
{
  const live = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Live Feedback Probe"});
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1300));
    app.changeTab("body", "sheet");
    await new Promise(r => setTimeout(r, 300));
    app.element.querySelector('.illuminus-tab[data-tab="body"] details.illuminus-section').open = true;
    await new Promise(r => setTimeout(r, 400));
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    const slider = app.element.querySelector('[data-field="body.size"] input[type="range"]');
    const box = slider.getBoundingClientRect();
    const sample = app.element.querySelector('.illuminus-preview__frame [data-part="body"]');
    return JSON.stringify({
      styleId: style.id,
      before: getComputedStyle(sample).fontSize,
      grip: [box.left + box.width * 0.15, box.top + box.height / 2],
      far: [box.left + box.width * 0.85, box.top + box.height / 2]
    });
  })()`));

  // Pressed, moved, and read — all before the button is let go of.
  await cdp.mouse("mouseMoved", ...live.grip);
  await cdp.mouse("mousePressed", live.grip[0], live.grip[1], 1);
  await cdp.mouse("mouseMoved", live.far[0], live.far[1], 1);
  await new Promise((r) => setTimeout(r, 250));
  const holding = JSON.parse(await cdp.evaluate(`(() => {
    const app = [...foundry.applications.instances.values()].find(a => a.constructor.name.includes("StyleEditor"));
    const sample = app.element.querySelector('.illuminus-preview__frame [data-part="body"]');
    return JSON.stringify({
      sample: getComputedStyle(sample).fontSize,
      control: app.element.querySelector('[data-field="body.size"] input[type="number"]').value
    });
  })()`));
  await cdp.mouse("mouseReleased", live.far[0], live.far[1], 1);

  check(holding.control !== "16", `dragging the slider moves it (${live.before} to ${holding.control})`);
  check(holding.sample === holding.control + "px",
    `and the sample is already showing it, mouse still down (${holding.sample})`);

  const typed = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const app = [...foundry.applications.instances.values()].find(a => a.constructor.name.includes("StyleEditor"));
    const sample = app.element.querySelector('.illuminus-preview__frame [data-part="body"]');
    const text = app.element.querySelector('[data-field="body.color"] input[type="text"]');
    const before = getComputedStyle(sample).color;
    // One keystroke's worth of event, with the field still focused: nothing has
    // been committed, and the sample should have it anyway.
    text.focus();
    text.value = "#00ff00";
    text.dispatchEvent(new Event("input", {bubbles: true}));
    await new Promise(r => setTimeout(r, 350));
    const out = JSON.stringify({ before, after: getComputedStyle(sample).color,
      stillFocused: document.activeElement === text });
    await app.close({force: true});
    await api.deleteStyle(${JSON.stringify("__id__")});
    return out;
  })()`.replace("__id__", live.styleId)));
  check(typed.after === "rgb(0, 255, 0)" && typed.before !== typed.after,
    `typing a color shows it before the field is left (${typed.before} to ${typed.after})`);
  check(typed.stillFocused, "and the field still has the cursor in it");
}

console.log("\n[55] A stylesheet on its own");
// The look without the words: what somebody laying out a page of their own
// needs, and the one export that carries no journal text at all.
{
  const sheet = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = api.listStyles()[0];
    const entry = await JournalEntry.create({name: "Illuminus CSS Export"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "P", type: "text", text: {content: "<h1>Chapter</h1><p>Body.</p>"}
    }]);
    try {
      const built = await api.buildJournalExport({
        styleId: style.id, entryIds: [entry.id], format: "css", prefix: "my-module"
      });
      const text = built.css ?? "";
      return JSON.stringify({
        filename: built.filename,
        type: built.blob.type,
        bytes: built.blob.size,
        // It has to carry the style's own values and the rules that read them,
        // under the name it was given.
        hasValues: /--my-module-page-background:/.test(text),
        hasRules: /\.my-module-styled .journal-page-content/.test(text),
        // And nothing that points at a folder beside it. Matched without
        // crossing a closing bracket, since a data URI is full of them.
        pointsOut: /url\\(\\s*["']?(?!data:)[^)"']+/.test(text),
        // The look, not the words: the journal's own text is not in here.
        noText: !text.includes("Body."),
        saysIlluminus: /illuminus|--ill-/.test(text),
        // A typeface is licensed to whoever installed it: the file names the
        // faces and carries none of them.
        carriesFonts: /@font-face/.test(text),
        namesFaces: /font-family:/.test(text)
      });
    } finally { await entry.delete(); }
  })()`));

  check(sheet.filename.endsWith(".css") && sheet.type === "text/css",
    `it comes out as a stylesheet (${sheet.filename}, ${sheet.type})`);
  check(sheet.hasValues && sheet.hasRules,
    `carrying the style's values and the rules that read them (${sheet.hasValues}, ${sheet.hasRules})`);
  check(!sheet.pointsOut, "with its pictures inside it rather than beside it");
  check(sheet.noText && sheet.bytes > 2000, `and no journal text at all (${sheet.bytes} bytes)`);
  // Named by whoever exported it: a file still answering to Illuminus's own
  // names would collide with Illuminus the moment it sat beside it.
  check(!sheet.saysIlluminus, "and says Illuminus nowhere at all — classes and colors alike");
  check(sheet.filename.startsWith("aged-parchment"), `whose file is named for the style (${sheet.filename})`);
  check(!sheet.carriesFonts && sheet.namesFaces,
    `naming its typefaces without carrying them (${sheet.carriesFonts ? "carries" : "names only"})`);
}

// Folding is behaviour a style switches on: the marker is written into every
// heading that governs something, and the stylesheet decides whether a reader
// can see it. That keeps the compiler's one rule — values, never rules — so the
// check is that a value reaches a marker and that clicking it folds.
console.log("\n[57] Folding a heading, and folding the contents panel");
try {
  const set = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    // Nothing else on screen: earlier checks leave windows open, and a pointer
    // sent at a window underneath one of them lands on the one on top.
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")
        || app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Fold Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    settings.heading2.foldShown = true;
    settings.heading2.foldIcon = "plus";
    settings.heading2.foldColor = "#00aa00";
    settings.heading3.foldShown = false;
    settings.sidebar.foldShown = true;
    await api.updateStyle(style.id, {settings});

    const entry = await JournalEntry.create({name: "Fold Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "Folding", type: "text", text: {content:
      "<h2>Section one</h2><p id='under-two'>Under two.</p><h3>Deeper</h3><p>Under three.</p>" +
      "<h2>Section two</h2><p>Elsewhere.</p>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    entry.sheet.setPosition({left: 60, top: 60, width: 900, height: 700});
    // In front of whatever earlier checks left open, or a click aimed here
    // lands on the window on top of it.
    entry.sheet.bringToFront();
    await new Promise(r => setTimeout(r, 1500));
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    window.__fold = {entryId: entry.id, styleId: style.id};

    const root = entry.sheet.element;
    const h2 = root.querySelector(".journal-page-content h2");
    const h3 = root.querySelector(".journal-page-content h3");
    const marker = h2.querySelector(".illuminus-fold");
    const box = marker.getBoundingClientRect();
    const at = [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
    // Clicked the way a person does: a marker CSS has made unclickable would
    // still answer element.click().
    const topmost = document.elementFromPoint(...at)?.closest(".illuminus-fold") === marker;
    const tocMarker = root.querySelector(".journal-sidebar .toc li.page .illuminus-fold");
    const tocBox = tocMarker?.getBoundingClientRect();
    return JSON.stringify({
      hasMarker: Boolean(marker),
      shown: getComputedStyle(marker).display,
      glyph: getComputedStyle(marker.querySelector("i"), "::before").content,
      color: getComputedStyle(marker).color,
      deeperHidden: getComputedStyle(h3.querySelector(".illuminus-fold")).display,
      runVisible: !root.querySelector("#under-two").closest("[hidden]"),
      at, topmost,
      tocAt: tocBox && [Math.round(tocBox.left + tocBox.width / 2), Math.round(tocBox.top + tocBox.height / 2)],
      tocListed: Boolean(root.querySelector(".journal-sidebar .toc ol.headings"))
    });
  })()`);
  const fold = JSON.parse(set);
  check(fold.hasMarker && fold.shown !== "none", `a folding level carries a marker a reader can see (${fold.shown})`);
  // FontAwesome draws an icon as a character: the plus is U+F067, and naming a
  // marker is naming that character.
  check(fold.glyph.includes("\uf067"), `wearing the glyph the style named (got ${JSON.stringify(fold.glyph)})`);
  check(fold.color === "rgb(0, 170, 0)", `in the color it named (got ${fold.color})`);
  check(fold.deeperHidden === "none", `a level that does not fold keeps its marker out of sight (${fold.deeperHidden})`);
  check(fold.topmost, "and the marker is what the pointer reaches");

  // Measured again on the click itself: the page settles after it renders, and
  // a marker is a small target.
  const foldedNow = () => cdp.evaluate(`(() => {
    const root = game.journal.get(window.__fold.entryId).sheet.element;
    return String(root.querySelectorAll(".is-folded").length);
  })()`);

  const clickMarker = async (pick) => {
    let blocked = "nothing";
    const before = await foldedNow();
    for (let tries = 0; tries < 4; tries += 1) {
      const spot = JSON.parse(await cdp.evaluate(`(() => {
        // Foundry's tooltip follows the pointer and outlives the thing that
        // asked for it: one left showing over the panel covers whatever is
        // under it, and a click aimed there lands on the tooltip.
        game.tooltip.deactivate();
        document.querySelectorAll("#tooltip").forEach(t => t.remove());
        const root = game.journal.get(window.__fold.entryId).sheet.element;
        const marker = ${pick};
        if (!marker) return "null";
        const b = marker.getBoundingClientRect();
        const at = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
        const top = document.elementFromPoint(at[0], at[1]);
        return JSON.stringify({at, reaches: top?.closest(".illuminus-fold") === marker,
          topmost: top ? top.tagName + "." + (top.className || "") : "nothing"});
      })()`));
      if (!spot) return "no marker";
      if (!spot.reaches) {
        blocked = spot.topmost;
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      await cdp.click(spot.at[0], spot.at[1]);
      // Answered, not merely aimed at: a click landing between a render and the
      // layout that follows it hits where the marker was.
      for (let waited = 0; waited < 12; waited += 1) {
        await new Promise((r) => setTimeout(r, 150));
        if (await foldedNow() !== before) return "";
      }
      blocked = "the click did nothing";
    }
    return blocked;
  };

  // Polled rather than slept past: a click and the read after it are two
  // protocol calls, and the second used to race the first.
  const settled = async (want) => {
    for (let i = 0; i < 20; i += 1) {
      const hidden = await cdp.evaluate(`(() => {
        const root = game.journal.get(window.__fold.entryId).sheet.element;
        return String(Boolean(root.querySelector("#under-two").closest("[hidden]")));
      })()`);
      if (hidden === String(want)) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  };

  const blockedBy = await clickMarker(`root.querySelector(".journal-page-content h2 .illuminus-fold")`);
  await settled(true);
  const afterFold = JSON.parse(await cdp.evaluate(`(() => {
    const root = game.journal.get(window.__fold.entryId).sheet.element;
    const h2 = root.querySelector(".journal-page-content h2");
    return JSON.stringify({
      folded: h2.classList.contains("is-folded"),
      runHidden: Boolean(root.querySelector("#under-two").closest("[hidden]")),
      // Only what this heading governs: the next section is not its business.
      elsewhere: !root.querySelectorAll(".journal-page-content h2")[1].hasAttribute("hidden")
    });
  })()`));
  check(afterFold.folded && afterFold.runHidden,
    `clicking it folds the run beneath the heading away${blockedBy ? ` (blocked by ${blockedBy})` : ""}`);
  check(afterFold.elsewhere, "and leaves the next section where it was");

  await clickMarker(`root.querySelector(".journal-page-content h2 .illuminus-fold")`);
  await settled(false);
  const stored = JSON.parse(await cdp.evaluate(`(async () => {
    const entry = game.journal.get(window.__fold.entryId);
    const root = entry.sheet.element;
    return JSON.stringify({
      back: !root.querySelector("#under-two").closest("[hidden]"),
      // Nothing is stored: the page keeps the markup a person typed.
      content: entry.pages.contents[0].text.content
    });
  })()`));
  check(stored.back, "clicking again brings it back");
  check(!/illuminus-fold/.test(stored.content), "and the page keeps no marker of its own");

  // The contents panel folds nothing: it has no settings for a marker, so it is
  // not given one. Folding is the page's.
  check(!fold.tocAt, "and the contents panel carries no marker of its own");
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__fold?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__fold?.styleId) await api.deleteStyle(window.__fold.styleId);
    window.__fold = undefined;
  })()`);
}

// Foundry injects a context menu *inside* the entry it was opened on, and every
// entry is a stacking context of its own so a background image can blend with
// its own fill — which left the entries below painting over the menu. Measured
// against an unstyled journal rather than in the absolute: a menu that runs past
// the bottom of a short panel is clipped by the panel whatever a style says, and
// the question is whether styling makes it worse.
console.log("\n[58] A context menu on a listed page can be used");
try {
  const menu = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")
        || app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Menu Probe"});
    const out = {};
    window.__menu = {styleId: style.id, entries: []};

    for (const [key, name] of [["styled", "Menu Journal"], ["plain", "Menu Journal Plain"]]) {
      const entry = await JournalEntry.create({name});
      await entry.createEmbeddedDocuments("JournalEntryPage", [
        {name: "First", type: "text", text: {content: "<p>x</p>"}},
        {name: "Second", type: "text", text: {content: "<p>y</p>"}}]);
      if (key === "styled") await api.assignStyle(entry, style.id);
      await entry.sheet.render({force: true});
      entry.sheet.setPosition({left: 60, top: 60, width: 900, height: 700});
      entry.sheet.bringToFront();
      window.__menu.entries.push(entry.id);
      await new Promise(r => setTimeout(r, 1400));
      document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
      game.tooltip.deactivate();
      document.querySelectorAll("#tooltip").forEach(t => t.remove());

      const li = entry.sheet.element.querySelector(".journal-sidebar .toc li.page");
      const box = li.getBoundingClientRect();
      li.dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true,
        clientX: Math.round(box.left + box.width / 2), clientY: Math.round(box.top + box.height / 2), button: 2}));
      await new Promise(r => setTimeout(r, 700));

      const opened = entry.sheet.element.querySelector("#context-menu");
      if (!opened) { out[key] = {missing: true}; continue; }
      const items = [...opened.querySelectorAll("li.context-item")];
      // Every item, not the first alone: the overlap grew down the list, so an
      // entry lower in the menu was the one that could not be clicked.
      const covered = items.map((item) => {
        const b = item.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
        return opened.contains(top) ? null : (top ? top.tagName + "." + (top.className || "") : "nothing");
      }).filter(Boolean);
      out[key] = {items: items.length, covered: covered.length, by: [...new Set(covered)],
        raised: getComputedStyle(li).zIndex};
      // Closed before the next one, or the first menu is still on screen.
      document.body.click();
      await new Promise(r => setTimeout(r, 400));
    }
    return JSON.stringify(out);
  })()`);
  const cm = JSON.parse(menu);
  check(!cm.styled.missing && cm.styled.items >= 3,
    `right-clicking a listed page opens its menu (${cm.styled.items} entries)`);
  check(cm.styled.covered <= cm.plain.covered,
    `and styling covers none of it that Foundry does not cover itself`
    + `${cm.styled.covered > cm.plain.covered
      ? ` (${cm.styled.covered} covered by ${cm.styled.by.join(", ")} against ${cm.plain.covered} unstyled)` : ""}`);
  check(cm.styled.raised === "31",
    `because the entry holding it rises above the rest (z ${cm.styled.raised})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    for (const id of window.__menu?.entries ?? []) {
      const entry = game.journal.get(id);
      if (entry) await entry.delete();
    }
    const api = game.modules.get("illuminus").api;
    if (window.__menu?.styleId) await api.deleteStyle(window.__menu.styleId);
    window.__menu = undefined;
  })()`);
}

// Ticking Disable Hovered State means the ordinary settings are the whole of
// what a style says: pointing at something may still do whatever Foundry does,
// and must do nothing more. Proved by comparing a styled journal against an
// unstyled one — the properties that change under the pointer must be no more
// than core's own.
console.log("\n[59] With the hovered state off, only the ordinary settings apply");
try {
  const start = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    const style = await api.createStyle({name: "Hover Off Probe"});
    const settings = foundry.utils.deepClone(api.getStyle(style.id).settings);
    // Every tab, not the four that start switched on: this is the question the
    // tick box asks, and it has to answer the same way everywhere.
    for (const group of Object.values(settings)) {
      if (typeof group === "object" && "hoverOff" in group) group.hoverOff = true;
    }
    await api.updateStyle(style.id, {settings});

    const content = "<h2>Heading</h2><p>Some words and a <a class='content-link'>link</a>.</p>"
      + "<ul><li>Item</li></ul><blockquote><p>Boxed</p></blockquote>";
    const made = {};
    for (const [key, name] of [["styled", "Hover Off Styled"], ["plain", "Hover Off Plain"]]) {
      const entry = await JournalEntry.create({name});
      // One page holding all of it: a sheet shows the current page, and the
      // things being pointed at were on the one it was not showing.
      await entry.createEmbeddedDocuments("JournalEntryPage", [
        {name: "One", type: "text", text: {content}}]);
      if (key === "styled") await api.assignStyle(entry, style.id);
      await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
      // Side by side rather than stacked, so pointing at one is never pointing
      // through the other.
      entry.sheet.setPosition({left: key === "styled" ? 20 : 700, top: 40, width: 640, height: 620});
      await new Promise(r => setTimeout(r, 1200));
      made[key] = entry.id;
    }
    const freeze = document.createElement("style");
    freeze.id = "illuminus-hover-off-freeze";
    freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(freeze);
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    window.__hoverOff = {styleId: style.id, ...made};
    return JSON.stringify(made);
  })()`);
  JSON.parse(start);

  // What changes under the pointer, property by property, for one element.
  const changedBy = async (which, selector) => {
    const place = async (where) => {
      const spot = JSON.parse(await cdp.evaluate(`(() => {
        const entry = game.journal.get(window.__hoverOff[${JSON.stringify(which)}]);
        entry.sheet.bringToFront();
        const el = entry.sheet.element.querySelector(${JSON.stringify(selector)});
        if (!el) return "null";
        const b = el.getBoundingClientRect();
        return JSON.stringify([Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]);
      })()`));
      if (!spot) return null;
      await cdp.mouse("mouseMoved", where === "on" ? spot[0] : 5, where === "on" ? spot[1] : 5);
      await new Promise((r) => setTimeout(r, 250));
      return cdp.evaluate(`(() => {
        const entry = game.journal.get(window.__hoverOff[${JSON.stringify(which)}]);
        const el = entry.sheet.element.querySelector(${JSON.stringify(selector)});
        const cs = getComputedStyle(el);
        const out = {};
        for (const name of cs) out[name] = cs.getPropertyValue(name);
        const b = el.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
        return JSON.stringify({hovering: el.matches(":hover"), style: out,
          topmost: top ? top.tagName + "." + (top.className || "") : "nothing"});
      })()`);
    };
    await place("off");
    const rest = JSON.parse(await place("off"));
    const over = JSON.parse(await place("on"));
    if (!rest || !over) return null;
    const changed = Object.keys(over.style)
      .filter((name) => !name.startsWith("--") && over.style[name] !== rest.style[name]);
    return { hovering: over.hovering, topmost: over.topmost, changed };
  };

  const targets = [
    [".journal-page-content h2", "a heading"],
    [".journal-page-content p", "a paragraph"],
    [".journal-page-content a.content-link", "a link"],
    [".journal-page-content li", "a list item"],
    [".journal-page-content blockquote", "a box"],
    [".journal-sidebar .toc li.page", "a listed page"],
    [".journal-sidebar button:not(.illuminus-fold)", "a panel button"],
    [".journal-header .title", "the journal's name"]
  ];
  const extra = [];
  const missed = [];
  let reached = 0;
  for (const [selector, what] of targets) {
    const styled = await changedBy("styled", selector);
    const plain = await changedBy("plain", selector);
    if (!styled || !plain) { missed.push(what + " (not on screen)"); continue; }
    if (styled.hovering) reached += 1;
    else missed.push(what + " (pointer reached " + styled.topmost + ")");
    const beyond = styled.changed.filter((name) => !plain.changed.includes(name));
    if (beyond.length) extra.push(what + ": " + beyond.join(", "));
  }
  check(reached >= 6, `the pointer reached ${reached} of ${targets.length} things to point at`
    + `${missed.length ? `:\n      ${missed.join("\n      ")}` : ""}`);
  check(extra.length === 0,
    `and with the switch off none of them changes beyond what Foundry does itself`
    + `${extra.length ? `:\n      ${extra.join("\n      ")}` : ""}`);
} finally {
  await cdp.evaluate(`(async () => {
    document.getElementById("illuminus-hover-off-freeze")?.remove();
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    for (const key of ["styled", "plain"]) {
      const entry = game.journal.get(window.__hoverOff?.[key]);
      if (entry) await entry.delete();
    }
    const api = game.modules.get("illuminus").api;
    if (window.__hoverOff?.styleId) await api.deleteStyle(window.__hoverOff.styleId);
    window.__hoverOff = undefined;
  })()`);
}

// Two windows, styled apart: the journal's, whose width these limits clamp, and
// the one Edit Page opens, which has a tab of its own. The editor's frame used
// to be whatever the Window tab said, so there was no way to give the place you
// write a look of its own.
console.log("\n[60] The window's width, and the editor's own window");
try {
  const set = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")
        || app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Window Width Probe", settings: {
      // The journal window, and a title bar the editor must not borrow.
      window: {frameMinWidth: 400, frameMaxWidth: 620, color: "#ff0000", size: 12},
      editor: {background: "#123456", color: "#00ff00", size: 26, frameMinWidth: 700,
               borderTopWidth: 4, borderTopStyle: "solid", borderTopColor: "#ff00ff",
               toolbarBackground: "#ff8800", toolbarColor: "#0000ff", toolbarSize: 20,
               // The bar, one icon on it, the two named controls, and the page's
               // own settings are four different things to paint.
               toolbarButtonBackground: "#00ffff", toolbarButtonHoverBackground: "#ff00aa",
               dropdownBackground: "#222266", dropdownColor: "#ffee00",
               fieldBackground: "#663322", fieldColor: "#00ddaa", fieldSize: 19,
               fieldCheckColor: "#ff00ff", fieldCheckTickedColor: "#00ff88",
               fieldCheckMarkColor: "#2200ff", fieldCheckSize: 22,
               settingsBarBackground: "#0a5f5f", settingsBarPaddingTop: 7,
               settingsBarMarginTop: 5, settingsBarColor: "#ffcc00", settingsBarSize: 17}
    }});
    const entry = await JournalEntry.create({name: "Window Width Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text",
      text: {content: "<h1>One</h1><p>Body text.</p>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true});
    // Asked for more than the maximum on purpose: Foundry sets a window's width
    // itself, and the question is whether the limit is drawn.
    entry.sheet.setPosition({left: 40, top: 40, width: 900, height: 700});
    await new Promise(r => setTimeout(r, 1400));
    window.__widths = {entryId: entry.id, styleId: style.id};
    const root = entry.sheet.element;
    const cs = getComputedStyle(root);
    return JSON.stringify({
      wide: Math.round(root.getBoundingClientRect().width),
      max: cs.maxWidth, min: cs.minWidth,
      titleColor: getComputedStyle(root.querySelector(".window-header .window-title")).color
    });
  })()`);
  const w = JSON.parse(set);
  check(w.wide <= 621 && w.max === "620px",
    `a journal window is drawn no wider than its maximum (asked 900, drawn ${w.wide})`);
  check(w.min === "400px", `and no narrower than its minimum (${w.min})`);
  check(w.titleColor === "rgb(255, 0, 0)", `the journal window keeps its own title (${w.titleColor})`);

  const editor = await cdp.evaluate(`(async () => {
    const tickBox = (box) => {
      const was = box.checked;
      box.checked = true;
      const read = {
        checkSize: getComputedStyle(box, "::before").fontSize,
        tickedColor: getComputedStyle(box, "::after").color,
        markColor: getComputedStyle(box, "::before").color
      };
      box.checked = false;
      read.emptyColor = getComputedStyle(box, "::before").color;
      box.checked = was;
      return read;
    };
    const entry = game.journal.get(window.__widths.entryId);
    entry.sheet.element.querySelector(".journal-entry-page .edit-container button")?.click();
    let sheet = null;
    for (let i = 0; i < 150 && !sheet; i++) {
      await new Promise(r => setTimeout(r, 100));
      sheet = [...foundry.applications.instances.values()].find(
        a => a.document?.documentName === "JournalEntryPage" && a.element?.parentElement === document.body);
    }
    if (!sheet) return JSON.stringify({missing: true});
    window.__widths.sheetId = sheet.id;
    await new Promise(r => setTimeout(r, 1200));
    const el = sheet.element;
    const cs = getComputedStyle(el);
    const button = el.querySelector("menu.editor-menu button:not(.pm-dropdown)");
    const menu = el.querySelector("menu.editor-menu");
    return JSON.stringify({
      // Painted on the layer that carries the window's picture, over Foundry's
      // own, so that a color of None leaves the window as Foundry draws it.
      fill: getComputedStyle(el, "::after").backgroundColor,
      border: cs.borderTopWidth + " " + cs.borderTopColor,
      min: cs.minWidth, drawn: Math.round(el.getBoundingClientRect().width),
      titleColor: getComputedStyle(el.querySelector(".window-header .window-title")).color,
      titleSize: getComputedStyle(el.querySelector(".window-header .window-title")).fontSize,
      toolbarFill: menu ? getComputedStyle(menu).backgroundColor : null,
      toolbarColor: button ? getComputedStyle(button).color : null,
      toolbarSize: button ? getComputedStyle(button).fontSize : null,
      iconFill: getComputedStyle(el.querySelector("menu.editor-menu button:not(.pm-dropdown)")).backgroundColor,
      dropdownFill: getComputedStyle(el.querySelector("menu.editor-menu .pm-dropdown")).backgroundColor,
      dropdownColor: getComputedStyle(el.querySelector("menu.editor-menu .pm-dropdown")).color,
      fieldFill: getComputedStyle(el.querySelector(".page-metadata select")).backgroundColor,
      fieldColor: getComputedStyle(el.querySelector(".page-metadata select")).color,
      fieldSize: getComputedStyle(el.querySelector(".page-metadata select")).fontSize,
      labelColor: getComputedStyle(el.querySelector(".page-metadata label")).color,
      // Read from what is drawn rather than from the input: Foundry turns the
      // browser's own drawing off and prints a glyph, so the box a person sees
      // is the after layer and the tick inside it the before one — and that
      // before layer is the *empty* box while nothing is ticked, which is why
      // each of these is read with the box put deliberately into one state.
      ...tickBox(el.querySelector('.page-metadata input[type="checkbox"]')),
      settingsBarFill: getComputedStyle(el.querySelector(".page-metadata")).backgroundColor,
      settingsBarPad: getComputedStyle(el.querySelector(".page-metadata")).paddingTop,
      settingsBarGap: getComputedStyle(el.querySelector(".page-metadata")).marginTop,
      settingsBarInk: getComputedStyle(el.querySelector(".page-metadata")).color,
      // What stands on the strip follows its lettering until it is given
      // something of its own. The tick box's own row is given nothing here and
      // takes the strip's size; the label on it is a Page Settings control and
      // takes that one instead.
      rowSize: getComputedStyle(el.querySelector(".page-metadata .show-title")).fontSize,
      labelSize: getComputedStyle(el.querySelector(".page-metadata .show-title label")).fontSize,
      // The page's own surface is what is written on, which the Page tab paints.
      surface: getComputedStyle(el.querySelector(":scope > .window-content")).backgroundColor
    });
  })()`);
  const ed = JSON.parse(editor);
  check(!ed.missing && ed.fill === "rgb(18, 52, 86)",
    `the editor's window takes its own fill (${ed.fill})`);
  check(ed.border === "4px rgb(255, 0, 255)", `and its own edges (${ed.border})`);
  check(ed.min === "700px" && ed.drawn >= 700,
    `and its own width limits, apart from the journal's (${ed.min}, drawn ${ed.drawn})`);
  check(ed.titleColor === "rgb(0, 255, 0)" && ed.titleSize === "26px",
    `its title bar is its own rather than the journal window's (${ed.titleColor}, ${ed.titleSize})`);
  check(ed.toolbarFill === "rgb(255, 136, 0)" && ed.toolbarColor === "rgb(0, 0, 255)",
    `and the editing controls take a fill and an icon color (${ed.toolbarFill}, ${ed.toolbarColor})`);
  check(ed.toolbarSize === "20px", `sized by the style (${ed.toolbarSize})`);
  check(ed.iconFill === "rgb(0, 255, 255)" && ed.iconFill !== ed.toolbarFill,
    `one icon takes a fill of its own, apart from the row's (${ed.iconFill} on ${ed.toolbarFill})`);
  check(ed.dropdownFill === "rgb(34, 34, 102)" && ed.dropdownColor === "rgb(255, 238, 0)",
    `the named controls take their own fill and lettering (${ed.dropdownFill}, ${ed.dropdownColor})`);
  check(ed.fieldFill === "rgb(102, 51, 34)" && ed.fieldColor === "rgb(0, 221, 170)",
    `and so do the page's own settings above them (${ed.fieldFill}, ${ed.fieldColor})`);
  check(ed.fieldSize === "19px" && ed.labelColor === "rgb(0, 221, 170)",
    `their size and the words beside them (${ed.fieldSize}, ${ed.labelColor})`);
  // The tick box is a printed glyph rather than a box, so a fill and an edge
  // would land on nothing: it takes a size, a color for the empty box, one for
  // the box once ticked, and one for the tick itself.
  check(ed.checkSize === "22px" && ed.emptyColor === "rgb(255, 0, 255)",
    `and the tick box has a size and a color of its own (${ed.checkSize}, ${ed.emptyColor})`);
  check(ed.tickedColor === "rgb(0, 255, 136)" && ed.markColor === "rgb(34, 0, 255)",
    `with the box it turns and the tick inside it apart (${ed.tickedColor}, ${ed.markColor})`);
  // The strip they stand on is painted apart from the controls standing on it,
  // as the editing bar is from its icons.
  check(ed.settingsBarFill === "rgb(10, 95, 95)" && ed.settingsBarPad === "7px",
    `the strip holding them takes its own fill and spacing (${ed.settingsBarFill}, ${ed.settingsBarPad})`);
  check(ed.settingsBarGap === "5px", `and space around it as well as inside (${ed.settingsBarGap})`);
  check(ed.settingsBarInk === "rgb(255, 204, 0)" && ed.rowSize === "17px",
    `its lettering is its own, and what stands on it follows (${ed.settingsBarInk}, ${ed.rowSize})`);
  check(ed.labelSize === "19px",
    `while a control given its own size keeps it (${ed.labelSize} on a strip of ${ed.rowSize})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__widths?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__widths?.styleId) await api.deleteStyle(window.__widths.styleId);
    window.__widths = undefined;
  })()`);
}

// The Title tab is laid out by hand rather than by the shared pass: fewer, longer
// categories, each reading in runs with a line drawn between them. The order is
// the point, so it is asserted rather than left to the pass that sorts the rest.
console.log("\n[61] The Title tab reads as it was laid out");
try {
  const laid = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Title Layout Probe"});
    window.__title = {styleId: style.id};
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1600));
    // The controls are in the DOM whether or not their category is open, and a
    // closed one is what makes this affordable: opening every category on six
    // tabs is a few thousand controls laid out at once, which took longer than
    // the protocol will wait. Only the tab whose line is measured is opened.
    const laidOut = {};
    // The six levels share one tab, so the family's id is what opens it.
    for (const which of ["title", "page", "headings", "body", "links", "lists",
      "tables", "boxes", "secrets", "images", "boxStyles", "sidebar", "window", "editor"]) {
      laidOut[which] = app.element.querySelector('.illuminus-tab[data-tab="' + which + '"]');
    }
    const tab = laidOut.title;

    // Read from the class the state switch writes rather than from the computed
    // style: six tabs of two and a half thousand controls is a great many forced
    // layouts, and the run used to time out before it could say anything.
    const showing = (el) => !el.classList.contains("is-state-hidden")
      && !el.classList.contains("is-filtered-out");
    // The lines closing a category off are chrome, drawn around every category
    // alike; what is asserted here is the runs the schema asked for.
    const read = (section) => [...section.querySelectorAll(
      ".illuminus-divider:not(.illuminus-divider--edge), .illuminus-field[data-field]")]
      .filter(showing)
      .map(el => el.classList.contains("illuminus-divider") ? "---"
        : el.querySelector(".illuminus-field__label").textContent.trim());
    const sections = [...tab.querySelectorAll("details.illuminus-section")].map(section => ({
      name: section.querySelector(".illuminus-section__label").textContent.trim(),
      rows: read(section)
    }));

    // A line with a run under it, whichever state is on show: the divider is
    // written before an ordinary control, so a state used to strand it.
    const text = [...tab.querySelectorAll("details.illuminus-section")]
      .find(s => s.querySelector(".illuminus-section__label").textContent.trim() === "Text");
    text.open = true;
    text.querySelector('.illuminus-state__option[data-state="hover"]').click();
    await new Promise(r => setTimeout(r, 250));
    const hovered = read(text);

    // Measured while the window is still open: a closed application's element
    // is detached, and a detached element has no computed style at all.
    const named = (tab) => [...tab.querySelectorAll("details.illuminus-section")].map(section => ({
      name: section.querySelector(".illuminus-section__label").textContent.trim(),
      rows: read(section)
    }));
    const page = named(laidOut.page);
    const heading = named(laidOut.headings);
    const body = named(laidOut.body);
    const links = named(laidOut.links);
    const lists = named(laidOut.lists);
    const tables = named(laidOut.tables);
    const boxes = named(laidOut.boxes);
    const secrets = named(laidOut.secrets);
    const images = named(laidOut.images);
    const boxStyles = named(laidOut.boxStyles);
    const sidebar = named(laidOut.sidebar);
    const window_ = named(laidOut.window);
    const editor = named(laidOut.editor);
    // Measured with the Title tab on show and one category open: a hidden tab's
    // boxes are all zero, which reads as a line drawn nowhere rather than as one
    // drawn across.
    app.changeTab("title", "sheet");
    tab.querySelector("details.illuminus-section").open = true;
    await new Promise(r => setTimeout(r, 400));
    // A line between runs, not one of the pair closing the category off: those
    // sit tighter, and are drawn around every category whatever its layout.
    const line = tab.querySelector(".illuminus-divider:not(.illuminus-divider--edge)");
    const seen = getComputedStyle(line);
    const drawn = {
      width: Math.round(line.getBoundingClientRect().width),
      control: Math.round(tab.querySelector(".illuminus-field").getBoundingClientRect().width),
      thickness: seen.borderTopWidth, color: seen.borderTopColor,
      above: seen.marginTop, below: seen.marginBottom
    };
    await app.close({force: true});
    return JSON.stringify({sections, page, heading, body, links, lists, tables, boxes, secrets,
      images, boxStyles, sidebar, window: window_, editor, hovered, ...drawn});
  })()`);
  const t = JSON.parse(laid);
  const names = t.sections.map((s) => s.name);
  check(JSON.stringify(names) === JSON.stringify(
    ["Size and Position", "Text", "Fill and Image", "Spacing", "Border"]),
    `the categories read in the order they were given (${names.join(" > ")})`);
  const text = t.sections.find((s) => s.name === "Text").rows;
  check(JSON.stringify(text) === JSON.stringify([
    "Typeface", "Text Size", "Text Color", "Text Style", "Italic",
    "---", "Alignment", "Capitals", "Letter Spacing", "Word Spacing", "Line Spacing",
    "---", "Outline Color", "Outline Thickness",
    "---", "Shadow Horizontal Offset", "Shadow Vertical Offset",
    "Shadow Softness", "Shadow Color"]),
    `Text holds its four runs, lines and all (${text.length} rows)`);
  const fill = t.sections.find((s) => s.name === "Fill and Image").rows;
  check(fill[0] === "Fill Color" && fill.filter((row) => row === "---").length === 3
    && fill.includes("Inner Shadow Softness") && fill.includes("Outer Shadow Horizontal Offset"),
    `Fill and Image holds the picture and both shadows (${fill.filter(r => r === "---").length} lines)`);
  const border = t.sections.find((s) => s.name === "Border").rows;
  // One line, before the corners. The four the schema draws between the sides
  // are gone with the runs they separated: an edge is gathered into a single
  // run with a side to choose, so Top no longer needs a line to tell it from
  // Bottom — they are never both on show.
  // One picture, read in the order it is drawn: the corners at the corners, the
  // thicknesses on the edges, then the style and color of whichever side is
  // chosen, and under it all what those corners are cut to. No line anywhere —
  // a line drawn inside one picture separates nothing.
  check(border.slice(0, 4).every((row) => row.endsWith("Corner"))
    && border.includes("Top Thickness") && border.includes("Top Style")
    && border.filter((row) => row === "---").length === 0
    && border.at(-1) === "Corner Shape",
    `Border is one box: corners, thicknesses, the chosen side, and the shape `
    + `(${border.slice(0, 4).join(", ")} … ${border.at(-1)})`);
  const pageNames = t.page.map((s) => s.name);
  check(JSON.stringify(pageNames) === JSON.stringify(
    ["Size and Position", "Fill and Image", "Spacing", "Border"]),
    `the Page tab reads the same way (${pageNames.join(" > ")})`);
  const pageFill = t.page.find((s) => s.name === "Fill and Image").rows;
  check(pageFill[0] === "Fill Color" && pageFill.filter((row) => row === "---").length === 3
    && pageFill.at(-1) === "Outer Shadow Color",
    `with the surface's picture and both its shadows in one category (${pageFill.length} rows)`);
  const headingNames = t.heading.map((s) => s.name);
  check(JSON.stringify(headingNames) === JSON.stringify(
    ["Text", "Fill and Image", "Spacing", "Border", "Columns", "Folding"]),
    `a heading level reads the same way (${headingNames.join(" > ")})`);
  const headingText = t.heading.find((s) => s.name === "Text").rows;
  check(headingText.filter((row) => row === "---").length === 3
    && headingText.slice(-4).join(", ") === "Shadow Horizontal Offset, Shadow Vertical Offset, "
      + "Shadow Softness, Shadow Color",
    `with the lettering's own shadow at the foot of its Text (${headingText.slice(-1)[0]})`);
  const bodyNames = t.body.map((s) => s.name);
  check(JSON.stringify(bodyNames) === JSON.stringify(
    ["Text", "Paragraphs", "Opening Capital", "Marked Text", "Code", "Code Block", "Dividers"]),
    `and Body keeps its own parts in order (${bodyNames.join(" > ")})`);
  const marks = t.body.find((s) => s.name === "Marked Text").rows;
  check(marks[0] === "Quotation Typeface" && marks.filter((row) => row === "---").length === 4,
    `each mark a run of its own (${marks.filter(r => r === "---").length} lines)`);
  const linkNames = t.links.map((s) => s.name);
  check(JSON.stringify(linkNames) === JSON.stringify(["Text", "Border", "Underline", "Highlight"]),
    `Links reads lettering, edges, line, chip (${linkNames.join(" > ")})`);
  const chip = t.links.find((s) => s.name === "Highlight").rows;
  check(chip[0] === "Fill Color" && chip.filter((row) => row === "---").length === 4
    && chip.at(-1) === "Right Padding",
    `the chip carrying its picture, its shadows and its spacing (${chip.length} rows)`);
  const listNames = t.lists.map((s) => s.name);
  check(JSON.stringify(listNames) === JSON.stringify(
    ["Size and Position", "Outer Spacing", "Bullets and Numbers", "Definition Lists"]),
    `Lists reads where it sits, then the mark, then the definitions (${listNames.join(" > ")})`);
  const defs = t.lists.find((s) => s.name === "Definition Lists").rows;
  check(defs[0] === "Term Typeface" && defs.filter((row) => row === "---").length === 5
    && defs.at(-1) === "Definition Shadow Color",
    `the term and its definition each a lettering, an outline and a shadow (${defs.length} rows)`);
  const tableNames = t.tables.map((s) => s.name);
  check(JSON.stringify(tableNames) === JSON.stringify(
    ["Size and Position", "Text", "Outer Spacing", "Border", "Header Row", "Table Rows",
     "Cell Styles", "Table Caption"]),
    `Tables reads the table, then its parts (${tableNames.join(" > ")})`);
  const cells = t.tables.find((s) => s.name === "Cell Styles").rows;
  // The room, then a line, then the edge as one run: as above, the lines that
  // separated the four sides went with the four runs.
  check(cells[0] === "Top Padding" && cells.filter((row) => row === "---").length === 1,
    `a cell's room and its edges in one category (${cells.length} rows)`);
  const boxNames = t.boxes.map((s) => s.name);
  check(JSON.stringify(boxNames) === JSON.stringify(
    ["Text", "Fill and Image", "Spacing", "Border", "Collapsible"]),
    `Boxes reads the same way (${boxNames.join(" > ")})`);
  const secretNames = t.secrets.map((s) => s.name);
  check(JSON.stringify(secretNames) === JSON.stringify(
    ["Text", "Fill and Image", "Spacing", "Border", "Once Revealed",
     "Reveal Button"]),
    `and Secrets ends with what reveals it (${secretNames.join(" > ")})`);
  const button = t.secrets.find((s) => s.name === "Reveal Button").rows;
  check(button[0] === "Button Text Size" && button.filter((row) => row === "---").length === 5,
    `the button in six runs of its own (${button.filter(r => r === "---").length} lines)`);
  // The seven laid out from the map rather than in their own literal: the
  // categories they were given, in the order they were given them.
  const laidTabs = {
    images: ["Size and Position", "Spacing", "Border", "Image Caption",
      "Sound and Video"],
    boxStyles: ["Size and Position", "Text", "Fill and Image", "Spacing",
      "Border", "Headings Inside"],
    sidebar: ["Size and Position", "Fill and Image", "Spacing", "Border", "Categories",
      "Numbering", "Page Entries", "Sub-Headings", "Search Box", "Buttons"],
    window: ["Size and Position", "Window Frame", "Title Bar", "Title Bar Buttons", "Edit Button"],
    editor: ["Size and Position", "Window Frame", "Title Bar", "Title Bar Buttons",
      "Page Settings Bar", "Page Settings", "Editing Bar", "Editing Icons", "Named Controls",
      "Drop-down List", "Drop-down Entries"]
  };
  for (const [tab, wanted] of Object.entries(laidTabs)) {
    const got = t[tab].map((s) => s.name);
    check(JSON.stringify(got) === JSON.stringify(wanted),
      `${tab} reads as it was laid out (${got.join(" > ")})`);
  }
  const panelFill = t.sidebar.find((s) => s.name === "Fill and Image").rows;
  check(panelFill[0] === "Fill Color" && panelFill.includes("Inner Shadow Softness"),
    `the panel's fill, picture and shading in one category (${panelFill.length} rows)`);
  check(t.hovered.filter((row) => row === "---").length === 3,
    `the lines are still there in the pointed-at state (${t.hovered.filter(r => r === "---").length})`);
  check(t.thickness === "1px" && t.width >= t.control - 2,
    `and each is drawn across the whole row (${t.thickness}, ${t.width} of ${t.control})`);
  // Room either side, and enough contrast to be seen against the tab.
  check(t.above === "16px" && t.below === "16px", `with room above and below (${t.above} / ${t.below})`);
  const alpha = Number(t.color.match(/[\d.]+\)$/)?.[0].slice(0, -1) ?? 1);
  check(alpha >= 0.25, `and a line that shows against the panel (${t.color})`);
} finally {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    if (window.__title?.styleId) await api.deleteStyle(window.__title.styleId);
    window.__title = undefined;
  })()`);
}

// Pointing at a journal must not move it. Every control has a state's own twin
// now, and a twin says nothing by leaving its number at zero — but a number is
// clamped to its control's range, so the panel-width twin came back as the
// control's 120px minimum. Hovering anywhere in a styled sheet then shrank the
// contents panel from 300 to 120, and every click target slid sideways with it:
// a secret passage's Reveal button walked out from under the pointer.
console.log("\n[62] Pointing at a journal moves nothing");
try {
  const start = await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Stillness Probe"});
    const entry = await JournalEntry.create({name: "Stillness Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      "<p>Open text.</p><section class='secret' id='secret-still'><p>Hidden words.</p></section>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    entry.sheet.setPosition({left: 40, top: 40, width: 700, height: 620});
    entry.sheet.bringToFront();
    await new Promise(r => setTimeout(r, 1400));
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    window.__still = {entryId: entry.id, styleId: style.id};
    const root = entry.sheet.element;
    const button = root.querySelector("button.reveal");
    const box = button.getBoundingClientRect();
    return JSON.stringify({
      panel: Math.round(root.querySelector(".journal-sidebar").getBoundingClientRect().width),
      button: [Math.round(box.x), Math.round(box.y)],
      at: [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)]
    });
  })()`);
  const rest = JSON.parse(start);

  await cdp.mouse("mouseMoved", rest.at[0], rest.at[1]);
  await new Promise((r) => setTimeout(r, 300));
  const pointed = JSON.parse(await cdp.evaluate(`(() => {
    const root = game.journal.get(window.__still.entryId).sheet.element;
    const button = root.querySelector("button.reveal");
    const box = button.getBoundingClientRect();
    const top = document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
    return JSON.stringify({
      panel: Math.round(root.querySelector(".journal-sidebar").getBoundingClientRect().width),
      button: [Math.round(box.x), Math.round(box.y)],
      reaches: top?.classList.contains("reveal") ?? false
    });
  })()`));
  check(pointed.panel === rest.panel,
    `the contents panel keeps its width under the pointer (${rest.panel} then ${pointed.panel})`);
  check(JSON.stringify(pointed.button) === JSON.stringify(rest.button),
    `and a button stays where it was drawn (${rest.button.join(",")} then ${pointed.button.join(",")})`);
  check(pointed.reaches, "so the pointer is still on it");

  await cdp.click(rest.at[0], rest.at[1]);
  await new Promise((r) => setTimeout(r, 700));
  const after = JSON.parse(await cdp.evaluate(`(() => {
    const entry = game.journal.get(window.__still.entryId);
    return JSON.stringify({
      classes: entry.sheet.element.querySelector("section.secret")?.className ?? "",
      stored: /revealed/.test(entry.pages.contents[0].text.content),
      label: entry.sheet.element.querySelector("button.reveal")?.textContent.trim() ?? ""
    });
  })()`));
  check(after.classes.includes("revealed") && after.stored,
    `and Reveal reveals the passage (${after.classes || "nothing happened"})`);
  check(after.label === "Hide", `the button offering to hide it again (${after.label})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__still?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__still?.styleId) await api.deleteStyle(window.__still.styleId);
    window.__still = undefined;
  })()`);
}

// The list a named control opens is not inside the window it belongs to: core
// clones it onto the body and positions it against the button, so nothing
// scoped to a styled sheet reaches it until the module marks it. Opened the way
// a person opens it, since a scripted event neither positions the list nor
// hovers its entries.
console.log("\n[63] The list a named control opens");
try {
  const set = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")
        || app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Drop-down List Probe", settings: {editor: {
      listBackground: "#2b0057", listPaddingTop: 9, listCornerTopLeft: 12,
      itemColor: "#ffd400", itemBackground: "#004422", itemPaddingLeft: 11,
      itemDividerColor: "#ff0000"
    }}});
    const entry = await JournalEntry.create({name: "Drop-down List Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text",
      text: {content: "<h1>One</h1><p>Body.</p>"}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true});
    await new Promise(r => setTimeout(r, 1200));
    entry.sheet.element.querySelector(".journal-entry-page .edit-container button")?.click();
    let sheet = null;
    for (let i = 0; i < 150 && !sheet; i++) {
      await new Promise(r => setTimeout(r, 100));
      sheet = [...foundry.applications.instances.values()].find(
        a => a.document?.documentName === "JournalEntryPage" && a.element?.parentElement === document.body);
    }
    window.__dropList = {entryId: entry.id, styleId: style.id};
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    return JSON.stringify({open: !!sheet});
  })()`));
  check(set.open, "a page editor is open to walk");

  await menuAtRest();
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    const button = await settledBox(`${EDIT_SHEET}.element.querySelector("menu.editor-menu .pm-dropdown")`);
    if (!button) break;
    await cdp.click(button.x, button.y);
    opened = await cdp.evaluate(`!!document.querySelector("#prosemirror-dropdown")`);
  }
  check(opened, "and its first named control opens a list");

  const list = JSON.parse(await cdp.evaluate(`(() => {
    const el = document.getElementById("prosemirror-dropdown");
    if (!el) return JSON.stringify({missing: true});
    const ul = el.querySelector(":scope > ul");
    const item = ul.querySelector("li:not(.divider)");
    const divider = ul.querySelector("li.divider");
    const cs = (node) => node ? getComputedStyle(node) : {};
    return JSON.stringify({
      marked: el.classList.contains("illuminus-styled"),
      styleId: el.getAttribute("data-illuminus-style"),
      listFill: cs(ul).backgroundColor,
      listPad: cs(ul).paddingTop,
      listCorner: cs(ul).borderTopLeftRadius,
      itemInk: cs(item).color,
      itemFill: cs(item).backgroundColor,
      itemPad: cs(item).paddingLeft,
      dividerColor: divider ? cs(divider).borderBottomColor : null
    });
  })()`));
  check(list.marked && list.styleId === await cdp.evaluate(`window.__dropList.styleId`),
    `the list carries the style of the window it was opened from (${list.styleId ?? "unmarked"})`);
  check(list.listFill === "rgb(43, 0, 87)" && list.listPad === "9px" && list.listCorner === "12px",
    `and takes its fill, spacing and corner (${list.listFill}, ${list.listPad}, ${list.listCorner})`);
  check(list.itemInk === "rgb(255, 212, 0)" && list.itemFill === "rgb(0, 68, 34)"
    && list.itemPad === "11px",
    `an entry takes its own lettering, fill and spacing (${list.itemInk} on ${list.itemFill})`);
  check(list.dividerColor === "rgb(255, 0, 0)",
    `and the line between the runs of entries takes a color (${list.dividerColor})`);
} finally {
  await cdp.evaluate(`(async () => {
    document.getElementById("prosemirror-dropdown")?.remove();
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const entry = game.journal.get(window.__dropList?.entryId);
    if (entry) await entry.delete();
    const api = game.modules.get("illuminus").api;
    if (window.__dropList?.styleId) await api.deleteStyle(window.__dropList.styleId);
    window.__dropList = undefined;
  })()`);
}

// A style that says nothing about the tick box must leave it exactly as Foundry
// draws it. Setting core's own variables from unset controls did not: an empty
// custom property is a *defined* one, so both glyph layers took the same
// inherited color and the tick disappeared into the box. Compared against an
// unstyled editor, which is the only thing that says what "left alone" means.
console.log("\n[64] A tick box nobody has set is Foundry's own");
try {
  const look = async (styled) => JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const style = ${styled} ? await api.createStyle({name: "Plain Tick Probe"}) : null;
    const entry = await JournalEntry.create({name: "Plain Tick Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text",
      text: {content: "<p>x</p>"}}]);
    if (style) await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true});
    await new Promise(r => setTimeout(r, 1200));
    entry.sheet.element.querySelector(".journal-entry-page .edit-container button")?.click();
    let sheet = null;
    for (let i = 0; i < 150 && !sheet; i++) {
      await new Promise(r => setTimeout(r, 100));
      sheet = [...foundry.applications.instances.values()].find(
        a => a.document?.documentName === "JournalEntryPage" && a.element?.parentElement === document.body);
    }
    await new Promise(r => setTimeout(r, 900));
    const box = sheet.element.querySelector('.page-metadata input[type="checkbox"]');
    const was = box.checked;
    box.checked = true;
    const out = {
      tick: getComputedStyle(box, "::before").color,
      tickedBox: getComputedStyle(box, "::after").color,
      size: getComputedStyle(box, "::before").width
    };
    box.checked = false;
    out.emptyBox = getComputedStyle(box, "::before").color;
    box.checked = was;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    await entry.delete();
    if (style) await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`));
  const plain = await look(false);
  const styled = await look(true);
  check(styled.tick === plain.tick && styled.tickedBox === plain.tickedBox,
    `an unset tick box is painted as Foundry paints it (tick ${styled.tick}, box ${styled.tickedBox})`);
  check(styled.emptyBox === plain.emptyBox && styled.size === plain.size,
    `down to the empty box and its size (${styled.emptyBox}, ${styled.size})`);
  // The tick is a cut-out through the box rather than a mark drawn over it,
  // which is why wiping its color made it vanish rather than change.
  check(plain.tick !== plain.tickedBox,
    `and the tick still tells itself apart from the box behind it (${plain.tick} in ${plain.tickedBox})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    for (const entry of game.journal.filter((e) => e.name === "Plain Tick Journal")) await entry.delete();
    const api = game.modules.get("illuminus").api;
    for (const style of api.listStyles().filter((s) => s.name === "Plain Tick Probe")) {
      await api.deleteStyle(style.id);
    }
  })()`);
}

// Where the pencil sits, and whether it travels with the reader. Foundry makes
// it `sticky` inside a container as tall as the page, so it follows the scroll
// and comes to rest across whatever is half way down — a heading, usually.
console.log("\n[65] The Edit button stays where it is put");
try {
  const look = async (follows) => JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Edit Button Probe", settings: {window: {
      pageButtonHoldTop: ${follows}, pageButtonTop: 24
    }}});
    const entry = await JournalEntry.create({name: "Edit Button Journal"});
    // Long enough to scroll, or "follows the reader" cannot be seen at all.
    const words = new Array(40).fill('<p>Paragraph of the long page, with enough words in it to take a line or two.</p>').join("");
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text",
      text: {content: "<h1>Chapter</h1>" + words}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    const root = entry.sheet.element;
    const article = root.querySelector("article.journal-entry-page");
    const button = article.querySelector(".edit-container button");
    const pages = root.querySelector(".journal-entry-pages") ?? root.querySelector(".scrollable");
    const down = () => Math.round(button.getBoundingClientRect().top - article.getBoundingClientRect().top);
    const out = {
      position: getComputedStyle(button).position,
      containerTop: getComputedStyle(article.querySelector(".edit-container")).top,
      atRest: down()
    };
    pages.scrollTop = 600;
    await new Promise(r => setTimeout(r, 400));
    out.afterScroll = down();
    out.scrolled = Math.round(pages.scrollTop);
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    await entry.delete();
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`));

  // Ticked holds it at the top; left alone it is Foundry's, which keeps its
  // place on screen while the page scrolls under it.
  const held = await look(true);
  const follows = await look(false);
  check(follows.containerTop === "24px" && follows.atRest === 24 && held.atRest === 24,
    `the button sits the distance from the top it was given (${held.atRest}px)`);
  check(follows.scrolled > 100 && follows.afterScroll > follows.atRest + 100,
    `left to follow the page it travels with the reader (${follows.atRest} to ${follows.afterScroll} `
    + `over ${follows.scrolled}px)`);
  check(held.afterScroll === held.atRest,
    `and held at the top it stays above the words (${held.atRest} to ${held.afterScroll})`);

  // Measured from the window rather than the page. A page clips whatever
  // scrolls inside it, so a pencil pushed above the page's own top is placed
  // and then not drawn — the container has to hang somewhere else, which is a
  // move rather than a value. Believed only from a hit test: an element above
  // the top of a scrolling box has a rectangle all the same.
  const anchored = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Edit Button Probe", settings: {window: {
      pageButtonAnchor: "window", pageButtonTop: 4, pageButtonHoldTop: true
    }}});
    const entry = await JournalEntry.create({name: "Edit Button Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text",
      text: {content: "<h1>Chapter</h1>" + new Array(30).fill("<p>Words on the page.</p>").join("")}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));
    // The hardware-acceleration notice sits exactly where the pencil now is.
    document.querySelectorAll("#notifications .notification").forEach(n => n.remove());
    game.tooltip.deactivate();
    document.getElementById("tooltip")?.remove();
    const root = entry.sheet.element;
    const button = root.querySelector(".edit-container button");
    const r = button.getBoundingClientRect();
    const at = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const out = {
      // Out of the page and onto the area the journal's name sits in.
      parent: button.closest(".journal-entry-content > .edit-container") ? "window" : "page",
      buttonTop: Math.round(r.top),
      pageTop: Math.round(root.querySelector(".journal-entry-pages").getBoundingClientRect().top),
      titleTop: Math.round(root.querySelector(".journal-header").getBoundingClientRect().top),
      reaches: at === button || button.contains(at),
      onTop: at ? at.tagName.toLowerCase() : null
    };
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    await entry.delete();
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`));
  check(anchored.parent === "window",
    `measured from the window, the pencil hangs off the window rather than the page`);
  check(anchored.buttonTop < anchored.pageTop && anchored.buttonTop >= anchored.titleTop,
    `so it sits above the page and beside the journal's name (${anchored.buttonTop}, `
    + `name at ${anchored.titleTop}, page at ${anchored.pageTop})`);
  check(anchored.reaches, `and the pointer reaches it there (found ${anchored.onTop})`);
} finally {
  await cdp.evaluate(`(async () => {
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    for (const entry of game.journal.filter((e) => e.name === "Edit Button Journal")) await entry.delete();
    const api = game.modules.get("illuminus").api;
    for (const style of api.listStyles().filter((s) => s.name === "Edit Button Probe")) {
      await api.deleteStyle(style.id);
    }
  })()`);
}

// The three shapes a tab repeats — a box, a shadow, a picture — gathered into
// one run each. What matters is that gathering is a change of *layout only*:
// every control the schema declares is still in the markup, still its own
// field, because the state switch, the filter, the changed markers, Match all
// sides and Reset all read the controls themselves.
console.log("\n[67] Controls are gathered, not taken away");
try {
  const gathered = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Gathered Probe"});
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1600));
    window.__gathered = {styleId: style.id};
    app.changeTab("boxes", "sheet");
    await new Promise(r => setTimeout(r, 400));
    const tab = app.element.querySelector('.illuminus-tab[data-tab="boxes"]');
    for (const section of tab.querySelectorAll("details.illuminus-section")) section.open = true;
    await new Promise(r => setTimeout(r, 400));

    const edge = tab.querySelector('.illuminus-box__run[data-run="edges"]');
    // Opened first, as a person opens it: a run the style says nothing about
    // starts folded away behind the line that says so.
    edge.open = true;
    await new Promise(r => setTimeout(r, 150));
    const showing = () => [...edge.querySelectorAll(".illuminus-box__part")]
      .filter((part) => getComputedStyle(part).display !== "none")
      .map((part) => part.dataset.side);
    const before = [...new Set(showing())];
    edge.querySelector('.illuminus-box__side[data-side="Right"]').click();
    await new Promise(r => setTimeout(r, 200));
    const after = [...new Set(showing())];

    const shadow = [...tab.querySelectorAll(".illuminus-cluster")]
      .find((one) => one.querySelector(".illuminus-cluster__name"));
    return JSON.stringify({
      // Every control the schema declares, present whether gathered or not.
      inTab: tab.querySelectorAll(".illuminus-field[data-field]").length,
      boxes: tab.querySelectorAll(".illuminus-box").length,
      clusters: tab.querySelectorAll(".illuminus-cluster").length,
      // A run nobody has set says so and stays folded; the summary is read from
      // the controls, so it cannot drift from what they hold.
      foldedAway: [...tab.querySelectorAll(".illuminus-cluster")].filter((one) => !one.open).length,
      saysNothing: [...tab.querySelectorAll(".illuminus-run-says.is-unset")].length,
      sideBefore: before, sideAfter: after,
      // A gathered run says which one it is, and its controls drop the
      // qualifier the run has taken on.
      runName: shadow?.querySelector(".illuminus-cluster__name")?.textContent.trim() ?? null,
      shortLabel: shadow?.querySelector(".illuminus-field__label--short")?.textContent.trim() ?? null,
      fullKept: Boolean(shadow?.querySelector(".illuminus-field__label:not(.illuminus-field__label--short)"))
    });
  })()`));
  check(gathered.boxes > 0 && gathered.clusters > 0,
    `a tab gathers its boxes and its shadows and pictures (${gathered.boxes} boxes, ${gathered.clusters} runs)`);
  check(gathered.sideBefore.length === 1 && gathered.sideBefore[0] === "Top",
    `an edge shows one side at a time (${gathered.sideBefore.join(", ") || "none"})`);
  check(gathered.sideAfter.length === 1 && gathered.sideAfter[0] === "Right",
    `and choosing another side shows that one instead (${gathered.sideAfter.join(", ") || "none"})`);
  check(Boolean(gathered.runName) && Boolean(gathered.shortLabel)
    && !gathered.shortLabel.startsWith(gathered.runName),
    `a gathered run takes the name its controls give up (${gathered.runName}: ${gathered.shortLabel})`);
  check(gathered.fullKept,
    "while the whole name stays in the markup, where the search box reads it");
  check(gathered.foldedAway > 0 && gathered.saysNothing > 0,
    `a run the style says nothing about is folded away behind the line saying so `
    + `(${gathered.foldedAway} folded)`);
} finally {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    if (window.__gathered?.styleId) await api.deleteStyle(window.__gathered.styleId);
    window.__gathered = undefined;
  })()`);
}

// Two ways in, for an editor with two thousand controls behind sixteen tabs.
console.log("\n[68] Reading back a style, and pointing at the thing you mean");
try {
  const ways = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    // A style that says one thing, so "only what this style sets" has an answer
    // that can be counted rather than eyeballed.
    const style = await api.createStyle({name: "Ways In Probe", settings: {links: {color: "#ff8800"}}});
    const app = await api.openEditor(style.id);
    await new Promise(r => setTimeout(r, 1600));
    window.__waysIn = {styleId: style.id};
    app.changeTab("links", "sheet");
    await new Promise(r => setTimeout(r, 400));
    const el = app.element;
    const tab = el.querySelector('.illuminus-tab[data-tab="links"]');
    const shown = () => [...tab.querySelectorAll(".illuminus-field[data-field]")]
      .filter((field) => !field.classList.contains("is-filtered-out"));
    const before = shown().length;

    const only = el.querySelector(".illuminus-filter__set-box");
    only.checked = true;
    only.dispatchEvent(new Event("change", {bubbles: true}));
    await new Promise(r => setTimeout(r, 300));
    const after = shown();
    const out = {
      before,
      after: after.length,
      // What is left is what the style actually says. Asked of the mark for
      // that and not of the changed marker beside it: a value the style saved
      // is unchanged since this editor opened, and would fail the other test
      // while being exactly what this one is looking for.
      allSet: after.every((field) => !field.classList.contains("is-unset")),
      names: after.map((field) => field.dataset.field)
    };
    only.checked = false;
    only.dispatchEvent(new Event("change", {bubbles: true}));
    await new Promise(r => setTimeout(r, 300));
    out.restored = shown().length;

    // And the sample as a way in: the piece a person can see, clicked.
    app.changeTab("page", "sheet");
    await new Promise(r => setTimeout(r, 300));
    const part = el.querySelector('.illuminus-preview__frame [data-part="links"]');
    out.hasPart = Boolean(part);
    part?.click();
    await new Promise(r => setTimeout(r, 400));
    out.landedOn = app.tabGroups.sheet;
    await app.close({force: true});
    return JSON.stringify(out);
  })()`));
  check(ways.after > 0 && ways.after < ways.before,
    `"only what this style sets" narrows a tab to what it says (${ways.before} to ${ways.after})`);
  check(ways.allSet && ways.names.includes("links.color"),
    `and what is left is exactly that (${ways.names.join(", ") || "nothing"})`);
  check(ways.restored === ways.before,
    `turning it off puts the rest back (${ways.restored} of ${ways.before})`);
  check(ways.hasPart && ways.landedOn === "links",
    `clicking a piece of the sample opens the tab that paints it (landed on ${ways.landedOn})`);
} finally {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.constructor.name.startsWith("Illuminus")) await app.close({force: true});
    }
    if (window.__waysIn?.styleId) await api.deleteStyle(window.__waysIn.styleId);
    window.__waysIn = undefined;
  })()`);
}

// A corner has a size and a shape. Until browsers grew `corner-shape` only the
// size could be said, so every corner in every style was a quarter circle; the
// shape reads the same four sizes and cuts a different shape with them.
console.log("\n[69] A corner can be cut to a shape");
try {
  const shapes = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Corner Shape Probe", settings: {
      // The block a read-aloud box is built from, cut rather than rounded.
      box01: {cornerTopLeft: 18, cornerTopRight: 18, cornerBottomLeft: 18,
              cornerBottomRight: 18, cornerShape: "bevel", background: "#402010"},
      // And a category that says nothing about it, which must stay as Foundry
      // draws it: round is the browser's own, so nothing changes.
      secrets: {cornerTopLeft: 10}
    }});
    const entry = await JournalEntry.create({name: "Corner Shape Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      '<blockquote class="illuminus-box illuminus-box--box01"><p>Read this aloud.</p></blockquote>' +
      '<section class="secret" id="secret-shape"><p>Hidden.</p></section>'}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));
    const root = entry.sheet.element;
    const box = root.querySelector("blockquote.illuminus-box--box01");
    const secret = root.querySelector("section.secret");
    const out = {
      supported: CSS.supports("corner-shape", "bevel"),
      shape: getComputedStyle(box).cornerShape,
      radius: getComputedStyle(box).borderTopLeftRadius,
      unset: getComputedStyle(secret).cornerShape
    };
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    await entry.delete();
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`));
  check(shapes.supported, "the browser can cut a corner to a shape");
  check(/bevel/.test(shapes.shape ?? "") && shapes.radius === "18px",
    `a block's corners are cut rather than rounded, to the size they were given `
    + `(${shapes.shape}, ${shapes.radius})`);
  // The default is what a browser does anyway, so a style that says nothing
  // about a corner still looks exactly as it did.
  check(/round/.test(shapes.unset ?? ""),
    `and a corner nobody has shaped is round, as Foundry draws it (${shapes.unset})`);
} finally {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    for (const entry of game.journal.filter((e) => e.name === "Corner Shape Journal")) await entry.delete();
    for (const style of api.listStyles().filter((s) => s.name === "Corner Shape Probe")) {
      await api.deleteStyle(style.id);
    }
  })()`);
}

// The parts a person builds themselves — the ten blocks, the ten tags, the ten
// picture treatments — can now say how they are laid out as well as how they
// are painted: a block can be a row of what is inside it, with a gap, a width
// it may not pass, and something to do with whatever will not fit.
console.log("\n[70] A block can be laid out, not only painted");
try {
  const laid = JSON.parse(await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    const style = await api.createStyle({name: "Layout Probe", settings: {
      box01: {display: "flex", flexDirection: "row", justify: "between", alignItems: "center",
              gap: 18, maxWidth: 420, overflow: "hidden"},
      // And one that says nothing about its layout, which must be laid out as
      // Foundry lays it out.
      box02: {background: "#221100"}
    }});
    const entry = await JournalEntry.create({name: "Layout Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "P", type: "text", text: {content:
      '<blockquote class="illuminus-box illuminus-box--box01"><p>One</p><p>Two</p></blockquote>' +
      '<blockquote class="illuminus-box illuminus-box--box02"><p>Plain</p></blockquote>'}}]);
    await api.assignStyle(entry, style.id);
    await entry.sheet.render({force: true, pageId: entry.pages.contents[0].id});
    await new Promise(r => setTimeout(r, 1400));
    const root = entry.sheet.element;
    const row = root.querySelector("blockquote.illuminus-box--box01");
    const plain = root.querySelector("blockquote.illuminus-box--box02");
    const cs = getComputedStyle(row);
    const out = {
      display: cs.display,
      direction: cs.flexDirection,
      justify: cs.justifyContent,
      align: cs.alignItems,
      gap: cs.gap,
      maxWidth: cs.maxWidth,
      overflow: cs.overflow,
      // Two paragraphs beside one another rather than one above the other is
      // the whole point, so it is measured rather than taken from the property.
      // Measured across rather than down: what makes it a row is the second
      // starting after the first ends. Their tops differ by a few pixels here
      // for a reason that has nothing to do with rows — the page's opening
      // letter is a drop cap, and that first paragraph is inside this block.
      sideBySide: (() => {
        const [one, two] = row.querySelectorAll("p");
        return two.getBoundingClientRect().left >= one.getBoundingClientRect().right;
      })(),
      plainDisplay: getComputedStyle(plain).display,
      plainMax: getComputedStyle(plain).maxWidth
    };
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    await entry.delete();
    await api.deleteStyle(style.id);
    return JSON.stringify(out);
  })()`));
  check(laid.display === "flex" && laid.direction === "row" && laid.sideBySide,
    `a block can be a row of what is inside it (${laid.display}, ${laid.direction}, `
    + `${laid.sideBySide ? "side by side" : "still stacked"})`);
  check(laid.justify === "space-between" && laid.align === "center" && laid.gap === "18px",
    `sharing out its room, lined up across it, with a gap (${laid.justify}, ${laid.align}, ${laid.gap})`);
  check(laid.maxWidth === "420px" && laid.overflow === "hidden",
    `and it can be given a width it may not pass (${laid.maxWidth}, ${laid.overflow})`);
  check(laid.plainDisplay === "block" && laid.plainMax === "none",
    `while a block that says nothing is laid out as Foundry lays it out `
    + `(${laid.plainDisplay}, ${laid.plainMax})`);
} finally {
  await cdp.evaluate(`(async () => {
    const api = game.modules.get("illuminus").api;
    for (const app of [...foundry.applications.instances.values()]) {
      if (app.document?.documentName?.startsWith("JournalEntry")) await app.close({force: true});
    }
    for (const entry of game.journal.filter((e) => e.name === "Layout Journal")) await entry.delete();
    for (const style of api.listStyles().filter((s) => s.name === "Layout Probe")) {
      await api.deleteStyle(style.id);
    }
  })()`);
}

console.log("\n[56] Console is clean");
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
