#!/usr/bin/env node
// Regenerates the symbol catalog from macOS itself.
//
// Apple ships no symbol API, but every Mac carries the authoritative list in
// CoreGlyphs.bundle — the same metadata the SF Symbols app reads (the app has
// no catalogue of its own; its Assets.car is 1.2 MB of its own UI icons). It is
// part of the OS, so it updates when the OS does: run this on a Mac with the
// macOS 27 beta and the iOS 27 symbols are in the catalogue. That is the whole
// update story, and there is no other source — the symbols are not in the
// system font's private-use area either (SFNS.ttf has exactly one PUA
// codepoint), so nothing but a Mac can produce them.
//
//   node scripts/sync-symbol-catalog.mjs            # write the catalogue
//   node scripts/sync-symbol-catalog.mjs --report   # print coverage only
//
// Writes two files, which is the point: `app/symbol-catalog.ts` for the app and
// `scripts/symbol-names.txt` for the Swift renderer. Both sides of "the name is
// known" and "the picture exists" come from one list, so they cannot drift.

import { execFile } from "node:child_process";
import { readdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

const GLYPHS = "/System/Library/CoreServices/CoreGlyphs.bundle/Contents/Resources";
const CATALOG_OUT = new URL("../app/symbol-catalog.ts", import.meta.url);
const NAMES_OUT = new URL("./symbol-names.txt", import.meta.url);
const reportOnly = process.argv.includes("--report");

/** plutil is the only reliable plist reader on a stock Mac. */
async function plist(name) {
  const { stdout } = await run("plutil", ["-convert", "json", "-o", "-", `${GLYPHS}/${name}`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/**
 * Apple keys availability by "release year" ("2023", "2024.3"), not by OS
 * version, because one symbol set ships across five platforms at once. The
 * plist carries the mapping, so the iOS number we show is Apple's own — no
 * table of ours to fall out of date.
 */
function iosVersionTable(yearToRelease) {
  const table = new Map();
  for (const [year, platforms] of Object.entries(yearToRelease)) {
    if (platforms?.iOS) table.set(year, Number.parseFloat(platforms.iOS));
  }
  return table;
}

// Localized variants (`.ar`, `.he`, `.zh`…) are the same drawing for another
// script. They are ~15% of the list and never appear in an AI suggestion.
const LOCALIZED = /\.(ar|he|hi|ja|ko|th|zh|my|km|si|ta|te|kn|ml|gu|bn|or|pa|ur|el|ru)(\.|$)/;

/** Every restriction Apple ships is this sentence with a product swapped in. */
const RESTRICTION = /may only be used to refer to (?:Apple.s )?(.+?)\.?$/;

/**
 * Front-coding: each line stores how many leading characters it shares with the
 * previous name. `arrow.up.circle` → `arrow.up.circle.fill` costs 5 characters
 * instead of 20, which is most of the catalogue's bulk.
 */
function frontCode(values, suffixFor) {
  const lines = [];
  let previous = "";
  for (const value of values) {
    let shared = 0;
    while (shared < 63 && shared < previous.length && previous[shared] === value[shared]) shared++;
    lines.push(String.fromCharCode(48 + shared) + value.slice(shared) + suffixFor(value));
    previous = value;
  }
  return lines.join("\n");
}

async function main() {
  const [availability, order, restrictions] = await Promise.all([
    plist("name_availability.plist"),
    plist("symbol_order.plist"),
    plist("symbol_restrictions.strings").catch(() => ({})),
  ]);

  const iosByYear = iosVersionTable(availability.year_to_release ?? {});
  const rank = new Map(order.map((name, index) => [name, index]));

  const rows = [];
  for (const [name, year] of Object.entries(availability.symbols ?? {})) {
    if (LOCALIZED.test(name)) continue;
    const ios = iosByYear.get(year);
    if (!ios) continue;
    rows.push({ name, ios, rank: rank.get(name) ?? Number.MAX_SAFE_INTEGER });
  }

  // Apple's own ordering groups related symbols together, which is exactly the
  // order a fallback list wants; ties fall back to the name.
  rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  // Versions come from a set of ~24 values, so an index costs one character
  // where the number costs four.
  const versions = [...new Set(rows.map((row) => row.ios))].sort((a, b) => a - b);
  const versionIndex = new Map(versions.map((value, index) => [value, index]));

  // 605 symbols carry a trademark restriction. Each reduces to one of ~106
  // product names; the sentence itself lives in messages.ts so it can be
  // translated rather than shipped as English from a system file.
  const products = [];
  const productIndex = new Map();
  const restricted = [];
  for (const row of rows) {
    const sentence = restrictions[row.name];
    const product = sentence && RESTRICTION.exec(sentence)?.[1];
    if (!product) continue;
    if (!productIndex.has(product)) {
      productIndex.set(product, products.length);
      products.push(product);
    }
    restricted.push(row.name);
  }

  let rendered = new Set();
  try {
    const files = await readdir(new URL("../public/symbols", import.meta.url));
    rendered = new Set(
      files.filter((f) => f.endsWith("--bold.png")).map((f) => f.replace("--bold.png", "")),
    );
  } catch {
    // No rendered set yet; coverage is simply zero.
  }

  const covered = rows.filter((row) => rendered.has(row.name)).length;
  const missing = rows.length - covered;

  console.log(`macOS catalog: ${rows.length} symbols (localized variants excluded)`);
  console.log(`iOS releases covered: ${versions[0]} … ${versions[versions.length - 1]}`);
  console.log(`trademark-restricted: ${restricted.length} symbols across ${products.length} products`);
  console.log(`rendered previews on disk: ${covered} / ${rows.length} (${((covered / rows.length) * 100).toFixed(1)}%)`);
  if (missing) console.log(`missing previews: ${missing} → run: swift scripts/render_sfsymbols.swift`);

  if (reportOnly) return;

  const iosByName = new Map(rows.map((row) => [row.name, row.ios]));
  const packed = frontCode(
    rows.map((row) => row.name),
    (name) => String.fromCharCode(48 + versionIndex.get(iosByName.get(name))),
  );

  const source = `// Generated by scripts/sync-symbol-catalog.mjs from
// /System/Library/CoreServices/CoreGlyphs.bundle — do not edit by hand, and do
// not hand-add a symbol: the whole set is a build product, which is what keeps
// a future macOS able to regenerate it in one command.
// Source OS: ${(await run("sw_vers", ["-productVersion"])).stdout.trim()} · ${rows.length} symbols · ${new Date().toISOString().slice(0, 10)}

/** Front-coded: leading char is (shared prefix length + 48), trailing char is the version index. */
const PACKED = ${JSON.stringify(packed)};

const VERSIONS = ${JSON.stringify(versions)};

/** Apple products whose symbols may only be used to refer to that product. */
export const restrictedProducts = ${JSON.stringify(products)};

/** Front-coded names of the restricted symbols, trailing char is the product index. */
const RESTRICTED = ${JSON.stringify(
    frontCode(restricted, (name) =>
      String.fromCharCode(48 + productIndex.get(RESTRICTION.exec(restrictions[name])[1])),
    ),
  )};

function unpack(source: string, onEntry: (name: string, code: number) => void) {
  let previous = "";
  for (const line of source.split("\\n")) {
    const shared = line.charCodeAt(0) - 48;
    const name = previous.slice(0, shared) + line.slice(1, -1);
    onEntry(name, line.charCodeAt(line.length - 1) - 48);
    previous = name;
  }
}

let versionCache: Map<string, number> | null = null;
let restrictionCache: Map<string, number> | null = null;

/** name → the iOS version the symbol first shipped in. Decoded once, on first use. */
export function symbolVersions(): Map<string, number> {
  if (!versionCache) {
    const index = new Map<string, number>();
    unpack(PACKED, (name, code) => index.set(name, VERSIONS[code]));
    versionCache = index;
  }
  return versionCache;
}

/** name → index into \`restrictedProducts\`, for the symbols Apple restricts. */
export function symbolRestrictions(): Map<string, number> {
  if (!restrictionCache) {
    const index = new Map<string, number>();
    unpack(RESTRICTED, (name, code) => index.set(name, code));
    restrictionCache = index;
  }
  return restrictionCache;
}
`;

  await writeFile(CATALOG_OUT, source, "utf8");
  // The renderer reads this rather than carrying its own list, so "the name is
  // known" and "the picture exists" can never disagree.
  await writeFile(NAMES_OUT, rows.map((row) => row.name).join("\n") + "\n", "utf8");

  console.log(`wrote app/symbol-catalog.ts — ${(Buffer.byteLength(source) / 1024).toFixed(0)} KB raw`);
  console.log(`wrote scripts/symbol-names.txt — ${rows.length} names for the renderer`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
