import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docxToMarkdown, unzip } from '../dist/core/index.mjs'

/* 就地造一个 zip（全部用「存储」方式，不压缩），避免测试依赖外部文件 */
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeZip(entries) {
  const enc = new TextEncoder()
  const locals = []
  const central = []
  let offset = 0
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(content)
    const sum = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint32(14, sum, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)

    const cd = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(6, 20, true)
    cv.setUint32(16, sum, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    cd.set(nameBytes, 46)
    central.push(cd)
    offset += local.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)

  const total = [...locals, ...central, eocd]
  const out = new Uint8Array(total.reduce((a, b) => a + b.length, 0))
  let p = 0
  for (const part of total) { out.set(part, p); p += part.length }
  return out.buffer
}

const p = (inner) => `<w:p>${inner}</w:p>`
const run = (text, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`

function buildDocx(bodyXml, extra = {}) {
  return makeZip({
    'word/document.xml':
      `<?xml version="1.0"?><w:document xmlns:w="x" xmlns:r="y"><w:body>${bodyXml}</w:body></w:document>`,
    ...extra,
  })
}

test('zip 解包能读出条目', async () => {
  const files = await unzip(makeZip({ 'a.txt': '你好', 'b/c.txt': 'world' }))
  assert.equal(new TextDecoder().decode(files.get('a.txt')), '你好')
  assert.equal(new TextDecoder().decode(files.get('b/c.txt')), 'world')
})

test('Word：标题、正文、加粗、斜体、删除线', async () => {
  const xml =
    p(`<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('文章标题')}`) +
    p(`<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${run('第一节')}`) +
    p(run('普通一段。')) +
    p(run('重点', '<w:b/>') + run('、') + run('强调', '<w:i/>') + run('、') + run('划掉', '<w:strike/>'))
  const { markdown } = await docxToMarkdown(buildDocx(xml))
  assert.match(markdown, /^# 文章标题$/m)
  assert.match(markdown, /^## 第一节$/m)
  assert.match(markdown, /^普通一段。$/m)
  assert.match(markdown, /\*\*重点\*\*、\*强调\*、~~划掉~~/)
})

test('Word：相邻的同格式片段会合并', async () => {
  // Word 常把一句话切成多个 run，逐个加标记会出现 **一****(6)**
  const xml = p(run('一', '<w:b/>') + run('(6)', '<w:b/>') + run(' 班课程表'))
  const { markdown } = await docxToMarkdown(buildDocx(xml))
  assert.match(markdown, /\*\*一\(6\)\*\* 班课程表/)
  assert.doesNotMatch(markdown, /\*\*\*\*/)
})

test('Word：有序与无序列表', async () => {
  const numbering =
    `<?xml version="1.0"?><w:numbering xmlns:w="x">` +
    `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
    `<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`
  const item = (text, numId, ilvl = 0) =>
    p(`<w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${run(text)}`)
  const xml = item('无序一', 1) + item('子项', 1, 1) + item('有序一', 2)
  const { markdown } = await docxToMarkdown(buildDocx(xml, { 'word/numbering.xml': numbering }))
  assert.match(markdown, /^- 无序一$/m)
  assert.match(markdown, /^ {2}- 子项$/m)
  assert.match(markdown, /^1\. 有序一$/m)
})

test('Word：超链接取 rels 里的真实地址', async () => {
  const rels =
    `<?xml version="1.0"?><Relationships>` +
    `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://vitejs.dev"/>` +
    `</Relationships>`
  const xml = p(`前面<w:hyperlink r:id="rId5">${run('Vite 官网')}</w:hyperlink>后面`)
  const { markdown } = await docxToMarkdown(buildDocx(xml, { 'word/_rels/document.xml.rels': rels }))
  assert.match(markdown, /\[Vite 官网\]\(https:\/\/vitejs\.dev\)/)
})

test('Word：表格转成 Markdown 表格', async () => {
  const cell = (t) => `<w:tc>${p(run(t))}</w:tc>`
  const xml =
    `<w:tbl><w:tr>${cell('列A')}${cell('列B')}</w:tr><w:tr>${cell('1')}${cell('2')}</w:tr></w:tbl>`
  const { markdown } = await docxToMarkdown(buildDocx(xml))
  assert.match(markdown, /\| 列A \| 列B \|/)
  assert.match(markdown, /\| --- \| --- \|/)
  assert.match(markdown, /\| 1 \| 2 \|/)
})

