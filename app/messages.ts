export type Locale = "zh" | "en";
export type CopyFormat = "name" | "swiftui" | "uikit" | "appkit";

export const locales: Locale[] = ["zh", "en"];
export const localeStorageKey = "symbol-flow-locale";
/**
 * The language is the one preference the server has to know, because it is the
 * only one that decides what the HTML *says*. A boot script can move a column
 * before the first frame; it cannot re-translate a rendered page, so a reader
 * whose choice differed from their Accept-Language watched every word on the
 * screen change once per load.
 *
 * Hence a cookie — two letters of it. It is not a step back from "your text
 * never leaves your browser": the text still never does, and this carries no
 * more about the reader than the language switch already shows on screen. The
 * localStorage key stays as the fallback for browsers that refuse cookies, and
 * as the migration path for anyone who chose a language before this existed.
 */
export const localeCookieName = "sf-locale";

/** Brand mark — never translated, same in every language. */
export const brandName = "Better SF Symbols";

/**
 * The symbol the product wears as its own mark, in the tab, in the header and
 * on the button. `BrandGlyph` fills this one and lays `${brandSymbol}.inverse`
 * over it for the outline and pupils — the same pair scripts/render_sfsymbols.
 * swift composites into favicon.png.
 */
export const brandSymbol = "eyes";

/**
 * The one address this site has.
 *
 * `canonical` and `og:url` are statements about *which* URL a page is, so
 * deriving them from the incoming request makes both a no-op: every host that
 * serves this page would name itself the canonical one, which is precisely what
 * a canonical tag exists to prevent. The share card is the same argument — a
 * link posted from a preview host should still show the deployed image.
 *
 * `public/robots.txt` and `public/sitemap.xml` are static files and cannot
 * import this, so they repeat it. A test pins all three together.
 */
export const siteOrigin = "https://sfsymbols.terryhu.workers.dev";

/** The author's links in the header bar. URLs are not copy — no translation. */
export const authorLinks = {
  // The repo, not the author's profile. Same rule as the BetterMapIt chip next
  // to it: the icon shows where you land. A GitHub logo on a site with public
  // source means "the source of this site" to everyone who clicks it, and a
  // profile page makes them go hunting for the repo they were promised.
  github: "https://github.com/terryHu7/better-sf-symbols",
  /** The App Store listing itself, not a page about it. The chip already wears
   *  BetterMapIt's own icon, so the link now lands where that icon leads. */
  betterMapIt: "https://apps.apple.com/cn/app/bettermapit/id6775102616",
};

export type Messages = {
  htmlLang: string;
  /**
   * `imageAlt` describes the share card. It is read aloud by every social
   * platform that bothers, and by anyone whose images failed to load — which
   * makes it copy, and copy lives in this file.
   */
  meta: { title: string; description: string; imageAlt: string; ogLocale: string };
  language: { label: string; zh: string; en: string };
  brand: { tagline: string };
  links: { github: string; betterMapIt: string };
  input: {
    title: string;
    fieldLabel: string;
    placeholder: string;
    /** The button's label when it has nothing to count. */
    check: string;
    /** …and when it has: the number is what pressing it is about to show. */
    checkCount: (count: number) => string;
  };
  /**
   * The page's bottom rule. One line, and it is the privacy promise — the
   * footer exists to hold it, not the other way round.
   */
  footer: { privacy: string };
  results: {
    title: string;
    copySettings: string;
    copyAs: string;
    copyAll: string;
    cardLabel: (name: string, format: string) => string;
    cardTitle: (name: string, format: string) => string;
    restricted: (product: string) => string;
  };
  empty: { title: string; body: string; action: string };
  invalid: { title: string; label: string; didYouMean: string; noMatch: string };
  toast: {
    copied: (format: string) => string;
    copiedAll: (count: number) => string;
    failed: string;
    switched: (label: string) => string;
    /**
     * `maxLength` drops the overflow of a paste before React ever sees it, and
     * says nothing. Someone pasting a whole conversation would otherwise never
     * learn that the tail of their own text had gone missing.
     */
    truncated: (count: number) => string;
  };
  history: {
    title: string;
    clear: string;
    emptyTitle: string;
    now: string;
    minutesAgo: (count: number) => string;
    hoursAgo: (count: number) => string;
    yesterday: string;
    daysAgo: (count: number) => string;
  };
  resizer: { left: string; right: string; hint: string };
  copyFormats: Record<CopyFormat, string>;
  /**
   * The example is never typed into the field — it is the grey text the empty
   * field shows, and the input the button falls back to when nothing was typed.
   */
  exampleText: string;
};

