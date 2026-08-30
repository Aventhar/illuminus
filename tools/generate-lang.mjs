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
const { GROUPS, allFields, groupFields, FAMILY_SIZE, cssVarFor } = await import(`${ROOT}/scripts/style-schema.mjs`);
const { cssNames } = await import(`${ROOT}/tools/css-names.mjs`);
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
// The vocabulary the editor names its controls in.
put("ILLUMINUS.Settings.Wording.Name", "Setting Names");
put("ILLUMINUS.Settings.Wording.Hint",
  "What the style editor calls its settings. Plain language describes what each one does, "
  + "in ordinary words — this is how Illuminus is meant to be used, and you never need to "
  + "know any CSS. Choose CSS property names instead if you already write stylesheets and "
  + "would rather see which property each control writes. Only the names change; the "
  + "explanation under each one stays the same either way.");
put("ILLUMINUS.Settings.Wording.Plain", "Plain language");
put("ILLUMINUS.Settings.Wording.Css", "CSS property names");


// The rows a box family is gathered into, and the sides of an edge.
put("ILLUMINUS.Editor.OnlySet", "Only what this style sets");
put("ILLUMINUS.Menu.Lists", "List");
put("ILLUMINUS.Menu.Tables", "Table");
put("ILLUMINUS.Settings.Eyedropper.Name", "Eyedropper");
put("ILLUMINUS.Settings.Eyedropper.Hint",
  "Where the eyedropper takes a color from. Reading it out of the page can see "
  + "anything Foundry has drawn \u2014 a fill, an edge, lettering \u2014 keeps transparency, "
  + "and needs no permission, but it cannot sample a background picture or "
  + "anything outside the Foundry window. The operating system's picker can take "
  + "any pixel on the screen, including a reference image open beside Foundry, "
  + "but gives back a solid color with no transparency. Hold Shift when you "
  + "click an eyedropper to use whichever one you have not chosen here.");
put("ILLUMINUS.Settings.Eyedropper.Page", "Read colors out of the page");
put("ILLUMINUS.Settings.Eyedropper.Screen", "Take any pixel on the screen");
put("ILLUMINUS.Notifications.NoScreenPicker",
  "This browser offers no screen eyedropper, so there is nothing to take a pixel with. "
  + "Reading colors out of the page still works.");
put("ILLUMINUS.Editor.Zoom", "Zoom");
put("ILLUMINUS.Editor.QuietSample", "Disable hover in preview");
// Said because its absence costs a bug report: with this on, every hovered
// control looks broken, since the sample is where a person looks to judge one.
put("ILLUMINUS.Editor.QuietSampleHint",
  "Stops the sample answering the mouse, so it holds still while you work — "
  + "otherwise every pass of the pointer repaints something.\n\n"
  + "While this is on, nothing you set for a hovered state will show in the "
  + "sample. Turn it off when you want to see one; a real journal is unaffected "
  + "either way.");
put("ILLUMINUS.Editor.PartsLabel", "The parts of a journal");
put("ILLUMINUS.Editor.PartsTwist", "Show what this part holds");
put("ILLUMINUS.Box.Unset", "Nothing set");
put("ILLUMINUS.Box.Shadow", "Shadow");
// What a gathered run answers to when the tab's own wording gives up nothing.
// Said apart from the bare word above, because a category holding both an inner
// shadow and an outer one showed two runs called "Shadow" and no way to tell
// which was which.
put("ILLUMINUS.Box.InnerShadow", "Inner Shadow");
put("ILLUMINUS.Box.OuterShadow", "Outer Shadow");
put("ILLUMINUS.Box.TextShadow", "Text Shadow");
put("ILLUMINUS.Box.Picture", "Picture");
put("ILLUMINUS.Box.Spacing", "Spacing");
put("ILLUMINUS.Box.Edges", "Edges and Corners");
put("ILLUMINUS.Box.Inner", "Inside");
put("ILLUMINUS.Box.Outer", "Around");
put("ILLUMINUS.Box.Corners", "Corners");
put("ILLUMINUS.Box.Edge", "Edge");
put("ILLUMINUS.Box.WhichSide", "Which side");
put("ILLUMINUS.Box.Top", "Top");
put("ILLUMINUS.Box.Right", "Right");
put("ILLUMINUS.Box.Bottom", "Bottom");
put("ILLUMINUS.Box.Left", "Left");
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
  "ILLUMINUS.Editor.StateActive": "Selected",
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
  "ILLUMINUS.Export.Title": "Advanced Exports",
  "ILLUMINUS.Export.Button": "Advanced Exports",
  "ILLUMINUS.Export.Tooltip": "Save styled journals as web pages that open in any browser",
  "ILLUMINUS.Export.ContextEntry": "Export as Web Pages\u2026",
  "ILLUMINUS.Export.Hint": "Saves the journals you pick, wearing the style you pick, as a PDF or as web pages that open in any browser \u2014 with no Foundry and no Illuminus needed. Hand a player a handout, print one for the table, or put an adventure on a website.",
  "ILLUMINUS.Export.StyleLegend": "Style",
  "ILLUMINUS.Export.JournalsLegend": "Journals",
  "ILLUMINUS.Export.SelectNone": "Select None",
  "ILLUMINUS.Buttons.Close": "Close",
  "ILLUMINUS.Buttons.CopyFrom": "Copy {name}",
  "ILLUMINUS.Buttons.CopyNormal": "Copy Normal",
  "ILLUMINUS.Buttons.FoundryDefault": "Use Foundry Default",
  "ILLUMINUS.Confirm.FoundryDefault": "Clear every setting on this tab, leaving the window frame, title bar, and buttons as Foundry draws them?",
  "ILLUMINUS.Buttons.FoundryDefaultTooltip": "Clear this tab, leaving the window frame, title bar, and buttons as Foundry draws them",
  "ILLUMINUS.Buttons.CopyNormalTooltip": "Fill these from the ordinary controls, as a starting point to change",
  "ILLUMINUS.Buttons.CopyFromTooltip": "Take every setting from the level above, as a starting point to change",
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
  "ILLUMINUS.Export.FormatPrintNote": "Opens your browser\u2019s print dialog, where Save as PDF lives \u2014 paper size, margins and background ink are chosen there. Chrome gives the best result: it writes its own PDF and keeps the contents page\u2019s links.",
  "ILLUMINUS.Export.FormatFolder": "Website directory structure",
  "ILLUMINUS.Export.CssPrefix": "Custom Descriptor",
  "ILLUMINUS.Export.CssPrefixPlaceholder": "Mandatory",
  "ILLUMINUS.Export.CssPrefixHint": "Every class and color name in the exported file is built from this word, in place of \"illuminus\" \u2014 so the file can sit in your own module without answering to Illuminus's names or being changed by them. Letters, digits and hyphens; it must start with a letter. Any pictures the style uses are carried inside the file, and licensing them for whatever you release is yours to arrange. Typefaces are not included: the file names them and leaves finding them to whatever loads it.",
  "ILLUMINUS.Export.CssNeedsStyle": "A style sheet can only be exported from an Illuminus style. \u201CAs they appear in Foundry VTT\u201D gathers the styling that is painting the page, which is not Illuminus\u2019s to hand on.",
  "ILLUMINUS.Export.CssPrefixNeeded": "A style sheet needs a name of its own before it can be exported.",
  "ILLUMINUS.Export.FormatFolderNote": "A folder of web pages, one file per journal, with a contents page and a styles folder beside them. Open it in any browser, or put the folder on a website.",
  "ILLUMINUS.Export.FormatFileNote": "One file holding everything \u2014 pages, pictures and styling alike. Nothing sits beside it, so it can be emailed, put on a memory stick, or opened straight from a download.",
  "ILLUMINUS.Export.FormatCss": "Independent Style Sheet (CSS)",
  "ILLUMINUS.Export.FormatCssNote": "The look on its own, for a page you lay out yourself. Pictures are carried inside the file.",
  "ILLUMINUS.Export.FormatFile": "Single file website",
  "ILLUMINUS.Export.FormatPrint": "Print to printer or PDF",
  "ILLUMINUS.Export.ManyTitle": "{count} Journals",
  "ILLUMINUS.Export.PopupBlocked": "Your browser would not start printing, so the page has been saved instead. Open it and print from there.",
  "ILLUMINUS.Export.DesktopLinks": "This browser saves a PDF through your operating system\u2019s print panel, which flattens the contents page\u2019s links and will not let you type a filename. Chrome writes its own PDF and keeps them, if you want one you can click through.",
  "ILLUMINUS.Export.Printing": "Preparing the printable pages\u2026 your browser\u2019s print window will open.",
  "ILLUMINUS.Export.OptionsLegend": "Export Options",
  "ILLUMINUS.Export.Secrets": "Include hidden passages",
  "ILLUMINUS.Export.SecretsHint": "Secret sections are the parts of a journal only the GM can read. They are left out unless this is ticked, so a handout can be exported from the same page the GM works in.",
  "ILLUMINUS.Export.PageTexture": "Include page background in file",
  "ILLUMINUS.Export.PageTextureHint": "A printer leaves background colors and pictures out unless it is asked for them, and a page's own surface is the largest of those. Tick this to print it \u2014 and expect it to use ink.",
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
  "ILLUMINUS.Families.boxStyles": "More Box Styles",
  "ILLUMINUS.Families.imageStyles": "More Image Styles",
  "ILLUMINUS.Families.tagStyles": "More Tag Styles",
  "ILLUMINUS.Families.listStyles": "More List Styles",
  "ILLUMINUS.Families.listStylesName": "List name",
  "ILLUMINUS.Families.listStylesHint": "Styles you apply to one list, overriding the Default List settings. Put the cursor in a list, then pick one. Rename it to suit your content.",
  "ILLUMINUS.Families.tableStyles": "More Table Styles",
  "ILLUMINUS.Families.tableStylesName": "Table name",
  "ILLUMINUS.Families.tableStylesHint": "Styles you apply to one table, overriding the Default Table settings. Put the cursor in a table, then pick one. Rename it to suit your content.",
  "ILLUMINUS.Families.tagStylesName": "Tag name",
  "ILLUMINUS.Families.tagStylesHint": "Styles you apply to a few words inside a paragraph or a heading \u2014 trait tags, rarity badges, the rank at the end of a title line. Select the words first, then pick one. Rename it to suit your content.",
  "ILLUMINUS.Field.sidebar.buttonColor.label": "Icon Color",
  "ILLUMINUS.Field.sidebar.buttonColor.hint": "Color of the icons on the panel's buttons.",
  "ILLUMINUS.Field.sidebar.buttonHoverColor.label": "Icon Color",
  "ILLUMINUS.Field.sidebar.buttonHoverColor.hint": "Color of the icons while the mouse is over a button.",
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
  "ILLUMINUS.ColorPicker.SwapSliders": "Say this color the other way. Hue, saturation and lightness are how a person usually thinks about a color; red, green and blue are how a screen makes one. Either sets the same color, and the picker remembers which you prefer.",
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
  "ILLUMINUS.Sample.Folder": "Samples",
  "ILLUMINUS.Sample.JournalName": "Illuminus Sample",
  "ILLUMINUS.Sample.Button": "Sample Journal",
  "ILLUMINUS.Sample.ButtonTooltip": "Make a real journal holding everything the sample shows, dressed in the ticked style",
  "ILLUMINUS.Sample.Made": "Made {name}, in the Samples folder.",
  "ILLUMINUS.Preview.HeadingBody": "The text that follows a heading, so the space above and below it, and the way it sits against a full measure of prose, can both be judged. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.",
  "ILLUMINUS.Preview.EditorTitle": "Editing: A Page",
  "ILLUMINUS.Preview.EditorPageName": "A Page",
  "ILLUMINUS.Preview.EditorLevel": "Level 1",
  "ILLUMINUS.Preview.EditorShowTitle": "Show Title",
  "ILLUMINUS.Preview.EditorFormat": "Format",
  "ILLUMINUS.Preview.EditorIlluminus": "Illuminus",
  "ILLUMINUS.Preview.EditorBody": "What you type here is written on the page's own surface, so it looks like what a reader will see.",
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
  // Filler, and deliberately dull: what this half of the paragraph is for is
  // length. Line spacing, paragraph width, justification, and columns all need
  // more than a sentence before they show what they are doing, and the link
  // above stays where a reader meets it early rather than being pushed to the
  // end of a long block.
  "ILLUMINUS.Preview.BodyRest": "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
  "ILLUMINUS.Preview.BodyTwo": "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur. At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.",
  "ILLUMINUS.Preview.BodyThree": "Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae. Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. Curabitur arcu erat, accumsan id imperdiet et, porttitor at sem, vestibulum ac diam sit amet quam. Vivamus suscipit tortor eget felis porttitor volutpat, quisque velit nisi pretium ut lacinia in elementum.",
  "ILLUMINUS.Preview.Boxed": "Boxed text, as used for read-aloud description. Long enough to wrap, so its own line spacing and padding are visible.",
  "ILLUMINUS.Preview.ListItem": "List item",
  "ILLUMINUS.Preview.TableHeader": "Table header",
  "ILLUMINUS.Preview.TableCell": "Table cell",
  "ILLUMINUS.Choices.shown": "Show them",
  "ILLUMINUS.Choices.notShown": "Do not display",
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
  "ILLUMINUS.Preview.CodeBlock": "a block of code, set apart from the prose",
  "ILLUMINUS.Preview.Struck": "struck through",
  "ILLUMINUS.Preview.Underlined": "underlined",
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
  "ILLUMINUS.Buttons.PickColorTooltip": "Point at anything in the window to copy its color \u2014 fills, borders, and lettering. Hold Option/Alt for lettering, Escape to cancel. Hold Shift to use the other eyedropper instead: whichever of the two you have not made your usual one, under Configure Settings.",
  "ILLUMINUS.Picker.BackgroundMode": "Fill",
  "ILLUMINUS.Picker.BorderMode": "Border",
  "ILLUMINUS.Picker.TextMode": "Text",
});

