import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };
const { GROUPS, allFields, defaultSettings, cleanSettings, groupFields, cssVarFor } = await import(`${ROOT}/scripts/style-schema.mjs`);
const { compileBaseRule, compileStyle, compileAll, fieldToCss } = await import(`${ROOT}/scripts/style-compiler.mjs`);
const { PRESETS } = await import(`${ROOT}/scripts/presets.mjs`);

// Both stylesheets: the hand-written skeleton and the generated block rules.
const css = ["styles/illuminus.css", "styles/illuminus-generated.css"]
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
const lang = JSON.parse(fs.readFileSync(path.join(ROOT, "lang/en.json"), "utf8"));
const editorHbs = ["templates/style-editor.hbs", "templates/style-field.hbs"]
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");

let failures = 0;
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

/* 1. Every var emitted by the schema is consumed by the stylesheet, and vice versa. */
console.log("\n[1] CSS variable wiring");
const baseRule = compileBaseRule();
// Every property the schema can emit, not only those its defaults happen to
// produce: a field meaning "use the page setting" emits nothing until it is
// given a value, and the stylesheet still has to name it.
const emitted = new Set();
// A chrome field is stored with a style and exported with it, but drives the
// editor rather than the stylesheet — "is this part's hovered state switched
// off" is a question for the compiler, not a value any rule reads. A `noCss`
// field is drawn in the list like any other and answers a question no value
// can: where the Edit pencil hangs is a move made at render, since a page clips
// what scrolls inside it. Both are exempt from the two directions of the check
// below, and from the one after it that insists every field can produce a
// declaration.
const paints = ({ field }) => !field.chrome && !field.noCss;
for (const { group, field } of allFields().filter(paints)) {
  const candidates = [field.default, ...(field.choices ?? []), true, false, 1, ""];
  let sawSuffix = false;
  for (const candidate of candidates) {
    const out = fieldToCss(field, candidate);
    for (const suffix of Object.keys(out ?? {})) {
      emitted.add(cssVarFor(group.id, field, suffix));
      sawSuffix = true;
    }
  }
  if (!sawSuffix) emitted.add(cssVarFor(group.id, field));
}
const consumed = new Set([...css.matchAll(/var\((--ill-[a-z0-9-]+)\s*[,)]/g)].map((m) => m[1]));