const zh: Messages = {
  htmlLang: "zh-CN",
  meta: {
    // 中西文之间用间隔号，不用 ASCII 连字符：`-` 夹在中文里读作减号。
    //
    // 副标题只写「批量预览」，不写「SF Symbol 批量预览」：品牌名那半截已经念过
    // 一次 SF Symbols 了，再念一遍是标签页里最贵的四个字用来重复。中文侧的搜索词
    // 仍然完整——「SF Symbols 批量预览」跨着这个间隔号照样匹配。
    //
    // 曾经是「SF Symbol 名称检查器」（2026-08-17 由作者换掉）：产品不是在替 AI
    // 纠错，它是把一整段文字里的符号一次铺开给你看，而「预览」正是页面上唯一那个
    // 主按钮的词。改这句要连着 en 侧一起改，两处标题在测试里都有断言钉着。
    title: "Better SF Symbols · 批量预览",
    description:
      "从 AI 回复、需求文档或代码中提取并检查 SF Symbol 名称，点按图标即可复制名称，或 SwiftUI / UIKit / AppKit 代码。",
    imageAlt: "Better SF Symbols：粘一段 AI 回复，看清每个符号，点一下复制代码",
    ogLocale: "zh_CN",
  },
  language: { label: "界面语言", zh: "中文", en: "EN" },
  // 一个空格都不留（2026-08-17 按要求）。此前中西文交界处（AI / SF 两侧）各有一个，
  // 西文词**后面**那个写成 \u00A0（不换行空格）：手机标题栏只有一行的宽度，普通空格
  // 两边都能断，实测断在了「…和 SF / 符号之间…」，把 SF 和它修饰的词拆到两行。
  //
  // 那道保护跟着空格一起没了，而 CJK 和西文之间本来就是合法断点，所以窄屏仍可能断在
  // 「AI」「SF」前后。真会折行的是手机那一档，改这句之前用 390px probe 看一眼断点。
  brand: { tagline: "从此告别在AI工具和SF符号之间来回复制粘贴👋" },
  // 这两条现在只给读屏用（tooltip 已去掉），所以只说去哪儿，不说客套话。
  // The label has to name the destination, and the destination changed: this
  // is the project's repo now, not the author's profile.
  links: { github: "这个网站的源码", betterMapIt: "BetterMapIt（作者的另一个 app）" },
  input: {
    title: "输入",
    fieldLabel: "包含 SF Symbol 名称的文本",
    // The ghost's whole first line. It names what the example *is* rather than
    // just saying "例如：" above it — one line instead of two, which is a line
    // of phone height back. It stays here rather than in `exampleText` because
    // pressing the button on an empty field puts `exampleText` into the field
    // as real input, and "例如" has no business being in the text you paste.
    placeholder: "例如三种分享按钮：",
    // 曾经是 `Show them all!`（对齐 BetterMapIt 的 `Map it!`），换成中文动词是
    // 有意放弃那条品牌口令：读者里有很多人不读英文，而这是页面上唯一的主按钮。
    // 所以这一项现在**跟着语言翻译**，别再改回两边同一个字符串。
    //
    // 数字是从输入框底下那行「识别到 N 个符号」搬上来的：它本来只是在旁边报数，
    // 现在直接说清按下去会发生什么。数字来自 `liveAnalysis`，而后者算的是
    // `pendingText`（空框时就是示例），所以**按钮上的数就是这一按会铺出来的磁贴数**。
    // 一个都没有时退回没有数字的 `check`——「预览其中 0 个符号」是在劝人别按。
    check: "预览",
    checkCount: (count) => `预览其中 ${count} 个符号`,
  },
  // 这行是承诺句式，不是机制句式（机制版是 Squoosh 那种「全程在浏览器里跑」）。
  // 兑现它的仍然是 worker/index.ts 的 connect-src 'self'——改这句之前先确认那条还在。
  footer: { privacy: "页面不收集任何用户数据" },
  results: {
    title: "预览",
    copySettings: "复制设置",
    copyAs: "复制：",
    copyAll: "复制全部",
    cardLabel: (name, format) => `复制 ${name} 的${format}`,
    cardTitle: (name, format) => `复制${format}：${name}`,
    restricted: (product) => `Apple 商标符号：不可改动，且只能用于指代 ${product}`,
  },
  empty: {
    title: "没有找到已收录的名称",
    // 「或恢复默认示例」被删了：那句话的下一行就是那个按钮。「普通文字会被忽略」
    // 也删了：那是在解释机制，而标题已经说了没找到——读者要的是下一步做什么。
    //
    // 曾经是「检查一下拼写。」，那是**错误归因**：裸词（share、设置、菜单）连
    // 「待确认」都进不去（`looksLikeSymbol` 要求至少一个点），所以最常撞到这个
    // 空状态的人根本没拼错任何东西，只是还不知道名字长什么样。告诉他检查拼写，
    // 他会以为是自己的问题，而这里唯一的按钮是「试试示例」——那是死路。
    body: "粘一段带 SF Symbol 名称的文字",
    // 「恢复」暗示本来有、丢了。这里是邀请，不是找回。
    action: "试试示例",
  },
  invalid: {
    title: "待确认",
    label: "待确认名称",
    didYouMean: "可能想用",
    noMatch: "没有近似的名字",
  },
  toast: {
    copied: (format) => `已复制${format}`,
    copiedAll: (count) => `已复制全部 ${count} 个结果`,
    // 「请手动复制」删了：那是失败之后唯一剩下的选择，说了等于没说。
    failed: "复制失败",
    switched: (label) => `已切换到「${label}」的记录`,
    // 数字钉住 locale，理由和输入框那个计数器一样：不带 locale 的 toLocaleString
    // 服务端用 Node 的、浏览器用读者的，两边会给出不同的千分位。
    truncated: (count) => `超出上限，末尾 ${count.toLocaleString("en-US")} 字未粘入`,
  },
  history: {
    title: "历史记录",
    clear: "清空",
    // 标题就是全部：下一行那句「完成一次预览后会显示在这里」是在复述空状态本身。
    emptyTitle: "还没有历史记录",
    now: "刚刚",
    minutesAgo: (count) => `${count} 分钟前`,
    hoursAgo: (count) => `${count} 小时前`,
    yesterday: "昨天",
    daysAgo: (count) => `${count} 天前`,
  },
  resizer: {
    left: "调整输入区与符号预览的宽度",
    right: "调整符号预览与历史记录的宽度",
    // 光标一停上去就变成左右箭头了，「拖动调整宽度」是在复述光标。
    hint: "双击恢复默认",
  },
  copyFormats: { name: "名称", swiftui: "SwiftUI", uikit: "UIKit", appkit: "AppKit" },
  // One symbol per line: at a glance the grey block reads as *several* names,
  // which is the thing this page does. Packed two to a line it read as prose.
  //
  // All three names answer *one* question — which is the point. Four names for
  // four different jobs (the old example) demonstrates listing; three
  // candidates for the same button demonstrates the choice you actually came
  // here to make, and none of the three tells you what it looks like.
  //
  // It has to read like something an AI actually said, reasons and all: a bare
  // list of three names reads as *hand-written*, and then the page looks like
  // it needs you to tidy the input first. The reason hanging off every
  // candidate is what makes it recognisable — and mildly tiresome, which is the
  // point, since wading through that is the work being taken away. Do not
  // tighten it into a clean list. Two things the author cut, both deliberate:
  // a 「好问题！」 opener (flattery is the one AI tic that reads as a joke at
  // the AI's expense rather than as the chore) and a closing "confirm your use
  // case first" hedge (it padded the phone layout for a line that named no
  // symbol). Four lines is the ceiling — the field is `field-sizing: content`,
  // so every line of ghost text pushes the button further down the phone.
  //
  // 应用 not `app`: bare `app` is a real symbol name and would show up as a
  // fourth tile. Same trap in English for `forward` / `doc` / `case`.
  exampleText: `square.and.arrow.up 最常见；
arrow.up.doc 偏向分享文件；
arrowshape.turn.up.right 偏向转发给别人。`,
};

