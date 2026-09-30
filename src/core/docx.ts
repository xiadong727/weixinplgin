import { child, findAll, parseXml, type XmlNode } from './xml'
import { textOf, unzip } from './zip'

/**
 * Word（.docx）→ Markdown。
 *
 * docx 是个 zip，正文在 word/document.xml。这里只认最常用的那些结构：
 * 标题、加粗斜体删除线、有序无序列表、引用、超链接、表格、分隔线。
 * 图片是二进制，公众号也抓不到本地图，所以只留一句提示。
 */

export interface DocxResult {
  markdown: string
  warnings: string[]
}

const HEADING_STYLE = /^(?:heading|标题)\s*([1-6])$/i

export async function docxToMarkdown(buf: ArrayBuffer): Promise<DocxResult> {
  const files = await unzip(buf)
  const docXml = textOf(files.get('word/document.xml'))
  if (!docXml) throw new Error('这个 Word 文件里没找到正文（word/document.xml）')

  const warnings: string[] = []
  const links = parseRels(textOf(files.get('word/_rels/document.xml.rels')))
  const numbering = parseNumbering(textOf(files.get('word/numbering.xml')))

  const root = parseXml(docXml)
  const body = findAll(root, 'w:body')[0]
  if (!body) throw new Error('这个 Word 文件的结构不认识')

  const lines: string[] = []
  let images = 0

  const pushBlank = () => {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('')
  }

  for (const node of body.children) {
    if (node.tag === 'w:p') {
      const block = convertParagraph(node, links, numbering)
      images += block.images
      if (!block.text) {
        pushBlank()
        continue
      }
      // 列表项之间不空行，否则会被渲染成一段一段的松散列表
      if (!block.isListItem) pushBlank()
      lines.push(block.text)
      if (!block.isListItem) pushBlank()
    } else if (node.tag === 'w:tbl') {
      pushBlank()
      lines.push(...convertTable(node, links))
      pushBlank()
    }
  }

  if (images) {
    warnings.push(
      `文档里有 ${images} 张图片，Word 里的图片是嵌在文件内部的，公众号读不到，` +
        '已跳过。需要的话请把图片单独导出、传到图床后再插回来',
    )
  }

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!markdown) throw new Error('这个 Word 文件里没有可导入的文字')
  return { markdown: markdown + '\n', warnings }
}

/* ------------------------------------------------------------------ */

interface Block {
  text: string
  isListItem: boolean
  images: number
}

function convertParagraph(p: XmlNode, links: Map<string, string>, numbering: Map<string, 'ordered' | 'bullet'>): Block {
  const pPr = child(p, 'w:pPr')
  const style = child(pPr, 'w:pStyle')?.attrs['w:val'] ?? ''
  const numPr = child(pPr, 'w:numPr')

  let images = 0
  const inline = renderRuns(p, links, () => images++)
  const text = inline.trim()
  if (!text) return { text: '', isListItem: false, images }

  // 标题
  const heading = HEADING_STYLE.exec(style) ?? (/^title$/i.test(style) ? ['', '1'] : null)
  if (heading) return { text: `${'#'.repeat(Number(heading[1]))} ${stripMarks(text)}`, isListItem: false, images }

  // 引用
  if (/quote/i.test(style)) return { text: `> ${text}`, isListItem: false, images }

  // 列表
  if (numPr) {
    const level = Number(child(numPr, 'w:ilvl')?.attrs['w:val'] ?? 0)
    const numId = child(numPr, 'w:numId')?.attrs['w:val'] ?? ''
    const indent = '  '.repeat(Math.max(0, Math.min(3, level)))
    const marker = numbering.get(numId) === 'ordered' ? '1.' : '-'
    return { text: `${indent}${marker} ${text}`, isListItem: true, images }
  }

  return { text, isListItem: false, images }
}

interface Seg {
  text: string
  bold: boolean
  italic: boolean
  strike: boolean
}

/**
 * 把段落里的 run 拼成带行内标记的文本。
 *
 * Word 会把一句话切成很多个 run（改个字号就切一刀），
 * 逐个加标记会出现 `**一****(6)**` 这种，所以先收集片段、
 * 合并格式相同的相邻项，最后才套 Markdown 标记。
 */
function renderRuns(node: XmlNode, links: Map<string, string>, onImage: () => void): string {
  // 先把整段拆成有序的 token：普通片段 or 已经拼好的超链接
  type Token = { kind: 'seg'; seg: Seg } | { kind: 'raw'; text: string }
  const tokens: Token[] = []

  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.tag === 'w:hyperlink') {
        const id = c.attrs['r:id']
        const target = id ? links.get(id) : undefined
        const inner = emit(collectSegs(c, onImage))
        tokens.push({ kind: 'raw', text: target ? `[${inner.trim()}](${target})` : inner })
        continue
      }
      if (c.tag === 'w:r') {
        const seg = runToSeg(c, onImage)
        if (seg.text) tokens.push({ kind: 'seg', seg })
        continue
      }
      walk(c)
    }
  }
  walk(node)

  // 连续的片段攒成一批再 emit，这样相邻同格式的才合得起来
  let out = ''
  let batch: Seg[] = []
  const flush = () => {
    if (batch.length) out += emit(batch)
    batch = []
  }
  for (const t of tokens) {
    if (t.kind === 'seg') batch.push(t.seg)
    else {
      flush()
      out += t.text
    }
  }
  flush()
  return out
}

