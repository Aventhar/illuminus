/**
 * Regenerate lang/en.json.
 *
 * The 54 side/corner/shadow-component fields follow strict naming families, so
 * their labels are generated rather than hand-listed — that is what keeps a
 * 391-control GUI from drifting out of sync with its strings. Everything else
 * is written out explicitly below.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
globalThis.foundry = { utils: { deepClone: (o) => structuredClone(o) } };

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { GROUPS, allFields, groupFields } = await import(`${ROOT}/scripts/style-schema.mjs`);
const existing = JSON.parse(fs.readFileSync(`${ROOT}/lang/en.json`, "utf8"));

const out = {};
const put = (k, v) => { out[k] = v; };

/* ---------- Chrome, carried over from the existing file ---------- */
const CARRY = [
  "ILLUMINUS.Settings.", "ILLUMINUS.Controls.", "ILLUMINUS.Manager.", "ILLUMINUS.Editor.",
  "ILLUMINUS.Picker.", "ILLUMINUS.Buttons.", "ILLUMINUS.Style.", "ILLUMINUS.Confirm.",
  "ILLUMINUS.Preview.", "ILLUMINUS.Notifications.", "ILLUMINUS.Errors."
];
for (const [k, v] of Object.entries(existing)) if (CARRY.some((p) => k.startsWith(p))) put(k, v);

/* ---------- New chrome strings ---------- */
Object.assign(out, {
  "ILLUMINUS.Buttons.MatchSides": "Match",
  "ILLUMINUS.Buttons.MatchSidesTooltip": "Copy the first value in this section across the other sides or corners",
  "ILLUMINUS.Buttons.ResetSection": "Reset",
  "ILLUMINUS.Buttons.ResetSectionTooltip": "Return this section to its starting values",
  "ILLUMINUS.Editor.ChangedTooltip": "How many settings on this tab differ from their starting value",
  "ILLUMINUS.Preview.Search": "Search Pages",
  "ILLUMINUS.Preview.Category": "Chapters",
  "ILLUMINUS.Preview.Page2": "The Drowned Choir",
  "ILLUMINUS.Preview.AddPage": "Add Page"
});

/* ---------- Groups ---------- */
const GROUP_TEXT = {
  page: ["The Page", "The paper the text sits on: its colour, any background picture, and the frame around it."],
  title: ["Journal Title", "The journal's name, shown across the top of the window."],
  heading1: ["Major Headings", "The largest headings — page titles and chapter openers."],
  heading2: ["Section Headings", "Mid-level headings that break a page into sections."],
  heading3: ["Minor Headings", "The smallest headings. Also used for anything smaller still."],
  body: ["Body Text", "Ordinary paragraphs — the bulk of what people read."],
  links: ["Links", "Clickable references to other documents, rolls, and web pages."],
  lists: ["Lists", "Bulleted and numbered lists."],
  tables: ["Tables", "Tables of results, treasure, encounters, and the like."],
  boxes: ["Boxed Text", "Set-apart passages, such as read-aloud description. Applies to quote blocks in the editor."],
  images: ["Pictures", "Images placed in a page, and their captions."],
  sidebar: ["Sidebar", "The contents panel down the left of the journal window: page list, search box, and buttons."]
};
for (const [id, [label, hint]] of Object.entries(GROUP_TEXT)) {
  put(`ILLUMINUS.Groups.${id}.label`, label);
  put(`ILLUMINUS.Groups.${id}.hint`, hint);
}

