/**
 * Styles bundled with the module, seeded into a world the first time Illuminus
 * runs there — and put back by Restore Samples when one has been deleted.
 *
 * **Written by `tools/build-presets.mjs`; do not hand-edit.** It takes exported
 * style files and keeps only the values that differ from the schema's own
 * defaults, so what is written here is what each style actually says rather
 * than every setting the schema has. Regenerate rather than patch:
 *
 *   node tools/build-presets.mjs sample/styles/*.json
 *
 * The ids are derived from the names and are stable, so restoring a deleted
 * sample puts back the same one rather than a second copy. Anything bundled
 * travels under the repository's licence, which is why these carry no artwork:
 * every picture they could point at would have to be licensable that way too.
 *
 * Built against schema version 11.
 */

export const PRESETS = [
  {
    "id": "preset-default-basic",
    "name": "Default Basic",
    "description": "An Example that preserves Foundry's native Journal look, while extending your layout options",
    "settings": {},
    "labels": {},
    "swatches": []
  },
  {
    "id": "preset-fantasy-basic",
    "name": "Fantasy Basic",
    "description": "An Example Fantasy Theme",
    "settings": {},
    "labels": {},
    "swatches": []
  },
  {
    "id": "preset-scifi-basic",
    "name": "SciFi Basic",
    "description": "An Example SciFi Theme",
    "settings": {},
    "labels": {},
    "swatches": []
  }
];
