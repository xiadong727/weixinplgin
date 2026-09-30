import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  render, THEMES, THEME_GROUPS, CODE_THEMES, autoSpace, normalizePunctuation,
  sanitizeHtml, parseCustomCss, auditForWechat,
  prepareMarkdown, checkImportFile, IMPORT_EXTENSIONS, mergeWarnings,
  plainTextOf, containsSameContent, styleSignature, hasStyleSignature, hasColor,
  sanitizeOptions, sanitizeUi, DEFAULT_OPTIONS,
  kindOf, docxToMarkdown, parseXml, findAll, unzip,
} from '../dist/core/index.mjs'

/** 把字符串按指定编码打包成 ArrayBuffer，模拟读进来的文件 */
function buf(str, encoding = 'utf8') {
  const b = Buffer.from(str, encoding)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}

test('中英文之间自动补空格', () => {
  assert.equal(autoSpace('这是English单词'), '这是 English 单词')
  assert.equal(autoSpace('版本v2.0发布'), '版本 v2.0 发布')
  assert.equal(autoSpace('纯中文不动'), '纯中文不动')
  assert.equal(autoSpace('pure english only'), 'pure english only')
  // 中文标点自带宽度，两侧不补空格
  assert.equal(autoSpace('中文，English'), '中文，English')
})

test('标点规范化', () => {
  assert.equal(normalizePunctuation('你好,世界'), '你好，世界')
  assert.equal(normalizePunctuation('真的吗?'), '真的吗？')
  assert.equal(normalizePunctuation('等一下...'), '等一下……')
  // 不能误伤文件名
  assert.equal(normalizePunctuation('打开配置.json文件'), '打开配置.json文件')
})

test('站外链接转脚注，站内链接保留可点击', () => {
  const r = render('看 [A](https://a.com) 和 [B](https://mp.weixin.qq.com/s/x)')
  assert.equal(r.footnotes.length, 1)
  assert.equal(r.footnotes[0].href, 'https://a.com')
  assert.match(r.html, /<sup[^>]*>\[1\]<\/sup>/)
  assert.match(r.html, /<a href="https:\/\/mp\.weixin\.qq\.com\/s\/x"/)
  assert.match(r.html, /参考资料/)
})

test('相同链接复用同一个脚注编号', () => {
  const r = render('[a](https://x.com) 与 [b](https://x.com)')
  assert.equal(r.footnotes.length, 1)
  // 两处正文引用 + 文末一条参考资料
  assert.equal((r.html.match(/<sup[^>]*>\[1\]<\/sup>/g) || []).length, 2)
})

test('关闭脚注时不产生参考资料', () => {
  const r = render('[A](https://a.com)', { linksToFootnotes: false })
  assert.equal(r.footnotes.length, 0)
  assert.doesNotMatch(r.html, /参考资料/)
})