/* ---------- Sections ---------- */
const SECTION_TEXT = {
  surface: ["Surface", "The colour and picture behind everything else"],
  layout: ["Size and Position", "How much room this takes up"],
  text: ["Lettering", "Typeface, size, colour, and spacing"],
  textShadow: ["Text Shadow", "A shadow cast by the lettering itself"],
  padding: ["Inner Spacing", "Room between the edges and the contents"],
  margin: ["Outer Spacing", "Room between this and whatever surrounds it"],
  background: ["Fill", "The colour behind the contents"],
  border: ["Border", "Each edge is set separately — leave a thickness at 0 for no line"],
  cellBorder: ["Lines Between Cells", "The grid inside the table. Each edge of every cell is set separately"],
  corners: ["Corner Rounding", "Each corner is set separately"],
  shadow: ["Outer Shadow", "A shadow cast outwards. A fully transparent colour means no shadow"],
  innerShadow: ["Inner Shadow", "Shading inside the edges, for an aged or lit-from-within look"],
  paragraph: ["Paragraphs", "Spacing and indentation between paragraphs"],
  columns: ["Columns", "Split the text into newspaper-style columns"],
  dropCap: ["Opening Capital", "An enlarged first letter at the start of a page"],
  decoration: ["Underline", "The line drawn through or under a link"],
  chip: ["Highlight", "A block of colour behind a link, making it look like a button"],
  marker: ["Bullets", "The mark in front of each item"],
  header: ["Header Row", "The top row of a table"],
  rows: ["Rows", "The body rows of a table"],
  cellPadding: ["Cell Spacing", "Room between a cell's edges and its contents"],
  caption: ["Caption", "The text beneath a picture"],
  entries: ["Page Entries", "Each page listed in the contents panel"],
  entryBorder: ["Entry Borders", "Lines around each listed page. Each edge is set separately"],
  entryStates: ["Current and Hovered", "How the page you are reading, and the one under the mouse, stand out"],
  number: ["Page Numbers", "The number shown beside each listed page"],
  subHeadings: ["Sub-Headings", "The headings listed underneath the page you are reading"],
  category: ["Category Rows", "Group headers in the contents panel"],
  search: ["Search Box", "The search field at the top of the panel"],
  buttons: ["Buttons", "The controls beside the search box and along the bottom"]
};
for (const [id, [label, hint]] of Object.entries(SECTION_TEXT)) {
  put(`ILLUMINUS.Sections.${id}.label`, label);
  put(`ILLUMINUS.Sections.${id}.hint`, hint);
}

/* ---------- Mechanical field families ---------- */

/**
 * Side, corner, and shadow-component fields follow strict naming families.
 * Rather than list them, detect each family from the schema and generate its
 * labels — so adding a `searchBorder` or `entryPadding` prefix needs no edit
 * here. NOUN supplies the wording for a prefix; anything unlisted falls back to
 * a generic phrase.
 */
const NOUN = {
  border: "edge", cellBorder: "cell edge", entryBorder: "entry edge", searchBorder: "search box edge",
  padding: "contents", cellPadding: "cell's contents", entryPadding: "entry's contents",
  margin: "", corner: "", searchCorner: "search box", buttonCorner: "button",
  shadow: "shadow", innerShadow: "inner shading", textShadow: "text shadow"
};
const SIDE_PHRASE = { Top: "above", Right: "to the right of", Bottom: "below", Left: "to the left of" };
const CORNER_WORD = {
  TopLeft: "Top-Left", TopRight: "Top-Right", BottomRight: "Bottom-Right", BottomLeft: "Bottom-Left"
};
const noun = (prefix, fallback) => (prefix in NOUN ? NOUN[prefix] : fallback);

const names = [...new Set(allFields().map(({ field }) => field.name))];
const unmatched = [];