function collectSegs(node: XmlNode, onImage: () => void): Seg[] {
  const segs: Seg[] = []
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.tag === 'w:r') {
        const seg = runToSeg(c, onImage)
        if (seg.text) segs.push(seg)
      } else {
        walk(c)
      }
    }
  }
  walk(node)
  return segs
}

function runToSeg(run: XmlNode, onImage: () => void): Seg {
  const rPr = child(run, 'w:rPr')
  const on = (tag: string) => {
    const el = child(rPr, tag)
    return !!el && el.attrs['w:val'] !== '0' && el.attrs['w:val'] !== 'false'
  }
  let text = ''
  for (const c of run.children) {
    if (c.tag === 'w:t') text += c.text
    else if (c.tag === 'w:tab') text += ' '
    else if (c.tag === 'w:br') text += '\n'
    else if (c.tag === 'w:drawing' || c.tag === 'w:pict') onImage()
  }
  return { text, bold: on('w:b'), italic: on('w:i'), strike: on('w:strike') }
}

/** 合并相邻同格式片段后再套标记 */
function emit(segs: Seg[]): string {
  const merged: Seg[] = []
  for (const s of segs) {
    const last = merged[merged.length - 1]
    if (last && last.bold === s.bold && last.italic === s.italic && last.strike === s.strike) {
      last.text += s.text
    } else {
      merged.push({ ...s })
    }
  }

  let out = ''
  for (const seg of merged) {
    if (!seg.text.trim()) {
      out += seg.text
      continue
    }
    // Markdown 的强调记号不能贴着空格，把两边的空白挪到标记外面
    const lead = seg.text.match(/^\s*/)?.[0] ?? ''
    const tail = seg.text.match(/\s*$/)?.[0] ?? ''
    let core = seg.text.slice(lead.length, seg.text.length - tail.length)
    core = core.replace(/([*_`])/g, '\\$1')
    if (seg.strike) core = `~~${core}~~`
    if (seg.bold) core = `**${core}**`
    if (seg.italic) core = `*${core}*`
    out += lead + core + tail
  }
  return out
}

/** 标题里不留行内标记，否则会出现「# **标题**」 */
function stripMarks(s: string): string {
  return s.replace(/\*\*/g, '').replace(/(^|[^\\])[*_~]/g, '$1').trim()
}

function convertTable(tbl: XmlNode, links: Map<string, string>): string[] {
  const rows = tbl.children.filter((c) => c.tag === 'w:tr')
  if (!rows.length) return []
  const cells = rows.map((tr) =>
    tr.children
      .filter((c) => c.tag === 'w:tc')
      .map((tc) => renderRuns(tc, links, () => {}).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()),
  )
  const width = Math.max(...cells.map((r) => r.length))
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')]
  const out = [`| ${pad(cells[0]).join(' | ')} |`, `|${' --- |'.repeat(width)}`]
  for (const r of cells.slice(1)) out.push(`| ${pad(r).join(' | ')} |`)
  return out
}

/** 超链接的目标地址在 rels 里，正文只放 r:id */
function parseRels(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!xml) return out
  for (const rel of findAll(parseXml(xml), 'Relationship')) {
    const id = rel.attrs.Id
    const target = rel.attrs.Target
    if (id && target && /hyperlink/i.test(rel.attrs.Type ?? '')) out.set(id, target)
  }
  return out
}

/** numId → 有序还是无序 */
function parseNumbering(xml: string): Map<string, 'ordered' | 'bullet'> {
  const out = new Map<string, 'ordered' | 'bullet'>()
  if (!xml) return out
  const root = parseXml(xml)

  const abstractFmt = new Map<string, 'ordered' | 'bullet'>()
  for (const a of findAll(root, 'w:abstractNum')) {
    const id = a.attrs['w:abstractNumId']
    const lvl = a.children.find((c) => c.tag === 'w:lvl')
    const fmt = child(lvl, 'w:numFmt')?.attrs['w:val'] ?? ''
    if (id) abstractFmt.set(id, fmt === 'bullet' ? 'bullet' : 'ordered')
  }
  for (const n of findAll(root, 'w:num')) {
    const numId = n.attrs['w:numId']
    const absId = child(n, 'w:abstractNumId')?.attrs['w:val']
    if (numId && absId) out.set(numId, abstractFmt.get(absId) ?? 'bullet')
  }
  return out
}
