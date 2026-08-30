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
 * travels under the repository's license, which is why these carry no artwork:
 * every picture they could point at would have to be licensable that way too.
 *
 * Built against schema version 12.
 */

export const PRESETS = [
  {
    "id": "preset-default-basic",
    "name": "Default Basic",
    "description": "An Example that preserves Foundry's native Journal look, while extending your layout options",
    "settings": {
      "sidebarEntries": {
        "entryBackground": "#00000000"
      },
      "sidebarHeadings": {
        "headingIndent": 16,
        "headingBackground": "#00000000"
      },
      "sidebarCategories": {
        "categoryBackground": "#00000000"
      },
      "sidebarSearch": {
        "searchColor": "",
        "searchBackground": "#00000000",
        "searchBorderTopWidth": 0,
        "searchBorderBottomWidth": 0,
        "searchBorderLeftWidth": 0,
        "searchBorderRightWidth": 0,
        "searchCornerTopLeft": 3,
        "searchCornerTopRight": 3,
        "searchCornerBottomLeft": 3,
        "searchCornerBottomRight": 3
      },
      "sidebarButtons": {
        "buttonBackground": "#00000000",
        "buttonCornerTopLeft": 3,
        "buttonCornerTopRight": 3,
        "buttonCornerBottomLeft": 3,
        "buttonCornerBottomRight": 3
      },
      "window": {
        "textStyle": "bold",
        "titleBarBackground": "#00000000",
        "paddingLeft": 0,
        "paddingRight": 0,
        "headerButtonBackground": "#00000000",
        "headerButtonCornerTopLeft": 3,
        "headerButtonCornerTopRight": 3,
        "headerButtonCornerBottomLeft": 3,
        "headerButtonCornerBottomRight": 3,
        "pageButtonBackground": "#0b0a1380"
      },
      "page": {
        "cornerTopLeft": 0,
        "cornerTopRight": 0,
        "cornerBottomLeft": 0,
        "cornerBottomRight": 0
      },
      "body": {
        "marginTop": 0,
        "highlightBackground": "#e8c979",
        "codeBackground": "#00000000"
      },
      "secrets": {
        "revealedBackground": "#0035000d",
        "buttonBackground": "#00000000"
      },
      "boxes": {
        "summaryBackground": "#00000000",
        "collapsibleBackground": "#00000000"
      },
      "editor": {
        "titleBarBackground": "#00000000",
        "textStyle": "bold",
        "paddingLeft": 0,
        "paddingRight": 0,
        "headerButtonBackground": "#00000000",
        "headerButtonCornerTopLeft": 3,
        "headerButtonCornerTopRight": 3,
        "headerButtonCornerBottomLeft": 3,
        "headerButtonCornerBottomRight": 3
      },
      "editorSettingsBar": {
        "settingsBarBackground": "#00000000",
        "fieldBackground": "#00000000",
        "fieldBorderTopWidth": 0,
        "fieldBorderRightWidth": 0,
        "fieldBorderBottomWidth": 0,
        "fieldBorderLeftWidth": 0,
        "fieldCornerTopLeft": 0,
        "fieldCornerTopRight": 0,
        "fieldCornerBottomRight": 0,
        "fieldCornerBottomLeft": 0,
        "fieldPaddingRight": 0,
        "fieldPaddingLeft": 0
      },
      "editorDropdowns": {
        "dropdownBackground": "#00000000",
        "dropdownCornerTopLeft": 0,
        "dropdownCornerTopRight": 0,
        "dropdownCornerBottomRight": 0,
        "dropdownCornerBottomLeft": 0,
        "dropdownPaddingTop": 0,
        "dropdownPaddingRight": 0,
        "dropdownPaddingBottom": 0,
        "dropdownPaddingLeft": 0,
        "listBackground": "#00000000",
        "itemBackground": "#00000000"
      },
      "editorToolbar": {
        "toolbarBackground": "#00000000",
        "toolbarPaddingTop": 0,
        "toolbarPaddingBottom": 0,
        "toolbarPaddingLeft": 0,
        "toolbarPaddingRight": 0,
        "toolbarCornerTopLeft": 0,
        "toolbarCornerTopRight": 0,
        "toolbarCornerBottomLeft": 0,
        "toolbarCornerBottomRight": 0,
        "toolbarButtonBackground": "#00000000",
        "toolbarButtonPaddingLeft": 0,
        "toolbarButtonPaddingRight": 0,
        "toolbarButtonCornerTopLeft": 0,
        "toolbarButtonCornerTopRight": 0,
        "toolbarButtonCornerBottomLeft": 0,
        "toolbarButtonCornerBottomRight": 0
      }
    },
    "labels": {},
    "swatches": []
  },
  {
    "id": "preset-fantasy-basic",
    "name": "Fantasy Basic",
    "description": "An Example Fantasy Theme",
    "settings": {
      "sidebarEntries": {
        "entryBackground": "#00000000"
      },
      "sidebarHeadings": {
        "headingIndent": 16,
        "headingBackground": "#00000000"
      },
      "sidebarCategories": {
        "categoryBackground": "#00000000"
      },
      "sidebarSearch": {
        "searchColor": "",
        "searchBackground": "#00000000",
        "searchBorderTopWidth": 0,
        "searchBorderBottomWidth": 0,
        "searchBorderLeftWidth": 0,
        "searchBorderRightWidth": 0,
        "searchCornerTopLeft": 3,
        "searchCornerTopRight": 3,
        "searchCornerBottomLeft": 3,
        "searchCornerBottomRight": 3
      },
      "sidebarButtons": {
        "buttonBackground": "#00000000",
        "buttonCornerTopLeft": 3,
        "buttonCornerTopRight": 3,
        "buttonCornerBottomLeft": 3,
        "buttonCornerBottomRight": 3
      },
      "window": {
        "textStyle": "bold",
        "titleBarBackground": "#00000000",
        "paddingLeft": 0,
        "paddingRight": 0,
        "headerButtonBackground": "#00000000",
        "headerButtonCornerTopLeft": 3,
        "headerButtonCornerTopRight": 3,
        "headerButtonCornerBottomLeft": 3,
        "headerButtonCornerBottomRight": 3,
        "pageButtonBackground": "#0b0a1380"
      },
      "page": {
        "cornerTopLeft": 0,
        "cornerTopRight": 0,
        "cornerBottomLeft": 0,
        "cornerBottomRight": 0
      },
      "body": {
        "marginTop": 0,
        "highlightBackground": "#e8c979",
        "codeBackground": "#00000000"
      },
      "secrets": {
        "revealedBackground": "#0035000d",
        "buttonBackground": "#00000000"
      },
      "boxes": {
        "summaryBackground": "#00000000",
        "collapsibleBackground": "#00000000"
      },
      "editor": {
        "titleBarBackground": "#00000000",
        "textStyle": "bold",
        "paddingLeft": 0,
        "paddingRight": 0,
        "headerButtonBackground": "#00000000",
        "headerButtonCornerTopLeft": 3,
        "headerButtonCornerTopRight": 3,
        "headerButtonCornerBottomLeft": 3,
        "headerButtonCornerBottomRight": 3
      },
      "editorSettingsBar": {
        "settingsBarBackground": "#00000000",
        "fieldBackground": "#00000000",
        "fieldBorderTopWidth": 0,
        "fieldBorderRightWidth": 0,
        "fieldBorderBottomWidth": 0,
        "fieldBorderLeftWidth": 0,
        "fieldCornerTopLeft": 0,
        "fieldCornerTopRight": 0,
        "fieldCornerBottomRight": 0,
        "fieldCornerBottomLeft": 0,
        "fieldPaddingRight": 0,
        "fieldPaddingLeft": 0
      },
      "editorDropdowns": {
        "dropdownBackground": "#00000000",
        "dropdownCornerTopLeft": 0,
        "dropdownCornerTopRight": 0,
        "dropdownCornerBottomRight": 0,
        "dropdownCornerBottomLeft": 0,
        "dropdownPaddingTop": 0,
        "dropdownPaddingRight": 0,
        "dropdownPaddingBottom": 0,
        "dropdownPaddingLeft": 0,
        "listBackground": "#00000000",
        "itemBackground": "#00000000"
      },
      "editorToolbar": {
        "toolbarBackground": "#00000000",
        "toolbarPaddingTop": 0,
        "toolbarPaddingBottom": 0,
        "toolbarPaddingLeft": 0,
        "toolbarPaddingRight": 0,
        "toolbarCornerTopLeft": 0,
        "toolbarCornerTopRight": 0,
        "toolbarCornerBottomLeft": 0,
        "toolbarCornerBottomRight": 0,
        "toolbarButtonBackground": "#00000000",
        "toolbarButtonPaddingLeft": 0,
        "toolbarButtonPaddingRight": 0,
        "toolbarButtonCornerTopLeft": 0,
        "toolbarButtonCornerTopRight": 0,
        "toolbarButtonCornerBottomLeft": 0,
        "toolbarButtonCornerBottomRight": 0
      }
    },
    "labels": {},
    "swatches": []
  },
  {
    "id": "preset-scifi-basic",
    "name": "SciFi Basic",
    "description": "An Example SciFi Theme",
    "settings": {
      "sidebarEntries": {
        "entryBackground": "#00000000"
      },
      "sidebarHeadings": {
        "headingIndent": 16,
        "headingBackground": "#00000000"
      },
      "sidebarCategories": {
        "categoryBackground": "#00000000"
      },
      "sidebarSearch": {
        "searchColor": "",
        "searchBackground": "#00000000",
        "searchBorderTopWidth": 0,
        "searchBorderBottomWidth": 0,
        "searchBorderLeftWidth": 0,
        "searchBorderRightWidth": 0,
        "searchCornerTopLeft": 3,
        "searchCornerTopRight": 3,
        "searchCornerBottomLeft": 3,
        "searchCornerBottomRight": 3
      },
      "sidebarButtons": {
        "buttonBackground": "#00000000",
        "buttonCornerTopLeft": 3,
        "buttonCornerTopRight": 3,
        "buttonCornerBottomLeft": 3,
        "buttonCornerBottomRight": 3
      },
      "window": {
        "textStyle": "bold",
        "titleBarBackground": "#00000000",
        "paddingLeft": 0,
        "paddingRight": 0,
        "headerButtonBackground": "#00000000",
        "headerButtonCornerTopLeft": 3,
        "headerButtonCornerTopRight": 3,
        "headerButtonCornerBottomLeft": 3,
        "headerButtonCornerBottomRight": 3,
        "pageButtonBackground": "#0b0a1380"
      },
      "page": {
        "cornerTopLeft": 0,
        "cornerTopRight": 0,
        "cornerBottomLeft": 0,
        "cornerBottomRight": 0
      },
      "body": {
        "marginTop": 0,
        "highlightBackground": "#e8c979",
        "codeBackground": "#00000000"
      },
      "secrets": {
        "revealedBackground": "#0035000d",
        "buttonBackground": "#00000000"
      },
      "boxes": {
        "summaryBackground": "#00000000",
        "collapsibleBackground": "#00000000"
      },
      "editor": {
        "titleBarBackground": "#00000000",
        "textStyle": "bold",
        "paddingLeft": 0,
        "paddingRight": 0,
        "headerButtonBackground": "#00000000",
        "headerButtonCornerTopLeft": 3,
        "headerButtonCornerTopRight": 3,
        "headerButtonCornerBottomLeft": 3,
        "headerButtonCornerBottomRight": 3
      },
      "editorSettingsBar": {
        "settingsBarBackground": "#00000000",
        "fieldBackground": "#00000000",
        "fieldBorderTopWidth": 0,
        "fieldBorderRightWidth": 0,
        "fieldBorderBottomWidth": 0,
        "fieldBorderLeftWidth": 0,
        "fieldCornerTopLeft": 0,
        "fieldCornerTopRight": 0,
        "fieldCornerBottomRight": 0,
        "fieldCornerBottomLeft": 0,
        "fieldPaddingRight": 0,
        "fieldPaddingLeft": 0
      },
      "editorDropdowns": {
        "dropdownBackground": "#00000000",
        "dropdownCornerTopLeft": 0,
        "dropdownCornerTopRight": 0,
        "dropdownCornerBottomRight": 0,
        "dropdownCornerBottomLeft": 0,
        "dropdownPaddingTop": 0,
        "dropdownPaddingRight": 0,
        "dropdownPaddingBottom": 0,
        "dropdownPaddingLeft": 0,
        "listBackground": "#00000000",
        "itemBackground": "#00000000"
      },
      "editorToolbar": {
        "toolbarBackground": "#00000000",
        "toolbarPaddingTop": 0,
        "toolbarPaddingBottom": 0,
        "toolbarPaddingLeft": 0,
        "toolbarPaddingRight": 0,
        "toolbarCornerTopLeft": 0,
        "toolbarCornerTopRight": 0,
        "toolbarCornerBottomLeft": 0,
        "toolbarCornerBottomRight": 0,
        "toolbarButtonBackground": "#00000000",
        "toolbarButtonPaddingLeft": 0,
        "toolbarButtonPaddingRight": 0,
        "toolbarButtonCornerTopLeft": 0,
        "toolbarButtonCornerTopRight": 0,
        "toolbarButtonCornerBottomLeft": 0,
        "toolbarButtonCornerBottomRight": 0
      }
    },
    "labels": {},
    "swatches": []
  }
];
