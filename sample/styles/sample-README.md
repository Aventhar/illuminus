# Sample styles

The exported style files the bundled samples are built from. Three of them ship
today: **Default Basic**, **Fantasy Basic** and **SciFi Basic**, seeded into a
world the first time Illuminus runs there and put back by **Restore Samples** in
the style library.

These files are the source, not the product.
[`scripts/presets.mjs`](../../scripts/presets.mjs) is generated from them and
must not be hand-edited — regenerate it instead:

```bash
node tools/build-presets.mjs sample/styles/*.json
```

## Updating one

Edit the style in Foundry, export it from the style library, drop the file here
replacing the old one, and re-run the command above. Then run
`node tools/validate.mjs`, which checks that every value a preset sets is still
a field the schema knows and still compiles.

Three things the build does that are worth knowing:

- **It keeps only what differs from the schema's own defaults.** An export holds
  every setting there is, because that is what an export is; a preset that
  repeated all of them would be a megabyte of numbers meaning "leave it alone",
  and nobody reading it could tell what the style actually does.
- **It migrates on the way in.** A file exported under an older schema is brought
  forward through `scripts/migrations.mjs` exactly as a stored style would be,
  which exercises the migration on real data at the same time.
- **The ids come from the names and are stable.** `Fantasy Basic` becomes
  `preset-fantasy-basic`, so restoring a deleted sample puts back *that* style
  rather than a second copy beside it. Renaming a style changes its id, which
  means the old one can be restored alongside the new — rename deliberately.

## What a sample may carry

**No artwork.** Anything bundled with the module is redistributed under the
repository's GPLv3 license, which is a narrower gate than most "free for personal
use" art packs allow. A sample that wants a texture should point at Foundry's own
`icons/svg/…`, which is always present, or wait until artwork licensable that way
is in the repository.

A Background Image pointing into `worlds/<your world>/…` will not exist for
anyone else who installs the module — they would simply get a broken texture, and
nothing warns about it, so check before exporting.
