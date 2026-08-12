/**
 * Styles bundled with the module, seeded into a world the first time Illuminus
 * runs there. Once seeded they are ordinary styles: editable, duplicable, and
 * deletable. Each one sets only the fields it cares about — everything else
 * falls through to the schema defaults.
 *
 * Fonts are named rather than bundled, so a preset asking for a font the user
 * has not installed simply falls back to the generic stack. Add fonts via
 * Foundry's Configure Font Families menu to get the intended look.
 */

export const PRESETS = [
  {
    id: "illuminus-parchment",
    name: "Aged Parchment",
    description: "Warm paper, rust-red headings, and boxed read-aloud text. The classic printed-adventure look.",
    settings: {
      page: {
        background: "#ece0c6",
        textureFit: "cover",
        textureBlend: "multiply",
        padding: 32,
        borderColor: "#8a6a3d",
        borderStyle: "solid",
        borderWidth: 2,
        radius: 2,
        innerShadow: true
      },
      title: { size: 40, color: "#5e1914", align: "center", caps: "smallCaps", letterSpacing: 1, shadow: true },
      heading1: {
        size: 28, color: "#f6efe0", background: "#5e1914", paddingX: 12, paddingY: 6,
        radius: 2, caps: "smallCaps", letterSpacing: 1, spaceAbove: 24, spaceBelow: 12
      },
      heading2: {
        size: 22, color: "#7a3b16", ruleStyle: "solid", ruleColor: "#8a6a3d", ruleWidth: 2, spaceAbove: 20
      },
      heading3: { size: 18, color: "#5a4326", style: "italic", caps: "smallCaps" },
      body: { size: 16, color: "#241b10", lineHeight: 1.55, paragraphSpacing: 10, align: "justify" },
      links: { color: "#7a2010", hoverColor: "#a8341c", underline: false, weight: "bold" },
      lists: { bullet: "diamond", markerColor: "#7a2010", indent: 28 },
      tables: {
        headerBackground: "#5e1914", headerColor: "#f6efe0", stripeColor: "#8a6a3d1a",
        borderColor: "#8a6a3d", cellPaddingX: 10, cellPaddingY: 5
      },
      boxes: {
        background: "#e0cfa6", textColor: "#2b2113", style: "italic", edge: "left",
        borderColor: "#7a2010", borderWidth: 5, padding: 14
      },
      images: { borderColor: "#8a6a3d", borderStyle: "solid", borderWidth: 2, shadow: true, captionColor: "#5a4326" }
    }
  },
  {
    id: "illuminus-midnight",
    name: "Midnight Codex",
    description: "A dark grimoire: deep slate paper, pale gold headings, and cool highlights.",
    settings: {
      page: {
        background: "#171a21", padding: 32, borderColor: "#3d4658", borderStyle: "solid",
        borderWidth: 1, radius: 4
      },
      title: { size: 38, color: "#e8c979", align: "center", caps: "smallCaps", letterSpacing: 2 },
      heading1: {
        size: 27, color: "#e8c979", ruleStyle: "solid", ruleColor: "#8a6a3d", ruleWidth: 2,
        caps: "smallCaps", letterSpacing: 1, spaceAbove: 24, spaceBelow: 10
      },
      heading2: { size: 21, color: "#c9a961", spaceAbove: 20 },
      heading3: { size: 17, color: "#9fb3c8", style: "italic" },
      body: { size: 16, color: "#d7dbe2", lineHeight: 1.6, paragraphSpacing: 10 },
      links: { color: "#7fc2e8", hoverColor: "#a9dcff", underline: false, weight: "bold" },
      lists: { bullet: "diamond", markerColor: "#e8c979", indent: 28 },
      tables: {
        headerBackground: "#2a3140", headerColor: "#e8c979", stripeColor: "#ffffff0d",
        borderColor: "#3d4658", textColor: "#d7dbe2", cellPaddingX: 10, cellPaddingY: 5
      },
      boxes: {
        background: "#1f2530", textColor: "#c8d2de", style: "italic", edge: "left",
        borderColor: "#e8c979", borderWidth: 4, padding: 14, radius: 3
      },
      images: { borderColor: "#3d4658", borderStyle: "solid", borderWidth: 1, radius: 3, captionColor: "#9fb3c8" }
    }
  },
  {
    id: "illuminus-manuscript",
    name: "Clean Manuscript",
    description: "Understated cream and ink. Generous spacing for long reads, with no heavy ornament.",
    settings: {
      page: { background: "#fbf7ef", padding: 40, maxWidth: 780, borderStyle: "none", radius: 0 },
      title: { size: 34, color: "#1f1f1f", align: "left", weight: "bold" },
      heading1: { size: 26, color: "#1f1f1f", spaceAbove: 28, spaceBelow: 10 },
      heading2: { size: 20, color: "#333333", spaceAbove: 22 },
      heading3: { size: 17, color: "#4a4a4a", style: "italic" },
      body: { size: 17, color: "#2b2b2b", lineHeight: 1.7, paragraphSpacing: 14, align: "left" },
      links: { color: "#1a5fb4", hoverColor: "#3584e4", underline: true },
      lists: { bullet: "disc", markerColor: "#8a8a8a", indent: 24, itemSpacing: 6 },
      tables: {
        headerBackground: "#ece7dd", headerColor: "#1f1f1f", stripeColor: "#00000008",
        borderColor: "#d8d2c6", cellPaddingX: 10, cellPaddingY: 6
      },
      boxes: {
        background: "#f2ede3", textColor: "#2b2b2b", style: "normal", edge: "left",
        borderColor: "#c9c1b2", borderWidth: 3, padding: 14
      },
      images: { borderStyle: "none", radius: 4, captionColor: "#6a6a6a" }
    }
  },
  {
    id: "illuminus-datapad",
    name: "Datapad",
    description: "A science-fiction readout: dark panel, cyan rules, and monospaced headings.",
    settings: {
      page: {
        background: "#0d1418", padding: 28, borderColor: "#1f6f7a", borderStyle: "solid",
        borderWidth: 1, radius: 6
      },
      title: { size: 32, color: "#5fe3d6", align: "left", caps: "uppercase", letterSpacing: 3 },
      heading1: {
        size: 24, color: "#5fe3d6", caps: "uppercase", letterSpacing: 2,
        ruleStyle: "solid", ruleColor: "#1f6f7a", ruleWidth: 1, spaceAbove: 24, spaceBelow: 10
      },
      heading2: { size: 19, color: "#7fb8c8", caps: "uppercase", letterSpacing: 1 },
      heading3: { size: 16, color: "#9aa8b0", style: "italic" },
      body: { size: 15, color: "#c2ced4", lineHeight: 1.6, paragraphSpacing: 10 },
      links: { color: "#5fe3d6", hoverColor: "#9df5ec", underline: false, chipBorderColor: "#1f6f7a", chipRadius: 2 },
      lists: { bullet: "square", markerColor: "#5fe3d6", indent: 24 },
      tables: {
        headerBackground: "#12333a", headerColor: "#5fe3d6", stripeColor: "#ffffff08",
        borderColor: "#1f6f7a", textColor: "#c2ced4", cellPaddingX: 10, cellPaddingY: 4, radius: 4
      },
      boxes: {
        background: "#10222a", textColor: "#a8d8e0", style: "normal", edge: "all",
        borderColor: "#1f6f7a", borderWidth: 1, padding: 12, radius: 4
      },
      images: { borderColor: "#1f6f7a", borderStyle: "solid", borderWidth: 1, radius: 4, captionColor: "#7fb8c8" }
    }
  }
];
