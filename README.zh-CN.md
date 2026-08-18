# Better SF Symbols

[English](README.md) · 简体中文

[![Better SF Symbols](docs/screenshot-zh.png)](https://sfsymbols.terryhu.workers.dev)

### → [sfsymbols.terryhu.workers.dev](https://sfsymbols.terryhu.workers.dev)

粘一段 AI 回复，里面提到的每个 SF Symbol 都画出来并排铺开，点一下复制名称。

## 它省掉的那趟来回

AI 给的只有名字：*「分享用 `square.and.arrow.up`，或者 `arrow.up.doc`，也可以
`arrowshape.turn.up.right`。」*

三个候选，对着同一颗按钮。SF Symbols.app 的搜索框一次只问一个问题，比三个就得搜三次、切三次。
你不是看不清，是记不住上一个长什么样。

整段贴进来就行。三个并排铺开，看一眼就选完了。

点一下复制的是**名称**——那正是要粘回 AI 已经写好的字符串字面量里的东西。预览区上方那个开关能换成
`Image(systemName:)`、`UIImage(systemName:)` 或 `NSImage(systemSymbolName:)`，选过一次就记住。

粘进去的内容不出浏览器。`worker/index.ts` 发的是 `connect-src 'self'`，这一页就算想上传也发不出去。

内置五套暗色配色：默认那套，加上 Dark Modern、GitHub Dark 和 Catppuccin Mocha，取值都来自各自项目
自己公布的规格。

## 跑起来

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 先构建，再校验 SSR 输出和磁贴几何
```

## 符号是哪来的

7,988 个名字、它们的 iOS 版本、601 条商标限制，以及全部图案，都是**从 macOS 自己生成的**，
两份产物都不许手工改。

```bash
node scripts/sync-symbol-catalog.mjs   # 目录（几秒）
swift scripts/render_sfsymbols.swift   # 7,988 张图 + favicon + 分享卡（约 65 秒，需要 Mac）
```

<details>
<summary>为什么必须是 Mac，以及它为什么不会过期</summary>

Apple 没有符号 API，但每台 Mac 都带着 SF Symbols.app 读的那份名单，就在
`/System/Library/CoreServices/CoreGlyphs.bundle` 里——名字、发布年份、601 条商标限制原文。
两个生成器读的是同一个文件，所以「名字认得出」和「图存在」不可能对不上。

因为源头是操作系统，目录跟着系统一起更新：换一台装了更新 macOS 的机器把两条命令跑一遍，
那一年的新符号就在里面了，别的什么都不用动。

图只能在 Mac 上出。SF Symbols **不在**系统字体的私有区里——`SFNS.ttf` 的 cmap 里
`>= U+F0000` 只有一个码位——所以网页拿不到矢量数据，没有第二条路。

</details>

## 目录结构

| 路径 | |
|---|---|
| `app/` | 产品本身。`symbol-flow.tsx` 是整个界面，`messages.ts` 装着所有用户可见的字 |
| `scripts/` | 两个生成器，外加 `ui-probe.mjs`——用真实浏览器量真实布局 |
| `tests/` | SSR 输出、源码不变量、磁贴几何 |
| `public/symbols/` | 生成物，删了能重来 |

`app/chatgpt-auth.ts`、`db/`、`drizzle*`、`examples/d1/` 是脚手架残留，一处都没引用。
`.openai/hosting.json` 长得像残留，其实不是：`vite.config.ts` 在构建时会 import 它。
