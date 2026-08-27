/**
 * Write SETTINGS.md: every tab, every category on it, and every setting in the
 * category, in the order the editor draws them.
 *
 * Generated rather than written, for the same reason `lang/en.json` is: a list
 * of two thousand controls kept by hand is a list that is wrong by the end of
 * the week. The order here *is* the order on screen — the schema sorts its
 * sections and fields once, and both the editor and this read the result.
 *
 * A state's own controls are not given rows of their own. The editor draws them
 * in the place of the control they stand in for, one state at a time, so the row
 * says which states the setting has instead.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { GROUPS } = await import(`${ROOT}/scripts/style-schema.mjs`);
const lang = JSON.parse(fs.readFileSync(`${ROOT}/lang/en.json`, "utf8"));

const say = (key, fallback = "") => lang[key] ?? fallback;

/** A sentence, ended once: some wording carries its own full stop and some does not. */
const sentence = (text) => (text && !/[.!?]$/.test(text) ? `${text}.` : text);

/** Wording for one control, in the family-specific spelling where there is one. */
const fieldText = (group, field, part) =>
  lang[`ILLUMINUS.Field.${group.family ?? group.id}.${field.name}.${part}`]
  ?? lang[`ILLUMINUS.Field.${field.name}.${part}`] ?? "";

/** The state a control is named for, and the name with that word taken out. */
const stateOf = (name) => (/^active|Active(?=[A-Z])/.test(name) ? "Selected"
  : /hover/i.test(name) ? "Hovered" : "Normal");
const stemOf = (name) => {
  const stripped = name.replace(/^(hover|active)/, "").replace(/(Hover|Active)(?=[A-Z])/, "");
  if (stripped === name || !stripped) return name;
  return `${stripped[0].toLowerCase()}${stripped.slice(1)}`;
};

/**
 * The tab strip: a group gets its tab where it is declared, a family gets one
 * where its first member is, and anything marked `strip: "end"` goes last
 * however early it appears.
 */
function tabs() {
  const seen = new Set();
  const ordinary = [];
  const last = [];
  for (const group of GROUPS) {
    const key = group.family ?? group.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const members = group.family ? GROUPS.filter((g) => g.family === group.family) : [group];
    (group.strip === "end" ? last : ordinary).push({ key, group, members });
  }
  return [...ordinary, ...last];
}

/** What a value looks like written down. */
function shown(field) {
  if (field.type === "toggle") return field.default ? "on" : "off";
  if (field.type === "color") return field.default || "—";
  if (field.type === "image") return field.default || "—";
  if (field.type === "number") {
    return field.default === 0 && field.zeroAs ? `0 (${field.zeroAs})` : `${field.default}${field.unit ?? ""}`;
  }
  return field.default === "" ? "—" : String(field.default);
}

const lines = [];
const out = (line = "") => lines.push(line);

out("# Every setting in the style editor");
out();
out("*Written by `node tools/generate-settings-doc.mjs`. Do not edit by hand.*");
out();
out("Each tab, each category on it, and every setting in the category, in the order");
out("the editor draws them. A setting that can be set differently for a state — while");
out("the mouse is over it, or while it is the page being read — is one row, with its");
out("states named: the editor draws one state at a time, in the same place, behind the");
out("switch at the top of the category.");
out();

const strip = tabs();
out(`**Tabs, in strip order:** ${strip.map(({ key, group, members }) =>
  members.length > 1 ? say(`ILLUMINUS.Families.${key}`, key)
    : say(`ILLUMINUS.Groups.${group.id}.label`, group.id)).join(" · ")}`);
out();

for (const { key, group, members } of strip) {
  const family = members.length > 1;
  const label = family ? say(`ILLUMINUS.Families.${key}`, key)
    : say(`ILLUMINUS.Groups.${group.id}.label`, group.id);
  const hint = family ? say(`ILLUMINUS.Families.${key}Hint`)
    : say(`ILLUMINUS.Groups.${group.id}.hint`);
  out(`## ${label}`);
  out();
  if (hint) out(sentence(hint));
  if (family) {
    out();
    out(`One tab for ${members.length} of them — ${members
      .map((m) => say(`ILLUMINUS.Groups.${m.id}.label`, m.id)).join(", ")} — with a picker`);
    out("at the top choosing which one is being set. They hold the same settings.");
  }
  out();

  for (const section of group.sections) {
    // A section may name its own wording, where the same section means
    // something different on one tab.
    const sectionLabel = say(section.label ?? `ILLUMINUS.Sections.${section.id}.label`, section.id);
    const sectionHint = section.hint ? say(section.hint) : say(`ILLUMINUS.Sections.${section.id}.hint`);
    out(`### ${sectionLabel}`);
    out();
    if (sectionHint) { out(sentence(sectionHint)); out(); }

    // A control's other states are drawn in its place, so they are folded into
    // its row rather than given one.
    const states = new Map();
    for (const field of section.fields) {
      const stem = stemOf(field.name);
      if (!states.has(stem)) states.set(stem, new Set());
      states.get(stem).add(stateOf(field.name));
    }
    const rows = section.fields.filter((field) => stateOf(field.name) === "Normal" && !field.chrome);
    if (!rows.length) { out("*Nothing but the state switch.*"); out(); continue; }

    out("| Setting | Default | States | What it does |");
    out("| --- | --- | --- | --- |");
    for (const field of rows) {
      // A line across the tab, where the section lays its controls out in runs.
      if (section.dividers?.has(field.name)) out("| --- | --- | --- | --- |");
      const also = [...(states.get(stemOf(field.name)) ?? [])].filter((state) => state !== "Normal");
      out(`| ${fieldText(group, field, "label") || field.name} | ${shown(field)} `
        + `| ${also.length ? also.join(", ") : "—"} `
        + `| ${fieldText(group, field, "hint").replace(/\|/g, "\\|")} |`);
    }
    out();
  }

  const chrome = group.sections.flatMap((s) => s.fields).filter((f) => f.chrome);
  if (chrome.length) {
    out(`Beside the tab's name: ${chrome.map((f) =>
      `**${fieldText(group, f, "label") || f.name}** (${shown(f)})`).join(", ")}.`);
    out();
  }
}

fs.writeFileSync(`${ROOT}/SETTINGS.md`, `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`);
const settings = GROUPS.reduce((n, g) => n + g.sections.reduce((m, s) => m + s.fields.length, 0), 0);
console.log(`wrote SETTINGS.md — ${strip.length} tabs, ${settings} settings`);
