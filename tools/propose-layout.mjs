/**
 * Propose a layout for the tabs that have not been laid out by hand yet, in the
 * shape of the two that have.
 *
 * Written to `SETTINGS_NEW.md`, under whatever is already there: it is a
 * proposal to read and change, not something the module reads. Applying one is a
 * separate edit — an `order` on the group and an `order` on each section, which
 * is what the Title and Page tabs carry.
 *
 * The shape it proposes, taken from those two:
 *
 *   Size and Position · Text · Fill and Image · Inner Spacing · Outer Spacing ·
 *   Border · then the parts inside, each in the same order within itself.
 *
 * And within a category, runs separated by a line: the lettering, then how it is
 * spaced, then the line around it, then its shadow; a fill, then its picture,
 * then the shading inside it, then the shadow it casts; a border a side at a
 * time, then the corners.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { GROUPS } = await import(`${ROOT}/scripts/style-schema.mjs`);
const lang = JSON.parse(fs.readFileSync(`${ROOT}/lang/en.json`, "utf8"));

const say = (key, fallback = "") => lang[key] ?? fallback;
const fieldText = (group, field, part) =>
  lang[`ILLUMINUS.Field.${group.family ?? group.id}.${field.name}.${part}`]
  ?? lang[`ILLUMINUS.Field.${field.name}.${part}`] ?? "";

const stateNamed = (name) => name !== "hoverOff"
  && /^(hover|active)|(Hover|Active)(?=[A-Z])/.test(name);

/** The categories the two laid-out tabs merged, and what they became. */
const MERGE = {
  layout: "size", frameSize: "size", tagLayout: "size",
  text: "text", textShadow: "text",
  background: "fill", shadow: "fill", innerShadow: "fill", glow: "fill",
  padding: "inner", margin: "outer",
  border: "border", corners: "border"
};
const MERGED_LABEL = {
  size: "Size and Position", text: "Text", fill: "Fill and Image",
  inner: "Inner Spacing", outer: "Outer Spacing", border: "Border"
};
const MERGED_ORDER = ["size", "text", "fill", "inner", "outer", "border"];

/**
 * Which run a control belongs to, inside its category.
 *
 * Matched on the name with its first letter raised, so that `color` and
 * `captionColor` are the same question asked of two different things — and in
 * an order that puts the particular before the general, since a shadow's color
 * is a shadow before it is a color.
 */
function run(name) {
  const bare = name.replace(/^(hover|active)/, "").replace(/(Hover|Active)(?=[A-Z])/, "")
    .replace(/^./, (c) => c.toUpperCase());
  if (/TextShadow(OffsetX|OffsetY|Blur|Spread|Color)$/.test(bare)) return "text.shadow";
  if (/InnerShadow(OffsetX|OffsetY|Blur|Spread|Color)$/.test(bare)) return "fill.inner";
  if (/Shadow(OffsetX|OffsetY|Blur|Spread|Color)$/.test(bare)) return "fill.outer";
  if (/Texture(|Fit|Position|Blend|Opacity)$/.test(bare)) return "fill.picture";
  if (/Background$/.test(bare)) return "fill.color";
  if (/BorderTop(Width|Style|Color)$/.test(bare)) return "border.top";
  if (/BorderBottom(Width|Style|Color)$/.test(bare)) return "border.bottom";
  if (/BorderLeft(Width|Style|Color)$/.test(bare)) return "border.left";
  if (/BorderRight(Width|Style|Color)$/.test(bare)) return "border.right";
  if (/Corner(TopLeft|TopRight|BottomRight|BottomLeft)$/.test(bare)) return "border.corners";
  if (/Padding(Top|Right|Bottom|Left)$/.test(bare)) return "spacing.inner";
  if (/Margin(Top|Right|Bottom|Left)$/.test(bare)) return "spacing.outer";
  if (/Outline(Width|Color)$/.test(bare)) return "text.outline";
  if (/(Align|Caps|LetterSpacing|WordSpacing|LineHeight|Indent)$/.test(bare)) return "text.spacing";
  if (/(Font|Size|Color|TextStyle|TextStyleSlant)$/.test(bare)) return "text.letters";
  return "rest";
}

const RUN_ORDER = [
  "text.letters", "text.spacing", "text.outline", "text.shadow",
  "fill.color", "fill.picture", "fill.inner", "fill.outer",
  "spacing.inner", "spacing.outer",
  "border.top", "border.bottom", "border.left", "border.right", "border.corners",
  "rest"
];

/** And within a run, the order the two laid-out tabs read in. */
const WITHIN = {
  "text.letters": ["Font", "Size", "Color", "TextStyle", "TextStyleSlant"],
  "text.spacing": ["Align", "Caps", "LetterSpacing", "WordSpacing", "LineHeight"],
  "text.outline": ["OutlineColor", "OutlineWidth"],
  "text.shadow": ["OffsetX", "OffsetY", "Blur", "Spread", "Color"],
  "fill.picture": ["Texture", "TextureFit", "TexturePosition", "TextureBlend", "TextureOpacity"],
  "fill.inner": ["OffsetX", "OffsetY", "Blur", "Spread", "Color"],
  "fill.outer": ["OffsetX", "OffsetY", "Blur", "Spread", "Color"],
  "spacing.inner": ["Top", "Bottom", "Left", "Right"],
  "spacing.outer": ["Top", "Bottom", "Left", "Right"],
  "border.top": ["Style", "Color", "Width"],
  "border.bottom": ["Style", "Color", "Width"],
  "border.left": ["Style", "Color", "Width"],
  "border.right": ["Style", "Color", "Width"],
  "border.corners": ["TopLeft", "TopRight", "BottomLeft", "BottomRight"]
};

