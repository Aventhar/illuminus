/**
 * Templates bundled with the module, seeded into a world the first time
 * Illuminus runs there.
 *
 * Every one of these is written against Illuminus's *keys* — `box01`, `tag01`,
 * `image01` — and never against a color or a size. That is what lets the same
 * template look like a Pathfinder hazard under one style and a starship manifest
 * under another. It also means a template only looks finished if the style
 * being used has set those slots up; the first two or three are used here
 * deliberately, since a style is most likely to have configured those.
 *
 * The markup is parsed through Foundry's own editor schema when it is inserted,
 * so anything here that the editor does not recognise is dropped rather than
 * trusted. Keep to elements a person could have typed in the editor themselves.
 */

/** Wrapped so the source stays readable; the stored copy is one string. */
const html = (...lines) => lines.join("");

export const TEMPLATE_PRESETS = [
  {
    id: "illuminus-statblock",
    name: "Stat Block",
    description: "A title line with its rank pushed right, a row of trait tags, and labelled entries.",
    markup: html(
      '<section class="illuminus-box illuminus-box--box01">',
      '<h2>Name <span class="illuminus-tag illuminus-tag--tag03">Rank 1</span></h2>',
      '<p><span class="illuminus-tag illuminus-tag--tag01">Trait</span>',
      '<span class="illuminus-tag illuminus-tag--tag02">Trait</span></p>',
      "<hr>",
      "<dl>",
      "<dt>Perception</dt><dd>+0</dd>",
      "<dt>Languages</dt><dd>Common</dd>",
      "<dt>Skills</dt><dd>Athletics +0</dd>",
      "</dl>",
      "<p>A sentence describing what this is and how it behaves.</p>",
      "</section>"
    )
  },
  {
    id: "illuminus-read-aloud",
    name: "Read-Aloud Box",
    description: "Boxed description to read to the table, with a heading above it.",
    markup: html(
      '<section class="illuminus-box illuminus-box--box01">',
      "<h2>Where They Are</h2>",
      "<p>Describe what the party sees, hears, and smells as they arrive.</p>",
      "</section>"
    )
  },
  {
    id: "illuminus-location",
    name: "Location Entry",
    description: "A heading, a tag row, an illustration, and room for the description.",
    markup: html(
      "<h2>Room Name <span class=\"illuminus-tag illuminus-tag--tag03\">Moderate 3</span></h2>",
      '<p><span class="illuminus-tag illuminus-tag--tag01">Trap</span>',
      '<span class="illuminus-tag illuminus-tag--tag02">Magical</span></p>',
      '<figure class="illuminus-image illuminus-image--image01">',
      '<img src="icons/svg/mystery-man.svg" alt="Illustration">',
      "<figcaption>What the picture shows.</figcaption>",
      "</figure>",
      "<p>What is in the room, and what happens when the party disturbs it.</p>",
      '<section class="illuminus-box illuminus-box--box01">',
      "<p>Boxed text to read aloud when they enter.</p>",
      "</section>"
    )
  },
  {
    id: "illuminus-handout",
    name: "Player Handout",
    description: "A letter or torn page, with a signature line under it.",
    markup: html(
      '<section class="illuminus-box illuminus-box--box02">',
      "<p><em>Whoever finds this,</em></p>",
      "<p>The body of the letter. Keep it short enough to read at the table.</p>",
      "<p style=\"text-align: right;\"><em>— A name</em></p>",
      "</section>"
    )
  },
  {
    id: "illuminus-secret-aside",
    name: "GM Aside",
    description: "A secret passage only the GM can read until it is revealed.",
    markup: html(
      '<section class="secret">',
      "<p>What the GM needs to know, and what to do if the party works it out.</p>",
      "</section>"
    )
  }
];