const en: Messages = {
  htmlLang: "en",
  meta: {
    // Same reasoning as the Chinese title: the brand half already says
    // "SF Symbols", so the suffix names what the page does with them.
    title: "Better SF Symbols — Batch Preview",
    description:
      "Pull SF Symbol names out of an AI reply, a spec, or code, check them, and click any glyph to copy the name — or SwiftUI, UIKit, AppKit code.",
    imageAlt: "Better SF Symbols — paste an AI reply, see every symbol, copy the code",
    ogLocale: "en_US",
  },
  language: { label: "Interface language", zh: "中文", en: "EN" },
  // Same non-breaking bind as the Chinese line, for the one two-word proper
  // noun in it: a wrap between "SF" and "Symbols" reads as two products.
  brand: { tagline: "No more copy-pasting between AI tools and SF\u00A0Symbols 👋" },
  links: { github: "Source code for this site", betterMapIt: "BetterMapIt (the author's other app)" },
  input: {
    title: "Input",
    fieldLabel: "Text containing SF Symbol names",
    placeholder: "For example, three share buttons:",
    // The number moved up here from the line under the field, which used to
    // report it beside the button rather than on it. It is `liveAnalysis` over
    // `pendingText` — the example when the field is blank — so the count is
    // exactly the number of tiles this press is about to lay out. It names the
    // panel the tiles appear in, too. Zero falls back to the bare verb: an
    // offer to preview nothing is an argument against pressing.
    check: "Preview",
    checkCount: (count) => `Preview ${count} symbol${count === 1 ? "" : "s"}`,
  },
  footer: { privacy: "This page collects no user data" },
  results: {
    title: "Preview",
    copySettings: "Copy settings",
    copyAs: "Copy as:",
    // Sentence case, like "Copy as:" beside it. Title Case on one of the two
    // read as two different registers on one line.
    copyAll: "Copy all",
    cardLabel: (name, format) => `Copy ${format} for ${name}`,
    cardTitle: (name, format) => `Copy ${format}: ${name}`,
    restricted: (product) => `Apple trademark: may not be modified, and may only be used to refer to ${product}`,
  },
  empty: {
    title: "No symbol names found here",
    // Was "Check the spelling." — see the note on the Chinese side. It blamed
    // the reader for something they had not done: a bare word never reaches the
    // "to confirm" list at all, so the people who hit this screen most often
    // spelled nothing wrong.
    body: "Paste text that mentions SF Symbol names.",
    action: "Try the example",
  },
  invalid: {
    // "To confirm" reads as a to-do label in English rather than as "these
    // names are not real". Say what was actually checked.
    title: "Not in the catalog",
    label: "Names not in the catalog",
    // Rendered inline, this used to be a question with no question mark —
    // exactly the kind of detail a native reader trips over. A verb sidesteps
    // the punctuation entirely: "Try square.and.arrow.up".
    didYouMean: "Try",
    noMatch: "No close match",
  },
  toast: {
    copied: (format) => `${format} copied`,
    copiedAll: (count) => `Copied all ${count} results`,
    failed: "Copy failed",
    // The Chinese says 「…的记录」 — it names the *thing* switched to. Without a
    // noun the English read as jumping to a point in time rather than opening a
    // row, so it gets the verb that carries the noun instead.
    switched: (label) => `Loaded “${label}”`,
    truncated: (count) => `Over the limit — ${count.toLocaleString("en-US")} characters not pasted`,
  },
  history: {
    title: "History",
    clear: "Clear",
    emptyTitle: "No history yet",
    now: "Just now",
    minutesAgo: (count) => `${count} min ago`,
    hoursAgo: (count) => (count === 1 ? "1 hour ago" : `${count} hours ago`),
    yesterday: "Yesterday",
    daysAgo: (count) => `${count} days ago`,
  },
  resizer: {
    left: "Resize the input and preview panels",
    right: "Resize the preview and history panels",
    hint: "Double-click to reset",
  },
  copyFormats: { name: "Name", swiftui: "SwiftUI", uikit: "UIKit", appkit: "AppKit" },
  // One symbol per line, three candidates for one button — see the note on the
  // Chinese example. Watch the prose here: `forward`, `doc`, `case` and `app`
  // are all real symbol names on their own, so "leans forward" or "in that
  // case" would quietly add a fourth tile. Re-run the tokenizer against
  // scripts/symbol-names.txt after any edit; the three names below are all the
  // preview should contain.
  exampleText: `square.and.arrow.up is the one you see most;
arrow.up.doc leans toward sharing a file;
arrowshape.turn.up.right leans toward passing it on to someone.`,
};

