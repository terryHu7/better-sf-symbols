"use client";

import type {
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CaretRight, Check, Copy, GithubLogo, Info, Trademark, Trash } from "@phosphor-icons/react";

import type { CopyFormat, Locale, Messages } from "./messages";
import { authorLinks, brandName, brandSymbol, inputGhost, isLocale, localeCookieName, localeStorageKey, locales, messages } from "./messages";
import { restrictedProducts, symbolRestrictions, symbolVersions } from "./symbol-catalog";
import { fillRow, planTiles, tileRowsBelow } from "./tile-plan";

/**
 * The catalogue is generated, never hand-written — see the header of
 * app/symbol-catalog.ts. Both this and the rendered PNGs come from one list, so
 * "the name is known" and "a picture exists" cannot disagree.
 */
const symbolVersion = symbolVersions();
const symbolRestriction = symbolRestrictions();

/**
 * Names bucketed by their first dotted segment. `symbolSuggestion` needs this:
 * running an edit distance against all 7,988 names for every unrecognised token
 * is far too slow to do while rendering.
 */
const namesByHead = (() => {
  const heads = new Map<string, string[]>();
  for (const name of symbolVersion.keys()) {
    const head = name.slice(0, name.indexOf(".") === -1 ? undefined : name.indexOf("."));
    const bucket = heads.get(head);
    if (bucket) bucket.push(name);
    else heads.set(head, [name]);
  }
  return heads;
})();

/** A green tick over "nothing found" reads as success. It is not one. */
type ToastTone = "success" | "notice";

type Analysis = {
  valid: string[];
  invalid: string[];
};

type HistoryEntry = {
  id: string;
  /**
   * Epoch ms, and required: every row in this list is something the reader ran.
   * It is also what tells an old build's demo rows apart from real ones when
   * they come back out of localStorage — see the restore effect.
   */
  createdAt: number;
  text: string;
  symbols: string[];
};


// A whole AI answer is the unit of paste, and 3,000 characters truncated one
// mid-conversation. The browser drops the overflow silently, so the reader
// would never learn the tail of their own paste had gone missing.
const maxInputLength = 20000;

/**
 * Column weights for the three panels, emitted as fr weights so the ratio
 * survives a window resize.
 *
 * These are a golden progression — 1 : φ : φ² for history : input : preview,
 * normalised over φ² + φ + 1. Because φ² = φ + 1, two things are true of it at
 * once: **the preview is exactly as wide as the input and the history
 * combined**, and **input : history is φ**.
 *
 * It also measures best, which is why it is here rather than for the geometry.
 * At 1512×744 with three results it puts the tiles at their 288px ceiling
 * (28.5/44/27.5 gave 265px, and equal thirds only 191px); at six results and
 * 1366×620 it gives 196px against 169px and 142px. Equal thirds is the worst of
 * the three in every measurement: it hands the history column ~140px more than
 * its widest chip can use and bills the preview — the one panel whose whole job
 * is to be looked at — for the difference.
 */
const defaultColumns = [30.9, 50, 19.1];
const columnsStorageKey = "symbol-flow-columns";
/**
 * The last measurement of what each panel's content needs, remembered so the
 * *floors* can be restored before the first frame too. Without it the stylesheet
 * placeholder has to stand in, and a placeholder that guesses high clamps a
 * stored width upward for a few frames and then lets go of it — the same jump
 * this whole mechanism exists to remove, just smaller (22px).
 */
const columnMinsStorageKey = "symbol-flow-column-mins";
/**
 * The last tile plan, for the same reason. `planTiles` needs the list's real
 * box, which does not exist until the list is laid out, so the server has to
 * guess — and it guessed three columns while the panel held four. The reader
 * watched 3+1 become 4 on every load.
 */
const tileStorageKey = "symbol-flow-tile";
const historyStorageKey = "symbol-flow-history";
const formatStorageKey = "symbol-flow-copy-format";

/**
 * The stored widths, applied before the first frame instead of after it.
 *
 * They cannot come from the server: nothing about the reader's last drag is in
 * the request. And a React effect is a paint too late — the page arrived at the
 * default ratio and then snapped to the stored one on **every** reload, which
 * is the one moment a returning reader is looking at the layout.
 *
 * So the three weights are written onto `<html>` by a parser-blocking script
 * that runs before `.app-shell` has even been parsed. Two things keep it
 * honest: it writes the defaults when there is nothing stored, so the fallbacks
 * in the stylesheet are only ever the no-JavaScript case; and **the shell
 * carries no inline widths until the client has restored them**, because an
 * inline custom property shadows the inherited one and would put the jump
 * straight back.
 */
const columnBootScript =
  `(function(){try{` +
  `var h=document.documentElement,d=h.style,k=["a","b","c"];` +
  `var read=function(key){try{var raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}catch(e){return null;}};` +
  `var three=function(v){return Array.isArray(v)&&v.length===3&&v.slice(0,3).every(function(n){return typeof n==="number"&&isFinite(n)&&n>0;});};` +
  `var w=read(${JSON.stringify(columnsStorageKey)});if(!three(w))w=${JSON.stringify(defaultColumns)};` +
  `k.forEach(function(n,i){d.setProperty("--col-"+n,w[i]+"fr");});` +
  // The floors travel with the widths: a placeholder that guesses above a
  // stored width would clamp it for a few frames and then release it.
  `var m=read(${JSON.stringify(columnMinsStorageKey)});` +
  `if(three(m)&&m.every(function(n){return n<2000;}))k.forEach(function(n,i){d.setProperty("--col-min-"+n,m[i]+"px");});` +
  // Columns, tile edge and the compact-row switch, as last measured.
  `var t=read(${JSON.stringify(tileStorageKey)});` +
  `if(Array.isArray(t)&&typeof t[0]==="number"&&t[0]>=1&&t[0]<=32&&typeof t[1]==="number"&&t[1]>=40&&t[1]<=400){` +
  `d.setProperty("--tile-columns",t[0]);d.setProperty("--tile-size",t[1]+"px");` +
  `if(t[2])h.setAttribute("data-tile-rows","");}` +
  // The history the server rendered is the empty state — it cannot know this
  // browser's rows. When there are some, they are about to replace it, so keep
  // the list from reading 「还没有历史记录」 for the frames before they arrive.
  // `createdAt` is on exactly the rows the reader ran — no JSON parse needed.
  `var s=localStorage.getItem(${JSON.stringify(historyStorageKey)});` +
  `var pending=s&&s.indexOf('"createdAt"')!==-1;` +
  `if(pending)h.setAttribute("data-history-pending","");` +
  // Same again for the copy format: the server can only render the default, so
  // a reader who picked SwiftUI is told "Name" for as long as hydration takes —
  // about what the click is going to put on their clipboard. The select's width
  // comes from its widest option, so holding the word moves nothing.
  `var f=localStorage.getItem(${JSON.stringify(formatStorageKey)});` +
  `if(f&&f!=="name"){pending=1;h.setAttribute("data-format-pending","");}` +
  // Belt and braces: if the bundle never hydrates, both must still appear.
  `if(pending)setTimeout(function(){h.removeAttribute("data-history-pending");` +
  `h.removeAttribute("data-format-pending");},1500);` +
  `}catch(e){}})()`;

