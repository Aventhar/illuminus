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
  // Preview strings are defined below rather than carried, so renaming one
  // does not leave the old key behind forever.
  "ILLUMINUS.Notifications.", "ILLUMINUS.Errors."
];
for (const [k, v] of Object.entries(existing)) if (CARRY.some((p) => k.startsWith(p))) put(k, v);

/* ---------- New chrome strings ---------- */
Object.assign(out, {
  "ILLUMINUS.Manager.Restore": "Restore Samples",
  "ILLUMINUS.Manager.RestoreTooltip": "Put back any style that came with Illuminus and is no longer here",
  "ILLUMINUS.Manager.Restored": "Restored {count} sample style(s).",
  "ILLUMINUS.Manager.RestoredNone": "Every sample style is already here.",
  "ILLUMINUS.Manager.SidebarButton": "Illuminus Styles",
  "ILLUMINUS.Buttons.MatchSides": "Match",
  "ILLUMINUS.Buttons.MatchSidesTooltip": "Copy the first value in this section across the other sides or corners",
  "ILLUMINUS.Buttons.ResetSection": "Reset",
  "ILLUMINUS.Buttons.ResetSectionTooltip": "Return this section to its starting values",
  "ILLUMINUS.Editor.StateNormal": "Normal",
  "ILLUMINUS.Editor.StateHover": "Hovered",
  "ILLUMINUS.Editor.StateActive": "Current page",
  "ILLUMINUS.Editor.FilterPlaceholder": "Search every setting\u2026",
  "ILLUMINUS.Editor.FilterCount": "{count} match(es)",
  "ILLUMINUS.Editor.ResizePreview": "Drag to resize the sample",
  "ILLUMINUS.Editor.UnsavedTitle": "Unsaved Changes",
  "ILLUMINUS.Editor.UnsavedBody": "\"{name}\" has changes you have not saved. Save them before closing?",
  "ILLUMINUS.Buttons.SaveAndClose": "Save and Close",
  "ILLUMINUS.Buttons.Discard": "Discard Changes",
  "ILLUMINUS.Buttons.KeepEditing": "Keep Editing",
  "ILLUMINUS.Editor.ChangedTooltip": "How many settings on this tab differ from their starting value",
  "ILLUMINUS.Color.None": "None",
  "ILLUMINUS.Menu.Title": "Illuminus",
  "ILLUMINUS.Menu.Blocks": "Box",
  "ILLUMINUS.Menu.Pictures": "Image Style",
  "ILLUMINUS.Menu.Tags": "Tag",
  "ILLUMINUS.Menu.Templates": "Template",
  "ILLUMINUS.Menu.SaveTemplate": "Save selection as template\u2026",
  "ILLUMINUS.Settings.Templates.Name": "Page Templates",
  "ILLUMINUS.Settings.Templates.Label": "Open Template Library",
  "ILLUMINUS.Settings.Templates.Hint": "Ready-made page structures to drop into a journal.",
  "ILLUMINUS.Manager.Title": "Illuminus Style Library",
  "ILLUMINUS.Templates.Title": "Illuminus Template Library",
  "ILLUMINUS.Templates.Hint": "Ready-made page structures you can drop into a journal from the editor\u2019s Illuminus menu. They carry structure, not styling, so each one takes on whatever style the journal is wearing.",
  "ILLUMINUS.Errors.ImportNoTemplates": "That file contained no templates Illuminus could recognize.",
  "ILLUMINUS.Notifications.ImportedTemplates": "Imported {count} template(s).",
  "ILLUMINUS.Templates.Untitled": "Untitled template",
  "ILLUMINUS.Templates.SaveTitle": "Save as Template",
  "ILLUMINUS.Templates.SaveBody": "What should this template be called?",
  "ILLUMINUS.Templates.NamePlaceholder": "Stat block, handout, room entry\u2026",
  "ILLUMINUS.Templates.Saved": "Saved \"{name}\" to the template library.",
  "ILLUMINUS.Templates.Empty": "No templates yet. Select something in a journal page and choose \"Save selection as template\" from the Illuminus menu.",
  "ILLUMINUS.Templates.Bundled": "Came with Illuminus",
  "ILLUMINUS.Templates.Restore": "Restore Samples",
  // Carried over from the existing file, and restated here so the word for a
  // thing that came with the module is the same in both libraries.
  "ILLUMINUS.Manager.Preset": "Sample",
  "ILLUMINUS.Templates.RestoreTooltip": "Put back any bundled template this world no longer has",
  "ILLUMINUS.Templates.Restored": "Restored {count} bundled template(s).",
  "ILLUMINUS.Templates.RestoredNone": "Every bundled template is already here.",
  "ILLUMINUS.Templates.DeleteTitle": "Delete Template",
  "ILLUMINUS.Templates.DeleteBody": "Delete \"{name}\"? Pages that already use it are not changed.",
  "ILLUMINUS.Templates.SidebarButton": "Illuminus Templates",
  "ILLUMINUS.Export.Title": "Advanced Journal Export",
  "ILLUMINUS.Export.Button": "Advanced Journal Export",
  "ILLUMINUS.Export.Tooltip": "Save styled journals as web pages that open in any browser",
  "ILLUMINUS.Export.ContextEntry": "Export as Web Pages\u2026",
  "ILLUMINUS.Export.Hint": "Saves the journals you pick, wearing the style you pick, as a PDF or as web pages that open in any browser \u2014 with no Foundry and no Illuminus needed. Hand a player a handout, print one for the table, or put an adventure on a website.",
  "ILLUMINUS.Export.StyleLegend": "Style",
  "ILLUMINUS.Export.JournalsLegend": "Journals",
  "ILLUMINUS.Export.SelectNone": "Select None",
  "ILLUMINUS.Buttons.Close": "Close",
  // Named for what the window does rather than for the pen on the button: the
  // dialog behind it sets a description as well, which "Rename" hides.
  "ILLUMINUS.Buttons.Details": "Name and Description",
  "ILLUMINUS.Manager.DescriptionPlaceholder": "What this is for \u2014 shown under its name in the library.",
  "ILLUMINUS.Export.OwnLook": "Journals not styled by Illuminus (as they appear in Foundry VTT)",
  "ILLUMINUS.Export.SourceFoundry": "Foundry",
  "ILLUMINUS.Export.CarriesText": "An export copies the text and images in these journals, and the fonts they use.",
  "ILLUMINUS.Export.CarriesStyling": "With no Illuminus style chosen it also copies the styling that is painting them, which may come from publisher-owned Game Systems or Add-On Modules.",
  "ILLUMINUS.Export.TermsButton": "Read the personal-use notice",
  "ILLUMINUS.Export.TermsTitle": "Personal Use Only",
  "ILLUMINUS.Export.TermsPersonal": "Exports using assets you do not own are intended for personal use in your home game ONLY, and are not meant to be used for publishing.",
  "ILLUMINUS.Export.TermsResponsible": "You are responsible for obtaining the appropriate licensing for any assets or text you publish publicly. This might include, but may not be limited to permission from:",
  "ILLUMINUS.Export.TermsWhoFoundry": "Foundry Gaming, LLC.",
  "ILLUMINUS.Export.TermsWhoPublisher": "The original content publisher.",
  "ILLUMINUS.Export.TermsWhoAuthor": "The original content author or artist.",
  "ILLUMINUS.Export.TermsWhoSystem": "The original game system developer.",
  "ILLUMINUS.Export.TermsWhoModule": "The original Foundry module developer.",
  "ILLUMINUS.Export.TermsDismiss": "I understand \u2014 do not show this again",
  "ILLUMINUS.Export.TermsAccept": "Export",
  "ILLUMINUS.Export.OnlyStyled": "Show only journals using this style",
  "ILLUMINUS.Export.NoneInStyle": "No journals are using this style. Turn off the filter above to pick any journal and export it in this style.",
  "ILLUMINUS.Export.PageCount": "{count} pages",
  "ILLUMINUS.Export.PageCountOne": "1 page",
  "ILLUMINUS.Export.NoJournals": "There are no journals to export.",
  "ILLUMINUS.Export.FormatLegend": "How to Save It",
  "ILLUMINUS.Export.FormatPrintNote": "Use in Chrome browser for best results.",
  "ILLUMINUS.Export.FormatFolder": "Website directory structure",
  "ILLUMINUS.Export.FormatFile": "Single file website",
  "ILLUMINUS.Export.FormatPrint": "Print to printer or PDF",
  "ILLUMINUS.Export.ManyTitle": "{count} Journals",
  "ILLUMINUS.Export.PopupBlocked": "Your browser would not start printing, so the page has been saved instead. Open it and print from there.",
  "ILLUMINUS.Export.DesktopLinks": "This browser saves a PDF through your operating system\u2019s print panel, which flattens the contents page\u2019s links and will not let you type a filename. Chrome writes its own PDF and keeps them, if you want one you can click through.",
  "ILLUMINUS.Export.Printing": "Preparing the printable pages\u2026 your browser\u2019s print window will open.",
  "ILLUMINUS.Export.OptionsLegend": "What to Include",
  "ILLUMINUS.Export.Secrets": "Include hidden passages",
  "ILLUMINUS.Export.PageTexture": "Include page background in file",
  "ILLUMINUS.Export.Build": "Export",
  "ILLUMINUS.Export.PickOne": "Pick at least one journal to export.",
  "ILLUMINUS.Export.Contents": "Contents",
  "ILLUMINUS.Export.Reference": "{kind}: {name}",
  "ILLUMINUS.Export.Done": "Exported {pages} pages and {assets} files.",
  "ILLUMINUS.Export.Flattened": "{count} links to things outside these journals are now plain text.",
  "ILLUMINUS.Export.Skipped": "{count} pages could not be exported. Video and PDF pages are players rather than pages, so they are left out.",
  "ILLUMINUS.Export.Fonts": "{count} font files were copied. Check what you are allowed to pass on before publishing them.",
  "ILLUMINUS.Export.Missing": "{count} files could not be read and are missing from the export.",
  "ILLUMINUS.Errors.TooManyTemplates": "A world may hold {max} templates. Delete one before adding another.",
  "ILLUMINUS.Menu.Clear": "Remove Illuminus styling",
  "ILLUMINUS.Families.headings": "Headings",
  "ILLUMINUS.Families.headingsName": "Heading level",
  "ILLUMINUS.Families.headingsHint": "The six heading levels. Level 1 also styles the page title. Pick a level to style it.",
  "ILLUMINUS.Families.boxStyles": "Box Styles",
  "ILLUMINUS.Families.imageStyles": "Image Styles",
  "ILLUMINUS.Families.tagStyles": "Tag Styles",
  "ILLUMINUS.Families.tagStylesName": "Tag name",
  "ILLUMINUS.Families.tagStylesHint": "Styles you apply to a few words inside a paragraph or a heading \u2014 trait tags, rarity badges, the rank at the end of a title line. Select the words first, then pick one. Rename it to suit your content.",
  "ILLUMINUS.Field.secrets.color.label": "Text Color",
  "ILLUMINUS.Field.secrets.color.hint": "Color of the lettering inside a secret passage. Leave empty to follow the page.",
  "ILLUMINUS.Field.secrets.size.hint": "How large the lettering is inside a secret passage. 0 follows the page.",
  "ILLUMINUS.Field.secrets.background.hint": "The color behind a secret passage before it has been revealed.",
  "ILLUMINUS.Field.tagStyles.color.label": "Text Color",
  "ILLUMINUS.Field.tagStyles.color.hint": "Color of the lettering inside this tag. Leave empty to follow the surrounding text.",
  "ILLUMINUS.Field.tagStyles.size.hint": "How large the lettering is inside this tag. 0 follows the surrounding text.",
  "ILLUMINUS.Field.tagStyles.lineHeight.hint": "Space between lines inside this tag. 0 follows the surrounding text.",
  "ILLUMINUS.Field.tagStyles.float.hint": "Push this tag to one side of the line. Right is what puts a rank at the far end of a title line.",
  "ILLUMINUS.Field.tagStyles.verticalAlign.label": "Vertical Position",
  "ILLUMINUS.Field.tagStyles.verticalAlign.hint": "How the tag lines up with the words beside it.",
  "ILLUMINUS.Field.tagStyles.background.hint": "The flat color behind the lettering of this tag.",
  "ILLUMINUS.Families.boxStylesName": "Box name",
  "ILLUMINUS.Families.imageStylesName": "Image style name",
  "ILLUMINUS.Families.boxStylesHint": "Boxes you wrap around content — read-aloud panels, sidebars, encounter blocks. Pick one to style, and rename it to suit your content.",
  "ILLUMINUS.Field.boxStyles.color.label": "Text Color",
  "ILLUMINUS.Field.boxStyles.color.hint": "Color of the lettering inside this box. Leave empty to follow the page.",
  "ILLUMINUS.Field.boxStyles.size.hint": "How large the lettering is inside this box. 0 follows the page.",
  "ILLUMINUS.Field.boxStyles.lineHeight.hint": "Space between lines inside this box. 0 follows the page.",
  "ILLUMINUS.Field.imageStyles.captionColor.hint": "Color of this image's caption. Leave empty to follow the Images tab.",
  "ILLUMINUS.Field.imageStyles.captionSize.hint": "How large this image's caption is. 0 follows the Images tab.",
  "ILLUMINUS.Families.imageStylesHint": "Styles you apply to a single image, overriding the page-wide Images settings. Pick one to style, and rename it to suit your content.",
  "ILLUMINUS.Buttons.OK": "OK",
  "ILLUMINUS.ColorPicker.Title": "Color",
  "ILLUMINUS.ColorPicker.Open": "Choose a color",
  "ILLUMINUS.ColorPicker.Hex": "Color code",
  "ILLUMINUS.ColorPicker.Rgb": "Red, Green, Blue",
  "ILLUMINUS.ColorPicker.Hsl": "Hue, Saturation, Lightness",
  "ILLUMINUS.ColorPicker.Ramp": "Shade and brightness",
  "ILLUMINUS.ColorPicker.Hue": "Hue",
  "ILLUMINUS.ColorPicker.Recent": "Recently used",
  "ILLUMINUS.ColorPicker.NameTitle": "Name This Color",
  "ILLUMINUS.ColorPicker.NamePlaceholder": "Parchment, rust heading, ink\u2026",
  "ILLUMINUS.ColorPicker.Saved": "Saved Colors",
  "ILLUMINUS.ColorPicker.SaveColor": "Save",
  "ILLUMINUS.ColorPicker.Forget": "Remove this color (or press Delete)",
  // The sample names each element after the setting that controls it, so it
  // reads as a legend rather than as a page of prose.
  "ILLUMINUS.Preview.WindowTitle": "Window Title",
  "ILLUMINUS.Preview.JournalTitle": "Journal Title",
  "ILLUMINUS.Preview.Heading1": "Heading 1",
  "ILLUMINUS.Preview.Heading2": "Heading 2",
  "ILLUMINUS.Preview.Heading3": "Heading 3",
  "ILLUMINUS.Preview.Heading4": "Heading 4",
  "ILLUMINUS.Preview.Heading5": "Heading 5",
  "ILLUMINUS.Preview.Heading6": "Heading 6",
  "ILLUMINUS.Preview.Body": "Body text, run on long enough to wrap over several lines so that line spacing, alignment, paragraph width, and the opening capital can all be judged. It contains a",
  "ILLUMINUS.Preview.Link": "link",
  "ILLUMINUS.Preview.Boxed": "Boxed text, as used for read-aloud description. Long enough to wrap, so its own line spacing and padding are visible.",
  "ILLUMINUS.Preview.ListItem": "List item",
  "ILLUMINUS.Preview.TableHeader": "Table header",
  "ILLUMINUS.Preview.TableCell": "Table cell",
  "ILLUMINUS.Choices.show": "Show it anyway",
  "ILLUMINUS.Choices.hide": "Hide it",
  "ILLUMINUS.Choices.thin": "Thin",
  "ILLUMINUS.Choices.thinItalic": "Thin Italic",
  "ILLUMINUS.Choices.extraLight": "Extra Light",
  "ILLUMINUS.Choices.extraLightItalic": "Extra Light Italic",
  "ILLUMINUS.Choices.light": "Light",
  "ILLUMINUS.Choices.lightItalic": "Light Italic",
  "ILLUMINUS.Choices.normalItalic": "Normal Italic",
  "ILLUMINUS.Choices.medium": "Medium",
  "ILLUMINUS.Choices.mediumItalic": "Medium Italic",
  "ILLUMINUS.Choices.semiBold": "Semi Bold",
  "ILLUMINUS.Choices.semiBoldItalic": "Semi Bold Italic",
  "ILLUMINUS.Choices.bold": "Bold",
  "ILLUMINUS.Choices.boldItalic": "Bold Italic",
  "ILLUMINUS.Choices.extraBold": "Extra Bold",
  "ILLUMINUS.Choices.extraBoldItalic": "Extra Bold Italic",
  "ILLUMINUS.Choices.black": "Black",
  "ILLUMINUS.Choices.blackItalic": "Black Italic",
  "ILLUMINUS.Choices.decimal": "1, 2, 3",
  "ILLUMINUS.Choices.decimalLeadingZero": "01, 02, 03",
  "ILLUMINUS.Choices.lowerAlpha": "a, b, c",
  "ILLUMINUS.Choices.upperAlpha": "A, B, C",
  "ILLUMINUS.Choices.lowerRoman": "i, ii, iii",
  "ILLUMINUS.Choices.upperRoman": "I, II, III",
  "ILLUMINUS.Choices.captionSide.top": "Above the table",
  "ILLUMINUS.Choices.captionSide.bottom": "Below the table",
  "ILLUMINUS.Choices.baseline": "On the line",
  "ILLUMINUS.Preview.TagTitle": "Sewer Haze",
  "ILLUMINUS.Preview.TagRank": "Disease 7",
  "ILLUMINUS.Preview.TagOne": "Disease",
  "ILLUMINUS.Preview.TagTwo": "Virulent",
  "ILLUMINUS.Preview.TagThree": "Rare",
  "ILLUMINUS.Preview.TagFlow": "A tag can also sit inside a sentence, like this",
  "ILLUMINUS.Preview.TagInline": "Uncommon",
  "ILLUMINUS.Preview.TagFlowEnd": "one, so its lettering and spacing can be judged against ordinary prose.",
  "ILLUMINUS.Preview.Secret": "A secret passage, which only the GM can read until it is revealed.",
  "ILLUMINUS.Preview.Reveal": "Reveal",
  "ILLUMINUS.Preview.Term": "Term",
  "ILLUMINUS.Preview.Definition": "The explanation that sits under a term in a definition list.",
  "ILLUMINUS.Preview.MarksLead": "Marked text, such as",
  "ILLUMINUS.Preview.Highlight": "a highlight",
  "ILLUMINUS.Preview.Code": "code",
  "ILLUMINUS.Preview.Abbr": "an abbreviation",
  "ILLUMINUS.Preview.Collapsible": "A collapsible passage",
  "ILLUMINUS.Preview.CollapsibleBody": "What the reader sees once it is opened.",
  "ILLUMINUS.Preview.TableCaption": "Table caption",
  "ILLUMINUS.Preview.Caption": "Image caption",
  "ILLUMINUS.Preview.BlockHeading": "Box heading",
  "ILLUMINUS.Preview.BlockBody": "Text inside the box, run on long enough to wrap over several lines so its own spacing, padding, and lettering can be judged against the page around it.",
  "ILLUMINUS.Preview.Flow": "Page text around it, long enough to wrap, so anything set to half width and floated shows the prose running beside it rather than sitting alone.",
  "ILLUMINUS.Preview.Category": "Category",
  "ILLUMINUS.Preview.CurrentPage": "Current page",
  "ILLUMINUS.Preview.SubHeading": "Sub-heading",
  "ILLUMINUS.Preview.PageEntry": "Page entry",
  "ILLUMINUS.Preview.Search": "Search box",
  "ILLUMINUS.Preview.Button": "Button",
  "ILLUMINUS.Buttons.PickColor": "Pick a color from the screen",
  "ILLUMINUS.Buttons.PickColorTooltip": "Point at anything in the window to copy its color — fills, borders, and lettering. Hold Option/Alt for lettering, Escape to cancel.",
  "ILLUMINUS.Picker.BackgroundMode": "Fill",
  "ILLUMINUS.Picker.BorderMode": "Border",
  "ILLUMINUS.Picker.TextMode": "Text",
});

