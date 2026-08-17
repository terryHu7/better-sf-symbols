# Better SF Symbols

[English](README.md) · 简体中文

**线上：https://sfsymbols.terryhu.workers.dev**

![Better SF Symbols：把一段 AI 回复粘进去，回复里提到的每个 SF Symbol 都并排铺开成真图](docs/screenshot-zh.png)

粘贴一段 AI 回复，把里面提到的每个 SF Symbol 都变成真实图案，点一下就能复制。

AI 只能给你**名字**——“用 `square.and.arrow.up`，或者 `arrow.up.doc`”。光看名字看不出长什么样，于是你得把每个名字复制到 SF Symbols app 里再切回来。这个网站删掉的就是这一整趟来回：把整段回复贴进来，符号自动被识别，真图并排铺开，点一下就能复制。默认复制的是名称——那正是要粘回 AI 已经写好的字符串字面量里的东西——预览区旁边的格式开关能换成 `Image(systemName:)`、`UIImage(systemName:)` 或 `NSImage(systemSymbolName:)`，选择会记住，下次还是它。

一切都在浏览器里跑。粘贴的内容不会被上传——由 `worker/index.ts` 里的 `connect-src 'self'` 强制执行，不是口头承诺。

## 运行

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 先构建，再校验 SSR 输出和磁贴几何
npm run lint
```

## 符号目录

全部 7,988 个名字、对应的 iOS 版本号和图案，都是**直接从 macOS 本身生成的**——Apple 没有提供符号 API，但每台 Mac 都自带一份权威名单，在 `CoreGlyphs.bundle` 里。两份都不曾手工改过。

```bash
node scripts/sync-symbol-catalog.mjs   # 名字 + 版本号 + 商标限制（几秒）
swift scripts/render_sfsymbols.swift   # 7,988 张 mask 图 + favicon + OG 卡片（约 65 秒，需要一台 Mac）
```

因为数据源是操作系统本身，目录会跟着系统一起更新：在装了新版 macOS 的机器上把这两条命令跑一遍，当年新增的符号就自动进来了。SF Symbols 不在系统字体的私有区里（`SFNS.ttf` 里只有一个 PUA 码位），Apple 也没有提供 API，所以图案只能来自一台 Mac，没有别的来源。

## 部署

```bash
npm run build
npx wrangler deploy
```

一个带静态资源的 Cloudflare Worker——SSR 仍然保留，所以界面语言依旧跟着请求的 `Accept-Language` 走。Wrangler 配置由 Vite 插件生成到 `dist/server/wrangler.json`，worker 名字取自 `package.json` 的 `name`。

安全响应头写在 `worker/index.ts` 里，**不是** `public/_headers`——Cloudflare 只把那个文件应用在静态资源响应上，写在那里的 CSP 永远到不了服务端渲染出来的 HTML。`_headers` 仍然负责 `/symbols/*` 的缓存。改完任何响应头之后，去查线上的真实结果：

```bash
curl -sI https://sfsymbols.terryhu.workers.dev | grep -i content-security-policy
```

## 目录结构

| 路径 | 是什么 |
|---|---|
| `app/` | 整个产品。`symbol-flow.tsx` 是界面，`messages.ts` 装着所有面向用户的文案 |
| `scripts/` | 目录和图案的生成脚本，外加自验工具 `ui-probe.mjs` |
| `tests/` | SSR 输出、源码不变量、磁贴几何的测试 |
| `public/symbols/` | 生成出来的图案——可丢弃，由 Swift 脚本重新渲染 |

这个项目没用到的脚手架残留：`app/chatgpt-auth.ts`、`db/`、`drizzle*`、`examples/d1/`。

`.openai/hosting.json` 看着像残留，其实不是——`vite.config.ts` 引入了它，`build/sites-vite-plugin.ts` 也会拷贝它，删掉会导致 `npm run build` 直接失败。它是构建输入，不是部署目标。
