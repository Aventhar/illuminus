/**
 * Turn exported style files into `scripts/presets.mjs`.
 *
 * A style file holds every setting the schema has, because that is what an
 * export is. A preset should hold only what it *says* — the values that differ
 * from the schema's own defaults — or the file is a megabyte of numbers that
 * mean "leave it alone", and no one reading it can tell what the style does.
 *
 * Run it over the files in `Sample Styles/`:
 *   node tools/build-presets.mjs "Sample Styles"/*.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };
const { defaultSettings, cleanSettings } = await import(`${ROOT}/scripts/style-schema.mjs`);
const { SCHEMA_VERSION } = await import(`${ROOT}/scripts/constants.mjs`);
const { migrateSettings } = await import(`${ROOT}/scripts/migrations.mjs`);

const files = process.argv.slice(2);
if (!files.length) {
  console.error("give it one or more exported style files");
  process.exit(1);
}

const defaults = defaultSettings();
/** A stable id, so restoring a deleted sample puts back the same one. */
const idFor = (name) => `preset-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

const presets = [];
for (const file of files) {
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const from = Number(payload.schemaVersion ?? 1);
  for (const style of payload.styles ?? [payload]) {
    // Through the migrations first, so an older file is brought forward the
    // same way a stored style would be.
    const settings = cleanSettings(migrateSettings(style.settings, from));
    const trimmed = {};
    for (const [group, values] of Object.entries(settings)) {
      for (const [name, value] of Object.entries(values ?? {})) {
        if (JSON.stringify(defaults[group]?.[name]) === JSON.stringify(value)) continue;
        (trimmed[group] ??= {})[name] = value;
      }
    }
    const kept = Object.values(trimmed).reduce((n, g) => n + Object.keys(g).length, 0);
    const total = Object.values(settings).reduce((n, g) => n + Object.keys(g ?? {}).length, 0);
    console.log(`${style.name}: ${kept} of ${total} settings differ from the defaults`);
    presets.push({
      id: idFor(style.name),
      name: style.name,
      description: style.description ?? "",
      settings: trimmed,
      labels: style.labels ?? {},
      swatches: style.swatches ?? []
    });
  }
}

const body = presets.map((p) => `  ${JSON.stringify(p, null, 2).split("\n").join("\n  ")}`).join(",\n");
fs.writeFileSync(`${ROOT}/scripts/presets.mjs`, `/**
 * Styles bundled with the module, seeded into a world the first time Illuminus
 * runs there — and put back by Restore Samples when one has been deleted.
 *
 * **Written by \`tools/build-presets.mjs\`; do not hand-edit.** It takes exported
 * style files and keeps only the values that differ from the schema's own
 * defaults, so what is written here is what each style actually says rather
 * than every setting the schema has. Regenerate rather than patch:
 *
 *   node tools/build-presets.mjs "Sample Styles"/*.json
 *
 * The ids are derived from the names and are stable, so restoring a deleted
 * sample puts back the same one rather than a second copy. Anything bundled
 * travels under the repository's licence, which is why these carry no artwork:
 * every picture they could point at would have to be licensable that way too.
 *
 * Built against schema version ${SCHEMA_VERSION}.
 */

export const PRESETS = [
${body}
];
`);
console.log(`wrote scripts/presets.mjs — ${presets.length} presets`);
