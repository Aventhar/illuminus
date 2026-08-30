/**
 * What a control's own name says about it.
 *
 * Two questions are answered here, and both are read from the name rather than
 * registered anywhere: which state a control belongs to, and which run of a
 * category it sits in. Kept apart from the editor because `validate.mjs` asks
 * them too, and the editor cannot be imported outside a running Foundry.
 */

/**
 * The states a control can belong to, in the order they are offered.
 *
 * A section declares its states simply by what its controls are called, so
 * `buttonHoverBackground` and `activeColor` need no registration beyond the
 * word itself.
 */
export const STATES = [
  { id: "normal", label: "ILLUMINUS.Editor.StateNormal" },
  { id: "hover", label: "ILLUMINUS.Editor.StateHover", match: /hover/i },
  { id: "active", label: "ILLUMINUS.Editor.StateActive", match: /^active|Active/ }
];

/** Which state a control belongs to. Anything unmarked is the ordinary one. */
export function stateOf(name) {
  return STATES.find((state) => state.match?.test(name))?.id ?? "normal";
}

/**
 * A field name with its state word removed, so counterparts can be matched.
 *
 * Both spellings occur — `buttonHoverBackground` and `hoverBackground` — so the
 * match is case-insensitive and the leading capital it leaves behind is put
 * back down.
 * @param {string} name
 * @returns {string} The shared stem, or the name itself when it has no state.
 */
export function stateBase(name) {
  const state = STATES.find((entry) => entry.match?.test(name));
  if (!state) return name;
  const stripped = name.replace(state.match, "");
  if (!stripped) return name;
  return /[a-z]/.test(name[0]) ? stripped[0].toLowerCase() + stripped.slice(1) : stripped;
}

/**
 * What a run of plain controls is about, read from the controls themselves.
 *
 * A category is laid out in runs — the schema draws a line and then stacks the
 * controls that belong together under it — and those runs are the last thing on
 * a part that could not be folded away, because unlike a shadow or a box they
 * have no family name to answer to. This is that name.
 *
 * Every entry is a suffix the schema already uses, so a control added next year
 * lands in the right run without anybody registering it. Order is the whole of
 * the table's meaning: a longer suffix is asked before the shorter one it ends
 * with, or every `outlineColor` would answer to `Color` and be gathered with
 * the lettering. `validate.mjs` [16] refuses a run this table cannot name.
 */
export const RUN_KINDS = [
  ["Folding", /[Ff]old[A-Z]/],
  ["Columns", /[Cc]olumn[A-Z]/],
  ["Glow", /[Gg]low[A-Z]/],
  ["TickBox", ["CheckColor", "CheckTickedColor", "CheckMarkColor", "CheckSize"]],
  ["Shape", ["PictureShape", "PictureCrop", "PictureFrom", "Shape", "Crop", "Flip"]],
  ["Outline", ["OutlineColor", "OutlineWidth"]],
  ["Rule", ["RuleWidth", "RuleStyle", "RuleColor", "RuleLength", "RuleAlign"]],
  ["Edge", ["BorderWidth", "BorderStyle", "BorderColor"]],
  ["Line", ["DecorationColor", "DecorationLine", "DecorationStyle", "DecorationThickness",
    "DecorationOffset", "Thickness", "Line", "DividerStyle", "DividerColor", "DividerLength",
    "DividerWidth", "DividerAlign"]],
  ["Fill", ["Background", "GradientFrom", "GradientTo", "GradientAngle", "Frost", "Opacity",
    "RowColor", "StripeColor"]],
  ["Lettering", ["Font", "Size", "Color", "TextStyle", "TextStyleSlant", "Bullet", "NumberStyle",
    "PlaceholderColor", "Style"]],
  ["Arrangement", ["Align", "Caps", "LetterSpacing", "WordSpacing", "LineHeight", "Wrap",
    "Hyphens", "WhiteSpace", "WordBreak", "Indent", "ItemSpacing", "Spacing", "SpacingAbove",
    "SpacingBelow"]],
  ["Layout", ["Display", "FlexDirection", "FlexWrap", "Justify", "AlignItems", "Gap"]],
  ["Size", ["Width", "Height", "Overflow"]],
  ["Flow", ["Float", "Clear", "WhenEmpty", "WrapEdges", "VerticalAlign", "Lift"]],
  ["Placing", ["Position", "OffsetTop", "OffsetLeft", "Offset", "Turn", "Scale", "Anchor",
    "Side", "Top"]]
];