/* ---------- Groups ---------- */
const GROUP_TEXT = {
  editor: ["Journal Editor", "The window that opens when you edit a page \u2014 its frame and its title bar. What you write on is the page's own surface, set on the Page tab, and the rows of controls are the parts this holds."],
  editorSettingsBar: ["Page Settings Bar", "The strip above the editing controls: the page's name, its level, and whether its title is shown."],
  editorDropdowns: ["Drop-downs", "The Format and Illuminus menus in the editing bar, and the list each one opens."],
  editorToolbar: ["Toolbar", "The row of editing controls itself, and the icon buttons along it."],
  page: ["Page", "The paper the text sits on: its color, any background image, and the frame around it."],
  window: ["Window", "The journal window itself: its frame, the title bar across the top, and the icon buttons."],
  sidebar: ["Sidebar", "The contents panel down the left of the journal window \u2014 the panel itself. What it lists is styled by the parts it holds."],
  sidebarEntries: ["Page Entries", "A page listed in the contents panel, and how it looks while pointed at or being read."],
  sidebarHeadings: ["Sub-headings", "The headings listed under a page in the contents panel, and how deep each tier is indented."],
  sidebarCategories: ["Category Rows", "The folder rows that group pages in the contents panel."],
  sidebarSearch: ["Search Box", "The box at the top of the contents panel that narrows the list."],
  sidebarButtons: ["Panel Buttons", "The buttons along the contents panel \u2014 collapse, search mode, and the rest."],
  sidebarNumbers: ["Page Numbers", "The number drawn beside each listed page."],
  title: ["Title", "The journal's name, shown across the top of the window."],
  heading1: ["Heading 1", "The largest headings — page titles and chapter openers."],
  heading2: ["Heading 2", "Mid-level headings that break a page into sections."],
  heading3: ["Heading 3", "Sub-section headings within a chapter."],
  heading4: ["Heading 4", "Smaller headings, often naming a single room or entry."],
  heading5: ["Heading 5", "Smaller still, for a labeled paragraph or a short list heading."],
  heading6: ["Heading 6", "The smallest heading level."],
  body: ["Body", "Ordinary paragraphs — the bulk of what people read."],
  links: ["Links", "Clickable references to other documents, rolls, and web pages. Foundry builds these itself as a page is read, so unlike a box or a table they cannot carry a treatment of their own."],
  lists: ["Default List", "A bulleted, numbered or definition list that has been given no list treatment of its own."],
  tables: ["Default Table", "A table of results, treasure or encounters that has been given no table treatment of its own."],
  secrets: ["Secret", "A GM-only passage, and the button that reveals it to the table."],
  boxes: ["Default Box", "A set-apart passage — read-aloud description and the like — that has been given no box treatment of its own. Applies to quote blocks in the editor."],
  images: ["Default Image", "A picture placed in a page, and its caption, where no picture treatment has been given."],
  tags: ["Default Tag", "A few words marked out inside a sentence — a trait, a keyword, a condition — where no tag treatment has been chosen. The editor's Tag menu names it first."]
};
for (const [id, [label, hint]] of Object.entries(GROUP_TEXT)) {
  put(`ILLUMINUS.Groups.${id}.label`, label);
  put(`ILLUMINUS.Groups.${id}.hint`, hint);
}

// Each family's treatments. Their displayed names are stored on the style and
// editable; these are only the fallbacks. The count comes from the schema, so
// widening or narrowing a family needs no edit here.
for (let i = 1; i <= FAMILY_SIZE; i++) {
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
  put(`ILLUMINUS.Groups.list${n}.label`, `List${n}`);
  put(`ILLUMINUS.Groups.list${n}.hint`,
    "A style you apply to one list, overriding the Default List settings \u2014 a run of trait "
    + "chips, a numbered procedure, a glossary.");
  put(`ILLUMINUS.Groups.table${n}.label`, `Table${n}`);
  put(`ILLUMINUS.Groups.table${n}.hint`,
    "A style you apply to one table, overriding the Default Table settings \u2014 a stat block "
    + "reads nothing like a treasure table.");
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
  // The page's own is a special case: the window clips it, so it is a control
  // that only earns its keep outside Foundry.
  pageShadow: ["Outer Shadow", "A shadow cast outwards. Foundry\u2019s window clips it, so this shows in exported pages rather than at the table"],
  categoryBorder: ["Category Edges", "Lines around a group heading in the contents panel. Each edge is set separately"],
  headingColumns: ["Columns", "How the text under this heading is set. Each level decides for its own passage, so a chapter can run wide and a section beneath it in two columns. Level 1 also sets the text under the page's title"],
  innerShadow: ["Inner Shadow", "Shading inside the edges, for an aged or lit-from-within look"],
  paragraph: ["Paragraphs", "Spacing and indentation between paragraphs"],
  columns: ["Columns", "Split the text into newspaper-style columns"],
  fold: ["Folding", "Let a reader fold this away and open it again, and set what the marker looks like"],
  codeBlock: ["Code Block", "A block of code set apart from the prose, rather than code inside a sentence"],
  dropCap: ["Opening Capital", "An enlarged first letter at the start of a page"],
  decoration: ["Underline", "The line drawn through or under a link"],
  marks: ["Marked Text", "Highlighting, strike-through, underline, and the rest of the toolbar's marks"],
  code: ["Code", "Fixed-width text, inline and as a block"],
  definitions: ["Definition Lists", "A term with its explanation beneath"],
  tableCaption: ["Table Caption", "The title printed above or below a table"],
  collapsible: ["Collapsible", "A passage the reader can fold away"],
  glow: ["Glow", "A halo that follows the picture's shape"],
  media: ["Sound and Video", "Embedded players and pages"],
  revealed: ["Once Revealed", "How the passage looks after it has been shown to the table"],
  revealButton: ["Reveal Button", "The button Foundry prints inside a secret passage"],
  chip: ["Highlight", "A patch of color behind a link, making it look like a button"],
  marker: ["Bullets and Numbers", "The mark in front of each item"],
  header: ["Header Row", "The top row of a table"],
  rows: ["Table Rows", "The body rows of a table"],
  cellPadding: ["Cell Spacing", "Room between a cell's edges and its contents"],
  caption: ["Caption", "The text beneath an image"],
  dividers: ["Dividers", "Horizontal rules between passages"],
  blockHeadings: ["Headings Inside", "Headings within this box. Leave as the page setting to follow the Heading tabs"],
  entries: ["Page Entries", "Each page listed in the contents panel"],
  entryBorder: ["Entry Borders", "Lines around each listed page. Each edge is set separately"],
  entryStates: ["Current and Hovered", "How the page you are reading, and the one under the mouse, stand out"],
  number: ["Numbering", "The number shown beside each listed page"],
  subHeadings: ["Sub-Headings", "The headings listed underneath the page you are reading"],
  category: ["Categories", "The group headings between the pages, and the rows they sit in"],
  search: ["Search Box", "The search field at the top of the panel"],
  buttons: ["Buttons", "The controls beside the search box and along the bottom"],
  frame: ["Window Frame", "The edge of the window, visible around the page"],
  titleBar: ["Title Bar", "The strip across the top carrying the journal's name"],
  headerButtons: ["Title Bar Buttons", "The icon buttons at the right of the title bar, including Illuminus's own"],
  frameSize: ["Window Size", "How wide the window may be drawn, whatever it is dragged to"],
  fillAndImage: ["Fill and Image", "The color and picture behind the contents, and the shadows they cast"],
  imageCaption: ["Image Caption", "The words printed under a picture"],
  cellStyles: ["Cell Styles", "The room inside a cell and the lines drawn around it"],
  pageFillAndImage: ["Fill and Image", "The color and picture behind the contents, and the shadows they cast — Foundry's window clips the outer one, so it shows in an exported page rather than at the table"],
  spacing: ["Spacing", "The space inside this and the space around it"],
  toolbar: ["Editing Bar", "The strip the editing controls stand on, above the prose"],
  toolbarIcons: ["Editing Icons", "Each icon on that strip \u2014 bold, italic, and the rest"],
  settingsBar: ["Page Settings Bar", "The strip holding the page's own settings, above the editing bar"],
  pageFields: ["Page Settings", "The title level and the Show Title tick box standing on that strip"],
  dropdowns: ["Named Controls", "The two controls that open a list of their own, Format and Illuminus"],
  dropdownList: ["Drop-down List", "The list a named control opens, which Foundry draws over the window"],
  dropdownItems: ["Drop-down Entries", "Each entry in that list"],
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
  hoverEntryBorder: "entry edge", activeEntryBorder: "entry edge",
  headerButtonBorder: "button edge", pageButtonBorder: "button edge",
  headerButtonCorner: "button", pageButtonCorner: "button",
  padding: "contents", cellPadding: "cell's contents", entryPadding: "entry's contents",
  entryMargin: "", headingPadding: "listed heading's name", headingMargin: "",
  toolbarPadding: "editing controls", toolbarBorder: "editing bar edge", toolbarCorner: "editing bar",
  settingsBarPadding: "settings on the strip", settingsBarBorder: "strip edge", settingsBarCorner: "strip",
  listPadding: "entries", listBorder: "list edge", listCorner: "list",
  itemPadding: "entry's name", itemCorner: "entry",
  settingsBarMargin: "",
  toolbarButtonPadding: "icon", toolbarButtonBorder: "icon edge", toolbarButtonCorner: "icon",
  dropdownPadding: "drop-down's name", dropdownBorder: "drop-down edge", dropdownCorner: "drop-down",
  fieldPadding: "field's contents", fieldBorder: "field edge", fieldCorner: "field",
  headingBorder: "listed heading edge", headingCorner: "listed heading", entryCorner: "entry",
  categoryPadding: "category's name", categoryMargin: "", categoryBorder: "category edge",
  categoryCorner: "category",
  margin: "", corner: "", searchCorner: "search box", buttonCorner: "button",
  codePadding: "code", codeBlockPadding: "block of code", summaryPadding: "heading",
  collapsiblePadding: "contents",
  shadow: "shadow", innerShadow: "inner shading", textShadow: "text shadow",
  headingTextShadow: "text shadow", categoryTextShadow: "text shadow",
  captionTextShadow: "text shadow", headerTextShadow: "text shadow",
  termTextShadow: "text shadow", detailTextShadow: "text shadow",
  summaryTextShadow: "text shadow", dropCapTextShadow: "text shadow",
  mediaShadow: "shadow"
};
const SIDE_PHRASE = { Top: "above", Right: "to the right of", Bottom: "below", Left: "to the left of" };
const CORNER_WORD = {
  TopLeft: "Top-Left", TopRight: "Top-Right", BottomRight: "Bottom-Right", BottomLeft: "Bottom-Left"
};
/** A prefix with its state word taken out, or null when it carries none. */
const withoutState = (name) => {
  const stripped = name.replace(/^(hover|active)/, "").replace(/(Hover|Active)(?=[A-Z])/, "");
  if (stripped === name || !stripped) return null;
  return stripped[0].toLowerCase() + stripped.slice(1);
};

