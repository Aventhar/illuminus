/**
 * Styles bundled with the module, seeded into a world the first time Illuminus
 * runs there. Once seeded they are ordinary styles: editable, duplicable, and
 * deletable. Seeding only happens when the store is empty, so removing one from
 * here does not remove it from a world that already has it.
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
      sidebar: {
        background: "#2b1d12", color: "#e8dcc2", activeColor: "#f6efe0", activeBackground: "#3d2a1a",
        activeAccentColor: "#a8341c", activeAccentWidth: 4, activeWeight: "700", hoverBackground: "#3a281a",
        entryBorderBottomWidth: 1, entryBorderBottomColor: "#463322", numberColor: "#9c8a6a",
        categoryColor: "#d9a441", categorySize: 20, headingColor: "#c9b28d", headingHoverColor: "#f6efe0",
        searchBackground: "#1d130b", searchColor: "#e8dcc2", searchPlaceholderColor: "#8a7454",
        buttonColor: "#e8dcc2", buttonBorderColor: "#6b4f2f", buttonHoverColor: "#f6efe0",
        buttonHoverBorderColor: "#a8341c"
      },
      page: {
        background: "#ece0c6", texture: "modules/illuminus/assets/samples/textures/parchment.svg", paddingTop: 32, paddingRight: 32, paddingBottom: 32,
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
  }
];
