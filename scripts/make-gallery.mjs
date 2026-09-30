// 生成 6 套主题的对照页，方便挑主题：npm run gallery → dist/gallery.html
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { render, THEMES } = await import(resolve(ROOT, 'dist/core/index.mjs'))

const SAMPLE = `# 文章大标题

正文混排 English words 和数字 2026，看看中英文之间的间距。

## 二级标题看这里

> 引用块适合放金句、结论或者引用别人的话。

### 三级标题

- 第一点，说明某个 feature
- 第二点，嵌套也支持
  - 子项 A

1. 先做这个
2. 再做那个

**加粗**、*斜体*、~~删除线~~、\`inline code\`，外链 [Vite 官网](https://vitejs.dev)。

\`\`\`ts
interface Article {
  title: string
  words: number
}
\`\`\`

| 主题 | 适合题材 | 特点 |
|:---|:---|---:|
| 极简白 | 通用 | 留白多 |
| 科技蓝 | 技术号 | 色块标题 |

---
`

const cards = THEMES.map((t) => {
  const { html } = render(SAMPLE, { theme: t.id, codeTheme: t.codeTheme })
  return `<article class="card">
  <header class="cap"><b>${t.name}</b><em>${t.group}</em><span>${t.desc}</span><code>theme: "${t.id}"</code></header>
  <div class="body">${html}</div>
</article>`
}).join('\n')

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>主题对照 · 公众号一键排版</title>
<style>
  body{margin:0;background:#eceef1;font:13px/1.6 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#1f2328}
  h1{font-size:16px;margin:0;padding:16px 18px 0}
  p.note{margin:4px 0 0;padding:0 18px 14px;font-size:12px;color:#6b7280}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:14px;padding:0 14px 24px}
  .card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08)}
  .cap{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding:10px 14px;background:#fbfbfc;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280}
  .cap b{font-size:13px;color:#1f2328}
  .cap em{font-style:normal;font-size:11px;color:#fff;background:#8b93a5;border-radius:3px;padding:1px 6px}
  .cap code{margin-left:auto;font-size:11px;color:#9ca3af}
  .body{padding:20px 18px 26px}
  img{max-width:100%}
</style></head>
<body>
  <h1>主题对照</h1>
  <p class="note">同一篇内容在 ${THEMES.length} 套主题下的效果，代码块用的是各主题推荐的高亮配色。每一块都是可直接粘进公众号的内联样式 HTML。</p>
  <div class="grid">
${cards}
  </div>
</body></html>`

mkdirSync(resolve(ROOT, 'dist'), { recursive: true })
const out = resolve(ROOT, 'dist/gallery.html')
writeFileSync(out, page)
console.log(`→ ${out}`)