/**
 * A panel may never be dragged narrower than its own content needs — the left
 * panel stops before the language switch is clipped, not at a number somebody
 * typed. `measurePanelMinimums` asks the browser for those widths, so the floor
 * follows the copy, the language, and the fluid type scale by itself.
 *
 * The bounds below only keep a pathological measurement from locking the
 * layout: a floor for "narrower than this is useless whatever fits", and a
 * ceiling for "no single panel may claim this much of the drag range".
 */
const minColumnFloor = [300, 320, 232];
const minColumnCeiling = [520, 560, 440];

function resizeColumns(start: number[], index: number, deltaX: number, mins: number[]) {
  const pair = start[index] + start[index + 1];
  // When the pair cannot satisfy both floors there is nothing to enforce; split
  // the shortfall proportionally instead of letting one panel eat the other.
  const scale = Math.min(1, pair / (mins[index] + mins[index + 1]));
  const minFirst = mins[index] * scale;
  const minSecond = mins[index + 1] * scale;

  const first = Math.min(Math.max(start[index] + deltaX, minFirst), pair - minSecond);

  const next = [...start];
  next[index] = first;
  next[index + 1] = pair - first;
  return next;
}


function isCopyFormat(value: unknown): value is CopyFormat {
  return value === "name" || value === "swiftui" || value === "uikit" || value === "appkit";
}

/** Real elapsed time, computed at render — no stored label to go stale. */
function historyLabel(entry: HistoryEntry, t: Messages, now: number) {
  const minutes = Math.floor((now - entry.createdAt) / 60000);
  if (minutes < 1) return t.history.now;
  if (minutes < 60) return t.history.minutesAgo(minutes);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.history.hoursAgo(hours);

  const days = Math.floor(hours / 24);
  return days === 1 ? t.history.yesterday : t.history.daysAgo(days);
}

/**
 * English function words that are also real, single-word SF Symbols. With the
 * full catalogue in play, `a` matched out of ordinary prose in the very first
 * sentence of a pasted AI reply.
 *
 * Only bare words are filtered — anything dotted is unambiguous — and only
 * words no one would ever be recommending as an icon. `bell`, `globe`, `play`
 * and `person` are common English too, but in a reply about icons they are
 * almost certainly the symbol, so they stay. This list is about English, not
 * about Apple's catalogue, which is why it does not need regenerating.
 */
const proseWords = new Set(
  ("a an and are as at be been but by can do does for from had has have he her his if in into is it" +
    " its me my no nor not of off on or our out over she so than that the their them then there these" +
    " they this to too up us was we were what when which who will with would you your" +
    // Measured, not guessed: running real AI replies and technical prose through
    // this found `left`, `right` and `app` firing constantly — "align left", "on
    // the right", "right now", "the app is at v2.14.3". All three are real bare
    // symbols, and all three are ones nobody recommends bare: it is always
    // `chevron.left` / `arrow.left`, and `app.badge` / `app.fill`.
    //
    // `document` was considered and deliberately left out, as were `gift`,
    // `play`, `bell`, `globe`, `person`, `trash`, `lock`, `star`, `heart` and
    // the other ~40 single-word symbols that are also ordinary English. Those
    // really are recommended bare, and a false negative here is the worse bug:
    // a missing tile is invisible, a spurious one is merely noise.
    " left right app")
    .split(" "),
);

/**
 * Links and addresses, dropped before anything is tokenised. A URL is dotted
 * lowercase words, which is precisely the shape of a symbol name — an AI answer
 * that cites developer.apple.com would otherwise put that under 「待确认」 and
 * offer a symbol it might have meant, about a link.
 */
const linkLike = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/gi;

/**
 * `index.html`, `main.swift`, `tokens.json` — dotted lowercase words that are
 * files, not icons somebody misspelled. Only the 「待确认」 bucket consults this:
 * a real name is matched against the catalogue first, and no name in it ends
 * with any of these (checked against scripts/symbol-names.txt, 0 hits), so this
 * cannot hide a symbol. Pasting code is one of the five things this page is
 * for, and every path in it was arriving as a suggestion to reconsider.
 */
const fileLike =
  /\.(?:html?|css|jsx?|tsx?|json|md|txt|png|jpe?g|gif|svg|webp|pdf|zip|swift|kt|java|py|rb|go|rs|sh|ya?ml|toml|xml|plist|log|csv|lock)$/;

/**
 * File paths, dropped before tokenising — which is a different job from
 * `fileLike` above, and it exists because of a case that one cannot see.
 *
 * `main.swift` arrives as a single token, is not in the catalogue, and
 * `fileLike` files it away. `Toolbar.swift` does not: the capital T breaks the
 * word boundary, so the only thing tokenised is `swift` — and `swift` is a real
 * symbol (Apple's bird), so it goes straight to the results as a tile nobody
 * asked for. Swift's own file-naming convention is capitalised, and pasting
 * code is one of the five things this page is for, so this fires constantly.
 *
 * **`lock` is deliberately absent from this list.** Fifteen real symbols end in
 * `.lock`, so stripping before the catalogue is consulted would hide them —
 * `fileLike` can afford to name it because it only ever sees tokens the
 * catalogue has already rejected. Every other extension here was re-checked
 * against scripts/symbol-names.txt at 0 hits. Re-run that grep before adding
 * one; the two lists are not interchangeable.
 */