const rank = (name, which) => {
  const list = WITHIN[which];
  if (!list) return 0;
  const lower = name.toLowerCase();
  const at = list.findIndex((part) => lower.endsWith(part.toLowerCase()));
  return at < 0 ? list.length : at;
};

function shown(field) {
  if (field.type === "toggle") return field.default ? "on" : "off";
  if (field.type === "number") {
    return field.default === 0 && field.zeroAs ? `0 (${field.zeroAs})` : `${field.default}${field.unit ?? ""}`;
  }
  return field.default === "" ? "—" : String(field.default);
}

const statesOf = (fields, stem) => {
  const found = new Set();
  for (const field of fields) {
    const bare = field.name.replace(/^(hover|active)/, "").replace(/(Hover|Active)(?=[A-Z])/, "")
      .replace(/^./, (c) => c.toLowerCase());
    if (bare !== stem) continue;
    if (/^active|Active(?=[A-Z])/.test(field.name)) found.add("Selected");
    else if (stateNamed(field.name)) found.add("Hovered");
  }
  return [...found];
};

const lines = [];
const out = (line = "") => lines.push(line);

const done = new Set(GROUPS.filter((g) => g.order).map((g) => g.family ?? g.id));
const seen = new Set();

/**
 * The tabs in strip order, which is how the editor reads: a group gets its tab
 * where it is declared, a family where its first member is, and anything marked
 * `strip: "end"` goes last however early it appears.
 */
const strip = (() => {
  const taken = new Set();
  const ordinary = [];
  const last = [];
  for (const group of GROUPS) {
    const key = group.family ?? group.id;
    if (taken.has(key)) continue;
    taken.add(key);
    (group.strip === "end" ? last : ordinary).push(group);
  }
  return [...ordinary, ...last];
})();

for (const group of strip) {
  const key = group.family ?? group.id;
  if (seen.has(key) || done.has(key)) continue;
  seen.add(key);
  const members = group.family ? GROUPS.filter((g) => g.family === group.family) : [group];
  const label = members.length > 1 ? say(`ILLUMINUS.Families.${key}`, key)
    : say(`ILLUMINUS.Groups.${group.id}.label`, group.id);
  out(`## ${label}`);
  out();
  out(say(members.length > 1 ? `ILLUMINUS.Families.${key}Hint` : `ILLUMINUS.Groups.${group.id}.hint`));
  out();

  // The categories this tab would have, in the proposed order: the merged ones
  // first, then the parts inside, in the order the tab already has them.
  const buckets = new Map();
  for (const section of group.sections) {
    const into = MERGE[section.id] ?? section.id;
    if (!buckets.has(into)) buckets.set(into, []);
    buckets.get(into).push(section);
  }
  const ordered = [
    ...MERGED_ORDER.filter((id) => buckets.has(id)),
    ...[...buckets.keys()].filter((id) => !MERGED_ORDER.includes(id))
  ];

  for (const id of ordered) {
    const sections = buckets.get(id);
    const merged = MERGED_ORDER.includes(id);
    const name = merged ? MERGED_LABEL[id]
      : say(sections[0].label ?? `ILLUMINUS.Sections.${id}.label`, id);
    const from = sections.map((section) =>
      say(section.label ?? `ILLUMINUS.Sections.${section.id}.label`, section.id));
    const note = merged && (from.length > 1 || from[0] !== name)
      ? ` - (was ${from.join(" + ")})` : "";
    out(`### ${name}${note}`);
    out();
    const hint = say(sections[0].hint ?? `ILLUMINUS.Sections.${sections[0].id}.hint`);
    if (hint) { out(hint); out(); }

    const fields = sections.flatMap((section) => section.fields);
    const rows = fields.filter((field) => !stateNamed(field.name) && !field.chrome);
    if (!rows.length) { out("*Nothing but the state switch.*"); out(); continue; }
    rows.sort((a, b) => {
      const ra = run(a.name);
      const rb = run(b.name);
      return (RUN_ORDER.indexOf(ra) - RUN_ORDER.indexOf(rb)) || (rank(a.name, ra) - rank(b.name, rb));
    });

    out("| Setting | Default | States | What it does |");
    out("| --- | --- | --- | --- |");
    let last = null;
    for (const field of rows) {
      const which = run(field.name);
      // No line before whatever the runs did not recognise: those are a tab's
      // own controls, and a line above them would promise a grouping that is not
      // there.
      if (last && which !== last && which !== "rest") out("---");
      last = which;
      const states = statesOf(fields, field.name);
      // Merging a shadow into a category with anything else is what makes it
      // ask for a qualifier — the Title tab's read "Shadow Softness" the moment
      // its Text Shadow category went away.
      const lead = merged && sections.length > 1
        ? { "text.shadow": "Shadow ", "fill.inner": "Inner Shadow ", "fill.outer": "Outer Shadow " }[which] ?? ""
        : "";
      const label = `${lead}${fieldText(group, field, "label") || field.name}`;
      out(`| ${label} | ${shown(field)} `
        + `| ${states.length ? states.join(", ") : "—"} `
        + `| ${fieldText(group, field, "hint").replace(/\|/g, "\\|")} |`);
    }
    out();
  }
}

const target = `${ROOT}/SETTINGS_NEW.md`;
const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8").trimEnd() : "";
// Only what has not been proposed yet is added: the tabs already in the file are
// somebody's own work and are left exactly as they are.
const kept = existing.split(/^(?=## )/m).filter((block) => {
  const heading = block.match(/^## (.+)$/m)?.[1]?.trim();
  return !heading || !lines.some((line) => line === `## ${heading}`);
});
fs.writeFileSync(target, `${[kept.join("").trimEnd(), lines.join("\n")].join("\n\n\n")}\n`);
console.log(`proposed ${seen.size} tabs into SETTINGS_NEW.md`);