// A var may legitimately be consumed indirectly, from inside a value emitted
// for some setting other than the default — the drop-cap tint indirects through
// the drop-cap color, but only while a drop cap is switched on. So exercise
// every value each field can take, not just its default.
for (const { field } of allFields().filter(paints)) {
  const candidates = [field.default, ...(field.choices ?? []), true, false];
  for (const candidate of candidates) {
    const out = fieldToCss(field, candidate);
    for (const css of Object.values(out ?? {})) {
      for (const m of String(css).matchAll(/var\((--ill-[a-z0-9-]+)\s*[,)]/g)) consumed.add(m[1]);
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

/* 2. Every field compiles — or is deliberately optional. */
console.log("\n[2] Field defaults compile");
let optional = 0;
for (const { group, field } of allFields().filter(paints)) {
  if (Object.keys(fieldToCss(field, field.default) ?? {}).length) continue;
  // A field whose default emits nothing means "use the page setting". It still
  // has to produce a declaration once given a real value.
  const sample = field.type === "color" ? "#123456" : field.choices?.[1] ?? 1;
  if (Object.keys(fieldToCss(field, sample) ?? {}).length) {
    optional += 1;
    continue;
  }
  fail(`${group.id}.${field.name} emits nothing, for its default or for ${JSON.stringify(sample)}`);
}
if (!failures) {
  ok(`all ${allFields().filter(paints).length} fields compile `
    + `(${optional} optional, falling back to the page setting)`);
}

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
for (const file of ["style-editor.hbs", "style-field.hbs", "style-manager.hbs"]) {
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
  // A preset that says nothing is a deliberate blank — a named starting point
  // with every control still at "leave it alone", which is a fair thing to ship.
  // A preset that *sets* something and still compiles to nothing is a bug: the
  // values were rejected somewhere between the file and the stylesheet.
  const says = Object.values(cleaned).some((group) => Object.keys(group ?? {}).length);
  const rule = compileStyle({ id: preset.id, settings: cleaned });
  if (says && !rule) fail(`preset "${preset.name}" sets values but compiled to nothing`);
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

/* 9. The export: a real archive, and the files it names. */
console.log("\n[9] Export");
const { makeZip } = await import(`${ROOT}/scripts/zip.mjs`);

// Every stylesheet the exporter reads has to be where it says it is. These are
// strings in the source, so nothing else would notice a rename.
const exporter = fs.readFileSync(path.join(ROOT, "scripts/export-html.mjs"), "utf8");
const named = [...exporter.matchAll(/moduleFile\("([^"]+)"\)/g)].map((m) => m[1]);
if (!named.length) fail("no stylesheets found in the exporter — has moduleFile been renamed?");
for (const file of named) {
  if (!fs.existsSync(path.join(ROOT, file))) fail(`the exporter reads ${file}, which does not exist`);
}
ok(`the exporter's ${named.length} stylesheets all exist`);

// The archive is checked by something that is not us: an unzipper either reads
// it or it does not, and our own reader agreeing with our own writer would
// prove nothing.
const payload = "<p>The stair descends past the waterline.</p>\n".repeat(400);
const binary = new Uint8Array(512).map((_, i) => i % 256);
const zip = await makeZip([
  { path: "index.html", data: payload },
  { path: "styles/aged-parchment.css", data: ":root { --x: 1 }" },
  { path: "assets/images/paper.bin", data: binary }
]);
const bytes = Buffer.from(await zip.arrayBuffer());
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "illuminus-zip-"));
try {
  fs.writeFileSync(path.join(dir, "out.zip"), bytes);
  execFileSync("unzip", ["-q", "-o", "out.zip", "-d", "out"], { cwd: dir });
  const html = fs.readFileSync(path.join(dir, "out/index.html"), "utf8");
  const back = fs.readFileSync(path.join(dir, "out/assets/images/paper.bin"));
  if (html !== payload) fail("text did not survive the round trip through the archive");
  else if (!back.equals(Buffer.from(binary))) fail("binary data did not survive the round trip");
  else ok(`an unzipper reads the archive back byte for byte (${payload.length} bytes stored in ${bytes.length})`);
  if (bytes.length >= payload.length) fail("the archive is no smaller than its contents — is deflate working?");
  else ok("and it is compressed, not merely stored");
} catch (error) {
  fail(`could not verify the archive with unzip: ${error.message}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

/* Two controls writing one setting.
 *
 * A part gathers its controls from several helpers, and two of them can declare
 * the same name without either knowing: `tagSections` had a least width of its
 * own and `layoutFields` added a second, so every tag style drew two "Least
 * Width" rows writing one value. Nothing else notices — the name is legal, the
 * property is legal, and the editor draws whatever it is given. */
console.log("\n[10] No two controls share a name");
{
  let clashes = 0;
  for (const group of GROUPS) {
    const names = group.sections.flatMap((section) => section.fields.map((field) => field.name));
    const twice = [...new Set(names.filter((name, at) => names.indexOf(name) !== at))];
    if (!twice.length) continue;
    fail(`${group.id} declares ${twice.join(", ")} more than once`);
    clashes += twice.length;
  }
  if (!clashes) ok(`every control in all ${GROUPS.length} tabs has a name of its own`);
}

/* A state's control must be able to say nothing.
 *
 * Every hovered and selected control is derived from an ordinary one and starts
 * empty, meaning "leave it as it is" — and the rule that reads it is written
 * `var(--twin, var(--ordinary))` so that emptiness reaches past it. But an
 * `emit` answers a value it does not recognize with a sensible one, which is
 * right for the ordinary control and wrong here: the twin then holds a real
 * value, wins that chain, and changes the element the moment a pointer arrives.
 * 276 twins did. Pointing at a background picture re-tiled and re-cornered it,
 * bold lettering came back at 400, small caps fell away, a drop cap collapsed,
 * and a list took the browser's own bullet. It is checked here rather than in
 * the app because one pass covers every twin in the schema, and an emit written
 * next year is covered by it without anyone remembering this. */
console.log("\n[11] A state's control can say nothing");
{
  const noisy = [];
  for (const group of GROUPS) {
    for (const section of group.sections) {
      for (const field of section.fields) {
        if (!field.twin) continue;
        const quiet = field.type === "number" ? 0 : field.default;
        const said = fieldToCss(field, quiet);
        if (said !== null && said !== undefined) noisy.push(`${group.id}.${field.name} -> ${JSON.stringify(said)}`);
      }
    }
  }
  if (noisy.length) {
    fail(`${noisy.length} state controls speak when they hold nothing`);
    for (const one of noisy.slice(0, 6)) fail(`  ${one}`);
  } else {
    ok("every hovered and selected control leaves its element alone until it is set");
  }
}

/* The same controls in CSS's own words.
 *
 * The editor can be switched into CSS property names for somebody who already
 * writes stylesheets, and the wording is read out of the stylesheets rather
 * than written by hand — so a control added without re-running the lang
 * generator would simply have no name in that vocabulary, and would quietly
 * keep its plain one. Only the names are translated: a hint says what a control
 * does, which is the same thing whichever words name it. */
console.log("\n[12] CSS wording");
{
  const unnamed = [];
  for (const group of GROUPS) {
    for (const field of groupFields(group)) {
      if (field.noCss || field.chrome) continue;
      const own = `ILLUMINUS.Field.${group.family ?? group.id}.${field.name}.css`;
      if (own in lang) continue;
      if (!(`ILLUMINUS.Field.${field.name}.css` in lang)) unnamed.push(`${group.id}.${field.name}`);
    }
  }
  if (unnamed.length) {
    fail(`${unnamed.length} controls have no CSS wording (${unnamed.slice(0, 4).join(", ")})`);
  } else {
    ok("every control that writes CSS can say so in CSS's own words");
  }
  // And the plain wording stays plain: the whole argument for the module is
  // that nobody has to read a property name to use it.
  const jargon = Object.entries(lang).filter(([key, said]) =>
    key.startsWith("ILLUMINUS.Field.") && key.endsWith(".label")
    && /^[a-z-]+(-[a-z]+)+$/.test(String(said)));
  if (jargon.length) {
    fail(`${jargon.length} plain labels read like CSS (${jargon.slice(0, 3).map(([k]) => k).join(", ")})`);
  } else {
    ok("and no plain label reads like a property name");
  }
}

/* A rule that quietly overrides itself.
 *
 * The secret passage's rule declared `box-shadow` twice — the complete one with
 * its inner shading, and later an outer-only one that replaced it. Nothing
 * complains: it is legal CSS, the later declaration simply wins, and the
 * control it took away goes on writing a custom property nobody reads. It
 * looked exactly like an Inner Shadow that did not work.
 *
 * Only a repeat that *differs* is a fault. An identical one is noise a
 * generator makes when two pieces both state the same thing, and says nothing
 * about what the browser will do. */
console.log("\n[13] No rule overrides itself");
{
  const twice = [];
  for (const [file, text] of [["skeleton", fs.readFileSync(path.join(ROOT, "styles/illuminus.css"), "utf8")],
                              ["generated", fs.readFileSync(path.join(ROOT, "styles/illuminus-generated.css"), "utf8")]]) {
    const plain = text.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector, body] of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const said = new Map();
      for (const [, , property, value] of body.matchAll(/(^|;)\s*([a-z-]+)\s*:([^;]*)/g)) {
        if (!said.has(property)) said.set(property, new Set());
        said.get(property).add(value.replace(/\s+/g, " ").trim());
      }
      for (const [property, values] of said) {
        if (values.size < 2) continue;
        twice.push(`${file}: ${selector.trim().split(",")[0].trim().slice(0, 54)} says ${property} two ways`);
      }
    }
  }
  if (twice.length) {
    fail(`${twice.length} rules say one property two ways, and the later one wins`);
    for (const one of twice.slice(0, 4)) fail(`  ${one}`);
  } else {
    ok("no rule states a property twice with different values");
  }
}

/* Two controls in one category answering to one name.
 *
 * A category may hold two of a thing — the line that folds a collapsible and
 * the block it folds, a term and its definition — and most of their controls
 * already say which they belong to, because the wording is built from the
 * part's own name. A family whose wording is written without reference to the
 * part came out the same for both, and a category showed two controls called
 * "Top Padding" with nothing to tell them apart. `generate-lang.mjs` sweeps for
 * this; the sweep is only as good as the words it has, so this says whether one
 * was left over. */
console.log("\n[14] No category holds two controls of one name");
{
  const clashes = [];
  for (const group of GROUPS) {
    const key = group.family ?? group.id;
    for (const section of group.sections) {
      const byLabel = new Map();
      for (const field of section.fields) {
        // Both spellings of a state, as the editor reads them: `hoverBackground`
        // and `entryHoverBackground`. A state's control is shown in place of
        // the one it stands in for, never beside it.
        if (/^(hover|active|collapsed)[A-Z]/.test(field.name)
          || /[a-z](Hover|Active|Collapsed)[A-Z]/.test(field.name)) continue;
        const label = lang[`ILLUMINUS.Field.${key}.${field.name}.label`]
          ?? lang[`ILLUMINUS.Field.${field.name}.label`];
        if (!label) continue;
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push(field.name);
      }
      for (const [label, names] of byLabel) {
        if (names.length > 1) clashes.push(`${group.id}.${section.id}: ${names.length} controls called "${label}" (${names.join(", ")})`);
      }
    }
  }
  if (clashes.length) {
    fail(`${clashes.length} categories hold two controls a person cannot tell apart`);
    for (const one of clashes.slice(0, 4)) fail(`  ${one}`);
  } else {
    ok("every control in a category has a name of its own");
  }
}

/* US English, which the module says it uses.
 *
 * Nothing enforced it, and 2,072 British spellings had accumulated — 1,931 of
 * them in wording a person reads. A file that says "colour" in one hint and
 * "color" in the next reads as carelessly written, and the CSS property is
 * spelled the American way regardless, so a stray "colour" in a hint sits next
 * to `color` in the same sentence. */
console.log("\n[15] US English");
{
  const BRITISH = ["colour", "centre", "grey", "licence", "recognise", "behaviour",
    "favour", "honour", "neighbour", "organise", "realise", "analyse", "defence",
    "travelled", "cancelled", "catalogue", "metre", "fibre"];
  const looked = [
    ["wording", Object.values(lang).join("\n")],
    ["the skeleton", fs.readFileSync(path.join(ROOT, "styles/illuminus.css"), "utf8")],
    ["the schema", fs.readFileSync(path.join(ROOT, "scripts/style-schema.mjs"), "utf8")]
  ];
  const found = [];
  for (const [what, text] of looked) {
    const lower = text.toLowerCase();
    for (const word of BRITISH) {
      const n = lower.split(word).length - 1;
      if (n) found.push(`${what}: ${n}× "${word}"`);
    }
  }
  if (found.length) {
    fail(`British spellings, where the module says US English: ${found.slice(0, 5).join(", ")}`);
  } else {
    ok("wording, stylesheet and schema are all US English");
  }
}

/* Every run of plain controls can be named, and no category holds two runs of
 * one name.
 *
 * A category is laid out in runs — the schema draws a line and stacks the
 * controls that belong together under it — and the editor folds each run behind
 * one row saying what it holds. That row needs a name, which is read from the
 * controls' own wording where they share any and from `RUN_KINDS` where they do
 * not. A run neither can name would draw a blank row, and two runs of one name
 * in one category is the same confusion as two controls of one name, which [14]
 * already refuses.
 *
 * Checked here rather than in the app because it is the whole schema in a
 * second, so a run added next year is covered without anyone remembering. */
console.log("\n[16] Every run of controls has a name");
{
  // Wording, as the editor reads it: a family's own key wins over the shared
  // one, exactly as `#fieldText` resolves a label.
  globalThis.game = { i18n: {
    localize: (key) => lang[key] ?? key,
    has: (key) => key in lang
  } };
  const { nameRuns, runKindOf, RUN_KINDS, boxPartOf, clusterPartOf, stateBase, stateOf } =
    await import(`${ROOT}/scripts/run-names.mjs`);

  const labelOf = (group, name) =>
    lang[`ILLUMINUS.Field.${group.family ?? group.id}.${name}.label`]
    ?? lang[`ILLUMINUS.Field.${name}.label`] ?? name;

  // The two shapes the editor gathers before these runs are left over — asked
  // of the editor's own functions rather than of a copy of its regexes. The
  // copy that used to live here had already drifted: it still looked for a
  // single `cornerShape` after each corner had grown one of its own, so four
  // controls the editor gathers were counted here as loose ones.
  const gathered = (name) => Boolean(boxPartOf(name) ?? clusterPartOf(name));

  let runs = 0;
  const nameless = [];
  const clashes = [];
  for (const group of GROUPS) {
    for (const section of group.sections) {
      const gathering = [];
      let held = [];
      const settle = () => {
        if (held.length) {
          const distinct = new Set(held.map((field) => field.name.replace(/^(hover|active)/, "")
            .replace(/(Hover|Active)(?=[A-Z])/, "")));
          if (distinct.size > 1) gathering.push(held);
        }
        held = [];
      };
      for (const field of section.fields) {
        if (field.chrome) continue;
        if (gathered(field.name)) { settle(); continue; }
        if (section.dividers?.has(field.name)) settle();
        held.push(field);
      }
      settle();
      runs += gathering.length;
      // Named the way the editor names them: a whole category at a time, so two
      // runs of one name are told apart against each other.
      const seen = nameRuns(gathering.map((run) => run.map((field) =>
        ({ name: field.name, label: labelOf(group, field.name) }))));
      seen.forEach((name, at) => {
        if (name) return;
        nameless.push(`${group.id}.${section.id}: ${gathering[at].map((f) => f.name).slice(0, 5).join(", ")}`);
      });
      const counted = new Map();
      for (const name of seen) if (name) counted.set(name, (counted.get(name) ?? 0) + 1);
      for (const [name, n] of counted) {
        if (n > 1) clashes.push(`${group.id}.${section.id}: "${name}" ×${n}`);
      }
    }
  }
  if (nameless.length) {
    fail(`${nameless.length} run(s) of controls that nothing can name — add a suffix to RUN_KINDS`);
    for (const one of nameless.slice(0, 4)) fail(`  ${one}`);
  } else {
    ok(`all ${runs} runs of controls are named`);
  }
  if (clashes.length) {
    fail(`${clashes.length} categor(ies) hold two runs of one name`);
    for (const one of clashes.slice(0, 4)) fail(`  ${one}`);
  } else {
    ok("no category holds two runs of one name");
  }

  // A gathered family, twice over, because its state is spelled two ways.
  //
  // The runs above are the loose controls; a box, a shadow and a picture are
  // gathered before them and were never compared with each other. A state's
  // control is named either way round — `activeHeadingBorderTopWidth` where it
  // was derived, `headingActiveBorderTopColor` where the schema states it by
  // hand — so one family came out as two, drawn as two runs with one name
  // between them. Sub-Headings showed two "Edges and Corners" under Selected,
  // one holding the widths and the other the colors, and nothing here saw it.
  const split = [];
  for (const group of GROUPS) {
    for (const section of group.sections) {
      const seen = new Map();
      for (const field of section.fields) {
        const part = boxPartOf(field.name) ?? clusterPartOf(field.name);
        if (!part) continue;
        // One run per family per state: what a family *is* with its state word
        // taken out, and which state it is in.
        const key = `${stateBase(part.family)}|${stateOf(part.family)}`;
        const held = seen.get(key);
        if (held && held !== part.family) {
          split.push(`${group.id}.${section.id}: ${stateBase(part.family)} is two runs `
            + `(${held} and ${part.family})`);
        } else seen.set(key, part.family);
      }
    }
  }
  // Counted once per family, not once per control: four controls collide for
  // every one family that is split, and "4 families" sends somebody looking for
  // three more that are not there.
  const splits = [...new Set(split)];
  if (splits.length) {
    fail(`${splits.length} ${splits.length === 1 ? "family is" : "families are"} `
      + "drawn as two runs of one name");
    for (const one of splits.slice(0, 4)) fail(`  ${one}`);
  } else {
    ok("no gathered family is drawn twice under two spellings of its state");
  }

  // And every word the table can reach for is written down. A kind with no
  // wording prints its own key into the editor.
  const unworded = RUN_KINDS.map(([kind]) => kind)
    .filter((kind) => !(`ILLUMINUS.Run.${kind}` in lang));
  if (unworded.length) fail(`run kinds with no wording: ${unworded.join(", ")}`);
  else ok(`every one of the ${RUN_KINDS.length} run kinds has wording`);

  // A control the table cannot place at all would make a run fall back to a
  // name it did not choose. Not fatal on its own — a run is named from shared
  // wording first — but worth saying.
  const unplaced = allFields().filter(({ field }) =>
    !field.chrome && !gathered(field.name) && !runKindOf(field.name)).length;
  console.log(`  · ${unplaced} controls sit in no kind, and are named by the wording they share`);
}


/* The interface's own words for its own parts.
 *
 * The editor has not had a strip of parts since the parts of a journal became a
 * tree, and a person told to "return every setting on this part" is being told
 * about a control that is not on the screen. The word survived in nine strings
 * after the tree was built, because nothing was looking.
 *
 * A paper part is a different word and a good one — a box with only its two
 * right-hand corners rounded does look like an index part — so what is refused
 * is the interface's own use of it. */
console.log("\n[17] The interface's own words");
{
  const PAPER = /\btab\b(?=\s+or\s+a\s+bookmark)/i;
  const wrong = [];
  for (const [key, said] of Object.entries(lang)) {
    if (typeof said !== "string") continue;
    for (const found of said.matchAll(/\btabs?\b/gi)) {
      if (PAPER.test(said.slice(found.index))) continue;
      wrong.push(`${key}: "${said.slice(Math.max(0, found.index - 30), found.index + 30).replace(/\n/g, " ")}"`);
      break;
    }
  }
  if (wrong.length) {
    fail(`${wrong.length} string(s) still call a part of a journal a tab`);
    for (const one of wrong.slice(0, 4)) fail(`  ${one}`);
  } else {
    ok("nothing a person reads calls a part of a journal a tab");
  }
}


/* Every part of a journal has a piece of the sample to point at.
 *
 * The sample follows the open part: pieces carry `data-part="<group id>"`, and
 * the editor dims the rest and scrolls the focused one into view. A part the
 * sample has no piece for is left alone — which is silent, and reads as the
 * part having no preview of its own rather than as a piece nobody wrote.
 *
 * That is what happened when the panel and the page editor were split into
 * parts of their own: the pieces went on naming the two parents, so opening
 * Page Entries or the Toolbar showed the whole journal exactly as the default
 * does. A family member needs none — its family's own preview takes the pane. */
console.log("\n[18] Every part has a piece of the sample");
{
  const markup = ["style-editor.hbs", "sample-page.hbs"]
    .map((name) => fs.readFileSync(path.join(ROOT, "templates", name), "utf8")).join("\n");
  const pieces = new Set([...markup.matchAll(/data-part="([^"]+)"/g)].map((found) => found[1]));
  const orphans = GROUPS.filter((group) => !group.family && !pieces.has(group.id));
  const strays = [...pieces].filter((id) => !GROUPS.some((group) => group.id === id));
  if (orphans.length) {
    fail(`${orphans.length} part(s) have no piece of the sample: ${orphans.map((g) => g.id).join(", ")}`);
  } else {
    ok(`all ${GROUPS.filter((g) => !g.family).length} parts have a piece of the sample to point at`);
  }
  if (strays.length) fail(`the sample names parts that do not exist: ${strays.join(", ")}`);
  else ok("and every piece names a part that exists");
}

/* No class quietly overrides itself.
 *
 * The JavaScript twin of [13]. A class body keeps the *later* definition of a
 * name and says nothing whatever about the one it replaced — so a second
 * `_initializeApplicationOptions`, added to remember the window's size, threw
 * away the one that gave each editor an id derived from its style. Every window
 * then registered under a counter, `open()` stopped finding an open editor, and
 * it read as the editor failing to open rather than as a method being gone.
 *
 * Read by indentation rather than by parsing: a method of a class sits at two
 * spaces, and nothing else that looks like a definition does. */
console.log("\n[19] No class overrides itself");
{
  const WORDS = new Set(["if", "for", "while", "switch", "catch", "return", "do", "else", "function"]);
  const clashes = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name))
      : entry.name.endsWith(".mjs") ? [path.join(dir, entry.name)] : []);
  for (const file of walk(path.join(ROOT, "scripts"))) {
    const seen = new Map();
    let where = null;
    for (const [at, line] of fs.readFileSync(file, "utf8").split("\n").entries()) {
      const opened = line.match(/^(?:export\s+)?class\s+(\w+)/);
      if (opened) { where = opened[1]; seen.clear(); continue; }
      const method = line.match(/^ {2}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([#\w]+)\s*\(/);
      if (!where || !method || WORDS.has(method[1])) continue;
      const already = seen.get(method[1]);
      if (already) clashes.push(`${path.relative(ROOT, file)}: ${where}.${method[1]} at lines ${already} and ${at + 1}`);
      else seen.set(method[1], at + 1);
    }
  }
  if (clashes.length) {
    fail(`${clashes.length} method(s) defined twice in one class`);
    for (const one of clashes.slice(0, 6)) fail(`  ${one}`);
  } else {
    ok("no class defines the same method twice");
  }
}

console.log(`\n${failures ? `FAILED — ${failures} problem(s)` : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
