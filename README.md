# Better SF Symbols
English · [简体中文](README.zh-CN.md)
[![Better SF Symbols](docs/screenshot-en.png)](https://sfsymbols.terryhu.workers.dev)
## Finally, a cure for Apple developer + symbol-picking indecision!
### Bookmark it: [sfsymbols.terryhu.workers.dev](https://sfsymbols.terryhu.workers.dev)
Extract every SF Symbol from your text in one go, and say goodbye to inefficiency 👋
## Project Introduction
In the age of vibe coding, you'll often run into this scenario.
When building a new feature and picking a button icon, if you ask an AI to recommend three options, you'll typically get a reply like this:
square.and.arrow.up — the most common;
arrow.up.doc — leans toward sharing a file;
arrowshape.turn.up.right — leans toward forwarding to someone else.
So you start copying and pasting them one by one, switching back and forth to the SF Symbols app to see what each icon actually looks like, and in the end you just pick one based on a vague impression.
With this tool, you just need to copy the entire AI reply and paste it once — the page will automatically extract all the icon symbols, capturing everything in one pass.
## Running Locally
```bash
npm install
npm run dev     # http://localhost:3000
npm test        
```

## Licence

The code here is MIT — see [LICENSE](LICENSE).

SF Symbols themselves are Apple's, and their use is governed by Apple's SF Symbols licence
agreement. No symbol artwork is committed to this repository: `public/symbols/` is generated on
your own Mac from the system, and is gitignored. This is a verification tool for people writing
Apple-platform code, not an icon library — there is no download or export, and what you copy is a
name or a line of Swift.
