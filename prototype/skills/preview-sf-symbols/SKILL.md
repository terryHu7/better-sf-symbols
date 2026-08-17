---
name: preview-sf-symbols
description: Extract SF Symbols automatically from a current or recent AI reply, validate them with macOS AppKit, and render authentic side-by-side PNG previews plus structured SwiftUI handoff data. Use when a user asks to see, compare, shortlist, choose, or directly apply SF Symbols mentioned in conversation, including raw multiline Chinese or English recommendations, slash-separated alternatives, weights, or colors, without asking the user to reformat, comma-separate, copy, or paste symbol names or code.
---

# Preview SF Symbols

Turn the AI reply already present in conversation into native previews. Do not ask the user to repeat, clean up, comma-separate, copy, or paste the symbol list.

## Workflow

1. Locate the current or most recent assistant reply containing the requested SF Symbol recommendations. Preserve it as raw multiline text, including headings, bullets, wrapped descriptions, and slash-separated alternatives.
2. Choose an output directory under the current workspace, normally `work/sf-symbol-previews/<short-run-name>`.
3. Feed the raw reply directly to `scripts/preview_sf_symbols.swift` on standard input. This serialization is an internal tool action; it is not a user copy/paste step.
4. Read the JSON emitted on standard output. Treat `symbols` as validated on the current Mac and `rejected` as unavailable or invalid on the current macOS release.
5. Display all `symbols` in a compact Markdown table using each `image_markdown` value. Compare silhouette, density, metaphor, and collision with icons the user already uses. Recommend one primary choice and, when useful, one fallback.
6. Keep the chosen symbol, `swiftui_code`, and style fields as the structured result for the current coding agent. If the user says to use the choice in an active coding task, apply it directly within that task's existing authorization; never ask the user to copy the name or code into another message. Continue naturally and rerun with a different `--weight`, `--color`, or a newly proposed reply when requested.

## Command

Run on macOS:

```bash
swift <skill-dir>/scripts/preview_sf_symbols.swift \
  --output-dir <workspace>/work/sf-symbol-previews/<run> \
  --weight regular \
  --color '#007AFF' \
  --point-size 48 \
  --canvas-size 128 \
  --manifest <workspace>/work/sf-symbol-previews/<run>/manifest.json
```

Supply the unedited assistant reply through standard input. Use a single-quoted shell heredoc delimiter (for example, `<<'SF_SYMBOLS_REPLY_7F3A'`) that does not occur in the reply, or use an equivalent tool-native stdin mechanism. Never make the user construct this command.

Supported weights are `ultralight`, `thin`, `light`, `regular`, `medium`, `semibold`, `bold`, `heavy`, and `black`. Use a 3-, 6-, or 8-digit hexadecimal color. Omit flags to use `regular`, `#000000`, 48 pt, and a 128 px transparent canvas.

## Extraction and output rules

- Trust the script's extraction order. It recognizes names at Markdown/plain-text bullet heads, slash or comma alternatives within a bullet head, and dotted symbol references in surrounding description lines.
- Trust AppKit validation rather than guessing from spelling. Availability is specific to the macOS version running the script.
- Do not claim that rejected names are globally nonexistent; report that AppKit does not expose them on this Mac.
- Preserve absolute `image_path` values and `image_markdown` strings when showing local previews in chat.
- Use `swiftui_code` as the clean structured handoff. Use `styled_swiftui_code` when the selected preview styling should travel with the handoff.
- If no candidates are found, inspect whether the wrong conversation reply was supplied. Do not silently invent symbols unless the user also asked for new recommendations.

The renderer uses only the public `NSImage(systemSymbolName:accessibilityDescription:)` API. It does not scrape the SF Symbols app, private asset catalogs, or online icon copies.