/* ---------- Groups ---------- */
const GROUP_TEXT = {
  page: ["Page", "The paper the text sits on: its color, any background image, and the frame around it."],
  window: ["Window", "The journal window itself: its frame, the title bar across the top, and the icon buttons."],
  sidebar: ["Sidebar", "The contents panel down the left of the journal window: page list, search box, and buttons."],
  title: ["Title", "The journal's name, shown across the top of the window."],
  heading1: ["Heading 1", "The largest headings — page titles and chapter openers."],
  heading2: ["Heading 2", "Mid-level headings that break a page into sections."],
  heading3: ["Heading 3", "Sub-section headings within a chapter."],
  heading4: ["Heading 4", "Smaller headings, often naming a single room or entry."],
  heading5: ["Heading 5", "Smaller still, for a labeled paragraph or a short list heading."],
  heading6: ["Heading 6", "The smallest heading level."],
  body: ["Body", "Ordinary paragraphs — the bulk of what people read."],
  links: ["Links", "Clickable references to other documents, rolls, and web pages."],
  lists: ["Lists", "Bulleted and numbered lists."],
  tables: ["Tables", "Tables of results, treasure, encounters, and the like."],
  secrets: ["Secrets", "GM-only passages, and the button that reveals them to the table."],
  boxes: ["Boxes", "Set-apart passages, such as read-aloud description. Applies to quote blocks in the editor."],
  images: ["Images", "Images placed in a page, and their captions."]
};
for (const [id, [label, hint]] of Object.entries(GROUP_TEXT)) {
  put(`ILLUMINUS.Groups.${id}.label`, label);
  put(`ILLUMINUS.Groups.${id}.hint`, hint);
}

