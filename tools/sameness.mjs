/**
 * Where a brand new style differs from an unstyled Foundry.
 *
 * The module's promise is that opening a new style and looking at it shows
 * exactly what an unstyled journal shows: every control starts by doing
 * nothing, so a person adds to Foundry rather than fighting what Illuminus
 * already did. This measures that rather than trusting it — every surface, open
 * twice, compared property by property.
 *
 * Most differences are not differences. The rules always emit a declaration
 * where Foundry emits none — a shadow in a transparent colour, a solid border
 * of no width, a gradient from nothing to nothing — because a rule has to read
 * its variable whether or not the style has set one. Those compute differently
 * and paint identically, and `shows()` below is what tells them apart.
 *
 *   tools/sandbox.sh up && node tools/sameness.mjs
 */
import { connect } from "./cdp.mjs";

const PORT = process.env.ILLUMINUS_TEST_PORT ?? "30002";
const BASE = `http://127.0.0.1:${PORT}`;

const PROPS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "color", "backgroundColor",
  "backgroundImage", "borderTopWidth", "borderBottomWidth", "borderLeftWidth", "borderRightWidth",
  "borderTopColor", "borderTopLeftRadius", "paddingTop", "paddingLeft", "paddingBottom",
  "marginTop", "marginLeft", "marginBottom", "display", "textTransform", "letterSpacing",
  "lineHeight", "textAlign", "opacity", "boxShadow", "textShadow", "listStyleType"];
// Deliberately not width or height. They are what padding and margins add up
// to, so one differing edge reports itself again on every element inside it —
// three hundred consequences of a dozen causes, which buries the causes.

/** The markup a page needs for every rule to have something to land on. */
const CONTENT = "<h1>Chapter</h1><p>Body text with a <a class='content-link'>link</a> in it.</p>"
  + "<h2>Section</h2><ul><li>An item</li></ul>"
  + "<blockquote><p>Read aloud.</p></blockquote>"
  + "<table><thead><tr><th>Head</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>"
  + "<dl><dt>Term</dt><dd>Detail</dd></dl>"
  + "<section class='secret' id='s1'><p>Hidden.</p></section>"
  + "<figure><img src='icons/svg/book.svg'><figcaption>Art</figcaption></figure>"
  + "<pre><code>code</code></pre><hr>";

const cdp = await connect();
await cdp.goto(`${BASE}/join`);
await cdp.waitFor("document.querySelector('select[name=userid], input[name=username]')", { label: "join form" });
await cdp.evaluate(`(() => {
  const picker = document.querySelector('select[name="userid"]');
  if (picker) picker.value = [...picker.options].find(o => o.value).value;
  else {
    const name = document.querySelector('input[name="username"]');
    name.value = "Gamemaster";
    name.dispatchEvent(new Event("input", {bubbles: true}));
  }
  const form = (picker ?? document.querySelector('input[name="username"]')).closest("form");
  (form?.querySelector('button[type="submit"], button[name="join"]')
    ?? document.querySelector('button[name="join"], button[type="submit"]')).click();
})()`);
await cdp.waitFor("window.game && game.ready", { label: "game.ready", timeout: 120000 });