const filePathLike =
  /\b[\w-]+\.(?:html?|css|jsx?|tsx?|json|md|txt|png|jpe?g|gif|svg|webp|pdf|zip|swift|kt|java|py|rb|go|rs|sh|ya?ml|toml|xml|plist|log|csv)\b/gi;

/**
 * Bare domains — `developer.apple.com`, `sfsymbols.terryhu.workers.dev`.
 *
 * `linkLike` only catches an address that announces itself with a scheme or a
 * `www.`, and an AI answer citing a doc page usually writes neither. The result
 * was the exact failure `linkLike` was added to prevent, still happening: the
 * host listed under 「待确认」, with a symbol offered for it.
 *
 * **`app` and `tv` are excluded on purpose**: 12 real symbols end in `.app`
 * (`plus.app`, `arrow.down.app`…) and 6 in `.tv` (`4k.tv`, `sparkles.tv`…), so
 * those two TLDs cannot be told apart from a symbol here. Every TLD listed was
 * checked against scripts/symbol-names.txt at 0 hits — re-run that before
 * adding one.
 */
const domainLike = /\.(?:com|org|net|io|dev|co|ai|me|sh|gg|xyz|info|edu|gov|cn|us|uk|de|fr|jp)$/;

function analyzeText(text: string): Analysis {
  // Symbol names may open with a digit (`1.circle`, `4k.tv`, `00.square`): 946
  // of Apple's 7,988 names do, and the old `[a-z]` opener dropped every one of
  // them. No name contains an uppercase letter, so the match stays lowercase —
  // that is what keeps `Image(systemName:)` from tokenising as a symbol.
  const tokens =
    text.replace(linkLike, " ").replace(filePathLike, " ").match(/\b[a-z0-9]+(?:\.[a-z0-9]+)*\b/g) ?? [];
  // Sets, not `Array.includes`: this runs on every keystroke, and a 20,000
  // character paste is thousands of tokens — quadratic de-duplication there is
  // felt in the field, as a delay between the key and the letter.
  const valid = new Set<string>();
  const invalid = new Set<string>();

  for (const token of tokens) {
    if (symbolVersion.has(token)) {
      if (!token.includes(".") && proseWords.has(token)) continue;
      valid.add(token);
      continue;
    }

    const parts = token.split(".");
    const looksLikeSymbol =
      parts.length > 1 && parts.every((part) => /^[a-z][a-z0-9]*$/.test(part));

    if (looksLikeSymbol && !fileLike.test(token) && !domainLike.test(token)) invalid.add(token);
  }

  return { valid: [...valid], invalid: [...invalid] };
}

/** Levenshtein, iterative single-row — the names are short, the catalog small. */
function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * "Did you mean" has to be evidence, not the closest of whatever happens to be
 * in the catalogue. A wrong suggestion here is worse than silence: somebody
 * ships the icon we named. Counting shared segments got this badly wrong,
 * because sharing a modifier like `fill` or `circle` means nothing — it
 * answered `gearshape.fill` with `paperplane.fill`, and `person.crop.circle`
 * with `arrow.up.circle`.
 *
 * So a candidate has to clear one of two real bars: it starts with the same
 * word, or it is within a typo's reach of the whole name.
 */
const suggestionMaxDistance = 0.34;
const suggestionCache = new Map<string, string | null>();

function symbolSuggestion(name: string) {
  const cached = suggestionCache.get(name);
  if (cached !== undefined) return cached;

  const dot = name.indexOf(".");
  const head = dot === -1 ? name : name.slice(0, dot);
  let best: { name: string; score: number } | null = null;

  const consider = (candidate: string, sameHead: boolean) => {
    const normalized =
      editDistance(name, candidate) / Math.max(name.length, candidate.length);
    if (!sameHead && normalized > suggestionMaxDistance) return;
    const score = (sameHead ? 1 : 0) - normalized;
    if (!best || score > best.score) best = { name: candidate, score };
  };

  // Same-word bucket first — usually a handful of names, and it outranks
  // everything a spelling comparison could turn up.
  for (const candidate of namesByHead.get(head) ?? []) consider(candidate, true);

  if (!best) {
    // Typo hunt. Scanning all 7,988 names costs far too much to do per token,
    // so only names of a plausible length that open with the same two letters
    // are compared: a typo lands there in practice, and this turns a full scan
    // into a few dozen comparisons.
    const slack = Math.ceil(name.length * suggestionMaxDistance);
    const prefix = name.slice(0, 2);
    for (const candidate of symbolVersion.keys()) {
      if (Math.abs(candidate.length - name.length) > slack) continue;
      if (!candidate.startsWith(prefix)) continue;
      consider(candidate, false);
    }
  }

  const result = best ? (best as { name: string }).name : null;
  suggestionCache.set(name, result);
  return result;
}

function formatForCopy(name: string, format: CopyFormat) {
  if (format === "swiftui") return `Image(systemName: "${name}")`;
  if (format === "uikit") return `UIImage(systemName: "${name}")`;
  if (format === "appkit") {
    return `NSImage(systemSymbolName: "${name}", accessibilityDescription: nil)`;
  }
  return name;
}

/**
 * Storage is an enhancement, and it is allowed to fail: blocked site data makes
 * `localStorage` itself throw on access, and a full quota throws on write.
 * Unguarded, that threw out of an effect and took the whole checker down with
 * it — over a convenience the reader would never have missed.
 */
function remember(write: (storage: Storage) => void) {
  try {
    write(window.localStorage);
  } catch {
    // No stored history and no restored settings. Everything else still works.
  }
}

/**
 * The language, written where the *server* can read it back. Every other
 * preference here is the client's business, but this one decides what the HTML
 * says, and only a cookie reaches the request that renders it. localStorage is
 * written too: it is the fallback when cookies are refused, and the migration
 * path for anyone who picked a language before this existed.
 */