// The ten blocks and ten picture treatments. Their displayed names are stored
// on the style and editable; these are only the fallbacks.
for (let i = 1; i <= 10; i++) {
  const n = String(i).padStart(2, "0");
  put(`ILLUMINUS.Groups.box${n}.label`, `Box${n}`);
  put(`ILLUMINUS.Groups.box${n}.hint`,
    "A box you wrap around content. Anything left as \"use the page setting\" follows the Body and Heading tabs.");
  put(`ILLUMINUS.Groups.image${n}.label`, `Image${n}`);
  put(`ILLUMINUS.Groups.image${n}.hint`,
    "A style you apply to one image, overriding the page-wide Images settings.");
  put(`ILLUMINUS.Groups.tag${n}.label`, `Tag${n}`);
  put(`ILLUMINUS.Groups.tag${n}.hint`,
    "A style you apply to a few words rather than to a whole box \u2014 a trait tag, a rarity badge, "
    + "or the rank on the right of a title line.");
}

/* ---------- Sections ---------- */
const SECTION_TEXT = {
  layout: ["Size and Position", "How much room this takes up"],
  tagLayout: ["Size and Position", "Where the tag sits on the line, and how wide it is"],
  text: ["Text", "Typeface, size, color, and spacing"],
  textShadow: ["Text Shadow", "A shadow cast by the lettering itself"],
  padding: ["Inner Spacing", "Room between the edges and the contents"],
  margin: ["Outer Spacing", "Room between this and whatever surrounds it"],
  background: ["Fill", "The color and image behind the contents"],
  border: ["Border", "Each edge is set separately — leave a thickness at 0 for no line"],
  cellBorder: ["Lines Between Cells", "The grid inside the table. Each edge of every cell is set separately"],
  corners: ["Corner Rounding", "Each corner is set separately"],
  shadow: ["Outer Shadow", "A shadow cast outwards. A fully transparent color means no shadow"],
  innerShadow: ["Inner Shadow", "Shading inside the edges, for an aged or lit-from-within look"],
  paragraph: ["Paragraphs", "Spacing and indentation between paragraphs"],
  columns: ["Columns", "Split the text into newspaper-style columns"],
  dropCap: ["Opening Capital", "An enlarged first letter at the start of a page"],
  decoration: ["Underline", "The line drawn through or under a link"],
  marks: ["Marked Text", "Highlighting, strike-through, underline, and the rest of the toolbar's marks"],
  code: ["Code", "Fixed-width text, inline and as a block"],
  definitions: ["Definition Lists", "A term with its explanation beneath"],
  tableCaption: ["Caption", "The title printed above or below a table"],
  collapsible: ["Collapsible", "A passage the reader can fold away"],
  glow: ["Glow", "A halo that follows the picture's shape"],
  media: ["Sound and Video", "Embedded players and pages"],
  revealed: ["Once Revealed", "How the passage looks after it has been shown to the table"],
  revealButton: ["Reveal Button", "The button Foundry prints inside a secret passage"],
  chip: ["Highlight", "A patch of color behind a link, making it look like a button"],
  marker: ["Bullets and Numbers", "The mark in front of each item"],
  header: ["Header Row", "The top row of a table"],
  rows: ["Rows", "The body rows of a table"],
  cellPadding: ["Cell Spacing", "Room between a cell's edges and its contents"],
  caption: ["Caption", "The text beneath an image"],
  dividers: ["Dividers", "Horizontal rules between passages"],
  blockHeadings: ["Headings Inside", "Headings within this box. Leave as the page setting to follow the Heading tabs"],
  entries: ["Page Entries", "Each page listed in the contents panel"],
  entryBorder: ["Entry Borders", "Lines around each listed page. Each edge is set separately"],
  entryStates: ["Current and Hovered", "How the page you are reading, and the one under the mouse, stand out"],
  number: ["Page Numbers", "The number shown beside each listed page"],
  subHeadings: ["Sub-Headings", "The headings listed underneath the page you are reading"],
  category: ["Category Rows", "Group headers in the contents panel"],
  search: ["Search Box", "The search field at the top of the panel"],
  buttons: ["Buttons", "The controls beside the search box and along the bottom"],
  frame: ["Window Frame", "The edge of the window, visible around the page"],
  titleBar: ["Title Bar", "The strip across the top carrying the journal's name"],
  headerButtons: ["Title Bar Buttons", "The icon buttons at the right of the title bar, including Illuminus's own"],
  pageButton: ["Edit Button", "The pencil that appears over a page when you point at it"]
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
  headerButtonBorder: "button edge", pageButtonBorder: "button edge",
  headerButtonCorner: "button", pageButtonCorner: "button",
  padding: "contents", cellPadding: "cell's contents", entryPadding: "entry's contents",
  margin: "", corner: "", searchCorner: "search box", buttonCorner: "button",
  codePadding: "code", codeBlockPadding: "block of code", summaryPadding: "heading",
  collapsiblePadding: "contents",
  shadow: "shadow", innerShadow: "inner shading", textShadow: "text shadow",
  mediaShadow: "shadow"
};
const SIDE_PHRASE = { Top: "above", Right: "to the right of", Bottom: "below", Left: "to the left of" };
const CORNER_WORD = {
  TopLeft: "Top-Left", TopRight: "Top-Right", BottomRight: "Bottom-Right", BottomLeft: "Bottom-Left"
};
const noun = (prefix, fallback) => (prefix in NOUN ? NOUN[prefix] : fallback);