test('输出全内联，不含 class / style 标签', () => {
  for (const theme of THEMES) {
    const r = render('# 标题\n\n正文 text\n\n```js\nconst a=1\n```\n\n> 引用\n\n- 项目', {
      theme: theme.id,
    })
    assert.doesNotMatch(r.html, /\sclass=/, `${theme.id} 泄漏了 class`)
    assert.doesNotMatch(r.html, /<style/i, `${theme.id} 泄漏了 <style>`)
    assert.match(r.html, /^<section style="/, `${theme.id} 缺少容器样式`)
  }
})

test('每个代码主题都能内联高亮', () => {
  for (const ct of CODE_THEMES) {
    const r = render('```python\ndef f(x):\n    return x + 1\n```', { codeTheme: ct.id })
    assert.match(r.html, new RegExp(ct.bg.replace(/[()]/g, '\\$&')))
    assert.match(r.html, /<span style="color:#/)
    assert.doesNotMatch(r.html, /hljs/)
  }
})

test('未知语言不报错并回退自动识别', () => {
  const r = render('```notalanguage\nfoo bar\n```')
  assert.match(r.html, /<pre/)
})

test('任务列表用字符复选框，不留 input', () => {
  const r = render('- [x] 完成\n- [ ] 待办')
  assert.doesNotMatch(r.html, /<input/)
  assert.match(r.html, /☑/)
  assert.match(r.html, /☐/)
})

test('表格按对齐方式输出 text-align', () => {
  const r = render('| a | b |\n|:--|--:|\n| 1 | 2 |')
  assert.match(r.html, /text-align:right/)
  assert.match(r.html, /overflow-x:auto/)
})

test('图片带图注，可关闭', () => {
  const on = render('![说明](https://x.com/a.png)')
  assert.match(on.html, /说明<\/span><\/section>/)
  const off = render('![说明](https://x.com/a.png)', { imageCaption: false })
  assert.doesNotMatch(off.html, /说明<\/section>/)
})

test('内嵌 HTML 会被清洗', () => {
  const r = sanitizeHtml('<p onclick="evil()">hi</p><script>bad()</script><span style="position:absolute;color:red">x</span>')
  assert.doesNotMatch(r.html, /script|onclick|position/)
  assert.match(r.html, /color:red/)
  assert.match(r.html, /<p>hi<\/p>/)
})

test('Markdown 里的 script 标签不会进入结果', () => {
  const r = render('正文\n\n<script>alert(1)</script>\n\n结尾')
  assert.doesNotMatch(r.html, /<script/i)
  assert.ok(r.warnings.some((w) => w.includes('script')))
})

test('自定义 CSS 覆盖主题', () => {
  const r = render('## 标题', { theme: 'academic', customCss: 'h2 { color: #ff0000; border-bottom: none }' })
  assert.match(r.html, /color:#ff0000/)
  const parsed = parseCustomCss('.unknown { color: red }')
  assert.ok(parsed.warnings.length > 0)
})

test('排版选项生效', () => {
  const r = render('第一段', { fontSize: 18, lineHeight: 2, paragraphSpacing: 30, indentFirstLine: true })
  assert.match(r.html, /font-size:18px/)
  assert.match(r.html, /line-height:36px/)
  assert.match(r.html, /margin:0 0 30px/)
  assert.match(r.html, /text-indent:2em/)
})

test('所有文字行高都带单位或使用 normal，避免微信误判', () => {
  const md = '普通正文 [外链](https://example.com)\n\n> 多行引用第一行\n> 第二行\n\n## 多行标题测试\n\n---\n\n![图注](https://example.com/a.png)\n\n```js\nconst x = 1\n```'
  for (const theme of THEMES) {
    const { html } = render(md, { theme: theme.id, fontSize: 16, lineHeight: 1.75 })
    const values = [...html.matchAll(/line-height:([^;"']+)/g)].map((match) => match[1])
    assert.ok(values.length > 0)
    for (const value of values) {
      assert.match(value, /^(?:normal|inherit|[\d.]+(?:px|em))$/, `${theme.id} 存在危险行高：${value}`)
    }
    assert.ok(!values.includes('0'), `${theme.id} 仍含 line-height:0`)
  }
})

test('行高保护只包直接文字，不用外层 span 包住行内格式', () => {
  const md = [
    '普通文字和 **加粗文字** 混排后会折成多行。',
    '',
    '**整段加粗**',
    '',
    '| 列一 | 列二 |',
    '|---|---|',
    '| 普通 | **加粗** |',
    '',
    '[站内链接](https://mp.weixin.qq.com/s/example)',
    '',
    '![图片说明](https://example.com/a.png)',
  ].join('\n')
  const { html } = render(md, { theme: 'tech' })
  const guard = '<span style="color:[^;\"]+;font-size:inherit;line-height:inherit">'
  assert.match(html, new RegExp(`<p[^>]*>${guard}普通文字和 <\\/span><strong[^>]*>加粗文字<\\/strong>${guard} 混排`))
  assert.match(html, /<p[^>]*><strong[^>]*>整段加粗<\/strong><\/p>/)
  assert.doesNotMatch(html, /<span[^>]*line-height:inherit[^>]*>[^<]*<strong/)
  assert.match(html, new RegExp(`<th[^>]*>${guard}列一<\\/span><\\/th>`))
  assert.match(html, new RegExp(`<a[^>]*>${guard}站内链接<\\/span><\\/a>`))
  assert.match(html, new RegExp(`<section[^>]*>${guard}图片说明<\\/span><\\/section>`))
})

test('混排图片不会生成非法的 p 包 section', () => {
  const mixed = render('图前 ![说明](https://example.com/a.png) 图后').html
  assert.match(mixed, /<p[^>]*>[\s\S]*<img[^>]*>[\s\S]*<\/p>/)
  assert.doesNotMatch(mixed, /<p[^>]*>[\s\S]*?<section[^>]*>[\s\S]*?<\/section>[\s\S]*?<\/p>/)

  const standalone = render('![说明](https://example.com/a.png)').html
  assert.match(standalone, /<section[^>]*><img[^>]*><section[^>]*>/)
})

test('代码换行开关', () => {
  assert.match(render('```\nx\n```', { codeWrap: true }).html, /white-space:pre-wrap/)
  assert.match(render('```\nx\n```', { codeWrap: false }).html, /white-space:pre/)
})

test('实体不会被二次转义', () => {
  const r = render('A &amp; B &lt; C')
  assert.match(r.html, /A &amp; B &lt; C/)
  assert.doesNotMatch(r.html, /&amp;amp;/)
})

test('空输入与纯空白输入安全', () => {
  for (const input of ['', '   ', '\n\n\n']) {
    const r = render(input)
    assert.match(r.html, /^<section /)
  }
})

test('体检能发现残留的 class 与 style 标签', () => {
  const w = auditForWechat('<div class="a"><style>x{}</style></div>')
  assert.equal(w.length, 2)
})

test('本地路径图片会被提示', () => {
  const r = render('![图](./local.png)')
  assert.ok(r.warnings.some((w) => w.includes('图床')))
  const ok = render('![图](https://x.com/a.png)')
  assert.ok(!ok.warnings.some((w) => w.includes('图床')))
})

test('主题元数据齐全且 id 不重复', () => {
  assert.ok(THEMES.length >= 15, `主题只有 ${THEMES.length} 套`)
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length)
  for (const t of THEMES) {
    assert.ok(t.name && t.desc && t.primary && t.group, `${t.id} 元数据缺项`)
    assert.ok(THEME_GROUPS.includes(t.group), `${t.id} 的分组 ${t.group} 不在分组表里`)
    assert.match(t.primary, /^#[0-9a-fA-F]{6}$/, `${t.id} 主色格式不对`)
  }
  // 每个分组都得有主题，否则 UI 里会出现空的 optgroup
  for (const g of THEME_GROUPS) {
    assert.ok(THEMES.some((t) => t.group === g), `分组「${g}」是空的`)
  }
})

test('每套主题推荐的代码配色都存在', () => {
  const ids = new Set(CODE_THEMES.map((c) => c.id))
  assert.ok(CODE_THEMES.length >= 9, `代码配色只有 ${CODE_THEMES.length} 套`)
  assert.equal(new Set(CODE_THEMES.map((c) => c.id)).size, CODE_THEMES.length)
  for (const t of THEMES) {
    assert.ok(ids.has(t.codeTheme), `${t.id} 推荐的代码配色 ${t.codeTheme} 不存在`)
  }
})

test('列表符号上色只作用于无序列表', () => {
  const { html } = render('- 无序项\n\n1. 有序项', { theme: 'tech' })
  const lis = html.match(/<li[^>]*>/g)
  assert.match(lis[0], /color:/)      // 无序：li 带 marker 色
  assert.doesNotMatch(lis[1], /color:/) // 有序：序号是内容，保持正文色
  // 无序列表的文字要包一层文字色，否则会继承成 marker 色
  assert.match(html, /<li[^>]*color:[^"]*"><span style="color:/)
})

test('主题不使用公众号会过滤的属性', () => {
  const banned = /(?:^|;)\s*(position|float|animation|transition|transform)\s*:/
  const md = '# 一\n\n## 二\n\n### 三\n\n正文\n\n> 引用\n\n- 项\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |'
  for (const t of THEMES) {
    const { html } = render(md, { theme: t.id })
    for (const style of html.match(/style="([^"]*)"/g) ?? []) {
      assert.doesNotMatch(style, banned, `${t.id} 用了会被过滤的属性：${style}`)
    }
    assert.doesNotMatch(html, /linear-gradient|::before|::after|var\(/, `${t.id} 用了不兼容的写法`)
  }
})

test('标题自动编号按层级独立计数', () => {
  const md = '## 甲\n\n### a\n\n### b\n\n## 乙\n\n### c'
  const { html } = render(md, { theme: 'business' })
  // business 的 h2 装饰是 {{nn}}
  assert.match(html, />01</)
  assert.match(html, />02</)
  // academic 的 h2 用 {{n}}. 形式，h3 不编号
  const acad = render(md, { theme: 'academic' }).html
  assert.match(acad, />1\.</)
  assert.match(acad, />2\.</)
})

test('分隔线纹样替换掉 hr', () => {
  const plain = render('---', { theme: 'minimal' }).html
  assert.match(plain, /<hr /)
  const fancy = render('---', { theme: 'magazine' }).html
  assert.doesNotMatch(fancy, /<hr /)
  assert.match(fancy, /❖/)
})

test('引用块装饰只加在引用块上', () => {
  const { html } = render('> 一句话\n\n普通段落', { theme: 'ink' })
  const bq = html.slice(html.indexOf('<blockquote'), html.indexOf('</blockquote>'))
  assert.match(bq, /“/)
  assert.equal((html.match(/“/g) || []).length, 1)
})

test('首字放大只作用于全文第一段', () => {
  const md = '第一段文字\n\n第二段文字'
  const on = render(md, { theme: 'magazine' })
  assert.match(on.html, /<span style="font-size:2\.4em[^"]*">第<\/span><span[^>]*>一段文字<\/span>/)
  assert.equal((on.html.match(/font-size:2\.4em/g) || []).length, 1)
  // 不开首字放大的主题不应出现
  const off = render(md, { theme: 'minimal' })
  assert.doesNotMatch(off.html, /font-size:2\.4em/)
})

test('首字放大遇到以标签开头的段落时跳过', () => {
  const { html } = render('**加粗开头**的段落', { theme: 'magazine' })
  assert.doesNotMatch(html, /font-size:2\.4em/)
})

/* ---------------- 本地 .md 导入 ---------------- */

test('导入：UTF-8 正常解码并统一换行', () => {
  const r = prepareMarkdown(buf('# 标题\r\n\r\n正文 text\r\n'))
  assert.equal(r.encoding, 'UTF-8')
  assert.doesNotMatch(r.text, /\r/)
  assert.match(r.text, /# 标题/)
  assert.equal(r.warnings.length, 0)
})

test('导入：带 BOM 的 UTF-8 会去掉 BOM', () => {
  const r = prepareMarkdown(buf('\uFEFF# 标题\n'))
  assert.match(r.encoding, /BOM/)
  assert.ok(r.text.startsWith('# 标题'), `实际开头：${JSON.stringify(r.text.slice(0, 6))}`)
})

test('导入：GBK 文件不会乱码', () => {
  // 「# 中文」的 GBK 字节，「中文」= D6 D0 CE C4，这串不是合法 UTF-8
  const gbk = new Uint8Array([0x23, 0x20, 0xd6, 0xd0, 0xce, 0xc4, 0x0a])
  const r = prepareMarkdown(gbk.buffer)
  assert.equal(r.encoding, 'GB18030')
  assert.match(r.text, /# 中文/)
  assert.ok(r.warnings.some((w) => w.includes('UTF-8')), '应该提示编码问题')
})

test('导入：去掉 YAML front matter 并把 title 提成大标题', () => {
  const src = '---\ntitle: "我的文章"\ndate: 2026-01-01\ntags: [a, b]\n---\n\n正文第一段\n'
  const r = prepareMarkdown(buf(src))
  assert.doesNotMatch(r.text, /^---/m)
  assert.doesNotMatch(r.text, /date:/)
  assert.equal(r.frontMatter.title, '我的文章')
  assert.equal(r.frontMatter.date, '2026-01-01')
  assert.ok(r.text.startsWith('# 我的文章'), r.text.slice(0, 30))
})

test('导入：正文已有 H1 时不再重复插标题', () => {
  const src = '---\ntitle: 文件名标题\n---\n\n# 正文自带的标题\n\n内容\n'
  const r = prepareMarkdown(buf(src))
  assert.equal((r.text.match(/^# /gm) || []).length, 1)
  assert.match(r.text, /# 正文自带的标题/)
})

test('导入：正文里的分隔线不会被当成 front matter', () => {
  const r = prepareMarkdown(buf('正文开头\n\n---\n\n正文结尾\n'))
  assert.match(r.text, /^正文开头/)
  assert.match(r.text, /---/)
})

test('导入：本地图片引用会被点名提示', () => {
  const src = '![图一](./img/a.png)\n\n![图二](https://x.com/b.png)\n\n![[obsidian.png]]\n'
  const r = prepareMarkdown(buf(src))
  const w = r.warnings.find((x) => x.includes('本地图片'))
  assert.ok(w, `提示缺失：${JSON.stringify(r.warnings)}`)
  assert.match(w, /2 处/)
  assert.match(w, /\.\/img\/a\.png/)
  assert.doesNotMatch(w, /x\.com/)
})

test('导入：文件类型识别与大小校验', () => {
  assert.equal(checkImportFile('a.md', 100), null)
  assert.equal(checkImportFile('a.MARKDOWN', 100), null)
  assert.equal(checkImportFile('稿子.docx', 100), null)
  assert.equal(checkImportFile('报告.PDF', 100), null)
  assert.equal(kindOf('a.md'), 'text')
  assert.equal(kindOf('a.txt'), 'text')
  assert.equal(kindOf('a.docx'), 'docx')
  assert.equal(kindOf('a.pdf'), 'pdf')
  assert.equal(kindOf('a.pages'), null)
  // 旧版 .doc 要给出可操作的提示，而不是笼统说不支持
  assert.match(checkImportFile('老文档.doc', 100), /另存为 \.docx/)
  assert.match(checkImportFile('a.png', 100), /支持/)
  // 纯文本 2MB 上限，Word/PDF 放宽到 30MB
  assert.match(checkImportFile('a.md', 5 * 1024 * 1024), /太大/)
  assert.equal(checkImportFile('a.docx', 5 * 1024 * 1024), null)
  assert.match(checkImportFile('a.pdf', 50 * 1024 * 1024), /太大/)
  assert.ok(IMPORT_EXTENSIONS.includes('.md') && IMPORT_EXTENSIONS.includes('.docx'))
})

test('XML 遍历器能处理 OOXML 的基本结构', () => {
  const root = parseXml('<w:body><w:p><w:r><w:t xml:space="preserve">你好 &amp; 世界</w:t></w:r></w:p></w:body>')
  const ts = findAll(root, 'w:t')
  assert.equal(ts.length, 1)
  assert.equal(ts[0].text, '你好 & 世界')
  assert.equal(ts[0].attrs['xml:space'], 'preserve')
})

test('导入提示与排版体检的重复项会合并', () => {
  const imported = prepareMarkdown(buf('![图](./a.png)\n'))
  const rendered = render(imported.text)
  const merged = mergeWarnings(imported.warnings, rendered.warnings)
  // 两边都会报本地图片，合并后只留一条，且保留更具体的那条（带文件名）
  assert.equal(merged.filter((w) => w.includes('图床')).length, 1)
  assert.match(merged[0], /\.\/a\.png/)
})

test('导入的内容能直接排版', () => {
  const src = '---\ntitle: 端到端\n---\n\n正文 body 一段。\n'
  const { text } = prepareMarkdown(buf(src))
  const { html } = render(text, { theme: 'numbered' })
  assert.match(html, /端到端/)
  assert.doesNotMatch(html, /title:/)
})

/* -------- 插入后的「内容还在不在」校验 -------- */

test('比对时会解开实体：&quot; 与原字符引号应视为相同', () => {
  // 我们输出的是 &quot;，浏览器从 DOM 读回来是原字符 " —— 这曾经导致校验永远失败
  const ours = '<p>手机里那个 &quot;余额宝&quot;，它到底是什么。</p>'
  const fromDom = '<p style="color:#333">手机里那个 "余额宝"，它到底是什么。</p>'
  assert.equal(plainTextOf(ours), plainTextOf(fromDom))
  assert.equal(containsSameContent(ours, fromDom), true)
})

test('&amp; 只解一次，不会把 &amp;lt; 误解成 <', () => {
  assert.equal(plainTextOf('<p>a&amp;lt;b</p>'), 'a&lt;b')
})

test('编辑器规整 HTML、剥掉部分装饰后仍判定为同一篇', () => {
  const ours = render('# 标题\n\n第一段内容\n\n## 小节\n\n第二段内容\n\n最后一段').html
  // 模拟微信：加 data-*、重写 style、丢掉一部分标签
  const mangled = ours
    .replace(/<section/g, '<section data-mp="1"')
    .replace(/style="[^"]*"/g, 'style="color: rgb(51, 51, 51);"')
    .replace(/<sup[^>]*>.*?<\/sup>/g, '')
  assert.equal(containsSameContent(ours, mangled), true)
})

test('样式指纹能区分共用同一套代码配色的两套主题', () => {
  const md = '# 标题\n\n正文一段\n\n## 小节\n\n> 引用\n\n```ts\nconst a = 1\n```\n'
  // 徽章序号和卡片都用 one-light 代码配色，指纹不能被代码块的颜色带偏
  const a = render(md, { theme: 'badge', codeTheme: 'one-light' }).html
  const b = render(md, { theme: 'card', codeTheme: 'one-light' }).html
  assert.equal(hasStyleSignature(a, styleSignature(a)), true)
  assert.equal(hasStyleSignature(b, styleSignature(b)), true)
  assert.equal(hasStyleSignature(b, styleSignature(a)), false, '卡片的正文不该被认成徽章序号')
  assert.equal(hasStyleSignature(a, styleSignature(b)), false, '徽章序号的正文不该被认成卡片')
})

test('样式回退（文字不变）要能被识别出来', () => {
  const md = '# 标题\n\n这是一段足够长的正文，用来保证文字比对一定通过。\n\n## 小节\n\n> 引用一句'
  const now = render(md, { theme: 'klein' }).html
  const old = render(md, { theme: 'rose' }).html
  // 文字完全一致，所以只比文字会漏判
  assert.equal(containsSameContent(now, old), true)
  // 样式指纹必须判否
  assert.equal(hasStyleSignature(old, styleSignature(now)), false)
})

test('主色判定认 hex 和 rgb 两种写法', () => {
  assert.equal(hasColor('<h2 style="color:#1F4E79">x</h2>', '#1F4E79'), true)
  // 微信会把 #1F4E79 重写成 rgb(31, 78, 121)
  assert.equal(hasColor('<h2 style="color: rgb(31, 78, 121)">x</h2>', '#1F4E79'), true)
  assert.equal(hasColor('<h2 style="color:#E08B3C">x</h2>', '#1F4E79'), false)
})

test('换主题时旧正文不该被认成新主题', () => {
  const md = '# 标题\n\n一段足够长的正文，保证文字比对一定通过。\n\n## 小节\n\n> 引用\n\n[链接](https://a.com)'
  const 商务蓝 = render(md, { theme: 'business' }).html
  const 暖阳橙 = render(md, { theme: 'warm' }).html
  // 这正是线上出问题的组合：文字一样，不能靠文字判断
  assert.equal(containsSameContent(商务蓝, 暖阳橙), true)
  // 主色是最硬的依据
  assert.equal(hasColor(暖阳橙, '#1F4E79'), false, '暖阳橙的正文里不该有商务蓝的主色')
  assert.equal(hasColor(商务蓝, '#1F4E79'), true)
})

test('内容被整个还原成别的东西时判否', () => {
  const ours = render('# 标题\n\n很长的一段正文内容，用来做比对基准。\n\n## 小节\n\n另一段内容').html
  assert.equal(containsSameContent(ours, '<p>这里是原有正文，一行占位内容。</p>'), false)
  assert.equal(containsSameContent(ours, ''), false)
})

test('空内容视为无需校验', () => {
  assert.equal(containsSameContent('', '<p>随便什么</p>'), true)
})

/* -------- 设置的保存与还原 -------- */

test('自定义主色和自定义 CSS 会被记住', () => {
  // 这两个是可选字段，不在 DEFAULT_OPTIONS 里，曾经每次重开都丢
  const saved = { theme: 'gilt', primary: '#B5451B', customCss: 'h2 { color: red }' }
  const back = sanitizeOptions(saved)
  assert.equal(back.theme, 'gilt')
  assert.equal(back.primary, '#B5451B')
  assert.equal(back.customCss, 'h2 { color: red }')
})

test('完整选项能原样往返', () => {
  const mine = {
    ...DEFAULT_OPTIONS,
    theme: 'badge', codeTheme: 'nord', fontSize: 18, lineHeight: 2,
    paragraphSpacing: 28, autoSpacing: false, punctuation: true,
    indentFirstLine: true, linksToFootnotes: false, codeWrap: true,
    primary: '#1F4E79', customCss: 'p { text-align: justify }',
  }
  assert.deepEqual(sanitizeOptions(JSON.parse(JSON.stringify(mine))), mine)
})

test('坏数据不会被存进来', () => {
  const bad = sanitizeOptions({
    theme: 123, fontSize: 999, lineHeight: NaN, paragraphSpacing: -5,
    autoSpacing: 'yes', primary: 'not-a-color', customCss: { nope: 1 },
  })
  assert.equal(bad.theme, DEFAULT_OPTIONS.theme)
  assert.equal(bad.fontSize, DEFAULT_OPTIONS.fontSize)
  assert.equal(bad.lineHeight, DEFAULT_OPTIONS.lineHeight)
  assert.equal(bad.paragraphSpacing, DEFAULT_OPTIONS.paragraphSpacing)
  assert.equal(bad.autoSpacing, DEFAULT_OPTIONS.autoSpacing)
  assert.equal(bad.primary, undefined)
  assert.equal(bad.customCss, undefined)
})

test('没存过或存坏了都回落到默认', () => {
  assert.deepEqual(sanitizeOptions(null), DEFAULT_OPTIONS)
  assert.deepEqual(sanitizeOptions('乱码'), DEFAULT_OPTIONS)
  assert.equal(sanitizeUi(null).insertMode, 'replace')
  assert.equal(sanitizeUi({ insertMode: 'cursor' }).insertMode, 'cursor')
  assert.equal(sanitizeUi({ insertMode: '乱写' }).insertMode, 'replace')
})

test('纯文本兜底去掉 Markdown 记号', () => {
  const r = render('# 标题\n\n**粗**和`码`')
  assert.equal(r.text.includes('#'), false)
  assert.equal(r.text.includes('**'), false)
})
