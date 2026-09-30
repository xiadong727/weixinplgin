// 把网页版打成一个自包含的 HTML，方便丢到任何地方直接打开
// 用法：npm run build:single → dist/公众号一键排版.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = resolve(ROOT, 'dist/web')
const ASSETS = resolve(WEB, 'assets')

let html = readFileSync(resolve(WEB, 'index.html'), 'utf8')
const files = readdirSync(ASSETS)
const js = files.filter((f) => f.endsWith('.js'))
const css = files.filter((f) => f.endsWith('.css'))

if (js.length !== 1) {
  throw new Error(`期望恰好一个 JS chunk，实际 ${js.length} 个：单文件模式需要关闭代码分割`)
}

// 替换值必须走函数形式：代码里的 $& / $` 之类序列会被 String.replace 当成替换模式展开
const inline = (re, build) => {
  const next = html.replace(re, () => build())
  if (next === html) throw new Error(`没找到要内联的资源引用：${re}`)
  html = next
}

// <link rel=stylesheet> → 内联 <style>
for (const name of css) {
  const code = readFileSync(resolve(ASSETS, name), 'utf8')
  inline(new RegExp(`\\s*<link[^>]+href="[^"]*${name}"[^>]*>`), () => `\n  <style>\n${code}\n  </style>`)
}

// <script src> → 内联 <script type="module">
for (const name of js) {
  const code = readFileSync(resolve(ASSETS, name), 'utf8')
  inline(
    new RegExp(`\\s*<script[^>]+src="[^"]*${name}"[^>]*></script>`),
    () => `\n  <script type="module">\n${code}\n  </script>`,
  )
}

if (/<(script|link)[^>]+(src|href)="\.\/assets/.test(html)) {
  throw new Error('还有没内联掉的外部资源引用')
}

const out = resolve(ROOT, 'dist/公众号一键排版.html')
writeFileSync(out, html)
console.log(`→ ${out}  (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`)
