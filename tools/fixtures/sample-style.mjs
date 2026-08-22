/**
 * A style for the checks to work with.
 *
 * The module ships no styles of its own — the sample styles that will come with
 * it are being made — but nearly every check needs a style whose values it
 * already knows: a page whose color it can look for, a heading whose bar it can
 * measure. This is that style, and it lives with the tooling because it is test
 * data rather than something anybody installs.
 *
 * Its picture points at one of Foundry's own icons, so the checks can watch a
 * texture arrive without the module carrying a picture to point at.
 */

export const SAMPLE_STYLES = [
  {
    id: "illuminus-parchment",
    name: "Aged Parchment",
    description: "Warm paper, rust-red headings, and boxed read-aloud text. The classic printed-adventure look.",
    settings: {
      sidebar: {
        background: "#2b1d12",
        color: "#e8dcc2",
        activeColor: "#f6efe0",
        entryActiveBackground: "#3d2a1a",
        activeAccentColor: "#a8341c",
        activeAccentWidth: 4,
        entryHoverBackground: "#3a281a",
        entryBorderBottomWidth: 1,
        entryBorderBottomColor: "#463322",
        numberShown: true,
        numberColor: "#9c8a6a",
        categoryColor: "#d9a441",
        categorySize: 20,
        headingColor: "#c9b28d",
        headingHoverColor: "#f6efe0",
        searchBackground: "#1d130b",
        searchColor: "#e8dcc2",
        searchPlaceholderColor: "#8a7454",
        buttonColor: "#e8dcc2",
        buttonBorderColor: "#6b4f2f",
        buttonHoverColor: "#f6efe0",
        buttonHoverBorderColor: "#a8341c",
        activeTextStyle: "bold"
      },
      page: {
        background: "#ece0c6",
        texture: "icons/svg/mystery-man.svg",
        paddingTop: 32,
        paddingRight: 32,
        paddingBottom: 32,
        paddingLeft: 32,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        cornerTopLeft: 2,
        cornerTopRight: 2,
        cornerBottomRight: 2,
        cornerBottomLeft: 2,
        innerShadowBlur: 40,
        innerShadowColor: "#50321459"
      },
      title: {
        size: 40,
        color: "#5e1914",
        caps: "smallCaps",
        letterSpacing: 1,
        textShadowOffsetY: 1,
        textShadowBlur: 2,
        textShadowColor: "#00000059"
      },
      heading1: {
        color: "#f6efe0",
        caps: "smallCaps",
        letterSpacing: 1,
        marginTop: 24,
        marginBottom: 12,
        paddingTop: 6,
        paddingRight: 12,
        paddingBottom: 6,
        paddingLeft: 12,
        background: "#5e1914",
        cornerTopLeft: 2,
        cornerTopRight: 2,
        cornerBottomRight: 2,
        cornerBottomLeft: 2
      },
      heading2: {
        marginTop: 20,
        borderBottomWidth: 2
      },
      heading3: {
        caps: "smallCaps"
      },
      body: {
        color: "#241b10",
        size: 16,
        lineHeight: 1.55,
        align: "justify",
        marginBottom: 10
      },
      links: {
        decorationLine: "none",
        textStyle: "bold"
      },
      lists: {
        bullet: "diamond",
        indent: 28
      },
      tables: {
        headerBackground: "#5e1914",
        headerColor: "#f6efe0",
        stripeColor: "#8a6a3d1a",
        cellPaddingTop: 5,
        cellPaddingRight: 10,
        cellPaddingBottom: 5,
        cellPaddingLeft: 10
      },
      boxes: {
        color: "#2b2113",
        background: "#e0cfa6",
        paddingTop: 14,
        paddingRight: 14,
        paddingBottom: 14,
        paddingLeft: 14,
        borderLeftWidth: 5
      },
      images: {
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        shadowOffsetY: 2,
        shadowBlur: 8,
        shadowColor: "#00000059"
      }
    }
  }
];