/**
 * The wording for a prefix. A state's own control describes the same thing its
 * ordinary twin does — `hoverButtonCorner` is still the button's corner — so a
 * prefix carrying a state word is looked up without it rather than falling to
 * the generic phrase, which dropped "of the button" from every hovered corner.
 */
const noun = (prefix, fallback) => {
  if (prefix in NOUN) return NOUN[prefix];
  const bare = withoutState(prefix);
  return bare && bare in NOUN ? NOUN[bare] : fallback;
};

const names = [...new Set(allFields().map(({ field }) => field.name))];

/**
 * Shadow controls that share a section with the lettering they belong to.
 *
 * Under Opening Capital, a Color above an Outline Color above another Color
 * explains nothing — the shadow's says so. Wording is keyed by field name and a
 * name is shared across tabs, so where a tab does have a Text Shadow section of
 * its own the label reads "Shadow Color" inside it, which is a word longer than
 * it needs to be rather than a word short of clear.
 */
/**
 * Shadows that share a section with anything else.
 *
 * A shadow whose section holds nothing but its own five controls is named by
 * that section — Outer Shadow, Inner Shadow, Text Shadow — so "Softness" is the
 * whole of what the row needs to say. One sharing a section with a fill, a
 * picture, and a second shadow needs to say which shadow it is, or a tab reads
 * Horizontal Offset twice and means two different things.
 */
/**
 * Shadows that share a section with anything else, by tab.
 *
 * A shadow whose section holds nothing but its own five controls is named by
 * that section — Outer Shadow, Inner Shadow, Text Shadow — so "Softness" is the
 * whole of what the row needs to say. One sharing a section with a fill, a
 * picture, and a second shadow has to say which shadow it is, or the tab reads
 * "Horizontal Offset" twice and means two different things by it. Keyed by tab
 * because the same control is both, depending on how the tab is laid out.
 */
const PARTS = /(OffsetX|OffsetY|Blur|Spread|Color)$/;
const isShadow = (name) => /[Ss]hadow(OffsetX|OffsetY|Blur|Spread|Color)$/.test(name);
const ordinaryName = (name) => name.replace(/^(hover|active)/, "")
  .replace(/(Hover|Active)(?=[A-Z])/, "").replace(/^./, (c) => c.toLowerCase());
const SHARED_SHADOW = new Set(GROUPS.flatMap((group) => group.sections.flatMap((section) => {
  const shadows = section.fields.map((field) => field.name).filter(isShadow);
  if (!shadows.length) return [];
  const families = new Set(shadows.map((name) => ordinaryName(name).replace(PARTS, "")));
  const alone = families.size === 1 && section.fields.every((field) => isShadow(field.name));
  return alone ? [] : shadows.map((name) => `${group.family ?? group.id}.${name}`);
})));

const unmatched = [];

/**
 * Background-image family: <prefix>Texture(|Fit|Position|Blend|Opacity). Every
 * fill color has one, so the labels are generated rather than listed.
 *
 * Where two fills share a section — a button and the same button pointed at —
 * they used to be told apart by a qualifier in the label. The state switch does
 * that now, and shows one of them at a time, so the qualifier said the same
 * thing twice.
 */
const IMAGE_QUALIFIER = () => "";
const IMAGE_TEXT = {
  Blur: ["Image Softness",
    "Blurs the picture before it is laid down behind the words.\n\n"
    + "This is the single most useful control here. A photograph or a scan at full "
    + "sharpness competes with the text sitting on top of it and makes it hard to read. "
    + "Blur it by 3 or 4 and it stops being a picture you look at and becomes a texture "
    + "you look past — which is what a background is for."],
  Brightness: ["Image Brightness",
    "Makes the picture lighter or darker before it is laid down. 100 leaves it alone; "
    + "below 100 darkens it, above 100 lightens it.\n\n"
    + "Which way you go depends on your text. Dark lettering needs a pale background, so "
    + "push a busy texture up to 130 or so until the words sit clearly on top. Pale "
    + "lettering needs the opposite — down to 60 or 70, until the page can hold light ink."],
  Contrast: ["Image Contrast",
    "How big the gap is between the picture's lightest and darkest parts. 100 leaves it "
    + "alone, lower flattens it towards a single flat gray, higher makes the darks "
    + "darker and the lights lighter.\n\n"
    + "Lowering it is usually what you want for a background. A parchment scan at 40 keeps "
    + "just enough grain to read as paper without any one blotch pulling the eye."],
  Saturation: ["Image Color",
    "How much color the picture keeps. 100 leaves it as it is; 0 drains it to gray.\n\n"
    + "Draining it is worth trying even when you want a colorful page. Set this to 0 and "
    + "then tint the picture with the Fill Color underneath it using Multiply blending — "
    + "you get the texture of the photograph with a color you chose, rather than "
    + "whatever color the photograph happened to be."],
  Age: ["Image Age",
    "Browns the picture, the way an old photograph or a sheet of paper yellows with age. "
    + "0 leaves its own colors; 100 is fully sepia.\n\n"
    + "A quick way to make a modern photograph belong on a fantasy page. Try it around "
    + "60 to 80 together with Image Color turned down."],
  "": ["Background Image",
    "A picture laid behind this — a parchment scan, a stone texture, a photograph.\n\n"
    + "Point it at any image in your Foundry data: your own art, artwork from a game "
    + "system, or another module's. Leave it empty for no picture at all.\n\n"
    + "The picture sits *behind* the lettering on its own layer, so the controls under "
    + "it — softness, brightness, strength — change the picture without touching the "
    + "words in front of it."],
  Fit: ["Image Fit",
    "What to do when the picture is not the same shape as the area it has to fill.\n\n"
    + "\"Tile\" repeats it like wallpaper, which is what you want for a seamless "
    + "texture such as paper grain or stone. \"Fill the area\" scales it up until it "
    + "covers everything, cropping whatever hangs over the edges — right for a "
    + "photograph. \"Fit inside\" shrinks it until all of it shows, which may leave "
    + "gaps. \"Stretch\" squashes it to fit exactly, and usually looks it."],
  Position: ["Image Position",
    "Which part of the picture to keep when it is bigger than the area, or where to "
    + "anchor it when it is smaller.\n\n"
    + "It matters most with \"Fill the area\", where something always gets cropped. If "
    + "the interesting part of your picture is at the top — a sky, a castle — anchor it "
    + "to the top so that is the part that survives."],
  Blend: ["Image Blending",
    "How the picture mixes with the Fill Color behind it, rather than simply covering "
    + "it up.\n\n"
    + "This is the trick that makes textures work, and it is worth learning one setting: "
    + "**Multiply**. With a grayscale texture over a colored fill, Multiply keeps every "
    + "dark speck of the texture while letting the color show through the light parts — "
    + "so one gray parchment scan can be aged ivory on one style and cold slate on "
    + "another, just by changing the Fill Color under it.\n\n"
    + "\"Normal\" means no mixing at all: the picture simply sits on top and the fill "
    + "beneath it does nothing. Use that when the picture already has the colors you "
    + "want."],
  Opacity: ["Image Strength",
    "How strongly the picture shows through. 100 is the picture at full strength, 0 "
    + "hides it entirely.\n\n"
    + "Because the picture is on its own layer behind the words, turning this down fades "
    + "the picture without fading the lettering. Somewhere between 15 and 40 is usually "
    + "right for a texture that is meant to be felt rather than noticed."]
};

/**
 * Outline family: <prefix>Outline(Width|Color), derived because every section
 * that offers a typeface offers a line around the letters too. The prefix says
 * which lettering, in the same words its own typeface control uses.
 */
const CROWDED_OUTLINE = new Set(GROUPS.flatMap((group) => group.sections.flatMap((section) => {
  const prefixes = new Set(section.fields
    .filter((field) => /OutlineWidth$|^outlineWidth$/.test(field.name))
    // A state's own outline is the same family as the one it stands in for, so
    // it does not make a section crowded — the switch tells them apart.
    .filter((field) => !/^(hover|active)|(Hover|Active)(?=[A-Z])/.test(field.name))
    .map((field) => field.name.replace(/OutlineWidth$/, "")));
  return prefixes.size > 1
    ? section.fields.filter((field) => /Outline(Width|Color)$/.test(field.name)).map((field) => field.name)
    : [];
})));

const OUTLINE_WORD = {
  "": "", heading: "Heading", category: "Category", term: "Term", detail: "Definition",
  header: "Header", caption: "Caption", summary: "Heading",
  // A state's own outline: the switch above the controls says which state, so
  // the label says only what the control is.
  hover: "", active: "",
  // The section is called Opening Capital, so the control says only what it is.
  dropCap: "",
  // A section holding one typeface needs no qualifier either.
  field: "", dropdown: "", settingsBar: "", item: ""
};

// Italic: a tick box beside every thickness control, named for it.
for (const name of names) {
  if (!/TextStyleSlant$|^textStyleSlant$/.test(name)) continue;
  put(`ILLUMINUS.Field.${name}.label`, "Italic");
  put(`ILLUMINUS.Field.${name}.hint`,
    "Slants the lettering, as italics do.\n\n"
    + "It sits beside Text Style rather than inside it because the two are separate "
    + "questions: you can have bold italics, light italics, or plain italics. Tick this "
    + "and set Text Style to Bold and you get both.\n\n"
    + "Used on a whole read-aloud box it is the traditional way to mark text the "
    + "gamemaster reads out; used on a whole page it becomes hard work to read.");
}