function rememberLocale(locale: Locale) {
  remember((storage) => storage.setItem(localeStorageKey, locale));
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${localeCookieName}=${locale}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  } catch {
    // Cookies refused. The stored copy above still catches it after hydration.
  }
}

/**
 * Whether the reader has asked their system to stop animating things. The CSS
 * side of this is a media query, but a scroll asked for in JavaScript carries
 * its own `behavior` and overrides `scroll-behavior` outright — so the one
 * animation this file starts has to consult the preference itself.
 */
function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** The pre-Clipboard-API route, also the last resort when the API says no. */
function copyBySelection(value: string) {
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  // iOS ignores select() on a readonly field; this is the part it honours.
  helper.setSelectionRange(0, value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    helper.remove();
  }

  return copied ? Promise.resolve() : Promise.reject(new Error("Clipboard copy failed"));
}

/**
 * Having the API is not the same as being allowed to use it: a denied clipboard
 * permission rejects, and the old route often still works. Only after both fail
 * does the reader get told to copy it themselves.
 */
function writeToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value).catch(() => copyBySelection(value));
  }

  return copyBySelection(value);
}

/**
 * A dotted name is the only long word on a tile, and `overflow-wrap: anywhere`
 * used to snap it wherever the line ran out — `square.and.arrow` / `.up`. The
 * dots are the real seams, so offer them as the break opportunities.
 */
function SymbolName({ name }: { name: string }) {
  const parts = name.split(".");

  return (
    <code>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <>.<wbr /></>}
          {part}
        </Fragment>
      ))}
    </code>
  );
}

/**
 * One weight for the whole site. `regular` reads thin and washed out at the
 * sizes the tiles now reach; `bold` is the one that holds up both as a 288px
 * hero glyph and as a 16px chip in the history list.
 *
 * All four weights are on disk. If this ever becomes a user-facing choice, make
 * it a prop threaded from one place — never hand-build the path at call sites.
 */
const symbolWeight = "bold";

function SymbolGlyph({ name, className = "" }: { name: string; className?: string }) {
  const mask = `url("/symbols/${name}--${symbolWeight}.png") center / contain no-repeat`;
  const style = { WebkitMask: mask, mask } as CSSProperties;

  return <span aria-hidden="true" className={`symbol-glyph ${className}`} style={style} />;
}

/**
 * The mark, drawn the way public/favicon.png is: `eyes` filled, with
 * `eyes.inverse` laid over it for the outline and pupils. A mask carries one
 * colour, so two-tone means two stacked layers of the same two SF Symbols the
 * Swift renderer composites — the tab, the header and the button then wear one
 * mark, not three variations of one.
 */
function BrandGlyph({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`brand-glyph ${className}`}>
      <SymbolGlyph name={brandSymbol} />
      <SymbolGlyph name={`${brandSymbol}.inverse`} />
    </span>
  );
}