export const messages: Record<Locale, Messages> = { zh, en };

/**
 * The grey text an empty field shows: one line of instruction, then the example
 * on the next line. Assembled here rather than in the view because both halves
 * are copy, and copy lives in this file. Only the example half is what the
 * button runs — the first line is the instruction, not input.
 */
export function inputGhost(t: Messages) {
  return `${t.input.placeholder}\n${t.exampleText}`;
}

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

/** The reader's own choice, if they have made one, from the request cookies. */
export function localeFromCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== localeCookieName) continue;

    const value = part.slice(separator + 1).trim();
    return isLocale(value) ? value : null;
  }

  return null;
}

/**
 * What the page renders in. A stored choice outranks the browser's guess —
 * plenty of developers read Chinese on an English-locale machine, and the
 * reverse — and it has to be answered here, on the server, or the first paint
 * is in the wrong language.
 */
export function resolveLocale(
  cookieHeader: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return localeFromCookie(cookieHeader) ?? detectLocale(acceptLanguage);
}

/**
 * Picks the interface language from an Accept-Language header: the highest
 * quality tag wins, Chinese in any region maps to zh, everything else to en.
 */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return "en";

  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));

      return { tag: tag.trim().toLowerCase(), quality: quality ? Number(quality.slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.quality) && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of tags) {
    if (tag === "*") continue;
    if (tag.startsWith("zh")) return "zh";
    return "en";
  }

  return "en";
}