/** One surface, read twice: with a brand new style on it, and with none. */
const read = async (surface, styled) => JSON.parse(await cdp.evaluate(`(async () => {
  const api = game.modules.get("illuminus").api;
  for (const a of [...foundry.applications.instances.values()]) {
    if (a.constructor.name.includes("ProseMirror") || a.constructor.name.startsWith("Illuminus")
      || a.document?.documentName?.startsWith("JournalEntry")) await a.close({force: true});
  }
  for (const s of api.listStyles().filter((s) => s.name === "Sameness Probe")) await api.deleteStyle(s.id);
  let entry = game.journal.getName("Sameness Journal");
  if (!entry) {
    entry = await JournalEntry.create({name: "Sameness Journal"});
    await entry.createEmbeddedDocuments("JournalEntryPage", [{name: "A Page", type: "text",
      text: {content: ${JSON.stringify(CONTENT)}, format: 1}}]);
  }
  const style = ${styled} ? await api.createStyle({name: "Sameness Probe"}) : null;
  await api.assignStyle(entry, style ? style.id : "");
  await new Promise(r => setTimeout(r, 400));
  const page = entry.pages.contents[0];
  const app = ${JSON.stringify(surface)} === "editor" ? page.sheet : entry.sheet;
  await app.render({force: true, pageId: page.id});
  await new Promise(r => setTimeout(r, ${surface === "editor" ? 3000 : 1800}));
  app.setPosition({left: 30, top: 30, width: 1000, height: 700});
  await new Promise(r => setTimeout(r, 900));
  // Frozen before anything is read. Buttons animate, so a size taken straight
  // after a render can be part way through a transition — a corner radius came
  // back as 3.00706px, which made the same button look different from one run
  // to the next and sent this harness's answer wandering.
  const freeze = document.createElement("style");
  freeze.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.append(freeze);
  await new Promise(r => setTimeout(r, 200));
  const props = ${JSON.stringify(PROPS)};
  const out = [...app.element.querySelectorAll("*")].map((el) => {
    const s = getComputedStyle(el);
    const seen = {};
    for (const p of props) seen[p] = s[p];
    return { tag: el.tagName + (el.className ? "." + String(el.className).slice(0, 30) : ""), seen,
             // Asked of the element's own box rather than of its display: the
             // icon inside a hidden folding marker is not itself display none,
             // and it was reporting a size and a color nobody can see.
             hidden: el.getClientRects().length === 0 || s.visibility === "hidden" };
  });
  freeze.remove();
  await app.close({force: true});
  if (style) await api.deleteStyle(style.id);
  return JSON.stringify(out);
})()`));

/** Whether a difference is one a person could see. */
const dead = (v) => v === "none" || v === "" || v === "normal" || v === "auto";
const clear = (v) => /rgba\(0, 0, 0, 0\)/.test(v);
const shows = (prop, before, after) => {
  if (/^border\w*(Style|Color)$/.test(prop)) return false;        // judged with the width
  if (/Shadow$/.test(prop)) {
    const off = (v) => dead(v) || !/rgb\((?!0, 0, 0\))|rgba\((?!0, 0, 0, 0\))/.test(v);
    return !(off(before) && off(after));
  }
  if (prop === "backgroundImage") {
    const off = (v) => v === "none" || /gradient\(rgba\(0, 0, 0, 0\), rgba\(0, 0, 0, 0\)\)/.test(v);
    return !(off(before) && off(after));
  }
  if (prop === "backgroundColor") return !(clear(before) && clear(after));
  if (/(Width|Radius)$/.test(prop)) return Math.abs(parseFloat(before) - parseFloat(after)) > 0.5;
  if (/^(width|height|padding|margin)/.test(prop)) {
    return Math.abs(parseFloat(before) - parseFloat(after)) > 1;
  }
  return true;
};

let total = 0;
for (const surface of ["journal", "editor"]) {
  const plain = await read(surface, false);
  const styled = await read(surface, true);
  console.log(`\n=== ${surface} — ${plain.length} elements unstyled, ${styled.length} styled ===`);
  if (plain.length !== styled.length) {
    console.log("  different element counts; the module adds markup here, so this cannot align by index");
    continue;
  }
  const diffs = [];
  for (let i = 0; i < plain.length; i++) {
    // A difference on something nobody can see is not a difference. The folding
    // markers are the case in point: they are written into every page whatever
    // the style, and a style is what reveals one — so both readings carry the
    // element and neither draws it, while its color and size differ freely.
    if (plain[i].hidden && styled[i].hidden) continue;
    const changed = PROPS.filter((p) => plain[i].seen[p] !== styled[i].seen[p]
      && shows(p, plain[i].seen[p], styled[i].seen[p]));
    if (changed.length) {
      diffs.push({ tag: styled[i].tag, changed: changed.map((p) => `${p}: ${plain[i].seen[p]} -> ${styled[i].seen[p]}`) });
    }
  }
  total += diffs.length;
  console.log(`  ${diffs.length} elements differ where it shows\n`);
  for (const d of diffs) console.log(`  ${d.tag}\n      ${d.changed.join("\n      ")}`);
}
console.log(`\n${total} elements differ in all`);
process.exit(0);