const names = [...new Set(allFields().map(({ field }) => field.name))];
const unmatched = [];

/**
 * Background-image family: <prefix>Texture(|Fit|Position|Blend|Opacity). Every
 * fill color has one, so the labels are generated rather than listed. Where two
 * fills share a section — a button and the same button being pointed at — the
 * qualifier keeps their labels apart.
 */
const IMAGE_QUALIFIER = (prefix) => {
  if (/hover$/i.test(prefix)) return " When Pointed At";
  if (prefix === "active") return " for the Current Page";
  return "";
};
const IMAGE_TEXT = {
  "": ["Background Image", "An image laid over the fill color, such as a parchment scan. Leave empty for none."],
  Fit: ["Image Fit", "How the background image covers the area."],
  Position: ["Image Position", "Where the background image is anchored."],
  Blend: ["Image Blending", "How the image mixes with the fill color. \"Multiply\" keeps paper texture while letting the color show through."],
  Opacity: ["Image Strength", "How strongly the background image shows. 0 hides it entirely."]
};

for (const name of names) {
  let m;
  // background-image family: <prefix>Texture(|Fit|Position|Blend|Opacity).
  // Only prefixed ones — the Page tab's own set is worded by hand.
  if ((m = name.match(/^(.+?)Texture(Fit|Position|Blend|Opacity)?$/))) {
    const [, prefix, part] = m;
    const [label, hint] = IMAGE_TEXT[part ?? ""];
    put(`ILLUMINUS.Field.${name}.label`, label + IMAGE_QUALIFIER(prefix));
    put(`ILLUMINUS.Field.${name}.hint`, hint);
    continue;
  }
  // lettering family: <prefix>TextStyle
  if ((m = name.match(/^(.+)TextStyle$/))) {
    const words = m[1].replace(/([A-Z])/g, " $1").toLowerCase().trim();
    put(`ILLUMINUS.Field.${name}.label`, "Text Style");
    put(`ILLUMINUS.Field.${name}.hint`, `How the ${words} lettering looks — its weight and whether it is italic.`);
    continue;
  }
  // hovered edges: hoverBorder<Side>Color
  if ((m = name.match(/^hoverBorder(Top|Right|Bottom|Left)Color$/))) {
    const side = m[1];
    put(`ILLUMINUS.Field.${name}.label`, `${side} Color`);
    put(`ILLUMINUS.Field.${name}.hint`,
      `Color of the ${side.toLowerCase()} edge while the mouse is over this. `
      + "Leave empty to keep the ordinary color.");
    continue;
  }
  // border family: <prefix><Side><Width|Style|Color>
  else if ((m = name.match(/^(.*?)(Top|Right|Bottom|Left)(Width|Style|Color)$/))) {
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
      put(`ILLUMINUS.Field.${name}.label`, `${side} Color`);
      put(`ILLUMINUS.Field.${name}.hint`, `Color of the ${lower} ${what} line.`);
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
  if ((m = name.match(/^(shadow|innerShadow|textShadow|mediaShadow)(OffsetX|OffsetY|Blur|Spread|Color)$/))) {
    const [, prefix, part] = m;
    const what = NOUN[prefix];
    const text = {
      OffsetX: ["Sideways Offset", `How far the ${what} sits to the right. Negative moves it left.`],
      OffsetY: ["Downward Offset", `How far the ${what} sits below. Negative moves it up.`],
      Blur: ["Softness", `How blurred the ${what} is. 0 is a hard edge.`],
      Spread: ["Size", `Grows or shrinks the ${what} beyond the shape that casts it.`],
      Color: ["Color", `Color of the ${what}. A fully transparent color means none at all.`]
    }[part];
    put(`ILLUMINUS.Field.${name}.label`, text[0]);
    put(`ILLUMINUS.Field.${name}.hint`, text[1]);
    continue;
  }
  // spacing family: <prefix><Side>
  if ((m = name.match(/^(padding|margin|cellPadding|entryPadding|codePadding|codeBlockPadding|summaryPadding|collapsiblePadding)(Top|Right|Bottom|Left)$/))) {
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
  hoverColor: ["Text Color", "Text color while the mouse is over this. Leave empty to keep the ordinary color."],
  hoverBackground: ["Fill Color", "The color behind this while the mouse is over it. Leave empty to keep the ordinary fill."],
  background: ["Fill Color", "The flat color behind everything else."],
  highlightBackground: ["Highlight Color", "The color behind highlighted words."],
  highlightColor: ["Highlight Text Color", "Text color of highlighted words."],
  strikeColor: ["Strike-Through Color", "Color of the line through struck-out words."],
  strikeThickness: ["Strike-Through Thickness", "How heavy the line through struck-out words is."],
  underlineColor: ["Underline Color", "Color of an underline."],
  underlineThickness: ["Underline Thickness", "How heavy an underline is."],
  underlineOffset: ["Underline Distance", "How far an underline sits below the words."],
  abbrColor: ["Abbreviation Color", "Text color of an abbreviation."],
  abbrLine: ["Abbreviation Underline", "What the line under an abbreviation looks like."],
  quoteFont: ["Quotation Typeface", "The typeface used for a short quotation."],
  quoteStyle: ["Quotation Slant", "Whether a short quotation is italic."],
  quoteColor: ["Quotation Color", "Text color of a short quotation. Leave empty to follow the page."],
  codeFont: ["Code Typeface", "The typeface used for code. A fixed-width face keeps columns lined up."],
  codeSize: ["Code Text Size", "How large code lettering is. 0 follows the page."],
  codeColor: ["Code Text Color", "Text color of code."],
  codeBackground: ["Code Fill Color", "The color behind code."],
  codeBorderColor: ["Code Border Color", "Outline color around code."],
  codeBorderWidth: ["Code Border Thickness", "How heavy the outline around code is. 0 draws nothing."],
  codeBlockMarginTop: ["Code Block Top Gap", "Empty space above a block of code."],
  codeBlockMarginBottom: ["Code Block Bottom Gap", "Empty space below a block of code."],
  termFont: ["Term Typeface", "The typeface used for the term being defined."],
  termSize: ["Term Text Size", "How large the term is. 0 follows the page."],
  termColor: ["Term Color", "Text color of the term being defined."],
  termCaps: ["Term Capitals", "Force capital letters on the term."],
  termSpacingAbove: ["Space Above Term", "Empty space above each term."],
  detailFont: ["Explanation Typeface", "The typeface used for the explanation under a term."],
  detailSize: ["Explanation Text Size", "How large the explanation is. 0 follows the page."],
  detailColor: ["Explanation Color", "Text color of the explanation under a term."],
  detailIndent: ["Explanation Indent", "How far the explanation is pushed in from the left."],
  detailSpacingBelow: ["Space Below Explanation", "Empty space under each explanation."],
  captionSide: ["Caption Position", "Whether the caption sits above or below the table."],
  captionCaps: ["Caption Capitals", "Force capital letters on the caption."],
  summaryFont: ["Heading Typeface", "The typeface used for the line you click to open it."],
  summarySize: ["Heading Text Size", "How large that line is. 0 follows the page."],
  summaryColor: ["Heading Color", "Text color of the line you click to open it."],
  summaryCaps: ["Heading Capitals", "Force capital letters on that line."],
  summaryBackground: ["Heading Fill Color", "The color behind the line you click to open it."],
  collapsibleBackground: ["Fill Color", "The color behind the contents once opened."],
  collapsibleBorderColor: ["Border Color", "Outline color around a collapsible passage."],
  collapsibleBorderWidth: ["Border Thickness", "How heavy that outline is. 0 draws nothing."],
  collapsibleMarginTop: ["Top Gap", "Empty space above a collapsible passage."],
  collapsibleMarginBottom: ["Bottom Gap", "Empty space below a collapsible passage."],
  glowColor: ["Glow Color", "A glow that follows the picture's own edges, not its box. Fully transparent means none."],
  glowSize: ["Glow Size", "How far the glow spreads. 0 draws nothing."],
  glowOffsetX: ["Glow Sideways Offset", "How far the glow sits to the right. Negative moves it left."],
  glowOffsetY: ["Glow Downward Offset", "How far the glow sits below. Negative moves it up."],
  mediaMaxWidth: ["Maximum Width", "How much of the text width a player or embedded page may take."],
  mediaMarginTop: ["Top Gap", "Empty space above a player or embedded page."],
  mediaMarginBottom: ["Bottom Gap", "Empty space below a player or embedded page."],
  revealedBackground: ["Fill Color Once Revealed", "The color behind a secret passage after it has been shown."],
  buttonSize: ["Button Text Size", "How large the lettering on the button is."],
  buttonBorderStyle: ["Button Border Style", "What the line around the button looks like."],
  whenEmpty: ["When Empty", "What happens if this box is left with nothing in it. Hiding it keeps a template tidy when a slot goes unused."],
  lift: ["Lift", "Nudge the tag up or down from the line it sits on, without moving the line itself."],
  minWidth: ["Least Width", "The narrowest this can be, so a row of short tags lines up. 0 lets it shrink to its words."],
  texture: ["Background Image", "An image laid over the fill color, such as a parchment scan. Leave empty for none."],
  textureFit: ["Image Fit", "How the background image covers the area."],
  texturePosition: ["Image Position", "Where the background image is anchored."],
  textureAttachment: ["Image Scrolling", "Whether the background image scrolls with the text or stays put."],
  textureBlend: ["Image Blending", "How the image mixes with the fill color. \"Multiply\" keeps paper texture while letting the color show through."],
  textureOpacity: ["Image Strength", "How strongly the background image shows. 0 hides it entirely."],
  maxWidth: ["Maximum Text Width", "Stops lines growing too long to read comfortably. Set to 0 for no limit."],
  font: ["Typeface", "Which lettering to use. Add more under Foundry's Configure Font Families menu."],
  size: ["Text Size", "How large the lettering is."],
  color: ["Text Color", "Color of the lettering."],
  textStyle: ["Text Style", "How the lettering looks \u2014 its weight and whether it is italic."],
  activeTextStyle: ["Current Page Text Style", "How the entry for the page being read looks."],
  numberTextStyle: ["Page Number Text Style", "How the numbers beside page entries look."],
  headingTextStyle: ["Heading Text Style", "How headings look."],
  categoryTextStyle: ["Category Text Style", "How a category row looks."],
  headerTextStyle: ["Header Text Style", "How the lettering in a header row looks."],
  captionTextStyle: ["Caption Text Style", "How caption lettering looks."],
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
  columnRuleColor: ["Divider Color", "Color of the line between columns."],
  dropCap: ["Opening Capital", "Enlarges the first letter of the page so it spans several lines."],
  dropCapFont: ["Opening Capital Typeface", "The typeface used for the opening capital. Leave as the journal's normal typeface to match the body."],
  dropCapColor: ["Opening Capital Color", "Color of that enlarged first letter."],

  decorationLine: ["Line", "Whether links are underlined, struck through, or left plain."],
  decorationStyle: ["Line Style", "What the link's line looks like."],
  decorationColor: ["Line Color", "Color of the link's line. May differ from the text itself."],
  decorationThickness: ["Line Thickness", "How heavy the link's line is."],
  decorationOffset: ["Line Distance", "How far the line sits from the lettering."],
  bullet: ["Bullet Shape", "The mark in front of each item in a bulleted list."],
  numberStyle: ["Number Style", "How items are numbered in a numbered list."],
  markerSize: ["Bullet Size", "How large bullets and item numbers are. 0 follows the text."],
  markerColor: ["Bullet Color", "Color of bullets and item numbers."],
  markerFont: ["Bullet Typeface", "The typeface used for bullets and item numbers."],
  indent: ["Indent", "How far a list is pushed in from the left."],
  itemSpacing: ["Spacing Between Items", "Gap between one list item and the next."],
  textColor: ["Text Color", "Text color in ordinary cells."],
  verticalAlign: ["Vertical Position", "Where contents sit within a cell, top to bottom."],
  width: ["Table Width", "How much of the available width the table fills."],
  headerBackground: ["Fill Color", "Background of the top row of a table."],
  headerColor: ["Text Color", "Text color in the top row of a table."],
  headerFont: ["Typeface", "The typeface used in the top row of a table."],
  headerSize: ["Text Size", "How large the top row's lettering is."],
  headerWeight: ["Thickness", "How heavy the top row's lettering is."],
  headerCaps: ["Capitals", "Force capital letters in the top row, or use small capitals."],
  headerAlign: ["Alignment", "Which edge the top row's text lines up against."],
  headerLetterSpacing: ["Letter Spacing", "Extra space between letters in the top row."],
  stripeColor: ["Alternating Row Color", "Shading on every other row, to help the eye track across. Use a mostly transparent color."],
  rowColor: ["Row Color", "Background shared by every body row. Use a fully transparent color for none."],
  opacity: ["Opacity", "How solid the picture is. Lower values let the page show through."],
  captionFont: ["Typeface", "The typeface used for a picture's caption."],
  captionSize: ["Text Size", "How large caption lettering is."],
  captionColor: ["Text Color", "Text color of a picture's caption."],
  captionWeight: ["Thickness", "How heavy caption lettering is."],
  captionStyle: ["Slant", "Whether captions are italic."],
  captionCaps: ["Capitals", "Force capital letters in captions, or use small capitals."],
  captionAlign: ["Alignment", "Which edge a caption lines up against."],
  captionSpacing: ["Gap Above Caption", "Space between a picture and its caption."],

  dividerWidth: ["Thickness", "How heavy a horizontal rule is. 0 draws nothing."],
  dividerStyle: ["Style", "What a horizontal rule looks like."],
  dividerColor: ["Color", "Color of a horizontal rule."],
  dividerLength: ["Length", "How much of the width a horizontal rule spans."],
  dividerAlign: ["Alignment", "Which side a shortened rule sits against."],
  dividerMarginTop: ["Space Above", "Gap between a rule and what comes before it."],
  dividerMarginBottom: ["Space Below", "Gap between a rule and what comes after it."],

  float: ["Float", "Let text wrap around this, on the left or the right of the page."],
  width: ["Width", "How much of the available width this takes up."],
  clear: ["Start Below", "Push this down past anything already floated beside it."],
  flip: ["Mirror", "Flip the picture, so an illustration can face into the page."],
  headingFont: ["Typeface", "The typeface for headings inside this block."],
  headingSize: ["Text Size", "Size of headings inside this box. 0 follows the page."],
  headingColor: ["Text Color", "Color of headings inside this box. Leave empty to follow the page."],
  headingWeight: ["Thickness", "How heavy headings inside this block are."],
  headingCaps: ["Capitals", "Capitalization of headings inside this block."],
  headingAlign: ["Alignment", "Which edge headings inside this block line up against."],
  headingMarginTop: ["Space Above", "Gap above a heading inside this block."],
  headingMarginBottom: ["Space Below", "Gap below a heading inside this block."],
  headingRuleWidth: ["Rule Thickness", "A line above each heading inside this block. 0 draws nothing."],
  headingRuleStyle: ["Rule Style", "What the line above a heading looks like."],
  headingRuleColor: ["Rule Color", "Color of the line above a heading."],

  sidebarWidth: ["Panel Width", "How wide the contents panel is."],
  titleBarBackground: ["Fill Color", "Color of the strip across the top of the window."],
  headerButtonColor: ["Icon Color", "Color of the title bar's icon buttons."],
  headerButtonHoverColor: ["Icon Color When Pointed At", "Icon color while the mouse is over a title bar button."],
  headerButtonBackground: ["Fill Color", "Color behind the title bar's icon buttons."],
  headerButtonHoverBackground: ["Fill When Pointed At", "Color behind a title bar button while the mouse is over it."],
  headerButtonSize: ["Icon Size", "How large the title bar's icons are."],
  pageButtonColor: ["Icon Color", "Color of the edit pencil."],
  pageButtonHoverColor: ["Icon Color When Pointed At", "Color of the edit pencil while the mouse is over it."],
  pageButtonBackground: ["Fill Color", "Color behind the edit pencil."],
  pageButtonHoverBackground: ["Fill When Pointed At", "Color behind the edit pencil while the mouse is over it."],
  pageButtonSize: ["Icon Size", "How large the edit pencil is."],
  hoverBackground: ["Highlight When Pointed At", "Color behind an entry while the mouse is over it."],
  activeColor: ["Current Page Color", "Text color of the page you are reading."],
  activeBackground: ["Current Page Highlight", "Color behind the page you are reading."],
  activeAccentColor: ["Current Page Marker Color", "Color of the bar marking the page you are reading."],
  activeAccentWidth: ["Current Page Marker Width", "A bar down the left of the page you are reading. 0 draws nothing."],
  activeWeight: ["Current Page Thickness", "How heavy the lettering is for the page you are reading."],
  numberColor: ["Text Color", "Color of the number beside each page."],
  numberSize: ["Text Size", "How large the page numbers are."],
  numberWeight: ["Thickness", "How heavy the page numbers are."],
  numberAlign: ["Alignment", "Which edge the page numbers line up against."],
  numberWidth: ["Column Width", "How much room the number column takes up."],
  headingFont: ["Typeface", "The typeface used for the sub-headings under a page."],
  headingSize: ["Text Size", "How large the sub-headings are."],
  headingColor: ["Text Color", "Color of the sub-headings."],
  headingWeight: ["Thickness", "How heavy the sub-headings are."],
  headingStyle: ["Slant", "Whether the sub-headings are italic."],
  headingHoverColor: ["Color When Pointed At", "Color a sub-heading turns when the mouse is over it."],
  headingIndent: ["Indent", "How far the sub-headings are pushed in from the left."],
  headingLineHeight: ["Row Height", "How tall each sub-heading row is."],
  categoryFont: ["Typeface", "The typeface used for category headers."],
  categorySize: ["Text Size", "How large category headers are."],
  categoryColor: ["Text Color", "Color of category headers."],
  categoryWeight: ["Thickness", "How heavy category headers are."],
  categoryCaps: ["Capitals", "Force capital letters in category headers, or use small capitals."],
  categoryLetterSpacing: ["Letter Spacing", "Extra space between letters in category headers."],
  categoryAlign: ["Alignment", "Which edge category headers line up against."],
  categoryBackground: ["Fill Color", "Color behind category headers."],
  searchBackground: ["Fill Color", "Color inside the search box."],
  searchColor: ["Text Color", "Color of what you type into the search box."],
  searchPlaceholderColor: ["Prompt Color", "Color of the grayed-out prompt shown while the search box is empty."],
  searchSize: ["Text Size", "How large the search box lettering is."],
  buttonColor: ["Text Color", "Text and icon color on the panel's buttons."],
  buttonBackground: ["Fill Color", "Color inside the panel's buttons."],
  buttonBorderColor: ["Border Color", "Color of the outline around the panel's buttons."],
  buttonBorderWidth: ["Border Thickness", "How heavy the outline around the panel's buttons is."],
  buttonHoverColor: ["Text Color When Pointed At", "Text color while the mouse is over a button."],
  buttonHoverBackground: ["Fill When Pointed At", "Color inside a button while the mouse is over it."],
  buttonHoverBorderColor: ["Border Color When Pointed At", "Outline color while the mouse is over a button."]
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
  none: "None", left: "Left", center: "Centered", right: "Right", justify: "Justified (both edges even)",
  normal: "Normal", italic: "Italic", oblique: "Slanted",
  uppercase: "ALL CAPITALS", lowercase: "all lower case", capitalize: "Title Case", smallCaps: "Small Capitals",
  solid: "Solid line", double: "Double line", dashed: "Dashed line", dotted: "Dotted line", wavy: "Wavy line",
  groove: "Carved groove", ridge: "Raised ridge", inset: "Sunken", outset: "Raised",
  disc: "Round dot", circle: "Hollow circle", square: "Square",
  diamond: "Four-pointed star", star: "Five-pointed star", dash: "Long dash", arrow: "Arrow",
  multiply: "Multiply (keeps texture, darkens)", overlay: "Overlay (boosts contrast)",
  softLight: "Soft light (gentle)", hardLight: "Hard light (strong)", screen: "Screen (lightens)",
  luminosity: "Brightness only", colorBurn: "Burn (deepens color)",
  tile: "Repeat as tiles", cover: "Fill the area (may crop)", contain: "Fit inside the area", stretch: "Stretch to fit",
  topLeft: "Top left", top: "Top", topRight: "Top right",
  bottomLeft: "Bottom left", bottom: "Bottom", bottomRight: "Bottom right",
  scroll: "Scrolls with the page", fixed: "Stays still", local: "Scrolls with the text",
  middle: "Middle",
  inherit: "Use the page setting",
  full: "Full width", threeQuarters: "Three quarters", half: "Half", third: "One third",
  horizontal: "Flip left to right", vertical: "Flip top to bottom", both: "Both",
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