test('Word：图片会被跳过并给出提示', async () => {
  const xml = p(`<w:r><w:drawing/></w:r>`) + p(run('正文'))
  const { markdown, warnings } = await docxToMarkdown(buildDocx(xml))
  assert.match(markdown, /正文/)
  assert.ok(warnings.some((w) => w.includes('图片')))
})

test('Word：标题里不残留行内标记', async () => {
  const xml = p(`<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${run('加粗的标题', '<w:b/>')}`)
  const { markdown } = await docxToMarkdown(buildDocx(xml))
  assert.match(markdown, /^## 加粗的标题$/m)
})

test('Word：空文件给出明确错误', async () => {
  await assert.rejects(() => docxToMarkdown(buildDocx('')), /没有可导入的文字/)
  await assert.rejects(() => docxToMarkdown(makeZip({ 'a.txt': 'x' })), /没找到正文/)
})

/* ---------------- 只改样式（restyle） ---------------- */

import { restyleElement, render } from '../dist/core/index.mjs'

/** 这些测试要 DOM。Node 里没有，所以只在浏览器里跑；这里做个最小桩来覆盖纯逻辑之外的部分 */
test('restyle 的守卫不能依赖 isConnected', async () => {
  // 用正则直接检查源码意图：root 是游离节点，isConnected 恒为 false，
  // 用它做守卫会让整个元素循环被静默跳过
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/core/restyle.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /if \(!el\.isConnected\) continue/)
  assert.match(src, /root\.contains\(el\)/)
})

test('字体必须落在文字元素上，不能只挂在容器', () => {
  const html = render('# 标题\n\n正文一段\n\n- 列表项', { fontFamily: 'Kaiti SC, serif' }).html
  const hits = (html.match(/font-family:Kaiti SC/g) || []).length
  // 容器 + 段落 + 列表项，至少三处；只挂容器的话编辑器一覆盖就失效
  assert.ok(hits >= 3, `字体只出现了 ${hits} 次`)
})

test('空白装饰块的删除规则', async () => {
  const { shouldDropWhenBlank } = await import('../dist/core/index.mjs')
  // 秀米/壹伴留下的空装饰容器，套上样式就会显形，该删
  for (const tag of ['section', 'div', 'blockquote', 'ul', 'ol', 'li', 'SECTION']) {
    assert.equal(shouldDropWhenBlank(tag, false), true, tag)
  }
  // 空段落要留：很多人用空行调间距，而段落不带边框，空着也不会变成框
  assert.equal(shouldDropWhenBlank('p', false), false)
  // 表格结构要留：空单元格是正常的
  assert.equal(shouldDropWhenBlank('td', false), false)
  assert.equal(shouldDropWhenBlank('tr', false), false)
  assert.equal(shouldDropWhenBlank('section', true), false, '表格内部一律不动')
  // 但这几个藏在表格里、空着却会显形：
  // 空 <caption> 在表格正上方渲染成一条空白带，正是线上遇到的那条
  for (const tag of ['caption', 'thead', 'tfoot', 'CAPTION']) {
    assert.equal(shouldDropWhenBlank(tag, true), true, tag)
  }
  // 内容型标签不在删除名单里
  assert.equal(shouldDropWhenBlank('img', false), false)
  assert.equal(shouldDropWhenBlank('hr', false), false)
})

test('表格只输出 prosemirror-tables 认的结构', async () => {
  const { render } = await import('../dist/core/index.mjs')
  const html = render('| 谁借的 | 叫什么 |\n|---|---|\n| 国家 | 国债 |').html
  // 公众号后台用的是 prosemirror-tables，schema 只认 table > tbody > tr > th|td。
  // 多给 caption / colgroup / thead 会被揉乱：表格被套进别的表格的单元格、
  // 正文跑进 tfoot 都见过。caption 尤其不能给——它的 style 会被剥掉，
  // 一个空 caption 就是表格正上方那条虚线空带。
  assert.doesNotMatch(html, /<caption/)
  assert.doesNotMatch(html, /<colgroup/)
  assert.doesNotMatch(html, /<thead/)
  assert.doesNotMatch(html, /<tfoot/)
  assert.match(html, /<table[^>]*><tbody><tr>/)
  // 表头仍然是 th，只是挪进了 tbody 的第一行
  assert.match(html, /<tbody><tr><th[^>]*><span[^>]*>谁借的<\/span><\/th>/)
  assert.match(html, /<td[^>]*><span[^>]*>国家<\/span><\/td>/)
})