export default function SymbolFlow({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = messages[locale];
  // The field starts empty and shows the example as its own grey text: whoever
  // types starts from a blank field instead of deleting somebody else's sample,
  // and whoever does not type still has something to press the button on.
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis>(() => analyzeText(t.exampleText));
  const [copyFormat, setCopyFormat] = useState<CopyFormat>("name");
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState(() => t.toast.copied(t.copyFormats.name));
  const [toastTone, setToastTone] = useState<ToastTone>("success");
  // Empty until this browser says otherwise. A first-time reader's history is
  // empty, and demo rows dressed as history told them they had done things they
  // never did — see 「已经删掉的东西」 in CLAUDE.md.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [restored, setRestored] = useState(false);
  const [columns, setColumns] = useState<number[]>(defaultColumns);
  const [activeResizer, setActiveResizer] = useState<number | null>(null);
  const [tile, setTile] = useState({ columns: 3, size: 125, rows: false });
  /** False until the list has been measured once; see columnBootScript. */
  const [planned, setPlanned] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const resultsRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelMins = useRef<number[]>([...minColumnFloor]);
  const lastStoredMins = useRef<string | null>(null);
  const lastStoredTile = useRef<string | null>(null);
  const pastedRef = useRef(false);

  /**
   * Newest first, always. The list is assembled from two sources — what this
   * session checked and what a previous session left in localStorage — so the
   * order is enforced here instead of being inherited from whatever order those
   * happened to arrive in.
   */
  const orderedHistory = useMemo(
    () => [...history].sort((a, b) => b.createdAt - a.createdAt),
    [history],
  );

  /** What the button would run right now — the typed text, or the example. */
  const pendingText = text.trim() ? text : t.exampleText;
  const liveAnalysis = useMemo(() => analyzeText(pendingText), [pendingText]);
  const density =
    analysis.valid.length <= 3 ? "comfortable" : analysis.valid.length <= 6 ? "compact" : "dense";

  /**
   * Adopt what the browser remembers, once, as soon as hydration commits.
   *
   * `set-state-in-effect` is disabled for this block deliberately. The rule
   * guards against effects that set state on every render; this one runs once
   * on mount and reads state the server could not have had — which is the case
   * the rule cannot distinguish. It used to be wrapped in `setTimeout(0)`
   * purely to get past the rule, and that timer bought nothing but an extra
   * macrotask of the server's defaults staying on screen. The column widths no
   * longer wait for any of this (see `columnBootScript`); the language, the
   * copy format and the reader's own history rows still do.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    {
      try {
        const savedHistory = window.localStorage.getItem("symbol-flow-history");
        const savedFormat = window.localStorage.getItem(formatStorageKey);
        const savedColumns = window.localStorage.getItem(columnsStorageKey);
        const savedLocale = window.localStorage.getItem(localeStorageKey);

        // A stored choice outranks the Accept-Language guess: plenty of
        // developers read Chinese on an English-locale machine, and vice versa.
        if (isLocale(savedLocale) && savedLocale !== initialLocale) {
          // Only reachable when the cookie is missing or refused: with it, the
          // server has already rendered this language. Writing it back is the
          // migration — one swap for readers who chose before the cookie, none
          // after — and the repair when a cookie is cleared but storage is not.
          setLocale(savedLocale);
          rememberLocale(savedLocale);
          // Nothing has been typed this early, so only the demo content moves.
          setAnalysis(analyzeText(messages[savedLocale].exampleText));
        }
        if (savedHistory) {
          const parsed = JSON.parse(savedHistory) as HistoryEntry[];
          if (Array.isArray(parsed)) {
            // A `createdAt` is what makes a row real, and demanding one is also
            // the migration: builds up to 2026-08-17 stored five demo rows here
            // that carry a topic key instead of a time. Restoring those would
            // put 「刚刚」 on content the reader never ran — the exact thing
            // dropping the examples was meant to stop.
            // Sorted before the cap, so the eight that survive are the eight
            // newest rather than the first eight the file happened to list.
            setHistory(
              parsed
                .filter((entry) => typeof entry?.createdAt === "number")
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 8),
            );
          }
        }
        if (isCopyFormat(savedFormat)) setCopyFormat(savedFormat);
        if (savedColumns) {
          const parsed = JSON.parse(savedColumns) as number[];
          const usable =
            Array.isArray(parsed) &&
            parsed.length === 3 &&
            parsed.every((value) => Number.isFinite(value) && value > 0);
          if (usable) setColumns(parsed);
        }
      } catch {
        // Local storage is an enhancement; the checker still works without it.
      } finally {
        setRestored(true);
        // The rows on screen are this browser's own from here, so the hold the
        // boot script put on the list comes off. In `finally`, because a list
        // that stays hidden after a failed restore is the worse bug.
        document.documentElement.removeAttribute("data-history-pending");
        document.documentElement.removeAttribute("data-format-pending");
      }
    }
  }, [initialLocale]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!restored) return;
    remember((storage) => storage.setItem("symbol-flow-history", JSON.stringify(history)));
  }, [history, restored]);

  useEffect(() => {
    if (!restored) return;
    remember((storage) => {
      storage.setItem(formatStorageKey, copyFormat);
      storage.setItem(columnsStorageKey, JSON.stringify(columns));
    });
  }, [columns, copyFormat, restored, locale]);

  useEffect(() => {
    document.documentElement.lang = messages[locale].htmlLang;
  }, [locale]);

  function changeLocale(next: Locale) {
    if (next === locale) return;

    // The example text is demo content, so it follows the language — anything
    // the reader typed or checked is left untouched, history rows included. An
    // empty field is showing the example as grey text, so its preview moves too.
    if (!text.trim()) {
      setAnalysis(analyzeText(messages[next].exampleText));
    } else if (text === t.exampleText) {
      setText(messages[next].exampleText);
      setAnalysis(analyzeText(messages[next].exampleText));
    }
    setLocale(next);
    rememberLocale(next);
  }

  function measureColumns() {
    const panels = shellRef.current?.querySelectorAll<HTMLElement>(":scope > .panel");
    if (!panels || panels.length !== 3) return null;
    return Array.from(panels, (panel) => panel.getBoundingClientRect().width);
  }

  /**
   * Asks the browser what each panel actually needs. Sizing the tracks to
   * `min-content` for one synchronous layout is the only way to get the real
   * answer — it accounts for the brand block, the language switch, the current
   * language's word lengths and the fluid type scale all at once. The result is
   * published as CSS variables, so the drag clamp and the grid's own floors are
   * the same numbers by construction rather than by a comment asking the next
   * person to keep two lists in sync. This is what stops the left edge from
   * ever sliding under the language switch.
   */
  useEffect(() => {
    function refreshPanelMinimums() {
      const shell = shellRef.current;
      // Below the two-column breakpoint the panels are stacked, not dragged.
      if (!shell || getComputedStyle(shell).display !== "grid") return;

      const previous = shell.style.gridTemplateColumns;
      shell.style.gridTemplateColumns =
        "min-content var(--handle-size) min-content var(--handle-size) min-content";
      const panels = shell.querySelectorAll<HTMLElement>(":scope > .panel");
      const measured =
        panels.length === 3 ? Array.from(panels, (panel) => panel.getBoundingClientRect().width) : null;
      shell.style.gridTemplateColumns = previous;
      if (!measured) return;

      panelMins.current = measured.map((value, index) =>
        Math.round(Math.min(Math.max(value, minColumnFloor[index]), minColumnCeiling[index])),
      );
      const suffix = ["a", "b", "c"];
      panelMins.current.forEach((value, index) => {
        shell.style.setProperty(`--col-min-${suffix[index]}`, `${value}px`);
      });

      // Remembered so the next load can apply the same floors before its first
      // frame, instead of a stylesheet placeholder that is bound to differ.
      const serialized = JSON.stringify(panelMins.current);
      if (serialized !== lastStoredMins.current) {
        lastStoredMins.current = serialized;
        remember((storage) => storage.setItem(columnMinsStorageKey, serialized));
      }
    }

    refreshPanelMinimums();

    const observer = new ResizeObserver(refreshPanelMinimums);
    if (shellRef.current) observer.observe(shellRef.current);
    // Web fonts land after first paint and change every measurement above.
    document.fonts?.ready.then(refreshPanelMinimums).catch(() => {});
    return () => observer.disconnect();
    // Locale swaps the copy, so the minimum widths move with it.
  }, [locale]);

  /**
   * Tile geometry is recomputed from the list's real box rather than from the
   * viewport, because what the drag handles change is the column, not the
   * window. `planTiles` then owns the "how big should a square be" decision.
   */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    function replan() {
      const node = listRef.current;
      if (!node) return;
      const styles = getComputedStyle(node);
      const gap = Number.parseFloat(styles.rowGap) || 8;
      const width = node.clientWidth - Number.parseFloat(styles.paddingLeft) - Number.parseFloat(styles.paddingRight);
      // Below the same width `planTiles` switches to a single column, the tiles
      // become compact rows and the one track has to span the list instead of
      // staying one square wide. It rides on the measurement rather than on a
      // container query because the list is its own container.
      const plan = fillRow(planTiles(analysis.valid.length, width, gap), width, gap);
      const next = { ...plan, rows: width <= tileRowsBelow };
      setTile((current) =>
        current.columns === next.columns &&
        current.rows === next.rows &&
        Math.abs(current.size - next.size) < 0.5
          ? current
          : next,
      );
      // From here the list carries the plan itself; before this the values came
      // from <html>, where columnBootScript put the last one before first paint.
      setPlanned(true);
      document.documentElement.removeAttribute("data-tile-rows");

      const serialized = JSON.stringify([next.columns, next.size, next.rows]);
      if (serialized !== lastStoredTile.current) {
        lastStoredTile.current = serialized;
        remember((storage) => storage.setItem(tileStorageKey, serialized));
      }
    }

    replan();
    const observer = new ResizeObserver(replan);
    observer.observe(list);
    return () => observer.disconnect();
  }, [analysis.valid.length]);

  /** Relative timestamps go stale silently; re-read the clock once a minute. */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  function startResize(index: number, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const start = measureColumns();
    if (!start) return;

    const handle = event.currentTarget;
    const startX = event.clientX;
    handle.setPointerCapture(event.pointerId);
    setActiveResizer(index);

    const move = (moveEvent: PointerEvent) => {
      setColumns(resizeColumns(start, index, moveEvent.clientX - startX, panelMins.current));
    };
    const stop = (stopEvent: PointerEvent) => {
      if (handle.hasPointerCapture(stopEvent.pointerId)) handle.releasePointerCapture(stopEvent.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      setActiveResizer(null);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  function resizeByKey(index: number, event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      setColumns(defaultColumns);
      return;
    }

    const step = event.key === "ArrowLeft" ? -28 : event.key === "ArrowRight" ? 28 : 0;
    if (step === 0) return;

    event.preventDefault();
    const start = measureColumns();
    if (start) setColumns(resizeColumns(start, index, step, panelMins.current));
  }

  function renderResizer(index: number, label: string) {
    const total = columns.reduce((sum, value) => sum + value, 0);

    return (
      <div
        className={`panel-resizer${activeResizer === index ? " is-active" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round((columns[index] / total) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        title={t.resizer.hint}
        onPointerDown={(event) => startResize(index, event)}
        onKeyDown={(event) => resizeByKey(index, event)}
        onDoubleClick={() => setColumns(defaultColumns)}
      />
    );
  }

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function showToast(message: string, name: string | null = null, tone: ToastTone = "success") {
    setToastMessage(message);
    setToastTone(tone);
    setCopiedName(name ?? "__status__");
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedName(null), 1800);
  }

  function checkNames(nextText = text, addToHistory = true) {
    const nextAnalysis = analyzeText(nextText);
    setAnalysis(nextAnalysis);

    // Running the example counts. It used to be excluded because the example
    // was already a seeded row in the list, so a second "just now" copy of it
    // was a duplicate; with the seeded rows gone that reason went with them, and
    // the alternative is a first-time reader pressing the one main button and
    // watching the history stay empty.
    if (nextAnalysis.valid.length > 0 && addToHistory) {
      const signature = nextAnalysis.valid.join("|");
      // Reading the clock is impure, and the rule cannot see that `checkNames`
      // is only ever reached from an event — a press, a paste, a history click —
      // and never from render. The stamp has to be taken when the run happens;
      // there is no other moment that is the truth about when it did.
      const entry: HistoryEntry = {
        id: signature,
        // eslint-disable-next-line react-hooks/purity -- event handler, not render
        createdAt: Date.now(),
        text: nextText,
        symbols: nextAnalysis.valid,
      };
      setHistory((current) => [entry, ...current.filter((item) => item.symbols.join("|") !== signature)].slice(0, 8));
    }

    // No "nothing found" toast: when there is nothing, the preview panel is
    // already showing that in full, one line above where the toast would land.
    // Two ways of saying it at once is one way too many.

    // Stacked, the preview is a screen below the button that fills it, so the
    // page has to travel. Asked of the layout rather than of a breakpoint: the
    // question is "is the preview somewhere the reader can see", and the
    // element can answer that itself — a copy of the CSS breakpoint here would
    // be one more number to keep in sync, and it already fell out of sync once
    // (760px against a layout that stacks at 840px).
    const results = resultsRef.current;
    if (results && results.getBoundingClientRect().top > window.innerHeight * 0.6) {
      // `behavior` given here wins over the stylesheet's `scroll-behavior`, so
      // the reduced-motion block in globals.css cannot reach this one. Ask.
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      requestAnimationFrame(() => results.scrollIntoView({ behavior, block: "start" }));
    }
  }

  /**
   * The button, and every other way of asking for a preview. An empty field is
   * not a dead end: it is showing the example in grey, and pressing the button
   * takes that at its word — the example becomes the real input, in black, so
   * what was checked is what the field says.
   */
  function runCheck() {
    if (text.trim()) {
      checkNames();
      return;
    }
    setText(t.exampleText);
    checkNames(t.exampleText);
  }

  function restoreHistory(entry: HistoryEntry) {
    setText(entry.text);
    checkNames(entry.text, false);
    // Name the destination, not the mechanism: the reader picked a row, so the
    // confirmation is "you are now looking at that row". Reusing the rendered
    // clock keeps the toast wording identical to the label they just clicked.
    showToast(t.toast.switched(historyLabel(entry, t, now)));
  }

  /**
   * Pasting is the whole reason this page exists, so it should not also cost a
   * click. The paste arms a flag and the change event that always follows it
   * carries the finished text, which is simpler and more exact than reading the
   * field back on the next frame. Typing is left alone — previewing on every
   * keystroke would be noise.
   */
  function markPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    pastedRef.current = true;
    // A paste that changes nothing fires no change event; do not leave the flag
    // armed for whatever the reader types next.
    requestAnimationFrame(() => { pastedRef.current = false; });

    // `maxLength` enforces the cap in the DOM, before React is told anything:
    // the overflow is gone and nothing anywhere says so. Someone pasting a
    // whole AI conversation would read a preview of the first 20,000 characters
    // believing it covered the lot. Measured here because this is the only
    // moment both halves are known — what the field holds, and what arrived.
    const field = event.currentTarget;
    const incoming = event.clipboardData?.getData("text") ?? "";
    const replaced = field.selectionEnd - field.selectionStart;
    const dropped = field.value.length - replaced + incoming.length - maxInputLength;
    if (dropped > 0) showToast(t.toast.truncated(dropped), null, "notice");
  }

  function handleInput(value: string) {
    setText(value);
    if (!pastedRef.current) return;
    pastedRef.current = false;
    checkNames(value);
  }

  async function copySymbol(name: string) {
    try {
      await writeToClipboard(formatForCopy(name, copyFormat));
      showToast(t.toast.copied(t.copyFormats[copyFormat]), name);
    } catch {
      showToast(t.toast.failed, null, "notice");
    }
  }

  async function copyAll() {
    if (analysis.valid.length === 0) return;
    try {
      await writeToClipboard(analysis.valid.map((name) => formatForCopy(name, copyFormat)).join("\n"));
      showToast(t.toast.copiedAll(analysis.valid.length));
    } catch {
      showToast(t.toast.failed, null, "notice");
    }
  }

  return (
    <main className="app-frame">
      {/* Parser-blocking, and ahead of the workbench it sizes: the reader's own
          column widths are on screen in the first frame instead of arriving one
          paint after the default ones. See columnBootScript. */}
      <script dangerouslySetInnerHTML={{ __html: columnBootScript }} />
      {/* The brand sits across the top rather than inside the input column:
          with it in the column, "输入" started one brand block lower than
          "预览" and "历史记录", and the three panel titles are one row of the
          same workbench. */}
      <header className="app-header">
        <div className="brand-block">
          {/* The mark is an SF Symbol drawn by the same pipeline as the
              results, so the product wears the thing it is about. */}
          <span className="brand-mark" aria-hidden="true">
            <BrandGlyph />
          </span>
          {/* The page's one <h1>. It used to be 「输入」 — the first of three
              panel titles — which told a search engine and a screen reader that
              this document is about a text field. The product's name is what
              the document is about; the panels are its sections. Nothing moves:
              every size on this line comes from .brand-name, not from the tag. */}
          <h1 className="brand-name">{brandName}</h1>
          <p className="brand-tagline">{t.brand.tagline}</p>
          <div className="brand-actions">
            {/* No `title`: both marks say what they are — a GitHub logo and
                BetterMapIt's own app icon — so the tooltip was reading the
                picture back out loud. `aria-label` stays, and it is not the
                same thing: without it these two links have no name at all for
                a screen reader, because their only content is an icon. */}
            <a className="brand-link" href={authorLinks.github} target="_blank" rel="noreferrer" aria-label={t.links.github}>
              <GithubLogo size={19} weight="fill" aria-hidden="true" />
            </a>
            {/* BetterMapIt's own icon, linking to its App Store page — the
                chip looks like exactly the thing it leads to. */}
            <a className="brand-link is-art" href={authorLinks.betterMapIt} target="_blank" rel="noreferrer" aria-label={t.links.betterMapIt}>
              <span className="brand-link-art" aria-hidden="true" />
            </a>
            <div className="lang-switch" role="group" aria-label={t.language.label}>
              {locales.map((option) => (
                <button
                  key={option}
                  type="button"
                  lang={messages[option].htmlLang}
                  className={locale === option ? "is-active" : ""}
                  aria-pressed={locale === option}
                  onClick={() => changeLocale(option)}
                >
                  {t.language[option]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div
        className={`app-shell${activeResizer !== null ? " is-resizing" : ""}`}
        ref={shellRef}
        // Nothing inline until the client has restored: until then the widths
        // are the ones columnBootScript put on <html>, and an inline custom
        // property here would shadow them. From that point on this element owns
        // them, and the first value it writes is the one already on screen.
        style={
          restored
            ? ({
                "--col-a": `${columns[0]}fr`,
                "--col-b": `${columns[1]}fr`,
                "--col-c": `${columns[2]}fr`,
              } as CSSProperties)
            : undefined
        }
      >
      <section className="panel input-panel" aria-labelledby="input-title">
        <div className="input-block">
          <div className="panel-title-row">
            <h2 id="input-title">{t.input.title}</h2>
            {/* A counter reading 0 / 20,000 is a limit introducing itself to
                someone who has not gone near it; it appears with the first
                character. The locale is pinned because the two sides of
                hydration disagree about it — the server formats with Node's
                default and the browser with the reader's, so a German reader
                had "20.000" replaced by "20,000". */}
            {text.length > 0 && (
              <span>{text.length.toLocaleString("en-US")} / {maxInputLength.toLocaleString("en-US")}</span>
            )}
          </div>
          <label className="sr-only" htmlFor="symbol-source">{t.input.fieldLabel}</label>
          <textarea
            id="symbol-source"
            value={text}
            maxLength={maxInputLength}
            spellCheck={false}
            onPaste={markPaste}
            onChange={(event) => handleInput(event.target.value)}
            placeholder={inputGhost(t)}
          />
        </div>

        <div className="input-actions">
          {/* Soul button — the BetterMapIt "Map it!" keycap: cap over a side
              wall, sinking into it on press. */}
          {/* Never disabled: with nothing typed it runs the grey example, which
              is the shortest path from landing here to seeing what this does. */}
          {/* The cap used to carry the eyes mark next to the label; it was
              dropped on request, so the button is the words alone. */}
          {/* The label carries the count, which is why the line under the field
              no longer does: `liveAnalysis` runs on `pendingText`, so this is
              the number of tiles the press produces, not a number beside it.
              Zero — typed text with nothing recognised — drops back to the bare
              verb rather than offering to preview nothing. */}
          <button className="soul-button" type="button" onClick={runCheck}>
            <span className="soul-glow" aria-hidden="true" />
            <span className="soul-cap">
              <span className="soul-label">
                {liveAnalysis.valid.length > 0 ? t.input.checkCount(liveAnalysis.valid.length) : t.input.check}
              </span>
            </span>
          </button>
        </div>
      </section>

      {renderResizer(0, t.resizer.left)}

      <section className="panel results-panel" ref={resultsRef} aria-labelledby="results-title">
        <header className="results-header">
          <h2 id="results-title">{t.results.title}</h2>
          <div className="result-controls" aria-label={t.results.copySettings}>
            <label className="copy-format">
              <span aria-hidden="true">{t.results.copyAs}</span>
              <select value={copyFormat} onChange={(event) => setCopyFormat(event.target.value as CopyFormat)}>
                {Object.entries(t.copyFormats).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="copy-all-button" type="button" onClick={copyAll} disabled={analysis.valid.length === 0}>
              {t.results.copyAll}
            </button>
          </div>
        </header>

        <div
          className="result-list"
          ref={listRef}
          data-density={density}
          data-layout={tile.rows ? "rows" : "tiles"}
          hidden={analysis.valid.length === 0}
          // Same rule as the shell's widths: nothing inline until this list has
          // been measured, so the plan the boot script inherited from <html> is
          // the one that paints. An inline value here would shadow it and put
          // the "3 + 1 becomes 4" flicker back.
          style={
            planned
              ? ({
                  "--tile-columns": tile.columns,
                  "--tile-size": `${tile.size.toFixed(2)}px`,
                } as CSSProperties)
              : undefined
          }
        >
          {analysis.valid.map((name, position) => {
            const isCopied = copiedName === name;
            const productIndex = symbolRestriction.get(name);
            // 601 symbols are Apple trademarks that may only stand for the
            // product they depict. That is a rule someone shipping an app needs
            // to know, so it rides on the tile rather than in a footnote.
            const restriction =
              productIndex === undefined ? null : t.results.restricted(restrictedProducts[productIndex]);

            return (
              <button
                className={`result-card${isCopied ? " is-copied" : ""}`}
                key={name}
                type="button"
                style={{ "--tile-index": position } as CSSProperties}
                aria-label={t.results.cardLabel(name, t.copyFormats[copyFormat])}
                title={restriction ? `${t.results.cardTitle(name, t.copyFormats[copyFormat])}\n${restriction}` : t.results.cardTitle(name, t.copyFormats[copyFormat])}
                onClick={() => copySymbol(name)}
              >
                <span className="result-icon"><SymbolGlyph name={name} /></span>
                <span className="result-content">
                  <SymbolName name={name} />
                </span>
                {/* role="img", or the label is a name on a plain span, which
                    several screen readers skip entirely. */}
                {restriction && (
                  <span className="restriction-badge" role="img" title={restriction} aria-label={restriction}>
                    <Trademark size={13} weight="bold" aria-hidden="true" />
                  </span>
                )}
                <span className="copy-affordance" aria-hidden="true">
                  {isCopied ? <Check size={20} weight="bold" /> : <Copy size={20} weight="regular" />}
                </span>
              </button>
            );
          })}
        </div>

        {analysis.valid.length === 0 && (
          <div className="empty-state">
            <SymbolGlyph name="doc.badge.plus" />
            <h3>{t.empty.title}</h3>
            <p>{t.empty.body}</p>
            <button type="button" onClick={() => { setText(t.exampleText); checkNames(t.exampleText); }}>{t.empty.action}</button>
          </div>
        )}

        {analysis.invalid.length > 0 && (
          <div className="invalid-list" aria-label={t.invalid.label}>
            <p>{t.invalid.title}</p>
            {analysis.invalid.map((name) => {
              const suggestion = symbolSuggestion(name);
              return (
                <div key={name}>
                  <code>{name}</code>
                  {/* The suggestion carries its picture. This was the one place
                      left in the product where a reader had to decide about a
                      name by reading it — and it is the worst possible place
                      for that, because they have just been handed a name that
                      does not exist and are being offered another one. Text
                      alone sent them back to the SF Symbols app, which is the
                      round trip this whole page exists to delete. It also makes
                      a wrong suggestion visible: the glyph either matches what
                      they meant or obviously does not. */}
                  <span>
                    {suggestion ? (
                      <>
                        {t.invalid.didYouMean}{" "}
                        <SymbolGlyph name={suggestion} />
                        <code>{suggestion}</code>
                      </>
                    ) : (
                      t.invalid.noMatch
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div
          className={`inline-toast${copiedName ? " is-visible" : ""}`}
          data-tone={toastTone}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">
            {toastTone === "success" ? <Check size={15} weight="bold" /> : <Info size={15} weight="bold" />}
          </span>
          {toastMessage}
        </div>

      </section>

      {renderResizer(1, t.resizer.right)}

      <aside className="panel history-panel" aria-labelledby="history-title">
        <header>
          <h2 id="history-title">{t.history.title}</h2>
          <button type="button" onClick={() => setHistory([])} disabled={history.length === 0}><Trash size={16} aria-hidden="true" />{t.history.clear}</button>
        </header>

        <div className="history-list">
          {orderedHistory.length > 0 ? orderedHistory.map((entry) => (
            <button className="history-card" type="button" key={entry.id} onClick={() => restoreHistory(entry)}>
              <span className="history-time">{historyLabel(entry, t, now)}</span>
              <span className="history-symbols">
                {entry.symbols.slice(0, 3).map((name) => (
                  <span className="history-chip" key={name}>
                    <SymbolGlyph name={name} />
                    <code>{name}</code>
                  </span>
                ))}
              </span>
              <span className="history-arrow" aria-hidden="true"><CaretRight size={21} weight="bold" /></span>
            </button>
          )) : (
            <div className="history-empty">
              <p>{t.history.emptyTitle}</p>
            </div>
          )}
        </div>
      </aside>
      </div>

      {/* The one line of explanation this interface earns, and now the whole
          footer: a stranger is about to paste an AI conversation or an internal
          spec into a website they found five seconds ago, and "nothing is
          collected" is the fact that decides whether they do it. It used to sit
          under the button, where it read as an instruction for the button. Down
          here it reads as what it is — the site's own statement about itself —
          and on every viewport taller than the shell it is still on screen,
          because .app-frame is the viewport and this is its last row.
          What actually enforces it is the CSP in worker/index.ts — *not*
          public/_headers, which Cloudflare applies to static assets only and
          never to this server-rendered page. */}
      {/* Commented out on request (2026-08-17): the line was judged to hurt the
          look of the page. What it said is still true — worker/index.ts still
          sends `connect-src 'self'`, so the pasted text still never leaves the
          browser — but nothing on screen says so now, which is the thing to
          weigh before this stays off for good. Uncomment to bring it back:
          <footer className="app-footer">
            <p>{t.footer.privacy}</p>
          </footer> */}
    </main>
  );
}