/** Whether one control's name is of a kind. A list of suffixes, or a pattern. */
function runKindMatches(test, name) {
  if (!Array.isArray(test)) return test.test(name);
  return test.some((word) =>
    name === word[0].toLowerCase() + word.slice(1) || name.endsWith(word));
}

/** Which kind a single control belongs to, or nothing where the table has none. */
export function runKindOf(name) {
  return RUN_KINDS.find(([, test]) => runKindMatches(test, name))?.[0] ?? null;
}

/**
 * What a run of plain controls is called.
 *
 * Read from the controls' own wording wherever they share any, because their
 * words are the part's words and are already written and translated: a term's
 * outline and a definition's outline are "Term Outline" and "Definition
 * Outline" without a table knowing that lists have terms in them. Only where
 * they share nothing — a typeface beside a text size beside a color — is the
 * kind above asked for a word, and there the run genuinely is "the lettering".
 *
 * A state's controls sit beside the ones they stand in for, so they are taken
 * out first: a run reading "Fill Color, Pointed-At Fill Color" shares nothing
 * and would fall back to a name it did not need.
 * @param {object[]} fields  The run's controls, in the order they are drawn.
 * @returns {string|null}    Its name, or nothing where nothing can name it.
 */
export function nameOfRun(fields) {
  const distinct = [...new Map(fields.map((field) => [stateBase(field.name), field])).values()];
  if (!distinct.length) return null;
  const labels = distinct.map((field) => field.label ?? "");
  // The words every one of them begins with. A label that is wholly the start
  // of another is the name itself — "Opening Capital" heads "Opening Capital
  // Typeface" — so the walk runs to the shortest label rather than stopping
  // short of it.
  const words = labels.map((label) => label.split(" "));
  const most = Math.min(...words.map((one) => one.length));
  let shared = 0;
  while (shared < most && words.every((one) => one[shared] === words[0][shared])) shared += 1;
  if (shared > 0) return words[0].slice(0, shared).join(" ");

  // Otherwise the kind most of them are, with the first control breaking a tie
  // — it is the one the schema put at the head of the run.
  const votes = new Map();
  let first = null;
  for (const field of distinct) {
    const kind = runKindOf(stateBase(field.name));
    if (!kind) continue;
    first ??= kind;
    votes.set(kind, (votes.get(kind) ?? 0) + 1);
  }
  let kind = first;
  let best = -1;
  for (const [one, count] of votes) {
    if (count > best || (count === best && one === first)) { best = count; kind = one; }
  }
  return kind ? game.i18n.localize(`ILLUMINUS.Run.${kind}`) : null;
}

/**
 * The names for every run in one category, told apart where two agree.
 *
 * Naming a run from its controls is done one run at a time and can therefore
 * land on the same word twice: a term's lettering and a definition's are both
 * "Lettering", since neither set of labels shares a leading word. The category
 * is where that is visible and where it is resolved, exactly as the wording
 * generator resolves two controls of one name — each takes the first word of
 * its own first control, unless the name already says it.
 * @param {object[][]} runs  Each run's controls, in the order they are drawn.
 * @returns {(string|null)[]} A name per run, in the same order.
 */
export function nameRuns(runs) {
  const names = runs.map((fields) => nameOfRun(fields));
  const counted = new Map();
  for (const name of names) if (name) counted.set(name, (counted.get(name) ?? 0) + 1);
  return names.map((name, at) => {
    if (!name || (counted.get(name) ?? 0) < 2) return name;
    const word = (runs[at][0]?.label ?? "").split(" ")[0];
    return word && !name.split(" ").includes(word) ? `${word} ${name}` : name;
  });
}
