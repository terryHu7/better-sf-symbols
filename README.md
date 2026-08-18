# Better SF Symbols

English · [简体中文](README.zh-CN.md)

[![Better SF Symbols](docs/screenshot-en.png)](https://sfsymbols.terryhu.workers.dev)

### → [sfsymbols.terryhu.workers.dev](https://sfsymbols.terryhu.workers.dev)

Paste an AI reply. Every SF Symbol in it gets drawn, side by side. Click one to copy the name.

## The trip it removes

An AI answer gives you names: *"use `square.and.arrow.up`, or `arrow.up.doc`, or
`arrowshape.turn.up.right`."*

Three candidates, one button. SF Symbols.app searches one name at a time, so comparing them costs
three searches and three context switches. You are not failing to see the glyph. You are failing to
remember the last one.

Paste the whole answer instead. The three land in a row and you pick by looking.

A click copies the name, because that is what goes back into the string literal the AI already
wrote. The control above the grid switches it to `Image(systemName:)`, `UIImage(systemName:)` or
`NSImage(systemSymbolName:)`, and remembers which you chose.

Nothing you paste leaves the browser. `worker/index.ts` serves `connect-src 'self'`, so the page
could not upload it if it wanted to.

Five dark palettes ship with it — the default plus Dark Modern, GitHub Dark and Catppuccin Mocha,
taken from each project's own published source.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # builds, then asserts the SSR output and the tile geometry
```

## Where the symbols come from

All 7,988 names, their iOS versions, their trademark restrictions and every picture are generated
from macOS itself. Neither output is ever hand-edited.

```bash
node scripts/sync-symbol-catalog.mjs   # the catalogue (seconds)
swift scripts/render_sfsymbols.swift   # 7,988 mask PNGs, favicon, share card (~65s, needs a Mac)
```

<details>
<summary>Why a Mac, and why it never goes stale</summary>

Apple ships no symbol API. Every Mac carries the list SF Symbols.app reads, in
`/System/Library/CoreServices/CoreGlyphs.bundle` — names, release years, and 601 trademark notes.
Both generators read that one file, so "this name is known" and "a picture exists for it" cannot
disagree.

Because the source is the operating system, the catalogue updates when the OS does. Run both
commands on a Mac with a newer macOS and that year's symbols are simply there.

The artwork can only come from a Mac. SF Symbols is not in the system font's private-use area —
`SFNS.ttf` has exactly one PUA codepoint — so there is no way to pull the vectors in a browser.

</details>

## Layout

| Path | |
|---|---|
| `app/` | The product. `symbol-flow.tsx` is the interface, `messages.ts` holds every user-visible string |
| `scripts/` | The two generators, plus `ui-probe.mjs` for measuring the real layout in a real browser |
| `tests/` | SSR output, source invariants, tile geometry |
| `public/symbols/` | Generated artwork. Disposable |

`app/chatgpt-auth.ts`, `db/`, `drizzle*` and `examples/d1/` are scaffold leftovers with no callers.
`.openai/hosting.json` looks like one and is not: `vite.config.ts` imports it at build time.