for (const name of names) {
  let m;
  // border family: <prefix><Side><Width|Style|Color>
  if ((m = name.match(/^(.*?)(Top|Right|Bottom|Left)(Width|Style|Color)$/))) {
    const [, prefix, side, part] = m;
    const what = noun(prefix, "edge");
    const lower = side.toLowerCase();
    if (part === "Width") {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Thickness`);
      put(`ILLUMINUS.Field.${name}.hint`, `How heavy the ${lower} ${what} line is. 0 draws nothing.`);
    } else if (part === "Style") {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Style`);
      put(`ILLUMINUS.Field.${name}.hint`, `What the ${lower} ${what} line looks like.`);
    } else {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Colour`);
      put(`ILLUMINUS.Field.${name}.hint`, `Colour of the ${lower} ${what} line.`);
    }
    continue;
  }
  // corner family: <prefix><Corner>
  if ((m = name.match(/^(.*?)(TopLeft|TopRight|BottomRight|BottomLeft)$/))) {
    const [, prefix, corner] = m;
    const what = noun(prefix, "");
    put(`ILLUMINUS.Field.${name}.label`, `${CORNER_WORD[corner]} Rounding`);
    put(`ILLUMINUS.Field.${name}.hint`,
      `How rounded the ${CORNER_WORD[corner].toLowerCase()} corner ${what ? `of the ${what} ` : ""}is. 0 is a sharp corner.`);
    continue;
  }
  // shadow family: <prefix><OffsetX|OffsetY|Blur|Spread|Color>
  if ((m = name.match(/^(shadow|innerShadow|textShadow)(OffsetX|OffsetY|Blur|Spread|Color)$/))) {
    const [, prefix, part] = m;
    const what = NOUN[prefix];
    const text = {
      OffsetX: ["Sideways Offset", `How far the ${what} sits to the right. Negative moves it left.`],
      OffsetY: ["Downward Offset", `How far the ${what} sits below. Negative moves it up.`],
      Blur: ["Softness", `How blurred the ${what} is. 0 is a hard edge.`],
      Spread: ["Size", `Grows or shrinks the ${what} beyond the shape that casts it.`],
      Color: ["Colour", `Colour of the ${what}. A fully transparent colour means none at all.`]
    }[part];
    put(`ILLUMINUS.Field.${name}.label`, text[0]);
    put(`ILLUMINUS.Field.${name}.hint`, text[1]);
    continue;
  }
  // spacing family: <prefix><Side>
  if ((m = name.match(/^(padding|margin|cellPadding|entryPadding)(Top|Right|Bottom|Left)$/))) {
    const [, prefix, side] = m;
    if (prefix === "margin") {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Gap`);
      put(`ILLUMINUS.Field.${name}.hint`,
        `Empty space ${SIDE_PHRASE[side]} this, outside the edge. Negative values pull it closer.`);
    } else {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Padding`);
      put(`ILLUMINUS.Field.${name}.hint`, `Empty space ${SIDE_PHRASE[side]} the ${noun(prefix, "contents")}, inside the edge.`);
    }
    continue;
  }
  unmatched.push(name);
}

/* ---------- Remaining fields ---------- */
const FIELD_TEXT = {
  background: ["Fill Colour", "The flat colour behind everything else."],
  texture: ["Background Picture", "An image laid over the fill colour, such as a parchment scan. Leave empty for none."],
  textureFit: ["Picture Fit", "How the background picture covers the area."],
  texturePosition: ["Picture Position", "Where the background picture is anchored."],
  textureAttachment: ["Picture Scrolling", "Whether the background picture scrolls with the text or stays put."],
  textureBlend: ["Picture Blending", "How the picture mixes with the fill colour. \"Multiply\" keeps paper texture while letting the colour show through."],
  textureOpacity: ["Picture Strength", "How strongly the background picture shows. 0 hides it entirely."],
  maxWidth: ["Maximum Text Width", "Stops lines growing too long to read comfortably. Set to 0 for no limit."],
  font: ["Typeface", "Which lettering to use. Add more under Foundry's Configure Font Families menu."],
  size: ["Text Size", "How large the lettering is."],
  color: ["Text Colour", "Colour of the lettering."],
  weight: ["Thickness", "How heavy the lettering is, from hairline to solid black."],
  style: ["Slant", "Whether the lettering is italic."],
  caps: ["Capitals", "Force capital letters, or use small capitals for a printed-book feel."],
  letterSpacing: ["Letter Spacing", "Extra space between letters. A little goes a long way on headings."],
  wordSpacing: ["Word Spacing", "Extra space between words."],
  lineHeight: ["Line Spacing", "Space between lines within a paragraph. 1.5 is comfortable for long reading."],
  align: ["Alignment", "Which edge the text lines up against."],
  firstLineIndent: ["First Line Indent", "Pushes the first line of each paragraph inward, as in a printed novel."],
  whiteSpace: ["Line Wrapping", "Whether long lines wrap, and whether extra spaces are kept."],
  wordBreak: ["Word Splitting", "Whether very long words may be broken across lines."],
  columnCount: ["Number of Columns", "Split the text into columns, as printed adventures often do."],
  columnGap: ["Gap Between Columns", "Empty space separating one column from the next."],
  columnRuleWidth: ["Divider Thickness", "A vertical line drawn between columns. 0 draws nothing."],
  columnRuleStyle: ["Divider Style", "What the line between columns looks like."],
  columnRuleColor: ["Divider Colour", "Colour of the line between columns."],
  dropCap: ["Opening Capital", "Enlarges the first letter of the page so it spans several lines."],
  dropCapColor: ["Opening Capital Colour", "Colour of that enlarged first letter."],
  hoverColor: ["Colour When Pointed At", "Colour a link turns when the mouse is over it."],
  decorationLine: ["Line", "Whether links are underlined, struck through, or left plain."],
  decorationStyle: ["Line Style", "What the link's line looks like."],
  decorationColor: ["Line Colour", "Colour of the link's line. May differ from the text itself."],
  decorationThickness: ["Line Thickness", "How heavy the link's line is."],
  decorationOffset: ["Line Distance", "How far the line sits from the lettering."],
  bullet: ["Bullet Shape", "The mark in front of each item in a bulleted list."],
  markerColor: ["Bullet Colour", "Colour of bullets and item numbers."],
  markerFont: ["Bullet Typeface", "Lettering used for bullets and item numbers."],
  indent: ["Indent", "How far a list is pushed in from the left."],
  itemSpacing: ["Spacing Between Items", "Gap between one list item and the next."],
  textColor: ["Text Colour", "Lettering colour in ordinary cells."],
  verticalAlign: ["Vertical Position", "Where contents sit within a cell, top to bottom."],
  width: ["Table Width", "How much of the available width the table fills."],
  headerBackground: ["Fill Colour", "Background of the top row of a table."],
  headerColor: ["Text Colour", "Lettering colour in the top row of a table."],
  headerFont: ["Typeface", "Lettering used in the top row of a table."],
  headerSize: ["Text Size", "How large the top row's lettering is."],
  headerWeight: ["Thickness", "How heavy the top row's lettering is."],
  headerCaps: ["Capitals", "Force capital letters in the top row, or use small capitals."],
  headerAlign: ["Alignment", "Which edge the top row's text lines up against."],
  headerLetterSpacing: ["Letter Spacing", "Extra space between letters in the top row."],
  stripeColor: ["Alternating Row Colour", "Shading on every other row, to help the eye track across. Use a mostly transparent colour."],
  rowColor: ["Row Colour", "Background shared by every body row. Use a fully transparent colour for none."],
  opacity: ["Opacity", "How solid the picture is. Lower values let the page show through."],
  captionFont: ["Typeface", "Lettering used for a picture's caption."],
  captionSize: ["Text Size", "How large caption lettering is."],
  captionColor: ["Text Colour", "Lettering colour of a picture's caption."],
  captionWeight: ["Thickness", "How heavy caption lettering is."],
  captionStyle: ["Slant", "Whether captions are italic."],
  captionCaps: ["Capitals", "Force capital letters in captions, or use small capitals."],
  captionAlign: ["Alignment", "Which edge a caption lines up against."],
  captionSpacing: ["Gap Above Caption", "Space between a picture and its caption."],

  sidebarWidth: ["Panel Width", "How wide the contents panel is."],
  hoverBackground: ["Highlight When Pointed At", "Colour behind an entry while the mouse is over it."],
  activeColor: ["Current Page Colour", "Lettering colour of the page you are reading."],
  activeBackground: ["Current Page Highlight", "Colour behind the page you are reading."],
  activeAccentColor: ["Current Page Marker Colour", "Colour of the bar marking the page you are reading."],
  activeAccentWidth: ["Current Page Marker Width", "A bar down the left of the page you are reading. 0 draws nothing."],
  activeWeight: ["Current Page Thickness", "How heavy the lettering is for the page you are reading."],
  numberColor: ["Text Colour", "Colour of the number beside each page."],
  numberSize: ["Text Size", "How large the page numbers are."],
  numberWeight: ["Thickness", "How heavy the page numbers are."],
  numberAlign: ["Alignment", "Which edge the page numbers line up against."],
  numberWidth: ["Column Width", "How much room the number column takes up."],
  headingFont: ["Typeface", "Lettering used for the sub-headings under a page."],
  headingSize: ["Text Size", "How large the sub-headings are."],
  headingColor: ["Text Colour", "Colour of the sub-headings."],
  headingWeight: ["Thickness", "How heavy the sub-headings are."],
  headingStyle: ["Slant", "Whether the sub-headings are italic."],
  headingHoverColor: ["Colour When Pointed At", "Colour a sub-heading turns when the mouse is over it."],
  headingIndent: ["Indent", "How far the sub-headings are pushed in from the left."],
  headingLineHeight: ["Row Height", "How tall each sub-heading row is."],
  categoryFont: ["Typeface", "Lettering used for category headers."],
  categorySize: ["Text Size", "How large category headers are."],
  categoryColor: ["Text Colour", "Colour of category headers."],
  categoryWeight: ["Thickness", "How heavy category headers are."],
  categoryCaps: ["Capitals", "Force capital letters in category headers, or use small capitals."],
  categoryLetterSpacing: ["Letter Spacing", "Extra space between letters in category headers."],
  categoryAlign: ["Alignment", "Which edge category headers line up against."],
  categoryBackground: ["Fill Colour", "Colour behind category headers."],
  searchBackground: ["Fill Colour", "Colour inside the search box."],
  searchColor: ["Text Colour", "Colour of what you type into the search box."],
  searchPlaceholderColor: ["Prompt Colour", "Colour of the greyed-out prompt shown while the search box is empty."],
  searchSize: ["Text Size", "How large the search box lettering is."],
  buttonColor: ["Text Colour", "Lettering and icon colour on the panel's buttons."],
  buttonBackground: ["Fill Colour", "Colour inside the panel's buttons."],
  buttonBorderColor: ["Border Colour", "Colour of the outline around the panel's buttons."],
  buttonBorderWidth: ["Border Thickness", "How heavy the outline around the panel's buttons is."],
  buttonHoverColor: ["Text Colour When Pointed At", "Lettering colour while the mouse is over a button."],
  buttonHoverBackground: ["Fill When Pointed At", "Colour inside a button while the mouse is over it."],
  buttonHoverBorderColor: ["Border Colour When Pointed At", "Outline colour while the mouse is over a button."]
};
for (const [name, [label, hint]] of Object.entries(FIELD_TEXT)) {
  put(`ILLUMINUS.Field.${name}.label`, label);
  put(`ILLUMINUS.Field.${name}.hint`, hint);
}
const stillMissing = unmatched.filter((n) => !(n in FIELD_TEXT));
if (stillMissing.length) {
  console.error("No wording for: " + stillMissing.join(", "));
  process.exit(1);
}
put("ILLUMINUS.Field.font.inherit", "Use the journal's normal typeface");
put("ILLUMINUS.Field.texture.placeholder", "No picture");

/* ---------- Choices ---------- */
const CHOICE_TEXT = {
  none: "None", left: "Left", center: "Centred", right: "Right", justify: "Justified (both edges even)",
  normal: "Normal", italic: "Italic", oblique: "Slanted",
  uppercase: "ALL CAPITALS", lowercase: "all lower case", capitalize: "Title Case", smallCaps: "Small Capitals",
  solid: "Solid line", double: "Double line", dashed: "Dashed line", dotted: "Dotted line", wavy: "Wavy line",
  groove: "Carved groove", ridge: "Raised ridge", inset: "Sunken", outset: "Raised",
  disc: "Round dot", circle: "Hollow circle", square: "Square",
  diamond: "Four-pointed star", star: "Five-pointed star", dash: "Long dash", arrow: "Arrow",
  multiply: "Multiply (keeps texture, darkens)", overlay: "Overlay (boosts contrast)",
  softLight: "Soft light (gentle)", hardLight: "Hard light (strong)", screen: "Screen (lightens)",
  luminosity: "Brightness only", colorBurn: "Burn (deepens colour)",
  tile: "Repeat as tiles", cover: "Fill the area (may crop)", contain: "Fit inside the area", stretch: "Stretch to fit",
  topLeft: "Top left", top: "Top", topRight: "Top right",
  bottomLeft: "Bottom left", bottom: "Bottom", bottomRight: "Bottom right",
  scroll: "Scrolls with the page", fixed: "Stays still", local: "Scrolls with the text",
  middle: "Middle",
  two: "Two lines tall", three: "Three lines tall", four: "Four lines tall", five: "Five lines tall",
  underline: "Underline", overline: "Line above", lineThrough: "Strike through",
  preWrap: "Keep spacing and line breaks", nowrap: "Never wrap",
  breakWord: "Split long words", breakAll: "Split anywhere",
  100: "Hairline (100)", 200: "Extra Light (200)", 300: "Light (300)", 400: "Normal (400)",
  500: "Medium (500)", 600: "Semi Bold (600)", 700: "Bold (700)", 800: "Extra Bold (800)", 900: "Black (900)"
};
for (const [value, label] of Object.entries(CHOICE_TEXT)) put(`ILLUMINUS.Choices.${value}`, label);

/* Field-specific overrides where the shared wording would mislead. */
Object.assign(out, {
  "ILLUMINUS.Choices.dropCap.none": "No opening capital",
  "ILLUMINUS.Choices.bullet.none": "No bullet",
  "ILLUMINUS.Choices.decorationLine.none": "No line",
  "ILLUMINUS.Choices.verticalAlign.top": "Top",
  "ILLUMINUS.Choices.verticalAlign.bottom": "Bottom",
  "ILLUMINUS.Choices.textureAttachment.local": "Scrolls with the text",
  "ILLUMINUS.Choices.columnRuleStyle.none": "No divider"
});

/* ---------- Verify nothing is missing before writing ---------- */
const missing = [];
for (const group of GROUPS) {
  for (const k of [`ILLUMINUS.Groups.${group.id}.label`, `ILLUMINUS.Groups.${group.id}.hint`]) {
    if (!(k in out)) missing.push(k);
  }
  for (const section of group.sections) {
    for (const k of [`ILLUMINUS.Sections.${section.id}.label`, `ILLUMINUS.Sections.${section.id}.hint`]) {
      if (!(k in out)) missing.push(k);
    }
  }
  for (const field of groupFields(group)) {
    for (const k of [`ILLUMINUS.Field.${field.name}.label`, `ILLUMINUS.Field.${field.name}.hint`]) {
      if (!(k in out)) missing.push(k);
    }
    for (const choice of field.choices ?? []) {
      if (!(`ILLUMINUS.Choices.${field.name}.${choice}` in out) && !(`ILLUMINUS.Choices.${choice}` in out)) {
        missing.push(`ILLUMINUS.Choices.${choice}`);
      }
    }
  }
}
if (missing.length) {
  console.error("MISSING:\n  " + [...new Set(missing)].join("\n  "));
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(`${ROOT}/lang/en.json`, JSON.stringify(sorted, null, 2) + "\n");
console.log(`wrote ${Object.keys(sorted).length} strings`);
