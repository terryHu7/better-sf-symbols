import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(acceptLanguage, cookie) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const headers = { accept: "text/html" };
  if (acceptLanguage) headers["accept-language"] = acceptLanguage;
  if (cookie) headers.cookie = cookie;

  return worker.fetch(
    new Request("http://localhost/", { headers }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished Symbol Flow product in Chinese for zh readers", async () => {
  const response = await render("zh-CN,zh;q=0.9,en;q=0.8");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN"/);
  // 「·」, not an ASCII hyphen: a `-` between Chinese characters reads as a
  // minus sign. The suffix does not repeat the brand half's 「SF Symbols」, but
  // it does say 「符号」 again — that half is English and answers no Chinese
  // query, so 「图标符号」 is the only searchable word this title has.
  assert.match(html, /<title>Better SF Symbols · 一网打尽图标符号<\/title>/);
  // Not one Latin character in the Chinese tagline, so none of the old
  // break-point care (\u00A0, no spaces at all) has anything left to protect:
  // it fits one phone line because it is short, measured at 390px.
  assert.match(html, /一网打尽，告别低效/);
  assert.match(html, /历史记录/);

  // One <h1>, and it is the product's name. It used to be 「输入」, which told a
  // crawler and a screen reader that this document is about a text field.
  const headings = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((match) => match[1]);
  assert.equal(headings.length, 1, `expected exactly one <h1>, found ${headings.length}`);
  assert.match(headings[0], /Better SF Symbols/);

  // The share card names its size, so a scraper can commit to the large layout
  // without fetching the image first, and describes itself for anyone who never
  // sees it.
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /property="og:image:alt"/);
  assert.match(html, /property="og:url"/);
  assert.match(html, /property="og:site_name" content="Better SF Symbols"/);
  assert.match(html, /rel="canonical"/);

  // The primary button's label is localized — it used to be the untranslated
  // brand phrase — so pin it to the label element rather than to the page. It
  // also carries the count that used to sit under the field, and on a blank
  // field that count is the example's, because the example is what pressing it
  // runs. Three symbols in the example, three tiles, three on the button.
  assert.match(html, /class="soul-label">预览其中 3 个符号</);
  // ...and they are three candidates for *one* button, which is what the page
  // is for (comparison, not listing). The count above only proves there are
  // three; these prove which three, and that the surrounding prose did not
  // quietly become a fourth tile — `app` is a real symbol name, so writing
  // 「几乎所有 app 都在用」 instead of 「应用」 would add one.
  for (const name of ["square.and.arrow.up", "arrow.up.doc", "arrowshape.turn.up.right"]) {
    assert.match(html, new RegExp(`title="复制名称：${name.replaceAll(".", "\\.")}"`));
  }
  // The privacy footer is commented out on request; nothing renders it now.
  assert.doesNotMatch(html, /app-footer/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("the stored column widths are in the first frame, not a paint later", async () => {
  const html = await (await render("zh-CN")).text();

  // The widths the reader dragged to cannot come from the server, so a script
  // ahead of the workbench applies them before it is parsed — and with them the
  // floors from the last measurement, or a placeholder guessing above a stored
  // width clamps it for a few frames and then lets go.
  assert.match(html, /setProperty\("--col-"/);
  assert.match(html, /setProperty\("--col-min-"/);
  assert.match(html, /symbol-flow-columns/);
  assert.match(html, /symbol-flow-column-mins/);
  // And the shell must ship with no inline widths of its own: an inline custom
  // property shadows the inherited one, which is exactly the jump this removes.
  // React starts writing them only once it has restored.
  const shell = /<div[^>]*class="app-shell"[^>]*>/.exec(html)?.[0] ?? "";
  assert.ok(shell, "no .app-shell in the rendered HTML");
  assert.doesNotMatch(shell, /--col-a/);

  // Same story one level down: the server has never measured the results list,
  // so it renders three columns while the panel holds four. The last plan is
  // restored before the first frame, and the list stays out of its way until it
  // has measured — otherwise 3+1 becomes 4 while the reader is looking at it.
  assert.match(html, /setProperty\("--tile-columns"/);
  assert.match(html, /symbol-flow-tile/);
  const list = /<div[^>]*class="result-list"[^>]*>/.exec(html)?.[0] ?? "";
  assert.ok(list, "no .result-list in the rendered HTML");
  assert.doesNotMatch(list, /--tile-columns/);

  // The history the server renders is empty — a first-time reader's history is
  // empty, and demo rows dressed as history claimed they had done things they
  // never did. A browser with rows of its own holds the list back rather than
  // reading 「还没有历史记录」 and withdrawing it a frame later.
  assert.match(html, /data-history-pending/);
  assert.doesNotMatch(html, /示例 ·|Example ·/);
  assert.match(html, /还没有历史记录/);
  // Same for the copy format: "Name" is the server's only possible answer, and
  // it is a statement about what the next click puts on the clipboard.
  assert.match(html, /data-format-pending/);
});

test("falls back to English for everyone else", async () => {
  const response = await render("de-DE,de;q=0.9,en;q=0.7");
  const html = await response.text();

  assert.match(html, /<html lang="en"/);
  assert.match(html, /<title>Better SF Symbols — Preview Them All<\/title>/);
  // The title's skeleton, not its whole phrase: the title spends its verb on
  // the searchable word ("Preview"), the tagline keeps the punchy one.
  assert.match(html, /Catch them all\. No more busywork/);
  // The soul button's label is localized now — it used to be the untranslated
  // brand phrase, so pin it to the label element rather than to the page.
  assert.match(html, /class="soul-label">Preview 3 symbols</);
  // Same trap as the Chinese example, different words: `forward`, `doc`, `case`
  // and `app` are all real symbol names on their own, so "leans forward" or
  // "in that case" in the reasons would show up as a fourth tile.
  for (const name of ["square.and.arrow.up", "arrow.up.doc", "arrowshape.turn.up.right"]) {
    assert.match(html, new RegExp(`title="Copy Name: ${name.replaceAll(".", "\\.")}"`));
  }
  assert.match(html, /History/);
  assert.doesNotMatch(html, /告别/);
});

test("a chosen language is answered by the server, not swapped in after paint", async () => {
  // The one preference a boot script cannot fix: it decides what the HTML says.
  // A reader on a Chinese machine who picked English must get English HTML.
  const english = await (await render("zh-CN,zh;q=0.9", "sf-locale=en")).text();
  assert.match(english, /<html lang="en"/);
  assert.match(english, /<title>Better SF Symbols — Preview Them All<\/title>/);
  assert.doesNotMatch(english, /告别/);

  const chinese = await (await render("en-US,en;q=0.9", "theme=dark; sf-locale=zh")).text();
  assert.match(chinese, /<html lang="zh-CN"/);
  assert.match(chinese, /历史记录/);

  // A cookie that says something else decides nothing.
  const nonsense = await (await render("en-US,en;q=0.9", "sf-locale=klingon")).text();
  assert.match(nonsense, /<html lang="en"/);
});

test("the transport the privacy promise depends on is not optional", async () => {
  const [worker, headers] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/_headers", import.meta.url), "utf8"),
  ]);

  // workers.dev answers on plain HTTP too, and it did — 200, the whole page.
  // Over http the CSP that enforces "your text never leaves the browser" is
  // just a header an attacker on the path can replace, so the promise on screen
  // has nothing behind it. `navigator.clipboard` is gated on a secure context
  // as well, so copying was silently on the fallback route for those visitors.
  assert.match(worker, /url\.protocol === "http:"/);
  assert.match(worker, /Response\.redirect\(url\.toString\(\), 301\)/);
  // And the visit after this one must not start in plaintext at all.
  assert.match(worker, /Strict-Transport-Security/);
  assert.doesNotMatch(worker, /Strict-Transport-Security[^\n]*preload/);

  // Security headers belong to the Worker; caching belongs to _headers, which
  // Cloudflare applies to asset responses only. Both fixed paths were falling
  // through to must-revalidate — og.png is half a megabyte, refetched in full
  // on every share. Not `immutable`: unlike /symbols/*, these keep their names
  // when the Swift renderer redraws them.
  assert.match(headers, /\/og\.png\n\s+Cache-Control: public, max-age=3600/);
  assert.match(headers, /\/favicon\.png\n\s+Cache-Control: public, max-age=3600/);
  assert.doesNotMatch(headers, /\/og\.png\n\s+Cache-Control:[^\n]*immutable/);
});

test("the site's one address is spelled the same in all three places that name it", async () => {
  const [strings, robots, sitemap] = await Promise.all([
    readFile(new URL("../app/messages.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8"),
  ]);

  const origin = /export const siteOrigin = "([^"]+)"/.exec(strings)?.[1];
  assert.ok(origin, "no siteOrigin in messages.ts");
  // The two static files cannot import it, so they repeat it — and a canonical
  // link, a sitemap and a robots directive that disagree about the host are
  // worse than not having them.
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`), `robots.txt does not point at ${origin}`);
  assert.ok(sitemap.includes(`<loc>${origin}/</loc>`), `sitemap.xml does not list ${origin}`);
  // 7,988 mask PNGs are artwork, not documents. Left crawlable, one page's crawl
  // becomes eight thousand.
  assert.match(robots, /^Disallow: \/symbols\/$/m);
});

test("the share card's alt text says what the card itself says", async () => {
  const strings = await readFile(new URL("../app/messages.ts", import.meta.url), "utf8");

  const taglines = [...strings.matchAll(/brand: \{ tagline: "([^"]+)" \}/g)].map((match) => match[1]);
  const alts = [...strings.matchAll(/imageAlt: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(taglines.length, 2, `expected two taglines, found ${taglines.length}`);
  assert.equal(alts.length, 2, `expected two imageAlt strings, found ${alts.length}`);

  // The card prints brand.tagline verbatim, so the alt has to carry the same
  // words. These drifted once already: the card was redrawn on 2026-08-20 and
  // both alts went on describing the sentence the old card used to print —
  // still true about the product, wrong about the picture, and nothing on the
  // page could notice. Emoji is stripped on the way in; this string is spoken.
  for (const [index, tagline] of taglines.entries()) {
    const spoken = tagline.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, "").trim();
    // "Catch them all. No more busywork" -> "catch them all, no more busywork":
    // one alt phrase rather than two sentences, the shape the alts already had.
    const phrase = spoken.replace(/\.\s+/g, ", ").toLowerCase();
    const alt = alts[index].toLowerCase();
    assert.ok(
      alt.includes(phrase) || alt.includes(spoken.toLowerCase()),
      `imageAlt ${JSON.stringify(alts[index])} does not carry the tagline ${JSON.stringify(tagline)}`,
    );
    assert.ok(alt.startsWith("better sf symbols"), `imageAlt ${JSON.stringify(alts[index])} does not name the product first`);
  }
});

test("keeps adaptive density, local history, and responsive behavior in the product source", async () => {
  const [page, view, css, layout, strings] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/symbol-flow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/messages.ts", import.meta.url), "utf8"),
  ]);

  assert.match(view, /symbol-flow-history/);
  // Pasting previews on its own; typing deliberately does not.
  assert.match(view, /onPaste=\{markPaste\}/);
  assert.match(view, /pastedRef/);
  // The example is the field's grey text, never its value: typing starts from
  // an empty field, and the button falls back to the example when nothing was
  // typed — so it is never disabled. Running it does write a history row: the
  // gate that excluded it existed because the example was also a seeded row.
  assert.match(view, /placeholder=\{inputGhost\(t\)\}/);
  assert.match(view, /function runCheck/);
  assert.doesNotMatch(view, /disabled=\{!text\.trim\(\)\}/);
  assert.doesNotMatch(view, /nextText !== t\.exampleText/);
  // What the press puts in the field is the whole grey block — `inputGhost`,
  // 「例如三种分享按钮：」 included — not `exampleText` with that line trimmed
  // off. Trimming read tidier and looked worse: the grey turned black and the
  // top line went out from under the rest, so a press that changes nothing but
  // a colour appeared to eat a line. The line names no symbol either way, and
  // there are assertions further down pinning that the example is exactly three
  // tiles in both languages.
  assert.match(view, /setText\(inputGhost\(t\)\);\s*\n?\s*checkNames\(inputGhost\(t\)\)/);
  assert.doesNotMatch(view, /setText\(t\.exampleText\)/);
  // Every row carries a time. Demanding one is also what drops the demo rows an
  // older build left in this same storage key.
  assert.match(view, /typeof entry\?\.createdAt === "number"/);
  // Newest first, by the clock — not by the order the rows were assembled in.
  assert.match(view, /orderedHistory/);
  assert.match(view, /b\.createdAt - a\.createdAt/);
  assert.match(strings, /export function inputGhost/);
  // Links, addresses and file names are dotted lowercase words too. Without
  // these two, an AI answer citing developer.apple.com or a paste of Swift code
  // filed index.html under "did you mean".
  assert.match(view, /text\.replace\(linkLike, " "\)\.replace\(filePathLike, " "\)/);
  // `main.swift` arrives as one token and fileLike files it away; `Toolbar.swift`
  // does not, because the capital breaks the word boundary and leaves only
  // `swift` — a real symbol, and so a tile nobody asked for. Swift's own naming
  // convention is capitalised, so this fired on every code paste.
  assert.match(view, /const filePathLike =/);
  // Fifteen real symbols end in `.lock`, so stripping it before the catalogue is
  // consulted would hide them. fileLike may name it; filePathLike may not.
  assert.doesNotMatch(/const filePathLike =[\s\S]*?;/.exec(view)?.[0] ?? "", /\|lock\)/);
  // linkLike only catches an address that announces itself with a scheme or a
  // www. — an AI answer citing developer.apple.com writes neither, and the host
  // landed under 「待确认」 with a symbol suggested for it.
  assert.match(view, /const domainLike =/);
  assert.match(view, /!domainLike\.test\(token\)/);
  // `.app` and `.tv` are excluded: 12 real symbols end in one, 6 in the other.
  assert.doesNotMatch(/const domainLike = [^;]*;/.exec(view)?.[0] ?? "", /\|app\||\|tv\|/);
  assert.match(view, /looksLikeSymbol && !fileLike\.test\(token\)/);
  assert.match(view, /data-density=\{density\}/);
  assert.match(view, /formatForCopy/);
  assert.match(view, /@phosphor-icons\/react/);
  assert.match(css, /result-list\[data-density="compact"\]/);
  assert.match(css, /result-list\[data-density="dense"\]/);
  // Sizes are derived from the viewport instead of hard-coded, so short laptop
  // screens fit the whole shell without clipping.
  assert.match(css, /--u: clamp\(/);
  assert.match(css, /--fs-md: clamp\(/);
  // Results are square, click-to-copy tiles whose size is planned from the
  // list's real box. `auto-fill` with a fixed minimum is what used to make the
  // tiles jump *smaller* every time another column happened to fit.
  assert.match(view, /planTiles/);
  assert.doesNotMatch(css, /repeat\(auto-fill/);
  // Tracks the planner asked for, centred as a block: the leftover tile of a
  // wrapped row lines up under the first column instead of floating between
  // the ones above it, which is what a centred flex wrap used to do.
  assert.match(css, /grid-template-columns: repeat\(var\(--tile-columns/);
  assert.match(css, /\.result-list\[data-layout="rows"\]/);
  // A history row is as tall as its own card, or a wrapped second line of chips
  // draws straight through the card's bottom border.
  assert.match(css, /grid-auto-rows: max-content/);
  assert.match(view, /data-layout=\{tile\.rows/);
  assert.match(css, /--tile-size/);
  assert.match(css, /aspect-ratio: 1 \/ 1/);
  assert.match(css, /copy-affordance svg/);
  // Everything inside a tile scales off the tile, not the viewport: dragging a
  // column is what changes the card, and the viewport never moved.
  // 0.71875rem is 11.5px at the default root size, to the pixel. Every bound in
  // the scale is rem for one reason: measured, a reader who sets a larger
  // default font size used to move nothing at all on this page — px and vw are
  // both out of that preference's reach, so it was silently discarded.
  assert.match(css, /font-size: clamp\(0\.71875rem, calc\(var\(--tile-size/);
  assert.match(css, /--fs-xs: clamp\(0\.71875rem/);
  assert.doesNotMatch(css, /--fs-[a-z0-9]+: clamp\([0-9.]+px/);
  // The two language buttons were the only controls on the page under the 40px
  // touch floor this project sets for itself — 40×34, measured with touch
  // emulation on. 2.5rem is 40px at the default root.
  assert.match(css, /--chip-h: 2\.5rem/);
  assert.match(css, /@keyframes tile-in/);
  // The reveal belongs to the press, not to the page load in front of it. The
  // run counter rides in every tile's key, so asking for a preview hands React
  // fresh elements and `tile-in` plays again. Without it the animation was
  // spent before the reader arrived and never fired for a set that had not
  // changed — pressing the main button on the grey example filled the field and
  // wrote a history row, and left the panel the button *names* as the one thing
  // on screen that did not move.
  assert.match(view, /const \[runId, setRunId\] = useState\(0\)/);
  assert.match(view, /setRunId\(\(current\) => current \+ 1\)/);
  assert.match(view, /key=\{`\$\{runId\}:\$\{name\}`\}/);
  // The stagger's delay is zeroed along with its duration under reduced motion:
  // `tile-in` is `backwards`, so a delay left standing holds the transparent
  // first frame on screen — a flicker, which is the thing that query removes.
  assert.match(css, /animation-duration: 0\.01ms !important; animation-delay: 0ms !important/);
  // The copy hint is quiet at rest, never absent. At `opacity: 0` it was the
  // only thing on a pointer device saying a tile can be clicked, and it was
  // invisible until hover — a first visit showed three glyphs and no way to
  // learn the one action this page exists for. A phone has always shown it
  // outright, having no hover to reveal it with.
  assert.match(css, /^\.copy-affordance \{[^}]*opacity: 0\.36;/m);
  assert.doesNotMatch(css, /^\.copy-affordance \{[^}]*opacity: 0;/m);
  // A phone's list width has no drag handle behind it, so the tiles fill the
  // row there instead of centring a fixed square between two wide margins.
  assert.match(view, /fillRow\(planTiles\(/);
  // The three panels are user-resizable, and never past their own content.
  assert.match(view, /role="separator"/);
  assert.match(view, /symbol-flow-columns/);
  assert.match(css, /\.panel-resizer/);
  assert.match(view, /min-content var\(--handle-size\) min-content/);
  assert.match(view, /--col-min-\$\{suffix\[index\]\}/);
  // The soul button keeps its keycap parts and the narrow column stays legible.
  assert.match(view, /soul-button/);
  assert.match(css, /--soul-travel/);
  assert.match(css, /@keyframes soul-glint/);
  assert.match(css, /@container \(max-width: 300px\)/);
  assert.match(css, /container-type: inline-size/);
  // Language follows the request, with a stored override.
  // Both entry points resolve the language the same way: the reader's cookie
  // first, the browser's Accept-Language after. Calling detectLocale directly
  // here is the bug — it ignores the choice and renders the wrong language.
  assert.match(page, /resolveLocale\(requestHeaders\.get\("cookie"\)/);
  assert.match(layout, /resolveLocale\(requestHeaders\.get\("cookie"\)/);
  assert.doesNotMatch(page, /detectLocale\(/);
  assert.doesNotMatch(layout, /detectLocale\(/);
  assert.match(strings, /localeCookieName = "sf-locale"/);
  assert.match(view, /rememberLocale/);
  assert.match(view, /localeStorageKey/);
  assert.match(strings, /symbol-flow-locale/);
  assert.match(view, /lang-switch/);
  assert.match(strings, /htmlLang: "zh-CN"/);
  assert.match(strings, /htmlLang: "en"/);
  // The input grows with the text instead of hiding it behind an inner scrollbar.
  assert.match(css, /field-sizing: content/);
  assert.match(css, /max-height: none/);
  // The brand sits in a bar above the workbench, so the three panel titles
  // start on one line — and outside .app-shell, so it cannot contribute its
  // own width to the min-content measurement the drag clamp is built from.
  assert.match(view, /className="app-frame"/);
  assert.match(view, /className="app-header"/);
  assert.match(css, /\.app-frame \{/);
  assert.match(/<header className="app-header">[\s\S]*?<\/header>/.exec(view)?.[0] ?? "", /brand-block/);
  // One mark everywhere, two-tone like favicon.png: fill plus inverse overlay.
  assert.match(view, /function BrandGlyph/);
  assert.match(strings, /brandSymbol = "eyes"/);
  assert.match(css, /\.brand-glyph \.symbol-glyph \+ \.symbol-glyph/);
  // Removed surfaces stay removed.
  assert.doesNotMatch(view, /场景预览|targetVersion|privacy-note|density-hint/);
  assert.doesNotMatch(css, /scene-preview|history-privacy|\.local-note/);
  // The privacy line is commented out on request, so nothing on screen states
  // it. It was never a caption under the button either — that placement read as
  // an instruction for the button. The markup and the CSS stay put, so bringing
  // it back is uncommenting the footer, not rebuilding it.
  assert.doesNotMatch(view, /local-note/);
  assert.match(view, /<footer className="app-footer">\s*<p>\{t\.footer\.privacy\}<\/p>\s*<\/footer> \*\//);
  assert.match(css, /\.app-footer \{/);
  // A tile is a symbol and its name. No version line, no counts above the grid.
  assert.doesNotMatch(view, /result-meta|results\.valid|results\.ignored/);
  assert.doesNotMatch(css, /\.result-meta/);
  assert.doesNotMatch(strings, /minIOS/);
  assert.match(css, /@media \(min-width: 1241px\) and \(max-height: 600px\)/);
  assert.match(css, /prefers-reduced-motion/);
  // The stylesheet's reduced-motion block cannot reach a scroll that names its
  // own `behavior` — the argument beats `scroll-behavior`. The one animation
  // this file starts therefore has to ask the preference itself.
  assert.match(view, /function prefersReducedMotion/);
  assert.match(view, /prefersReducedMotion\(\) \? "auto" : "smooth"/);
  // The suggested name carries its picture. This was the last place in the
  // product where a reader had to judge a name by reading it, and it is the
  // worst one: they have just been handed a name that does not exist.
  assert.match(view, /<SymbolGlyph name=\{suggestion\} \/>/);
  assert.match(css, /\.invalid-list \.symbol-glyph/);
  // `maxLength` drops the tail of an over-long paste in the DOM, before React
  // is told anything. Silently, is the problem — so the paste handler measures
  // what was lost and says so.
  assert.match(view, /t\.toast\.truncated\(dropped\)/);
  assert.match(strings, /truncated: \(count\)/);
  assert.match(css, /@media \(max-width: 580px\)/);
  assert.match(layout, /og\.png/);
  // The brand bar places every child by hand below 840px. Left to
  // auto-placement, the action cluster dropped into a row of its own in the
  // first column and pushed the name and tagline halfway across a phone.
  assert.match(css, /\.brand-actions \{ grid-area: 1 \/ 3 \/ 2 \/ 4; \}/);
  assert.match(css, /\.brand-name \{ grid-area: 1 \/ 2 \/ 2 \/ 3; \}/);
  // A phone keeps two rows — the author links are what comes off instead, so the
  // bar never grows a third row for a pair of chips leading somewhere else.
  const phoneBar = /@media \(max-width: 580px\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
  assert.match(phoneBar, /\.brand-actions \.brand-link \{ display: none; \}/);
  assert.doesNotMatch(css, /\.brand-actions \{ grid-area: 3 \//);
  // …and on that phone the cluster rides row 2 beside the tagline, with the
  // <h1> taking the whole of row 1. The version before this stood the cluster on
  // end — one track spanning both rows — which left the palette chip alone in
  // the top-right corner with the switch underneath it, and at 320px it still
  // broke the name across two lines, the one thing it had been bought to
  // prevent. Measured on the change: 320px zh went 139px / 2 name lines to
  // 107px / 1, and 390px zh stayed at ~108px with the two controls on one row.
  assert.match(phoneBar, /\.brand-name \{ grid-area: 1 \/ 2 \/ 2 \/ 4; \}/);
  assert.match(phoneBar, /\.brand-actions \{ grid-area: 2 \/ 3 \/ 3 \/ 4;/);
  assert.doesNotMatch(phoneBar, /\.brand-actions \{[^}]*flex-direction: column/);
  // The two icon links carry no hover tooltip — a GitHub logo and BetterMapIt's
  // own app icon already say what they are. They must keep `aria-label` all the
  // same: their only content is an icon, so without it a screen reader reads
  // out two links with no name.
  assert.doesNotMatch(view, /className="brand-link[^"]*"[^>]*\stitle=/);
  assert.match(view, /className="brand-link"[^>]*aria-label=\{t\.links\.github\}/);
  assert.match(view, /className="brand-link is-art"[^>]*aria-label=\{t\.links\.betterMapIt\}/);
  // The three panel titles are one line of the workbench at every width, so the
  // preview's header never stacks its title above its controls — that centred
  // 「预览」 while its two neighbours stayed left.
  assert.doesNotMatch(css, /\.results-header \{ flex-direction: column/);
  // A tablet in portrait keeps both halves in view; only phones stack.
  assert.match(css, /@media \(max-width: 700px\)/);
  // The count is on the button, not on a line beside it, and it is the count of
  // what the press will produce: `liveAnalysis` reads `pendingText`, which is
  // the example while the field is blank. Zero drops back to the bare verb.
  assert.match(view, /t\.input\.checkCount\(liveAnalysis\.valid\.length\)\s*:\s*t\.input\.check/);
  assert.doesNotMatch(view, /live-count/);
  assert.doesNotMatch(css, /live-count/);
  // A phone gets the tiles without the chrome over them: the copy-format select
  // and 「复制全部」 are hidden, and tapping a tile is still the copy.
  assert.match(css, /@media \(max-width: 580px\)[\s\S]*?\.result-controls \{ display: none; \}/);
  // The history is the reader's, so nothing seeds it and nothing reseeds it —
  // switching language must not put rows into an empty list.
  assert.doesNotMatch(view, /seededHistory|isSeeded/);
  assert.doesNotMatch(strings, /\bseeds:/);
  assert.match(view, /useState<HistoryEntry\[\]>\(\[\]\)/);
  // The boot script edits <html> before React loads; without this, React logs a
  // hydration mismatch about the style attribute it did not write.
  assert.match(view, /columnBootScript/);
  assert.match(view, /restored\s*$/m);
  assert.match(layout, /suppressHydrationWarning/);
  // The browser's own bars are part of a dark page on a phone.
  assert.match(layout, /themeColor/);
  assert.match(layout, /apple: "\/favicon\.png"/);
});

test("all five palettes declare the same tokens, and the stored one is on screen before React", async () => {
  const [css, view, strings] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/symbol-flow.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/messages.ts", import.meta.url), "utf8"),
  ]);

  // A theme block is a complete palette or it is a trap: a token declared in
  // one block and forgotten in another falls back to `:root`, which means the
  // *default* theme's value, silently, on one element somewhere down the page.
  const palette = (header) => {
    const start = css.indexOf(header);
    assert.notEqual(start, -1, `no theme block for ${header}`);
    const open = css.indexOf("{", start);
    const close = css.indexOf("\n}", open);
    const names = [...css.slice(open, close).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]);
    assert.ok(names.length > 30, `${header} declares only ${names.length} tokens`);
    return new Set(names);
  };
  const reference = palette('\n[data-theme="amber"] {');
  for (const name of ["midnight", "dark-modern", "github-dark", "catppuccin"]) {
    const other = palette(`[data-theme="${name}"] {`);
    const missing = [...reference].filter((token) => !other.has(token));
    const extra = [...other].filter((token) => !reference.has(token));
    assert.deepEqual(missing, [], `${name} is missing ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `amber is missing ${extra.join(", ")}`);
  }

  // The default theme is the bare `:root` selector's values, so the amber block
  // must be attached to it rather than standing alone — that is what a reader
  // with no stored choice, or no JavaScript, gets.
  assert.match(css, /:root,\n\[data-theme="amber"\] \{/);
  // …and the derived layer is attached to `[data-theme]` as well as `:root`, or
  // the picker's swatches preview the running theme five times over: a custom
  // property inherits as its computed value, already substituted.
  assert.match(css, /:root,\n\[data-theme\] \{/);
  assert.match(view, /className="theme-swatch" data-theme=\{option\}/);

  // Nothing may name a hue any more: `--blue` was the accent, and the accent is
  // amber, purple or frost depending on the palette.
  assert.doesNotMatch(css, /var\(--blue\b|var\(--green\b|var\(--amber\b/);
  // Every tint is derived from the four ramps, so an alpha exists once.
  assert.match(css, /--accent: rgb\(var\(--accent-rgb\)\)/);
  assert.match(css, /--line: rgba\(var\(--hairline-rgb\), 0\.14\)/);

  // Applied before the first paint, like the column widths and for the same
  // reason — a palette that arrives in an effect is one the reader watches
  // arrive. `<html>` carries the truth; the picker's state is only a mirror,
  // and it starts null because the server cannot know which palette this is.
  assert.match(view, /h\.setAttribute\("data-theme"/);
  assert.match(view, /symbol-flow-theme/);
  assert.match(view, /useState<Theme \| null>\(null\)/);
  assert.match(view, /const themes: Theme\[\] = \["amber", "midnight", "dark-modern", "github-dark", "catppuccin"\]/);

  // The chip is a control, not a way out of the site, so it is not a
  // `.brand-link` — that class is what the phone breakpoint hides.
  assert.match(view, /className="theme-toggle"[\s\S]{0,220}aria-label=\{t\.theme\.label\}/);
  assert.doesNotMatch(view, /className="theme-toggle"[^>]*\stitle=/);
  assert.match(strings, /theme: \{ label: "配色主题" \}/);
  assert.match(strings, /theme: \{ label: "Colour theme" \}/);
  // Palette names are proper nouns, like the brand — one spelling, both
  // languages, and not this project's to rename.
  for (const name of ["Ink & Amber", "Midnight", "Dark Modern", "GitHub Dark", "Catppuccin Mocha"]) {
    assert.ok(strings.includes(`"${name}"`), `themeNames is missing ${name}`);
  }

  // The cluster's order, asked for by name: palette, source, BetterMapIt,
  // language. It is not decoration — the two ends are the two controls a phone
  // keeps, and the pair in the middle is what comes off at 580px, so the order
  // is what makes the phone bar read as "theme … language" with nothing
  // reflowing around a gap.
  const cluster = /<div className="brand-actions">([\s\S]*?)\n          <\/div>/.exec(view)?.[1] ?? "";
  const order = [...cluster.matchAll(/className="(theme-picker|brand-link|brand-link is-art|lang-switch)"/g)]
    .map((m) => m[1]);
  assert.deepEqual(order, ["theme-picker", "brand-link", "brand-link is-art", "lang-switch"]);

  // …and the chip survives the phone, where the two author links do not.
  const phone = /@media \(max-width: 580px\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
  assert.doesNotMatch(phone, /theme-toggle \{ display: none/);

  for (const [language, label] of [["zh-CN", "配色主题"], ["en-US", "Colour theme"]]) {
    const html = await (await render(language)).text();
    assert.match(html, new RegExp(`class="theme-toggle"[^>]*aria-label="${label}"`));
    // The server renders no theme attribute at all: the default palette is the
    // bare `:root`, and the boot script is what names it.
    assert.doesNotMatch(html, /<html[^>]*data-theme=/);
    // The menu is shut on the first frame. That is the whole reason its
    // contents are allowed to depend on state the server could not have.
    assert.doesNotMatch(html, /theme-menu/);
  }
});