for (const name of names) {
  let m;
  if (/TextStyleSlant$|^textStyleSlant$/.test(name)) continue;
  // Outline family: <prefix>Outline(Width|Color).
  if ((m = name.match(/^(.*?)Outline(Width|Color)$/))) {
    const [, rawPrefix, part] = m;
    const prefix = rawPrefix ? rawPrefix[0].toLowerCase() + rawPrefix.slice(1) : "";
    if (prefix in OUTLINE_WORD) {
      const word = OUTLINE_WORD[prefix];
      const of = word ? `${word.toLowerCase()} ` : "";
      const said = word && CROWDED_OUTLINE.has(name) ? `${word} ` : "";
      put(`ILLUMINUS.Field.${name}.label`,
        `${said}Outline ${part === "Width" ? "Thickness" : "Color"}`);
      put(`ILLUMINUS.Field.${name}.hint`, part === "Width"
        ? `Draws a line around the outside of each ${of}letter, in pixels. 0 for none.`
          + "\n\nThis is how you make pale lettering readable on top of a busy "
          + "background picture: a thin dark outline separates the words from whatever "
          + "is behind them, the way a subtitle on a film does.\n\n"
          + "Keep it under about 2. The outline is painted *behind* the letterform "
          + "rather than over it, so it thickens the shape without eating into it — but "
          + "past a certain weight it closes up the gaps in letters like e and a."
        : `What color the outline around each ${of}letter is drawn in.\n\n`
          + "Only shows if the Outline Thickness above is more than 0. A color close "
          + "to the page's own background works best — the outline is meant to hold the "
          + "letters apart from what is behind them, not to be noticed itself.");
      continue;
    }
  }
  // background-image family: <prefix>Texture(|Fit|Position|Blend|Opacity).
  // Only prefixed ones — the Page tab's own set is worded by hand.
  if ((m = name.match(
    /^(.+?)Texture(Fit|Position|Blend|Opacity|Blur|Brightness|Contrast|Saturation|Age)?$/))) {
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
      put(`ILLUMINUS.Field.${name}.hint`,
        `How thick the ${lower} ${what} line is, in pixels. 0 means no line at all on `
        + "that side.\n\n"
        + "You do not have to draw all four. One thick line down the left side and "
        + "nothing anywhere else is the classic look for a read-aloud box, and it is "
        + "quieter than a full frame.");
    } else if (part === "Style") {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Style`);
      put(`ILLUMINUS.Field.${name}.hint`,
        `What kind of line the ${lower} ${what} is drawn as — solid, dashed, dotted, `
        + "double, or one of the ridged and grooved kinds that try to look three-"
        + "dimensional.\n\n"
        + "Solid is right nearly always. Dashed reads as a cut-out or a note to be "
        + "filled in; double suits a formal frame around a title. The ridged ones come "
        + "from very old web design and rarely look good on a printed-page style.");
    } else {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Color`);
      put(`ILLUMINUS.Field.${name}.hint`,
        `What color the ${lower} ${what} line is drawn in.\n\n`
        + "A line that is only slightly darker than the surface it sits on reads as a "
        + "fold or a crease; one in a strong contrasting color reads as a deliberate "
        + "frame. Both are useful — just pick one on purpose.");
    }
    continue;
  }
  // corner family: <prefix><Corner>
  if ((m = name.match(/^(.*?)(TopLeft|TopRight|BottomRight|BottomLeft)$/))) {
    const [, prefix, corner] = m;
    const what = noun(prefix, "");
    put(`ILLUMINUS.Field.${name}.label`, `${CORNER_WORD[corner]} Corner`);
    put(`ILLUMINUS.Field.${name}.hint`,
      `How far the ${CORNER_WORD[corner].toLowerCase()} corner ${what ? `of the ${what} ` : ""}`
      + "is cut away, in pixels. 0 leaves it a sharp right angle.\n\n"
      + "Small numbers — 2 to 6 — read as a printed panel with slightly worn corners. "
      + "Large ones read as a modern app. Corners do not all have to match: rounding "
      + "only the two right-hand corners is a neat way to make a box look like a tab or "
      + "a bookmark.\n\n"
      + "The Corner Shape control below decides *what* the cut looks like — this only "
      + "says how big it is.");
    continue;
  }
  // shadow family: <prefix><OffsetX|OffsetY|Blur|Spread|Color>
  // Shadow family: <prefix>(OffsetX|OffsetY|Blur|Spread|Color). Text shadows
  // are named for the lettering they belong to — captionTextShadow, and so on —
  // so the prefix is matched rather than listed.
  // Any prefix, not a list of them: a shadow and a shading inside the edges are
  // derived beside every background picture, so the families are open-ended.
  if ((m = name.match(/^(\w*?[Ss]hadow)(OffsetX|OffsetY|Blur|Spread|Color)$/))) {
    const [, prefix, part] = m;
    const inner = /[Ii]nnerShadow$/.test(prefix);
    const lettering = /[Tt]extShadow$/.test(prefix);
    const what = NOUN[prefix] ?? (inner ? "inner shading" : lettering ? "text shadow" : "shadow");
    // Where the light is coming from, said in the words somebody who has never
    // read a CSS reference would use. A shadow takes five numbers and none of
    // them mean anything on their own, so each says what it does to the picture
    // the other four are painting.
    const cast = inner
      ? "Inner shading is a shadow cast *inside* the edges, so the surface looks "
        + "slightly sunken — pressed into the page rather than sitting on top of it. "
      : lettering
        ? "A text shadow sits behind the lettering itself. Used gently it lifts words off a busy background; used hard it reads as a printing error. "
        : "A shadow is what makes something look raised off the page rather than printed flat on it. ";
    const text = {
      OffsetX: ["Horizontal Offset",
        `${cast}This is how far it slides to the right, in pixels. `
        + "A negative number slides it left instead.\n\n"
        + "Think of it as where the light is standing. Light from the left throws the "
        + "shadow right, so a positive number here and a positive Vertical Offset "
        + "together read as a lamp up and to the left — which is what most people "
        + "expect, and what almost every printed book uses."],
      OffsetY: ["Vertical Offset",
        `${cast}This is how far it slides down, in pixels. A negative number `
        + "lifts it up instead.\n\n"
        + "Keep it small. Two or three pixels reads as paper lying on a table; twenty "
        + "reads as a sticker floating an inch above it, which is rarely what you want "
        + "on a page people are meant to read."],
      Blur: ["Softness",
        `${cast}This is how fuzzy its edge is. 0 gives a hard-edged shape, like a `
        + "shadow in bright noon sun; a larger number spreads it into a soft haze, "
        + "like an overcast day.\n\n"
        + "If a shadow looks fake, this is usually the reason. Real shadows are softer "
        + "the further the thing sits from what it falls on, so a small offset wants a "
        + "small softness to match."],
      Spread: ["Size",
        `${cast}This grows or shrinks the shadow before it is blurred, so it can be `
        + "bigger or smaller than the thing casting it.\n\n"
        + "Leave it at 0 unless you have a reason. A little negative — say -2 — pulls "
        + "the shadow in so it peeks out only on one side, which is a neat way to get "
        + "a subtle lift without a dark halo all the way round."],
      Color: ["Color",
        `${cast}This is what color it is painted.\n\n`
        + "Pure black almost always looks wrong. Real shadows take a color from what "
        + "they fall on, so on a warm parchment page a dark brown reads far better "
        + "than black. Turn the opacity down too — somewhere around 25% to 40% is "
        + "usually plenty.\n\n"
        + "Set the color fully transparent and there is no shadow at all, which is "
        + "how you switch one off."]
    }[part];
    // The plain label. Where a shadow shares a section, the tab writes a
    // qualified one of its own below.
    put(`ILLUMINUS.Field.${name}.label`, text[0]);
    put(`ILLUMINUS.Field.${name}.hint`, text[1]);
    continue;
  }
  // a turn and a size: <prefix>Turn / <prefix>Scale, in both spellings.
  if ((m = name.match(/^(.*?)([Tt]urn|[Ss]cale)$/)) && !/fold$/i.test(m[1])) {
    const of = noun(m[1], "");
    const turn = m[2].toLowerCase() === "turn";
    put(`ILLUMINUS.Field.${name}.label`, turn ? "Turn" : "Size");
    put(`ILLUMINUS.Field.${name}.hint`, turn
      ? `Tilts ${of ? `the ${of}` : "this"} by a few degrees, the way a photograph `
        + "pinned to a corkboard never sits perfectly straight.\n\n"
        + "Keep it small. One or two degrees reads as a real object placed by hand and "
        + "is genuinely charming; ten degrees reads as a mistake. Negative numbers tilt "
        + "it the other way, and using -1 on some pictures and +1.5 on others stops a "
        + "page of them looking mechanical.\n\n"
        + "0 leaves it perfectly straight."
      : `Draws ${of ? `the ${of}` : "this"} larger or smaller than the room it actually `
        + "takes up on the page. 100 is its normal size.\n\n"
        + "Because the room it occupies does not change, going above 100 makes it "
        + "overhang its neighbors rather than pushing them aside — which is how you "
        + "get a picture that breaks out of its column, or a drop cap that spills into "
        + "the margin.\n\n"
        + "Below 100 it shrinks and leaves a gap around itself. Small steps: 105 is "
        + "noticeable, 150 is a lot.");
    continue;
  }
  // where a part sits: <prefix>Position / <prefix>OffsetTop / <prefix>OffsetLeft,
  // in both spellings — a family with no prefix writes the first letter small.
  if ((m = name.match(/^(.*?)([Pp]osition|[Oo]ffsetTop|[Oo]ffsetLeft)$/))
      && !/texture$/i.test(m[1])) {
    const wording = {
      position: ["How It Sits",
        "Whether this sits wherever the page puts it, or sticks to the screen as the "
        + "page scrolls past it.\n\n"
        + "\"Held in view\" is the interesting one: the thing scrolls along with "
        + "everything else until it reaches the top of the page area, and then it "
        + "stays there while the rest keeps going. A map or a stat box can follow the "
        + "reader down a long section that refers back to it.\n\n"
        + "It needs Nudge Down set to something — that is the distance from the top it "
        + "stops at. Left at 0 it sticks to the very top edge."],
      offsettop: ["Nudge Down",
        "Moves this down from where the page put it, in pixels. A negative number "
        + "moves it up instead.\n\n"
        + "Nothing else shifts to make room — it simply slides, and may end up "
        + "overlapping what is above or below. That is the point: it is how you get a "
        + "heading to sit slightly over a banner, or lift a tag to line up with the "
        + "words beside it.\n\n"
        + "When How It Sits is set to \"Held in view\", this means something "
        + "different: it is how far below the top of the page the thing comes to rest."],
      offsetleft: ["Nudge Right",
        "Moves this to the right of where the page put it, in pixels. A negative "
        + "number moves it left.\n\n"
        + "As with Nudge Down, nothing moves out of the way — it just slides, and can "
        + "overlap its neighbors. A few pixels either way is usually all you want; "
        + "large numbers push things off the page entirely."]
    }[m[2].toLowerCase()];
    put(`ILLUMINUS.Field.${name}.label`, wording[0]);
    put(`ILLUMINUS.Field.${name}.hint`, wording[1]);
    continue;
  }
  // A fill that graduates: <prefix>GradientFrom / To / Angle, one set per fill.
  if ((m = name.match(/^(.*?)[Gg]radient(From|To|Angle)$/))) {
    const of = noun(m[1], "");
    const it = of ? `the ${of}` : "this";
    const wording = {
      From: ["Graduated From",
        `Fades ${it} from one color into another across the shape, instead of one `
        + "flat color throughout. This is the color it starts at.\n\n"
        + "Both ends start fully transparent, which means no fade at all — so nothing "
        + "happens until you set them. Set both and you get a soft wash; set one and "
        + "leave the other clear and it fades away to nothing, which is often the "
        + "better-looking of the two."],
      To: ["Graduated To",
        "The color the fade runs into, at the far end of the direction set below.\n\n"
        + "Leave this and Graduated From both fully transparent for an ordinary flat "
        + "fill."],
      Angle: ["Graduated Direction",
        "Which way the fade runs, as an angle in degrees.\n\n"
        + "180 runs from the top down, which is the usual one — it reads as light "
        + "falling from above. 90 runs from the left across. 0 runs from the bottom "
        + "up, and 135 runs diagonally.\n\n"
        + "This does nothing while both ends are transparent."]
    }[m[2]];
    put(`ILLUMINUS.Field.${name}.label`, wording[0]);
    put(`ILLUMINUS.Field.${name}.hint`, wording[1]);
    continue;
  }
  // frosted glass: <prefix>Frost, one per fill that offers it.
  if ((m = name.match(/^(.*?)[Ff]rost$/))) {
    const of = noun(m[1], "");
    put(`ILLUMINUS.Field.${name}.label`, "Frosting");
    put(`ILLUMINUS.Field.${name}.hint`,
      `Blurs whatever sits behind ${of ? `the ${of}` : "this"}, the way frosted `
      + "bathroom glass blurs what is on the other side of it.\n\n"
      + "It only shows if the fill in front of it is partly see-through — behind a "
      + "solid color there is nothing to see. So this works together with the Fill "
      + "Color's opacity: drop the fill to something like 60% and then frost what is "
      + "behind it, and you get a panel that feels like glass laid over the page "
      + "rather than a hole cut in it.\n\n"
      + "0 turns it off entirely. Six to twelve is usually enough — heavy blurring "
      + "costs the browser real work on every frame.");
    continue;
  }
  // how a picture is cropped: pictureShape / pictureCrop / pictureFrom.
  if ((m = name.match(/^(.*?)[Pp]icture(Shape|Crop|From)$/))) {
    const wording = {
      Shape: ["Picture Shape",
        "Crops every picture wearing this treatment to the same shape, whatever shape "
        + "it started as.\n\n"
        + "This is what makes a page look composed rather than assembled. Half a dozen "
        + "portraits pulled from different places will all be different shapes; set "
        + "them all to Square, or all to Widescreen, and they suddenly look like they "
        + "belong to the same book.\n\n"
        + "Leave it alone and each picture keeps its own shape, which is what a journal "
        + "does now."],
      Crop: ["How It Fills The Shape",
        "What to do when the picture is not the shape you asked for above.\n\n"
        + "\"Crop to fill\" scales it up until it covers the whole shape and trims "
        + "whatever hangs over — the picture stays undistorted, but you lose the edges. "
        + "\"Fit whole inside\" shrinks it until all of it shows, which may leave "
        + "empty bands at the sides. \"Stretch\" squashes it to fit exactly, which "
        + "makes faces look wrong and is almost never what you want.\n\n"
        + "Cropping is the usual choice. Use Which Part Is Kept below to decide what "
        + "survives the trim."],
      From: ["Which Part Is Kept",
        "When a picture is cropped, this says which part of it to keep.\n\n"
        + "It matters most for portraits: crop a tall picture to a wide shape from the "
        + "middle and you often behead the subject. Anchor it to the top instead and "
        + "you keep the face.\n\n"
        + "Only does anything when a Picture Shape is set and the picture is being "
        + "cropped to fill it."]
    }[m[2]];
    put(`ILLUMINUS.Field.${name}.label`, wording[0]);
    put(`ILLUMINUS.Field.${name}.hint`, wording[1]);
    continue;
  }
  // whether long words may be broken: <prefix>Hyphens.
  if ((m = name.match(/^(.*?)[Hh]yphens$/))) {
    const of = noun(m[1], "");
    put(`ILLUMINUS.Field.${name}.label`, "Hyphenation");
    put(`ILLUMINUS.Field.${name}.hint`,
      `Whether a long word${of ? ` in the ${of}` : ""} may be split across two lines `
      + "with a hyphen, the way a printed book does it.\n\n"
      + "It matters in narrow columns. Without hyphenation, one long word that will not "
      + "fit gets pushed to the next line and the browser stretches the gaps on the "
      + "line before to compensate — you end up with rivers of white space running down "
      + "the page. Letting it hyphenate keeps the spacing even.\n\n"
      + "Worth turning on for anything set in columns or in a narrow box; unnecessary "
      + "for full-width paragraphs, where there is room to breathe.");
    continue;
  }
  // where the lines may break: <prefix>Wrap, one per lettering family.
  if ((m = name.match(/^(.*?)[Ww]rap$/)) && !/[Ff]lex$/.test(m[1])) {
    const of = noun(m[1], "");
    put(`ILLUMINUS.Field.${name}.label`, "Line Breaking");
    put(`ILLUMINUS.Field.${name}.hint`,
      `Lets the browser be cleverer about where the lines${of ? ` of the ${of}` : ""} `
      + "break, instead of simply filling each one until it runs out of room.\n\n"
      + "\"Even up the lines\" is for headings. A two-line heading normally comes out "
      + "with eight words on the first line and one on the second; this balances them "
      + "so both lines are about the same length, which looks deliberate rather than "
      + "accidental.\n\n"
      + "\"Avoid a lone last word\" is for paragraphs. It stops a paragraph ending "
      + "with a single word stranded on its own line — printers call that an orphan, "
      + "and once you notice it you cannot stop noticing it.");
    continue;
  }
  // corner shape: <prefix>Shape, one per corner family.
  if ((m = name.match(/^(.*?)[Cc]ornerShape$/))) {
    const of = noun(`${m[1]}Corner`, "");
    put(`ILLUMINUS.Field.${name}.label`, "Corner Shape");
    put(`ILLUMINUS.Field.${name}.hint`,
      `What kind of cut the corners${of ? ` of the ${of}` : ""} are given. They all use `
      + "the four sizes set above — this only changes the shape of the cut.\n\n"
      + "\"Rounded\" is the ordinary curve everyone expects. \"Bevel\" cuts the "
      + "corner off flat, like a mitred picture frame or a cut gemstone — good for "
      + "anything meant to look built rather than printed. \"Notch\" cuts a square "
      + "step out of it. \"Scoop\" curves inward instead of outward, which makes a "
      + "box look like a stamped seal or a torn ticket.\n\n"
      + "If nothing changes when you pick one, the corner sizes above are still 0 — "
      + "there is no cut yet for this to shape.");
    continue;
  }
  // spacing family: <prefix><Side>
  if ((m = name.match(/^(padding|margin|cellPadding|entryPadding|entryMargin|headingPadding|headingMargin|categoryPadding|categoryMargin|codePadding|codeBlockPadding|summaryPadding|collapsiblePadding|toolbarPadding|toolbarButtonPadding|dropdownPadding|fieldPadding|settingsBarPadding|settingsBarMargin|listPadding|itemPadding)(Top|Right|Bottom|Left)$/))) {
    const [, prefix, side] = m;
    // A gap is outside the edge whatever it is a gap around, so the two
    // families are told apart by the word rather than by the whole name.
    if (/^margin$|Margin$/.test(prefix)) {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Gap`);
      put(`ILLUMINUS.Field.${name}.hint`,
        `Empty space ${SIDE_PHRASE[side]} this, on the OUTSIDE of its edge — the room `
        + "between it and whatever else is on the page.\n\n"
        + "This is the one people mix up with padding, so: outer spacing pushes other "
        + "things away, inner spacing pushes its own contents in. If a box is crowding "
        + "the paragraph above it, this is the control you want.\n\n"
        + "A negative number pulls it closer instead, which lets a box overlap what is "
        + "above or below it — occasionally what you want for a heading that should sit "
        + "over a banner.");
    } else {
      put(`ILLUMINUS.Field.${name}.label`, `${side} Padding`);
      put(`ILLUMINUS.Field.${name}.hint`,
        `Empty space ${SIDE_PHRASE[side]} the ${noun(prefix, "contents")}, on the INSIDE `
        + "of its edge — the breathing room between the words and the border around them."
        + "\n\nWithout it, lettering sits right against the edge and looks cramped, the "
        + "way text does when it runs to the very edge of a photocopy. Ten to sixteen is "
        + "comfortable for a read-aloud box; a tight label might want three or four.\n\n"
        + "Not to be confused with outer spacing, which is the room *outside* the edge.");
    }
    continue;
  }
  unmatched.push(name);
}

/* ---------- Remaining fields ---------- */
const FIELD_TEXT = {
  shown: ["Show Title", "Whether the journal's name is drawn above the page at all."],
  entryBackground: ["Fill Color", "The color behind a listed page."],
  entryHoverBackground: ["Fill Color", "The color behind a listed page while the mouse is over it."],
  entryActiveBackground: ["Fill Color", "The color behind the page being read."],
  headingBackground: ["Fill Color", "The color behind a heading listed under a page."],
  toolbarBackground: ["Fill Color", "The color behind the whole strip of editing controls."],
  listBackground: ["Fill Color", "The color behind the list a named control opens."],
  itemFont: ["Typeface", "The lettering on each entry in that list."],
  itemSize: ["Text Size", "How large an entry is drawn. 0 follows the list."],
  itemColor: ["Text Color", "Color of an entry's name."],
  itemBackground: ["Fill Color", "The color behind one entry."],
  itemDividerColor: ["Divider Color", "The line drawn between one run of entries and the next."],
  settingsBarFont: ["Typeface", "The lettering on the strip. Each setting standing on it follows this unless it is given a typeface of its own."],
  settingsBarSize: ["Text Size", "How large that lettering is. 0 follows the window."],
  settingsBarColor: ["Text Color", "Color of that lettering."],
  settingsBarAlign: ["Alignment", "Which edge the settings line up against on the strip."],
  settingsBarCaps: ["Capitals", "Force capital letters on the strip, or use small capitals."],
  settingsBarLetterSpacing: ["Letter Spacing", "Extra space between the letters on the strip."],
  settingsBarWordSpacing: ["Word Spacing", "Extra space between the words on the strip."],
  settingsBarLineHeight: ["Line Spacing", "How tall each row on the strip is. 0 follows the window."],
  settingsBarBackground: ["Fill Color", "The color behind the strip the page's settings stand on."],
  toolbarColor: ["Icon Color", "Color of the icons on the editing bar."],
  toolbarHoverColor: ["Icon Color", "Color of a control while the mouse is over it. Leave empty to keep the ordinary color."],
  toolbarSize: ["Icon Size", "How large each icon on the editing bar is drawn."],
  // The category is named for the icons, so the control says only what it is —
  // as the window's own buttons do in a category named for them.
  toolbarButtonBackground: ["Fill Color", "The color behind one icon, rather than behind the whole strip."],
  toolbarButtonHoverBackground: ["Fill Color", "The color behind an icon while the mouse is over it."],
  dropdownFont: ["Typeface", "The lettering on the two named controls, Format and Illuminus."],
  dropdownSize: ["Text Size", "How large their names are drawn. 0 follows the editing controls."],
  dropdownColor: ["Text Color", "Color of their names."],
  dropdownHoverColor: ["Text Color", "Color of a name while the mouse is over it. Leave empty to keep the ordinary color."],
  dropdownBackground: ["Fill Color", "The color behind a named control."],
  dropdownHoverBackground: ["Fill Color", "The color behind a named control while the mouse is over it."],
  fieldFont: ["Typeface", "The lettering on the settings above the editing controls."],
  fieldSize: ["Text Size", "How large those settings are drawn. 0 follows the window."],
  fieldColor: ["Text Color", "Color of their words."],
  fieldBackground: ["Fill Color", "The color behind a setting's box."],
  fieldCheckColor: ["Tick Box Color", "Color of the empty box. Leave empty to keep the one Foundry draws."],
  fieldCheckTickedColor: ["Ticked Box Color", "Color the box turns once it is ticked."],
  fieldCheckMarkColor: ["Tick Color", "Color of the tick inside the box."],
  fieldCheckSize: ["Tick Box Size", "How large the box is drawn. 0 leaves it the size Foundry draws it."],
  pageButtonAnchor: ["Measured From", "What the two distances are measured from. The page clips whatever scrolls inside it, so a pencil pushed above the page's own top is not drawn there — measured from the window it sits beside the journal's name instead, which needs one page on show rather than a journal read as one long scroll."],
  pageButtonTop: ["Distance From Top", "How far below the top of the page the Edit button sits."],
  pageButtonHoldTop: ["Hold At The Top", "The button stays at the top of the page instead of holding its place on screen as the page scrolls under it, which is what puts Foundry's across a heading half way down."],
  wrapEdges: ["Edges On Both Lines", "A tag long enough to break across two lines is one box in two halves, and a browser draws its edges only at the outer ends. Turn this on to draw both halves whole."],
  gradientFrom: ["Graduated From",
    "Fades the fill from one color into another across the shape, instead of one flat "
    + "color throughout. This is the color it starts at.\n\n"
    + "Both ends start fully transparent, which means no fade at all — so nothing "
    + "happens until you set both this and Graduated To.\n\n"
    + "Keep the two colors close together. A parchment that fades from cream to a "
    + "slightly deeper cream looks like real paper catching the light; one that fades "
    + "from yellow to purple looks like a website from 1998."],
  gradientTo: ["Graduated To",
    "The color the fill fades into, at the far end of the direction set below.\n\n"
    + "Leave both this and Graduated From fully transparent for an ordinary flat fill."],
  gradientAngle: ["Graduated Direction",
    "Which way the fade runs, as an angle in degrees.\n\n"
    + "180 runs from the top down, which is the usual one — it reads as light falling "
    + "from above. 90 runs from the left across. 0 runs from the bottom up, and 135 "
    + "runs diagonally.\n\n"
    + "If you cannot see any fade at all, the two colors above are probably still "
    + "transparent."],
  display: ["Layout",
    "Whether this stacks its contents down the page or lays them out in a row across "
    + "it.\n\n"
    + "Leave it alone and things stack, which is how a page normally reads: one "
    + "paragraph under the next. Change it to \"Row\" and whatever is inside sits "
    + "side by side instead — which is how you build a line of trait tags, a stat "
    + "line, or a two-column aside out of an ordinary box.\n\n"
    + "The five controls under this one only do anything once you have chosen Row. "
    + "Until then they are switched off in all but name."],
  flexDirection: ["Row Direction",
    "Which way a row runs: left to right as you would expect, or reversed, or turned "
    + "on its side to run down the page.\n\n"
    + "Reversed is more useful than it sounds — it flips the order without you having "
    + "to retype anything, so a rarity tag can be made to sit at the end of a line "
    + "that was written with it at the start.\n\n"
    + "Only does anything when Layout is set to Row."],
  flexWrap: ["Row Wrapping",
    "What happens when a row has more in it than fits across the page: everything is "
    + "squashed onto one line, or the overflow drops onto a second line beneath.\n\n"
    + "Let it wrap for anything whose length you do not control — a list of traits on "
    + "a monster might be three items or fifteen. Keep it on one line only when you "
    + "know it is short and want it to stay put.\n\n"
    + "Only does anything when Layout is set to Row."],
  justify: ["Along The Row",
    "Where the spare room in a row goes, once everything in it has been placed.\n\n"
    + "\"Start\" bunches everything to the left and leaves the gap at the end. "
    + "\"Space between\" pushes the first thing hard left and the last hard right "
    + "with the gap shared out in the middle — which is how you get a name on the left "
    + "and a level on the right of the same line. \"Center\" gathers everything in "
    + "the middle with the gap split either side.\n\n"
    + "Only does anything when Layout is set to Row."],
  alignItems: ["Across The Row",
    "How things in a row line up top-to-bottom when they are not all the same "
    + "height.\n\n"
    + "\"Center\" is usually right: a small tag next to a tall one will sit at its "
    + "middle rather than hanging from the top. \"Stretch\" makes them all as tall "
    + "as the tallest, which is how you get a row of boxes with matching heights even "
    + "though one has more words in it. \"Baseline\" lines up the actual lettering, "
    + "which matters when the text sizes differ.\n\n"
    + "Only does anything when Layout is set to Row."],
  gap: ["Gap Between",
    "How much space to leave between the things inside a row, in pixels.\n\n"
    + "Simpler than putting outer spacing on each one, because it only goes *between* "
    + "them and not around the outside. Six to ten pixels usually separates a line of "
    + "tags without them drifting apart.\n\n"
    + "Only does anything when Layout is set to Row."],
  minWidth: ["Least Width",
    "The narrowest this may ever be drawn, in pixels, no matter how little is in it. "
    + "0 lets it shrink to fit its contents.\n\n"
    + "Its real use is making things line up. Give every tag the same least width and "
    + "a column of them will have matching edges even though one says \"Rare\" and "
    + "another says \"Uncommon\"."],
  maxWidth: ["Most Width",
    "The widest this may ever be drawn, in pixels. 0 means no limit.\n\n"
    + "Worth setting on anything holding a lot of text. Lines longer than roughly "
    + "70 or 80 characters get genuinely hard to read — your eye loses its place on "
    + "the way back to the start of the next line — which is why books are narrow and "
    + "newspapers use columns."],
  minHeight: ["Least Height",
    "The shortest this may ever be drawn, in pixels, however little is in it. 0 lets "
    + "it shrink to fit.\n\n"
    + "Useful for keeping a row of boxes even when one of them is nearly empty."],
  maxHeight: ["Most Height",
    "The tallest this may ever be drawn, in pixels. 0 means no limit.\n\n"
    + "Only set this together with What Will Not Fit below, or you will simply cut "
    + "the bottom off whatever is too long."],
  overflow: ["What Will Not Fit",
    "What to do with contents too big for the room this has — which only happens if "
    + "you have limited its width or height above.\n\n"
    + "\"Let it spill out\" lets the contents hang over the edges, ignoring the "
    + "limit. \"Cut it off\" hides anything past the edge, cleanly but permanently — "
    + "a reader has no way to see what was trimmed. \"Let it scroll\" puts a scroll "
    + "bar on it so they can.\n\n"
    + "Cutting off is also what keeps a background picture inside rounded corners "
    + "rather than poking out past them."],
  frameMinWidth: ["Minimum Width", "The narrowest the window may be drawn, however far it is dragged in. 0 lets Foundry decide."],
  frameMaxWidth: ["Maximum Width", "The widest the window may be drawn, however far it is dragged out. 0 lets Foundry decide."],
  foldShown: ["Can Be Folded", "Whether a marker appears for folding this away. A reader clicks it to hide what is under it and clicks again to bring it back; nothing is saved, so a page opens as its author left it."],
  foldIcon: ["Marker", "The shape of the marker a reader clicks to fold."],
  foldColor: ["Marker Color", "Color of the marker. Leave empty to follow the lettering beside it."],
  foldHoverColor: ["Marker Color", "Color of the marker while the mouse is over it. Leave empty to keep the ordinary color."],
  foldSize: ["Marker Size", "How large the marker is. 0 follows the lettering beside it."],
  foldGap: ["Marker Gap", "Space between the marker and the words beside it."],
  foldTurn: ["Marker Turn", "How far the marker turns when what it holds is open. 90 points a sideways arrow downwards."],
  textureBlur: ["Image Softness", IMAGE_TEXT["Blur"][1]],
  textureBrightness: ["Image Brightness", IMAGE_TEXT["Brightness"][1]],
  textureContrast: ["Image Contrast", IMAGE_TEXT["Contrast"][1]],
  textureSaturation: ["Image Color", IMAGE_TEXT["Saturation"][1]],
  textureAge: ["Image Age", IMAGE_TEXT["Age"][1]],
  outlineWidth: ["Outline Thickness", "A line drawn around each letter. Leave at 0 for none."],
  outlineColor: ["Outline Color", "The color of the line drawn around each letter."],
  hoverColor: ["Text Color", "Text color while the mouse is over this. Leave empty to keep the ordinary color."],
  hoverMarkerColor: ["Bullet Color", "Color of the bullet or number while the mouse is over the item. Leave empty to keep the ordinary color."],
  hoverTermColor: ["Term Color", "Text color of a term while the mouse is over it. Leave empty to keep the ordinary color."],
  hoverDetailColor: ["Definition Color", "Text color of a definition while the mouse is over it. Leave empty to keep the ordinary color."],
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
  codeFont: ["Typeface", "The typeface used for code. A fixed-width face keeps columns lined up."],
  codeSize: ["Text Size", "How large code lettering is. 0 follows the page."],
  codeColor: ["Text Color", "Text color of code."],
  codeBackground: ["Fill Color", "The color behind code."],
  codeBorderColor: ["Border Color", "Outline color around code."],
  codeBorderWidth: ["Border Thickness", "How heavy the outline around code is. 0 draws nothing."],
  codeBlockMarginTop: ["Gap Above", "Empty space above a block of code."],
  codeBlockMarginBottom: ["Gap Below", "Empty space below a block of code."],
  termFont: ["Term Typeface", "The typeface used for the term being defined."],
  termSize: ["Term Text Size", "How large the term is. 0 follows the page."],
  termColor: ["Term Color", "Text color of the term being defined."],
  termCaps: ["Term Capitals", "Force capital letters on the term."],
  termSpacingAbove: ["Gap Above Term", "Empty space above each term."],
  detailFont: ["Definition Typeface", "The typeface used for the definition under a term."],
  detailSize: ["Definition Text Size", "How large the definition is. 0 follows the page."],
  detailColor: ["Definition Color", "Text color of the definition under a term."],
  detailIndent: ["Definition Indent", "How far the definition is pushed in from the left."],
  detailSpacingBelow: ["Gap Below Definition", "Empty space under each definition."],
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
  glowOffsetX: ["Glow Horizontal Offset", "How far the glow sits to the right. Negative moves it left."],
  glowOffsetY: ["Glow Vertical Offset", "How far the glow sits below. Negative moves it up."],
  mediaMaxWidth: ["Maximum Width", "How much of the text width a player or embedded page may take."],
  mediaMarginTop: ["Top Gap", "Empty space above a player or embedded page."],
  mediaMarginBottom: ["Bottom Gap", "Empty space below a player or embedded page."],
  revealedBackground: ["Fill Color Once Revealed", "The color behind a secret passage after it has been shown."],
  buttonSize: ["Button Text Size", "How large the lettering on the button is."],
  buttonBorderStyle: ["Button Border Style", "What the line around the button looks like."],
  pageButtonSide: ["Which Side", "The side of the page the pencil sits on."],
  pageButtonOffset: ["Distance from the Edge", "How far in from that side the pencil sits. Raise it to slide the button clear of anything it lands on; negative numbers push it outside the page."],
  numberShown: ["Show Page Numbers", "Whether each listed page carries its number. Leaving them off gives the whole row to the page's name."],
  whenEmpty: ["When Empty", "What happens if this box is left with nothing in it. Hiding it keeps a template tidy when a slot goes unused."],
  lift: ["Lift",
    "Nudges the tag up or down from the line of text it sits in, without moving the "
    + "line itself.\n\n"
    + "Useful because a tag with padding and a background often looks like it is "
    + "sitting slightly too low next to the words around it. A pixel or two up usually "
    + "settles it. Negative numbers push it down."],
  minWidth: ["Least Width", "The narrowest this can be, so a row of short tags lines up. 0 lets it shrink to its words."],
  texture: ["Background Image", IMAGE_TEXT[""][1]],
  textureFit: ["Image Fit", IMAGE_TEXT["Fit"][1]],
  texturePosition: ["Image Position", IMAGE_TEXT["Position"][1]],
  textureAttachment: ["Image Scrolling", "Whether the background image scrolls with the text or stays put."],
  textureBlend: ["Image Blending", IMAGE_TEXT["Blend"][1]],
  textureOpacity: ["Image Strength", IMAGE_TEXT["Opacity"][1]],
  maxWidth: ["Maximum Text Width", "Stops lines growing too long to read comfortably. Set to 0 for no limit."],
  font: ["Typeface",
    "Which lettering this is set in.\n\n"
    + "The list is whatever Foundry knows about, so to add your own — a proper display "
    + "face for chapter openings, say — install it under Foundry's Configure Font "
    + "Families menu and it will appear here.\n\n"
    + "Two typefaces on a page is plenty: one with character for headings, one plain "
    + "and comfortable for the body. Three or more starts to look like a ransom note."],
  size: ["Text Size",
    "How large the lettering is, in pixels.\n\n"
    + "Leave it at 0 to use whatever the page is already using — which is usually what "
    + "you want, because then everything stays in proportion if you change the page's "
    + "own size later.\n\n"
    + "For body text, 14 to 17 is comfortable on a screen. Much smaller and people lean "
    + "in; much larger and a paragraph stops fitting in the window."],
  color: ["Text Color", "Color of the lettering."],
  textStyle: ["Text Style", "How the lettering looks \u2014 its weight and whether it is italic."],
  activeTextStyle: ["Text Style", "How the entry for the page being read looks."],
  numberTextStyle: ["Text Style", "How the numbers beside page entries look."],
  headingTextStyle: ["Text Style", "How headings look."],
  categoryTextStyle: ["Text Style", "How a category row looks."],
  headerTextStyle: ["Text Style", "How the lettering in a header row looks."],
  captionTextStyle: ["Text Style", "How caption lettering looks."],
  caps: ["Capitals",
    "Changes the case the lettering is drawn in, without changing what was actually "
    + "typed.\n\n"
    + "\"Small capitals\" is the one worth knowing: every letter becomes a capital, "
    + "but the ones that were lower-case are drawn shorter. It is what printed books "
    + "use for the first line of a chapter, and it looks considered in a way that plain "
    + "ALL CAPS does not.\n\n"
    + "Full capitals shout, and get tiring over more than a few words — fine for a "
    + "short heading or a tag, poor for a paragraph."],
  letterSpacing: ["Letter Spacing",
    "Adds space between every letter, in pixels. Negative numbers pull them together.\n\n"
    + "A little goes a very long way. Half a pixel to two pixels opens a heading out "
    + "and makes it feel calm and expensive — this is what most book covers do. Five "
    + "pixels makes it unreadable.\n\n"
    + "Body text almost never wants this; it is a heading and small-capitals control."],
  wordSpacing: ["Word Spacing",
    "Adds space between words, on top of the ordinary gap. Negative numbers tighten "
    + "them up.\n\n"
    + "Rarely needed, and easy to overdo — the eye reads groups of words, and pushing "
    + "them too far apart breaks a line into a list of separate things. Occasionally "
    + "useful on a short, widely letter-spaced heading, where the ordinary word gap "
    + "starts to look too small by comparison."],
  lineHeight: ["Line Spacing",
    "How far apart the lines within a paragraph sit. It is a multiple of the text size "
    + "rather than a pixel measurement, so 1.5 means one and a half times the height of "
    + "the lettering.\n\n"
    + "This is the single biggest thing you can change to make a wall of text readable. "
    + "1.4 to 1.6 is comfortable for long reading; anything under 1.2 makes lines run "
    + "into each other and the eye lose its place.\n\n"
    + "Headings want less than body text — around 1.1 — because their lines are short "
    + "and large, and the default spacing leaves them looking disconnected. Leave it at "
    + "0 to use the page's own setting."],
  align: ["Alignment",
    "Which edge the lines are lined up against.\n\n"
    + "\"Left\" is the default and the right answer for nearly all body text: every "
    + "line starts in the same place, so your eye knows where to go. \"Center\" suits "
    + "a title or a short caption and is hard work for anything longer, since every "
    + "line starts somewhere different.\n\n"
    + "\"Justify\" straightens both edges by stretching the spaces, which is what "
    + "books do — but books also hyphenate. If you justify, turn Hyphenation on too, or "
    + "you will get ugly gaps."],
  firstLineIndent: ["First Line Indent",
    "Pushes the first line of every paragraph inward, the way a printed novel does.\n\n"
    + "It is the traditional alternative to leaving a blank line between paragraphs — "
    + "books use one or the other, rarely both. If your paragraphs already have clear "
    + "space between them, this will look like a mistake.\n\n"
    + "Around 16 to 24 is the usual amount. The very first paragraph after a heading is "
    + "left alone, as it should be."],
  whiteSpace: ["Line Wrapping", "Whether long lines wrap, and whether extra spaces are kept."],
  wordBreak: ["Word Splitting", "Whether very long words may be broken across lines."],
  columnCount: ["Number of Columns",
    "Sets this run of text in columns, the way a printed adventure does.\n\n"
    + "1 leaves it running the full width. 2 is the usual choice for a dense section — "
    + "shorter lines are easier to read, which is why newspapers have always done it. "
    + "3 or more only works on a wide window.\n\n"
    + "This belongs to the heading above the text, not to the page: a chapter opening "
    + "can run full width while the section beneath it sets in two columns. Turn "
    + "Hyphenation on as well — narrow columns need it."],
  columnGap: ["Gap Between Columns", "Empty space separating one column from the next."],
  columnRuleWidth: ["Divider Thickness", "A vertical line drawn between columns. 0 draws nothing."],
  columnRuleStyle: ["Divider Style", "What the line between columns looks like."],
  columnRuleColor: ["Divider Color", "Color of the line between columns."],
  dropCap: ["Opening Capital",
    "Enlarges the very first letter of the page so it spans several lines of the "
    + "paragraph beside it — the illuminated capital that gives this module its name."
    + "\n\nChoose how many lines tall it should be. Three is the traditional height "
    + "and the safest; five is dramatic and needs a long enough first paragraph to sit "
    + "against, or it hangs off the bottom.\n\n"
    + "It is a real letter rather than a typographic trick, so everything else under "
    + "Opening Capital applies to it — its own typeface, color, outline and shadow. "
    + "Setting it in a display face while the rest of the page stays plain is the whole "
    + "effect."],
  dropCapFont: ["Opening Capital Typeface", "The typeface used for the opening capital. Leave as the journal's normal typeface to match the body."],
  dropCapColor: ["Opening Capital Color", "Color of that enlarged first letter."],

  decorationLine: ["Line", "Whether links are underlined, struck through, or left plain."],
  decorationStyle: ["Line Style", "What the link's line looks like."],
  decorationColor: ["Line Color", "Color of the link's line. May differ from the text itself."],
  decorationThickness: ["Line Thickness", "How heavy the link's line is."],
  decorationOffset: ["Line Distance", "How far the line sits from the lettering."],
  bullet: ["Bullet Shape",
    "The mark drawn in front of each item in a bulleted list.\n\n"
    + "The unusual ones are worth a look: a diamond or a dash reads quite differently "
    + "from the ordinary round dot, and can tie a list to the rest of a style. "
    + "\"None\" removes the mark entirely, which is how you make a list of items that "
    + "should not look like a list — a row of trait tags, say."],
  numberStyle: ["Number Style", "How items are numbered in a numbered list."],
  markerSize: ["Bullet Size", "How large bullets and item numbers are. 0 follows the text."],
  markerColor: ["Bullet Color", "Color of bullets and item numbers."],
  markerFont: ["Bullet Typeface", "The typeface used for bullets and item numbers."],
  indent: ["Indent", "How far a list is pushed in from the left."],
  itemSpacing: ["Spacing Between Items", "Gap between one list item and the next."],
  textColor: ["Text Color", "Text color in ordinary cells."],
  verticalAlign: ["Vertical Position",
    "Where the contents of a table cell sit, top to bottom, when the row is taller than "
    + "they are.\n\n"
    + "\"Top\" is right for most tables: when one cell has three lines and its "
    + "neighbors have one, you want them all starting at the same height so the row "
    + "reads across. \"Middle\" suits short entries like numbers or single words."],
  width: ["Table Width",
    "How much of the width across the page this takes up.\n\n"
    + "Only interesting together with Float above. A half-width floated box leaves half "
    + "the page for text to wrap around it; a full-width one leaves none, so nothing "
    + "can sit beside it however it is floated."],
  headerBackground: ["Fill Color", "Background of the top row of a table."],
  headerColor: ["Text Color", "Text color in the top row of a table."],
  headerFont: ["Typeface", "The typeface used in the top row of a table."],
  headerSize: ["Text Size", "How large the top row's lettering is."],
  headerWeight: ["Thickness", "How heavy the top row's lettering is."],
  headerCaps: ["Capitals", "Force capital letters in the top row, or use small capitals."],
  headerAlign: ["Alignment", "Which edge the top row's text lines up against."],
  headerLetterSpacing: ["Letter Spacing", "Extra space between letters in the top row."],
  headerWordSpacing: ["Word Spacing", "Extra space between words in the top row. Useful where a heading is set in capitals and the words run together."],
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
  dividerMarginTop: ["Gap Above", "Space between a divider and what comes before it."],
  dividerMarginBottom: ["Gap Below", "Space between a divider and what comes after it."],

  float: ["Float",
    "Lets the text of the page flow around this instead of stopping for it.\n\n"
    + "Floated left, the box sits against the left margin and the paragraphs wrap down "
    + "its right-hand side — exactly how a printed adventure sets a sidebar or a "
    + "portrait. Without it the box takes the full width and the text starts again "
    + "underneath.\n\n"
    + "Set a Width below as well, or there is no room left for the text to wrap into."],
  width: ["Width",
    "How much of the width across the page this takes up.\n\n"
    + "Only interesting together with Float above. A half-width floated box leaves half "
    + "the page for text to wrap around it; a full-width one leaves none, so nothing "
    + "can sit beside it however it is floated."],
  clear: ["Start Below",
    "Pushes this down until it is past anything already floating beside it, instead of "
    + "sliding up alongside.\n\n"
    + "Use it when two floated boxes end up stacked next to each other and you wanted "
    + "one below the other, or when a heading gets pulled up beside a picture it is "
    + "supposed to come after."],
  flip: ["Mirror", "Flip the picture, so an illustration can face into the page."],
  headingFont: ["Typeface", "The typeface for headings inside this block."],
  headingSize: ["Text Size", "Size of headings inside this box. 0 follows the page."],
  headingColor: ["Text Color", "Color of headings inside this box. Leave empty to follow the page."],
  headingWeight: ["Thickness", "How heavy headings inside this block are."],
  headingCaps: ["Capitals", "Capitalization of headings inside this block."],
  headingAlign: ["Alignment", "Which edge headings inside this block line up against."],
  headingMarginTop: ["Gap Above", "Space above a heading inside this box."],
  headingMarginBottom: ["Gap Below", "Space below a heading inside this box."],
  headingRuleWidth: ["Rule Thickness", "A line above each heading inside this block. 0 draws nothing."],
  headingRuleStyle: ["Rule Style", "What the line above a heading looks like."],
  headingRuleColor: ["Rule Color", "Color of the line above a heading."],

  sidebarWidth: ["Panel Width", "How wide the contents panel is."],
  titleBarBackground: ["Fill Color", "Color of the strip across the top of the window."],
  headerButtonColor: ["Icon Color", "Color of the title bar's icon buttons."],
  headerButtonHoverColor: ["Icon Color", "Icon color while the mouse is over a title bar button."],
  headerButtonBackground: ["Fill Color", "Color behind the title bar's icon buttons."],
  headerButtonHoverBackground: ["Fill Color", "Color behind a title bar button while the mouse is over it."],
  headerButtonSize: ["Icon Size", "How large the title bar's icons are."],
  pageButtonColor: ["Icon Color", "Color of the edit pencil."],
  pageButtonHoverColor: ["Icon Color", "Color of the edit pencil while the mouse is over it."],
  pageButtonBackground: ["Fill Color", "Color behind the edit pencil."],
  pageButtonHoverBackground: ["Fill Color", "Color behind the edit pencil while the mouse is over it."],
  pageButtonSize: ["Icon Size", "How large the edit pencil is."],
  hoverBackground: ["Fill Color", "Color behind an entry while the mouse is over it."],
  activeColor: ["Text Color", "Text color of the page you are reading."],
  activeBackground: ["Fill Color", "Color behind the page you are reading."],
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
  headingHoverColor: ["Text Color", "Color a sub-heading turns when the mouse is over it."],
  headingIndent: ["Indent", "How far the sub-headings are pushed in from the left."],
  headingLineHeight: ["Line Spacing", "How tall each sub-heading row is."],
  categoryFont: ["Typeface", "The typeface used for category headers."],
  categorySize: ["Text Size", "How large category headers are."],
  categoryColor: ["Text Color", "Color of category headers."],
  categoryWeight: ["Thickness", "How heavy category headers are."],
  categoryCaps: ["Capitals", "Force capital letters in category headers, or use small capitals."],
  iconColor: ["Icon Color", "Color of the little mark in front of a link — the figure beside a "
    + "character's name, the dice beside a roll. Foundry puts one there for links to things in "
    + "your world, and drags one in when you drop a record into a page. Leave this empty and it "
    + "takes the link's own color, which is what it does now."],
  categoryLetterSpacing: ["Letter Spacing", "Extra space between letters in category headers."],
  categoryWordSpacing: ["Word Spacing", "Extra space between words in category headers. Useful where a heading is set in capitals and the words run together."],
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
  buttonHoverColor: ["Text Color", "Text color while the mouse is over a button."],
  buttonHoverBackground: ["Fill Color", "Color inside a button while the mouse is over it."],
  buttonHoverBorderColor: ["Border Color", "Edge color while the mouse is over a button."]
};
for (const [name, [label, hint]] of Object.entries(FIELD_TEXT)) {
  put(`ILLUMINUS.Field.${name}.label`, label);
  put(`ILLUMINUS.Field.${name}.hint`, hint);
}
/**
 * A state's own control says what its ordinary twin says.
 *
 * The switch above it already names the state, so "Outline Thickness" under
 * Hovered is the whole of what needs saying — and it stays in step with the
 * ordinary control's wording for free. Anything named by hand above keeps that
 * wording; this is only for the ones derived from the schema.
 */
const stateStem = withoutState;
for (const name of unmatched) {
  if (name in FIELD_TEXT) continue;
  const stem = stateStem(name);
  const label = stem && out[`ILLUMINUS.Field.${stem}.label`];
  const hint = stem && out[`ILLUMINUS.Field.${stem}.hint`];
  if (!label) continue;
  put(`ILLUMINUS.Field.${name}.label`, label);
  put(`ILLUMINUS.Field.${name}.hint`, hint);
}

/* ---------- Shadows that share a section say which shadow they are ---------- */
/**
 * Whose shadow it is, where a category holds more than one lettering's.
 *
 * A definition list sets a term and its definition in the same category and both
 * cast one, so "Shadow Softness" twice says nothing about which. Where a
 * category holds a single lettering shadow, the category already says whose it
 * is and the shorter label is the better one.
 */
/*
 * Which lettering casts a shadow, where a tab letters more than one thing.
 *
 * Separate from the outline words above, which are deliberately empty for a
 * category holding a single typeface: an outline sits beside its own typeface
 * and needs no qualifier, while a shadow is read against every other shadow on
 * the tab. Where the outline word would say nothing, or would say what another
 * part on the same tab already says, this names the part as its own category
 * does — the disclosure line is a Heading inside the Collapsible category and
 * also a Heading inside Headings Inside, and one of the two has to give.
 */
const SHADOW_WORD = {
  summary: "Disclosure",
  settingsBar: "Bar", field: "Setting",
  dropdown: "Control", item: "Entry"
};

const SHADOW_OWNERS = new Map();
for (const group of GROUPS) {
  // Asked of the whole tab rather than of one category. A tab's categories are
  // read together — the tree lists them, the search box crosses them — so three
  // categories each holding a lettering shadow gave three runs all called
  // "Shadow", which is what the Tables tab did. Which lettering casts it is the
  // only thing that tells them apart.
  const families = new Set(groupFields(group).map((field) => field.name)
    .filter(isShadow).map((name) => ordinaryName(name).replace(PARTS, "")));
  const lettering = [...families].filter((family) => /[Tt]extShadow$/.test(family));
  if (lettering.length < 2) continue;
  for (const family of lettering) {
    const part = family.replace(/TextShadow$/, "");
    SHADOW_OWNERS.set(`${group.family ?? group.id}.${family}`,
      SHADOW_WORD[part] ?? OUTLINE_WORD[part] ?? "");
  }
}

for (const key of SHARED_SHADOW) {
  const [tab, name] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
  const plain = out[`ILLUMINUS.Field.${name}.label`];
  if (!plain) continue;
  const family = ordinaryName(name).replace(PARTS, "");
  // A lettering shadow says so. It used to say "Shadow" and no more, which put
  // it beside an Inner Shadow and an Outer Shadow on the same tab with nothing
  // to tell it from either — and where a tab lettered several things, three
  // runs answered to the one word. Which lettering casts it comes first where
  // a tab has more than one.
  const owner = SHADOW_OWNERS.get(`${tab}.${family}`);
  const lead = /[Ii]nnerShadow$/.test(family) ? "Inner Shadow "
    : /[Tt]extShadow$/.test(family) ? `${owner ? `${owner} ` : ""}Text Shadow ` : "Outer Shadow ";
  put(`ILLUMINUS.Field.${tab}.${name}.label`, `${lead}${plain}`);
  put(`ILLUMINUS.Field.${tab}.${name}.hint`, out[`ILLUMINUS.Field.${name}.hint`]);
}

const stillMissing = unmatched.filter((n) => !(n in FIELD_TEXT)
  && !(`ILLUMINUS.Field.${n}.label` in out));
if (stillMissing.length) {
  console.error("No wording for: " + stillMissing.join(", "));
  process.exit(1);
}
put("ILLUMINUS.Field.font.inherit", "Use the journal's normal typeface");
put("ILLUMINUS.Field.texture.placeholder", "No picture");

/* ---------- Choices ---------- */
const CHOICE_TEXT = {
  // The three answers a state's own tick box has: its own yes, its own no, and
  // whichever the ordinary one gave.
  same: "Same as normal", on: "Yes", off: "No",
  // Where the lines of a run of words may break.
  balance: "Even up the lines", pretty: "Avoid a lone last word",
  // Whether long words may be broken with a hyphen.
  neverBreak: "Only where one is asked for", breakAsNeeded: "Where a word needs it",
  // How a part sits on the page.
  asPlaced: "Where the page puts it", heldInView: "Held in view while the page scrolls",
  ownShape: "The picture's own shape",
  // The shape a picture is cropped to, and how it fills it.
  square: "Square", landscape: "Landscape", portrait: "Portrait",
  wide: "Widescreen", tall: "Tall", panorama: "Panorama",
  cover: "Crop to fill", contain: "Fit whole inside", stretch: "Stretch to fit",
  // How a thing is laid out, in the words a person would use for it.
  block: "A block of its own", inline: "Part of the line of text",
  inlineBlock: "In the line, but a block", flex: "A row of what is inside it",
  inlineFlex: "A row, in the line of text", grid: "A grid",
  row: "Left to right", rowReverse: "Right to left",
  column: "Top to bottom", columnReverse: "Bottom to top",
  nowrap: "Stay on one line", wrap: "Move onto another line",
  wrapReverse: "Move onto another line, upwards",
  start: "Packed at the start", end: "Packed at the end",
  between: "Spread apart", around: "Spread, with room at the ends",
  evenly: "Spread evenly", stretch: "Stretched to match",
  baseline: "Lined up on the lettering",
  visible: "Let it show", hidden: "Cut it off", auto: "Let it scroll",
  scroll: "Always leave room to scroll",
  static: "Where it falls", relative: "Nudged from where it falls",
  sticky: "Held in view while scrolling",
  // The shapes a corner can be cut to. Plain words rather than the CSS ones:
  // "bevel" and "squircle" are jargon outside a stylesheet.
  round: "Rounded", bevel: "Cut off", notch: "Notched", scoop: "Scooped out",
  squircle: "Softened square",
  // What the Edit pencil's distances are measured from.
  page: "The page", window: "The window",
  chevron: "Chevron", caret: "Solid triangle", angle: "Thin angle", arrow: "Arrow", plus: "Plus",
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

/* ---------- Two controls in one category answering to one name ---------- */

/*
 * A category may hold two of a thing — the line that folds a collapsible and the
 * block it folds, a term and its definition — and then each of their controls
 * needs to say which it belongs to. Most already do, because the wording for a
 * typeface or a color is built from the part's own name: "Heading Typeface"
 * beside "Fill Color", "Term Color" beside "Definition Color". But a family
 * whose wording is written without reference to the part — a padding, a
 * gradient, a frosting — came out the same for both, and a category showed two
 * controls called "Top Padding" with nothing to tell them apart.
 *
 * Swept here rather than fixed family by family, so a family added next year is
 * covered without anyone remembering. Only a part with a word of its own is
 * qualified: where one has none the other's qualifier is enough to tell them
 * apart, which is the same bargain an outline strikes when a category holds a
 * single typeface. `validate.mjs` [14] fails if a clash is left over.
 */
{
  const wordFor = (prefix) => OUTLINE_WORD[prefix] ?? SHADOW_WORD[prefix] ?? "";
  const shared = (names) => {
    // What the colliding names have in common at the end is the control; what
    // is left in front of it is the part.
    let keep = 0;
    outer: while (keep < names[0].length) {
      const at = names[0].length - 1 - keep;
      for (const other of names) {
        if (other[other.length - 1 - keep] !== names[0][at]) break outer;
      }
      keep += 1;
    }
    return keep;
  };
  for (const group of GROUPS) {
    const key = group.family ?? group.id;
    for (const section of group.sections) {
      const byLabel = new Map();
      for (const field of section.fields) {
        if (/^(hover|active)[A-Z]/.test(field.name)) continue;
        const label = out[`ILLUMINUS.Field.${key}.${field.name}.label`]
          ?? out[`ILLUMINUS.Field.${field.name}.label`];
        if (!label) continue;
        if (!byLabel.has(label)) byLabel.set(label, []);
        byLabel.get(label).push(field.name);
      }
      for (const [label, names] of byLabel) {
        if (names.length < 2) continue;
        const tail = shared(names);
        for (const name of names) {
          const prefix = name.slice(0, name.length - tail);
          const word = wordFor(prefix);
          if (!word) continue;
          put(`ILLUMINUS.Field.${key}.${name}.label`, `${word} ${label}`);
          const hint = out[`ILLUMINUS.Field.${key}.${name}.hint`]
            ?? out[`ILLUMINUS.Field.${name}.hint`];
          if (hint) put(`ILLUMINUS.Field.${key}.${name}.hint`, hint);
        }
      }
    }
  }
}

/* ---------- The same controls in CSS's own words ---------- */

/*
 * Illuminus names everything in plain language on purpose, and this is the
 * other half of that bargain: somebody who already writes CSS can switch the
 * editor into the vocabulary they know. The wording is read out of the
 * stylesheets rather than written here — see `tools/css-names.mjs` — so a rule
 * that changes takes its wording with it.
 *
 * Keyed like every other label, by the control's own name, with a tab's own key
 * where one tab means something different by it: the contents panel holds two
 * controls feeding `color`, so there one of them has to say which.
 */
{
  const css = ["styles/illuminus.css", "styles/illuminus-generated.css"]
    .map((file) => fs.readFileSync(`${ROOT}/${file}`, "utf8")).join("\n");
  const { names, missing: unnamed } = cssNames(GROUPS, css, cssVarFor);
  if (unnamed.length) {
    console.error("NO CSS WORDING FOR:\n  " + unnamed.slice(0, 20).join("\n  "));
    process.exit(1);
  }

  // What each control writes, per tab, and what it writes most often.
  const said = new Map();
  for (const group of GROUPS) {
    for (const field of groupFields(group)) {
      const wording = names.get(`${group.id}.${field.name}`);
      if (!wording) continue;
      if (!said.has(field.name)) said.set(field.name, new Map());
      const perTab = said.get(field.name);
      if (!perTab.has(wording)) perTab.set(wording, []);
      perTab.get(wording).push(group.family ?? group.id);
    }
  }

  let specific = 0;
  for (const [name, perTab] of said) {
    const ranked = [...perTab.entries()].sort((a, b) => b[1].length - a[1].length);
    const [common] = ranked[0];
    put(`ILLUMINUS.Field.${name}.css`, common);
    for (const [wording, tabs] of ranked.slice(1)) {
      for (const tab of new Set(tabs)) {
        put(`ILLUMINUS.Field.${tab}.${name}.css`, wording);
        specific += 1;
      }
    }
  }
  console.log(`css wording: ${said.size} controls, ${specific} with a tab of their own`);
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(`${ROOT}/lang/en.json`, JSON.stringify(sorted, null, 2) + "\n");
console.log(`wrote ${Object.keys(sorted).length} strings`);
