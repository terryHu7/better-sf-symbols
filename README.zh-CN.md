# Better SF Symbols

[English](README.md) · 简体中文

[![Better SF Symbols](docs/screenshot-zh.png)](https://sfsymbols.terryhu.workers.dev)


## 苹果开发者+符号选择困难症终于有救了！

### 欢迎收藏：[sfsymbols.terryhu.workers.dev](https://sfsymbols.terryhu.workers.dev)

一网打尽文本里的所有SF Symbol，从此告别低效👋 

## 项目介绍

Vibe Coding时代，总会遇到下面这个情景。

开发新功能，选按钮图标时候，让AI推荐三个时一般会收到如下回复:
square.and.arrow.up 最常见；
arrow.up.doc 偏向分享文件；
arrowshape.turn.up.right 偏向转发给别人。

于是开始一个个复制粘贴，来回切到SF Symbols.app，看看那个图标长什么样，最后只能凭着印象选出一个。

用上这个工具后，只需copy整段AI回复后粘贴一次，页面会自动提取出来所有图标符号，一网打尽。

## 本地运行方式

```bash
npm install
npm run dev     # http://localhost:3000
npm test        
```

## 许可

代码是 MIT，见 [LICENSE](LICENSE)。

SF Symbols 本身是 Apple 的，使用受 Apple 的 SF Symbols 许可协议约束。仓库里没有提交任何符号图——
`public/symbols/` 由你自己的 Mac 从系统生成，已经在 gitignore 里。这个站是给写 Apple 平台代码的人
用的确认工具，不是图标库：没有任何下载导出，复制出来的是名字或者一行 Swift。
