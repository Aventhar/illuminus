/**
 * Styles bundled with the module, seeded into a world the first time Illuminus
 * runs there. Once seeded they are ordinary styles: editable, duplicable, and
 * deletable.
 *
 * Each preset lists only the values that differ from the schema defaults;
 * everything else falls through. Because every side, corner, and shadow
 * component is separately addressable, a preset that wants a plain box simply
 * says nothing about the other three sides.
 *
 * Fonts are named rather than bundled, so a preset asking for a font the user
 * has not installed falls back to the generic stack. Add fonts via Foundry's
 * Configure Font Families menu to get the intended look.
 */

export const PRESETS = [
  {
    id: "illuminus-parchment",
    name: "Aged Parchment",
    description: "Warm paper, rust-red headings, and boxed read-aloud text. The classic printed-adventure look.",
    settings: {
      page: {
        background: "#ece0c6", textureFit: "cover", paddingTop: 32, paddingRight: 32, paddingBottom: 32,
        paddingLeft: 32, borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2,
        cornerTopLeft: 2, cornerTopRight: 2, cornerBottomRight: 2, cornerBottomLeft: 2, innerShadowBlur: 40,
        innerShadowColor: "#50321459"
      },
      title: {
        size: 40, color: "#5e1914", caps: "smallCaps", letterSpacing: 1, textShadowOffsetY: 1, textShadowBlur: 2,
        textShadowColor: "#00000059"
      },
      heading1: {
        color: "#f6efe0", caps: "smallCaps", letterSpacing: 1, marginTop: 24, marginBottom: 12, paddingTop: 6,
        paddingRight: 12, paddingBottom: 6, paddingLeft: 12, background: "#5e1914", cornerTopLeft: 2,
        cornerTopRight: 2, cornerBottomRight: 2, cornerBottomLeft: 2
      },
      heading2: {
        marginTop: 20, borderBottomWidth: 2
      },
      heading3: {
        caps: "smallCaps"
      },
      body: {
        lineHeight: 1.55, align: "justify", marginBottom: 10
      },
      links: {
        weight: "700", decorationLine: "none"
      },
      lists: {
        bullet: "diamond", indent: 28
      },
      tables: {
        stripeColor: "#8a6a3d1a", cellPaddingTop: 5, cellPaddingRight: 10, cellPaddingBottom: 5,
        cellPaddingLeft: 10
      },
      boxes: {
        color: "#2b2113", background: "#e0cfa6", paddingTop: 14, paddingRight: 14, paddingBottom: 14,
        paddingLeft: 14, borderLeftWidth: 5
      },
      images: {
        borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2, shadowOffsetY: 2,
        shadowBlur: 8, shadowColor: "#00000059"
      }
    }
  },
  {
    id: "illuminus-midnight",
    name: "Midnight Codex",
    description: "A dark grimoire: deep slate paper, pale gold headings, and cool highlights.",
    settings: {
      page: {
        background: "#171a21", paddingTop: 32, paddingRight: 32, paddingBottom: 32, paddingLeft: 32,
        borderTopWidth: 1, borderTopColor: "#3d4658", borderRightWidth: 1, borderRightColor: "#3d4658",
        borderBottomWidth: 1, borderBottomColor: "#3d4658", borderLeftWidth: 1, borderLeftColor: "#3d4658",
        cornerTopLeft: 4, cornerTopRight: 4, cornerBottomRight: 4, cornerBottomLeft: 4
      },
      title: {
        size: 38, color: "#e8c979", caps: "smallCaps", letterSpacing: 2
      },
      heading1: {
        size: 27, color: "#e8c979", caps: "smallCaps", letterSpacing: 1, marginTop: 24, marginBottom: 10,
        borderBottomWidth: 2
      },
      heading2: {
        size: 21, color: "#c9a961", marginTop: 20
      },
      heading3: {
        size: 17, color: "#9fb3c8"
      },
      body: {
        color: "#d7dbe2", lineHeight: 1.6, marginBottom: 10
      },
      links: {
        color: "#7fc2e8", hoverColor: "#a9dcff", weight: "700", decorationLine: "none"
      },
      lists: {
        bullet: "diamond", markerColor: "#e8c979", indent: 28
      },
      tables: {
        textColor: "#d7dbe2", headerBackground: "#2a3140", headerColor: "#e8c979", stripeColor: "#ffffff0d",
        cellPaddingTop: 5, cellPaddingRight: 10, cellPaddingBottom: 5, cellPaddingLeft: 10,
        cellBorderTopColor: "#3d4658", cellBorderRightColor: "#3d4658", cellBorderBottomColor: "#3d4658",
        cellBorderLeftColor: "#3d4658", borderTopColor: "#3d4658", borderRightColor: "#3d4658",
        borderBottomColor: "#3d4658", borderLeftColor: "#3d4658"
      },
      boxes: {
        color: "#c8d2de", background: "#1f2530", paddingTop: 14, paddingRight: 14, paddingBottom: 14,
        paddingLeft: 14, borderTopColor: "#e8c979", borderRightColor: "#e8c979", borderBottomColor: "#e8c979",
        borderLeftColor: "#e8c979", cornerTopLeft: 3, cornerTopRight: 3, cornerBottomRight: 3, cornerBottomLeft: 3
      },
      images: {
        borderTopWidth: 1, borderTopColor: "#3d4658", borderRightWidth: 1, borderRightColor: "#3d4658",
        borderBottomWidth: 1, borderBottomColor: "#3d4658", borderLeftWidth: 1, borderLeftColor: "#3d4658",
        cornerTopLeft: 3, cornerTopRight: 3, cornerBottomRight: 3, cornerBottomLeft: 3, captionColor: "#9fb3c8"
      }
    }
  },
  {
    id: "illuminus-manuscript",
    name: "Clean Manuscript",
    description: "Understated cream and ink. Generous spacing for long reads, with no heavy ornament.",
    settings: {
      page: {
        background: "#fbf7ef", maxWidth: 780, paddingTop: 40, paddingRight: 40, paddingBottom: 40, paddingLeft: 40,
        borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none"
      },
      title: {
        size: 34, color: "#1f1f1f", align: "left"
      },
      heading1: {
        size: 26, color: "#1f1f1f", marginTop: 28, marginBottom: 10
      },
      heading2: {
        size: 20, color: "#333333", marginTop: 22
      },
      heading3: {
        size: 17, color: "#4a4a4a"
      },
      body: {
        size: 17, color: "#2b2b2b", lineHeight: 1.7, marginBottom: 14
      },
      links: {
        color: "#1a5fb4", hoverColor: "#3584e4"
      },
      lists: {
        markerColor: "#8a8a8a", itemSpacing: 6
      },
      tables: {
        headerBackground: "#ece7dd", headerColor: "#1f1f1f", stripeColor: "#00000008", cellPaddingTop: 6,
        cellPaddingRight: 10, cellPaddingBottom: 6, cellPaddingLeft: 10, cellBorderTopColor: "#d8d2c6",
        cellBorderRightColor: "#d8d2c6", cellBorderBottomColor: "#d8d2c6", cellBorderLeftColor: "#d8d2c6",
        borderTopColor: "#d8d2c6", borderRightColor: "#d8d2c6", borderBottomColor: "#d8d2c6",
        borderLeftColor: "#d8d2c6"
      },
      boxes: {
        color: "#2b2b2b", style: "normal", background: "#f2ede3", paddingTop: 14, paddingRight: 14,
        paddingBottom: 14, paddingLeft: 14, borderTopColor: "#c9c1b2", borderRightColor: "#c9c1b2",
        borderBottomColor: "#c9c1b2", borderLeftWidth: 3, borderLeftColor: "#c9c1b2"
      },
      images: {
        borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none",
        cornerTopLeft: 4, cornerTopRight: 4, cornerBottomRight: 4, cornerBottomLeft: 4, captionColor: "#6a6a6a"
      }
    }
  },
  {
    id: "illuminus-datapad",
    name: "Datapad",
    description: "A science-fiction readout: dark panel, cyan rules, and monospaced headings.",
    settings: {
      page: {
        background: "#0d1418", paddingTop: 28, paddingRight: 28, paddingBottom: 28, paddingLeft: 28,
        borderTopWidth: 1, borderTopColor: "#1f6f7a", borderRightWidth: 1, borderRightColor: "#1f6f7a",
        borderBottomWidth: 1, borderBottomColor: "#1f6f7a", borderLeftWidth: 1, borderLeftColor: "#1f6f7a",
        cornerTopLeft: 6, cornerTopRight: 6, cornerBottomRight: 6, cornerBottomLeft: 6
      },
      title: {
        size: 32, color: "#5fe3d6", caps: "uppercase", letterSpacing: 3, align: "left"
      },
      heading1: {
        size: 24, color: "#5fe3d6", caps: "uppercase", letterSpacing: 2, marginTop: 24, marginBottom: 10,
        borderBottomWidth: 1, borderBottomColor: "#1f6f7a"
      },
      heading2: {
        size: 19, color: "#7fb8c8", caps: "uppercase", letterSpacing: 1
      },
      heading3: {
        size: 16, color: "#9aa8b0"
      },
      body: {
        size: 15, color: "#c2ced4", lineHeight: 1.6, marginBottom: 10
      },
      links: {
        color: "#5fe3d6", hoverColor: "#9df5ec", decorationLine: "none", borderTopColor: "#1f6f7a",
        borderRightColor: "#1f6f7a", borderBottomColor: "#1f6f7a", borderLeftColor: "#1f6f7a", cornerTopLeft: 2,
        cornerTopRight: 2, cornerBottomRight: 2, cornerBottomLeft: 2
      },
      lists: {
        bullet: "square", markerColor: "#5fe3d6"
      },
      tables: {
        textColor: "#c2ced4", headerBackground: "#12333a", headerColor: "#5fe3d6", stripeColor: "#ffffff08",
        cellPaddingRight: 10, cellPaddingLeft: 10, cellBorderTopColor: "#1f6f7a", cellBorderRightColor: "#1f6f7a",
        cellBorderBottomColor: "#1f6f7a", cellBorderLeftColor: "#1f6f7a", borderTopColor: "#1f6f7a",
        borderRightColor: "#1f6f7a", borderBottomColor: "#1f6f7a", borderLeftColor: "#1f6f7a", cornerTopLeft: 4,
        cornerTopRight: 4, cornerBottomRight: 4, cornerBottomLeft: 4
      },
      boxes: {
        color: "#a8d8e0", style: "normal", background: "#10222a", borderTopWidth: 1, borderTopColor: "#1f6f7a",
        borderRightWidth: 1, borderRightColor: "#1f6f7a", borderBottomWidth: 1, borderBottomColor: "#1f6f7a",
        borderLeftWidth: 1, borderLeftColor: "#1f6f7a", cornerTopLeft: 4, cornerTopRight: 4, cornerBottomRight: 4,
        cornerBottomLeft: 4
      },
      images: {
        borderTopWidth: 1, borderTopColor: "#1f6f7a", borderRightWidth: 1, borderRightColor: "#1f6f7a",
        borderBottomWidth: 1, borderBottomColor: "#1f6f7a", borderLeftWidth: 1, borderLeftColor: "#1f6f7a",
        cornerTopLeft: 4, cornerTopRight: 4, cornerBottomRight: 4, cornerBottomLeft: 4, captionColor: "#7fb8c8"
      }
    }
  }
];
