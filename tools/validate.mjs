import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };
const { GROUPS, allFields, defaultSettings, cleanSettings, groupFields } = await import(`${ROOT}/scripts/style-schema.mjs`);
const { compileBaseRule, compileStyle, compileAll, fieldToCss } = await import(`${ROOT}/scripts/style-compiler.mjs`);
const { PRESETS } = await import(`${ROOT}/scripts/presets.mjs`);

const css = fs.readFileSync(path.join(ROOT, "styles/illuminus.css"), "utf8");
const lang = JSON.parse(fs.readFileSync(path.join(ROOT, "lang/en.json"), "utf8"));
const editorHbs = fs.readFileSync(path.join(ROOT, "templates/style-editor.hbs"), "utf8");

let failures = 0;
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

/* 1. Every var emitted by the schema is consumed by the stylesheet, and vice versa. */
console.log("\n[1] CSS variable wiring");
const baseRule = compileBaseRule();
const emitted = new Set([...baseRule.matchAll(/(--ill-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const consumed = new Set([...css.matchAll(/var\((--ill-[a-z0-9-]+)\)/g)].map((m) => m[1]));

// A var may legitimately be consumed indirectly, from inside a value emitted
// for some setting other than the default — the drop-cap tint indirects through
// the drop-cap color, but only while a drop cap is switched on. So exercise
// every value each field can take, not just its default.
for (const { field } of allFields()) {
  const candidates = [field.default, ...(field.choices ?? []), true, false];
  for (const candidate of candidates) {
    const out = fieldToCss(field, candidate);
    for (const css of Object.values(out ?? {})) {
      for (const m of String(css).matchAll(/var\((--ill-[a-z0-9-]+)\)/g)) consumed.add(m[1]);
    }
  }
}

// Two fields emitting the same custom property would silently clobber one
// another, so check every declaration name in the base rule is unique.
const declared = [...baseRule.matchAll(/(--ill-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
const dupes = declared.filter((v, i) => declared.indexOf(v) !== i);
if (dupes.length) fail(`two fields emit the same custom property: ${[...new Set(dupes)].join(", ")}`);
else ok(`all ${declared.length} emitted property names are unique`);

const unused = [...emitted].filter((v) => !consumed.has(v));
const undefinedVars = [...consumed].filter((v) => !emitted.has(v));
if (undefinedVars.length) fail(`stylesheet reads vars the schema never emits: ${undefinedVars.join(", ")}`);
else ok(`all ${consumed.size} vars used in CSS are emitted by the schema`);
if (unused.length) fail(`schema emits vars no CSS rule consumes: ${unused.join(", ")}`);
else ok(`all ${emitted.size} emitted vars are consumed by CSS`);

/* 2. Every field emits at least one declaration for its default value. */
console.log("\n[2] Field defaults compile");
for (const { group, field } of allFields()) {
  const result = fieldToCss(field, field.default);
  if (!result || !Object.keys(result).length) fail(`${group.id}.${field.name} emits nothing for its default`);
}
if (!failures) ok(`all ${allFields().length} fields compile their default`);

/* 3. Localization coverage. */
console.log("\n[3] Localization coverage");
const missing = [];
for (const group of GROUPS) {
  for (const key of [`ILLUMINUS.Groups.${group.id}.label`, `ILLUMINUS.Groups.${group.id}.hint`]) {
    if (!(key in lang)) missing.push(key);
  }
  for (const section of group.sections) {
    for (const key of [`ILLUMINUS.Sections.${section.id}.label`, `ILLUMINUS.Sections.${section.id}.hint`]) {
      if (!(key in lang)) missing.push(key);
    }
  }
  for (const field of groupFields(group)) {
    for (const key of [`ILLUMINUS.Field.${field.name}.label`, `ILLUMINUS.Field.${field.name}.hint`]) {
      if (!(key in lang)) missing.push(key);
    }
    for (const choice of field.choices ?? []) {
      const specific = `ILLUMINUS.Choices.${field.name}.${choice}`;
      const shared = `ILLUMINUS.Choices.${choice}`;
      if (!(specific in lang) && !(shared in lang)) missing.push(shared);
    }
  }
}
const uniqueMissing = [...new Set(missing)];
if (uniqueMissing.length) fail(`missing lang keys:\n      ${uniqueMissing.join("\n      ")}`);
else ok("every group, field, and choice has a label and hint");

/* 4. Template localize keys all exist. */
console.log("\n[4] Template string keys");
const tplKeys = new Set();
for (const file of ["style-editor.hbs", "style-manager.hbs"]) {
  const text = fs.readFileSync(path.join(ROOT, "templates", file), "utf8");
  for (const m of text.matchAll(/localize ['"]([A-Z][A-Za-z0-9._]+)['"]/g)) tplKeys.add(m[1]);
}
const missingTpl = [...tplKeys].filter((k) => !(k in lang));
if (missingTpl.length) fail(`templates reference missing keys: ${missingTpl.join(", ")}`);
else ok(`all ${tplKeys.size} template keys resolve`);

/* 5. Presets only use real fields and survive a compile round-trip. */
console.log("\n[5] Presets");
for (const preset of PRESETS) {
  const cleaned = cleanSettings(preset.settings);
  for (const [groupId, fields] of Object.entries(preset.settings)) {
    const group = GROUPS.find((g) => g.id === groupId);
    if (!group) { fail(`preset "${preset.name}" references unknown group "${groupId}"`); continue; }
    for (const [name, value] of Object.entries(fields)) {
      const field = groupFields(group).find((f) => f.name === name);
      if (!field) { fail(`preset "${preset.name}" sets unknown field ${groupId}.${name}`); continue; }
      if (cleaned[groupId]?.[name] === undefined) {
        fail(`preset "${preset.name}" value for ${groupId}.${name} (${JSON.stringify(value)}) was rejected by cleanSettings`);
      }
    }
  }
  const rule = compileStyle({ id: preset.id, settings: cleaned });
  if (!rule) fail(`preset "${preset.name}" compiled to nothing`);
}
if (!failures) ok(`all ${PRESETS.length} presets use valid fields and compile`);

/* Asset paths referenced anywhere in the module must exist on disk. */
console.log("\n[6] Bundled asset references");
const assetRefs = new Map();
const scan = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(full); continue; }
    if (!/\.(mjs|hbs|css|json)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const m of text.matchAll(/modules\/illuminus\/(assets\/[A-Za-z0-9_\-./]+)/g)) {
      if (!assetRefs.has(m[1])) assetRefs.set(m[1], path.relative(ROOT, full));
    }
  }
};
for (const dir of ["scripts", "templates", "styles", "tools"]) scan(path.join(ROOT, dir));

const brokenRefs = [...assetRefs].filter(([rel]) => !fs.existsSync(path.join(ROOT, rel)));
if (brokenRefs.length) {
  fail("references to assets that do not exist:\n      "
    + brokenRefs.map(([rel, from]) => `${rel}  (from ${from})`).join("\n      "));
} else ok(`all ${assetRefs.size} referenced asset paths exist`);

// Case matters on a case-sensitive filesystem even though macOS forgives it.
const caseIssues = [...assetRefs].filter(([rel]) => {
  const parts = rel.split("/");
  let dir = ROOT;
  for (const part of parts) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return false; }
    if (!entries.includes(part)) return true;
    dir = path.join(dir, part);
  }
  return false;
});
if (caseIssues.length) fail(`asset paths differ in case from the files on disk: ${caseIssues.map(([r]) => r).join(", ")}`);
else ok("and match the on-disk spelling exactly");

/* 6. Sanitization holds against hostile input. */
console.log("\n[7] Injection resistance");
const hostile = {
  page: {
    background: "#fff; } body { display: none } .x {",
    texture: 'javascript:alert(1)'
  },
  body: { font: 'Foo"; } * { color: red } @import "evil.css' }
};
const hostileCss = compileStyle({ id: "hostile", settings: cleanSettings(hostile) });
const declBody = hostileCss.slice(hostileCss.indexOf("{") + 1, hostileCss.lastIndexOf("}"));
if (/[{}]/.test(declBody)) fail(`sanitizer let braces through:\n${hostileCss}`);
else ok("braces cannot escape a declaration block");
if (/javascript:/i.test(hostileCss)) fail("javascript: URL survived sanitization");
else ok("javascript: URLs are rejected");
if (/@import/i.test(hostileCss)) fail("@import survived sanitization");
else ok("@import is stripped");

/* 7. A hostile style id cannot break the selector. */
const badId = compileStyle({ id: 'x"] { color: red } [a="', settings: { page: { background: "#fff" } } });
if (/["\]]/.test(badId.split("{")[0].replace(/\[data-illuminus-style=|\.illuminus-styled/g, "").replace(/"/g, " ").replace(/ /g, '"'))) {
  // simple check: selector should contain exactly two quotes
}
const quoteCount = (badId.split("{")[0].match(/"/g) ?? []).length;
if (quoteCount !== 2) fail(`hostile style id produced a broken selector: ${badId.split("{")[0]}`);
else ok("hostile style ids are stripped to a safe selector");

/* 8. Editor template covers every field type in the schema. */
console.log("\n[8] Editor template coverage");
const types = new Set(allFields().map(({ field }) => field.type));
for (const type of types) {
  if (type === "select" || type === "font") continue; // both fall through to the <select> branch
  if (!editorHbs.includes(`"${type}"`)) fail(`editor template has no branch for field type "${type}"`);
}
ok(`template handles field types: ${[...types].join(", ")}`);

console.log(`\n${failures ? `FAILED — ${failures} problem(s)` : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
