/**
 * PDF 取文字。
 *
 * 刻意不引 pdf.js（1MB+，还要 worker）。这里只做一件事：
 * 把页面内容流里的文字按位置还原成行和段。
 *
 * 能做到的：
 *   · FlateDecode 内容流
 *   · 通过 ToUnicode CMap 还原中文（Type0/CID 和 Type3 都靠它）
 *   · 按 Y 坐标断行、按行距判断分段、按字号猜标题
 * 做不到的：
 *   · 扫描件（里面根本没有文字，只有图）
 *   · 没有 ToUnicode 的字体（拿不到编码表）
 *   · 表格、多栏排版的还原（PDF 里没有这些语义）
 */

export interface PdfResult {
  markdown: string
  warnings: string[]
}

interface TextPiece {
  text: string
  x: number
  y: number
  size: number
  page: number
}

export async function pdfToMarkdown(buf: ArrayBuffer): Promise<PdfResult> {
  const bytes = new Uint8Array(buf)
  if (latin(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('这不是一个 PDF 文件')

  const objects = scanObjects(bytes)
  const warnings: string[] = []
  const pieces: TextPiece[] = []
  const fontCache = new Map<number, Map<number, string> | null>()

  const pages = [...objects.entries()].filter(([, o]) => /\/Type\s*\/Page[^s]/.test(o.head))
  if (!pages.length) throw new Error('没在这个 PDF 里找到页面')

  let pageNo = 0
  let missingToUnicode = 0

  for (const [, page] of pages) {
    pageNo++
    const fonts = await resolveFonts(bytes, page.head, objects, fontCache, () => missingToUnicode++)
    for (const ref of contentRefs(page.head)) {
      const obj = objects.get(ref)
      if (!obj) continue
      const data = await streamData(bytes, obj)
      if (!data) continue
      extractText(latin(data), fonts, pageNo, pieces)
    }
  }

  if (!pieces.length) {
    throw new Error('这个 PDF 里没有可提取的文字，可能是扫描件（整页都是图片）')
  }
  if (missingToUnicode) {
    warnings.push(`有 ${missingToUnicode} 个字体没带编码表（ToUnicode），这部分文字可能是乱码或缺失`)
  }

  const markdown = layout(pieces)
  warnings.push('PDF 里没有标题、列表这些结构信息，标题是按字号猜的，导入后请检查一下')
  return { markdown, warnings }
}

/* ---------------- 对象扫描 ---------------- */

interface PdfObject { head: string; streamStart: number; streamEnd: number }

/**
 * 直接全文扫 `N G obj … endobj`，不解析 xref 表。
 * xref 有传统表和流两种形式，还有增量更新，全支持不划算；
 * 全扫一遍对几 MB 的文件也就几十毫秒。
 */
function scanObjects(bytes: Uint8Array): Map<number, PdfObject> {
  const text = latin(bytes)
  const out = new Map<number, PdfObject>()
  const re = /(\d+)\s+(\d+)\s+obj\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const num = Number(m[1])
    const bodyStart = m.index + m[0].length
    const endIdx = text.indexOf('endobj', bodyStart)
    const streamIdx = text.indexOf('stream', bodyStart)
    const hasStream = streamIdx !== -1 && (endIdx === -1 || streamIdx < endIdx)

    let head: string
    let streamStart = -1
    let streamEnd = -1
    if (hasStream) {
      head = text.slice(bodyStart, streamIdx)
      let s = streamIdx + 6
      if (text[s] === '\r') s++
      if (text[s] === '\n') s++
      streamStart = s
      const e = text.indexOf('endstream', s)
      streamEnd = e === -1 ? bytes.length : e
    } else {
      head = text.slice(bodyStart, endIdx === -1 ? bodyStart + 4000 : endIdx)
    }
    out.set(num, { head, streamStart, streamEnd })
  }
  return out
}

async function streamData(bytes: Uint8Array, obj: PdfObject): Promise<Uint8Array | null> {
  if (obj.streamStart < 0) return null
  let raw = bytes.subarray(obj.streamStart, obj.streamEnd)
  // 末尾可能带换行
  while (raw.length && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) {
    raw = raw.subarray(0, raw.length - 1)
  }
  if (!/\/Filter/.test(obj.head)) return raw
  if (!/FlateDecode/.test(obj.head)) return null // 其它滤镜（LZW/JBIG2 等）不管
  try {
    const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

function contentRefs(pageHead: string): number[] {
  const m = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(pageHead)
  if (!m) return []
  return [...m[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((x) => Number(x[1]))
}

/* ---------------- 字体与 ToUnicode ---------------- */

type FontInfo = { map: Map<number, string> | null; twoByte: boolean }

async function resolveFonts(
  bytes: Uint8Array,
  pageHead: string,
  objects: Map<number, PdfObject>,
  cache: Map<number, Map<number, string> | null>,
  onMissing: () => void,
): Promise<Map<string, FontInfo>> {
  const fonts = new Map<string, FontInfo>()

  // /Font 可能直接内联，也可能是个引用
  let fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(pageHead)?.[1]
  if (!fontDict) {
    const ref = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(pageHead)?.[1]
    const res = ref ? objects.get(Number(ref)) : undefined
    fontDict = res ? /\/Font\s*<<([\s\S]*?)>>/.exec(res.head)?.[1] : undefined
  }
  if (!fontDict) return fonts

  for (const m of fontDict.matchAll(/\/([^\s/]+)\s+(\d+)\s+\d+\s+R/g)) {
    const name = m[1]
    const objNum = Number(m[2])
    const fontObj = objects.get(objNum)
    if (!fontObj) continue
    const twoByte = /Identity-[HV]|\/Type0/.test(fontObj.head)

    if (cache.has(objNum)) {
      fonts.set(name, { map: cache.get(objNum) ?? null, twoByte })
      continue
    }
    const tuRef = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(fontObj.head)?.[1]
    const tuObj = tuRef ? objects.get(Number(tuRef)) : undefined
    let map: Map<number, string> | null = null
    if (tuObj) {
      const data = await streamData(bytes, tuObj)
      if (data) map = parseToUnicode(latin(data))
    }
    if (!map || map.size === 0) onMissing()
    cache.set(objNum, map)
    fonts.set(name, { map, twoByte })
  }
  return fonts
}

export function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(p[1], 16), hexToText(p[2]))
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/g)) {
      const lo = parseInt(p[1], 16)
      const hi = parseInt(p[2], 16)
      if (p[4]) {
        const base = p[4]
        for (let c = lo; c <= hi && c - lo < 65536; c++) {
          const shifted = (parseInt(base, 16) + (c - lo)).toString(16).padStart(base.length, '0')
          map.set(c, hexToText(shifted))
        }
      } else if (p[5]) {
        const items = [...p[5].matchAll(/<([0-9a-fA-F]+)>/g)]
        items.forEach((it, i) => map.set(lo + i, hexToText(it[1])))
      }
    }
  }
  return map
}

function hexToText(hex: string): string {
  let s = ''
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const code = parseInt(hex.slice(i, i + 4), 16)
    if (!Number.isNaN(code)) s += String.fromCharCode(code)
  }
  return s
}

/* ---------------- 内容流里的文字 ---------------- */

const STRING_OR_OP = /\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|\[[^\]]*\]|\/[^\s/[\]<>()]+|-?[\d.]+|[A-Za-z'"*]+/g

type Matrix = [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

function extractText(content: string, fonts: Map<string, FontInfo>, page: number, out: TextPiece[]) {
  let font: FontInfo | undefined
  let size = 12
  let tmScale = 1
  let x = 0
  let y = 0
  let leading = 0
  // 图形矩阵：内容常被画在各自平移过的坐标系里，
  // 不跟着算的话不同块的 Y 值没有可比性，排出来的顺序就是乱的
  let ctm: Matrix = [...IDENTITY]
  const ctmStack: Matrix[] = []
  const stack: string[] = []

  /** 文本坐标 → 页面坐标 */
  const toPage = (tx: number, ty: number): { x: number; y: number } => ({
    x: ctm[0] * tx + ctm[2] * ty + ctm[4],
    y: ctm[1] * tx + ctm[3] * ty + ctm[5],
  })
  const pageScale = () => Math.hypot(ctm[1], ctm[3]) || 1

  const tokens = content.match(STRING_OR_OP) ?? []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (/^[A-Za-z'"*]+$/.test(t)) {
      const args = stack.splice(0, stack.length)
      switch (t) {
        case 'q':
          ctmStack.push([...ctm] as Matrix)
          break
        case 'Q':
          ctm = ctmStack.pop() ?? [...IDENTITY]
          break
        case 'cm': {
          const n = args.slice(-6).map(Number)
          if (n.length === 6 && n.every((v) => Number.isFinite(v))) {
            ctm = multiply(n as Matrix, ctm)
          }
          break
        }
        case 'Tf': {
          const name = args[args.length - 2]?.replace(/^\//, '')
          size = Number(args[args.length - 1]) || size
          font = name ? fonts.get(name) : font
          break
        }
        case 'TL':
          leading = Number(args[args.length - 1]) || leading
          break
        case 'Td':
        case 'TD': {
          x += Number(args[args.length - 2]) || 0
          y += Number(args[args.length - 1]) || 0
          if (t === 'TD') leading = -(Number(args[args.length - 1]) || 0)
          break
        }
        case 'Tm': {
          const n = args.slice(-6).map(Number)
          if (n.length === 6 && n.every((v) => Number.isFinite(v))) {
            x = n[4]
            y = n[5]
            // 文本矩阵的缩放要单独记，和 Tf 的字号相乘才是屏幕上的大小；
            // 直接乘进 size 会在下一个 Tm 时再乘一次，越滚越大
            tmScale = Math.hypot(n[0], n[1]) || 1
          }
          break
        }
        case 'T*':
          y -= leading
          break
        case 'Tj':
        case "'":
        case '"': {
          if (t !== 'Tj') y -= leading
          const s = decodeString(args[args.length - 1] ?? '', font)
          if (s) {
            const pos = toPage(x, y)
            out.push({ text: s, x: pos.x, y: pos.y, size: size * tmScale * pageScale(), page })
          }
          break
        }
        case 'TJ': {
          const arr = args[args.length - 1] ?? ''
          let s = ''
          for (const piece of arr.matchAll(/\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|-?[\d.]+/g)) {
            const p = piece[0]
            if (p.startsWith('(') || p.startsWith('<')) s += decodeString(p, font)
            else if (Number(p) < -150) s += ' ' // 负向位移较大时是词间距
          }
          if (s) {
            const pos = toPage(x, y)
            out.push({ text: s, x: pos.x, y: pos.y, size: size * tmScale * pageScale(), page })
          }
          break
        }
        default:
          break
      }
      continue
    }
    stack.push(t)
  }
}

function decodeString(token: string, font?: FontInfo): string {
  let codes: number[] = []
  if (token.startsWith('<')) {
    const hex = token.slice(1, -1).replace(/\s+/g, '')
    const step = font?.twoByte === false ? 2 : 4
    for (let i = 0; i < hex.length; i += step) codes.push(parseInt(hex.slice(i, i + step), 16))
  } else if (token.startsWith('(')) {
    const raw = unescapePdfString(token.slice(1, -1))
    if (font?.twoByte) {
      for (let i = 0; i + 1 < raw.length; i += 2) codes.push((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1))
    } else {
      codes = [...raw].map((c) => c.charCodeAt(0))
    }
  } else {
    return ''
  }

  let s = ''
  for (const code of codes) {
    if (Number.isNaN(code)) continue
    const mapped = font?.map?.get(code)
    if (mapped !== undefined) s += mapped
    // 双字节字体没有编码表时，按单字节猜只会吐出乱码，不如留空
    else if (!font?.map && !font?.twoByte && code >= 32 && code < 0xfffd) s += String.fromCharCode(code)
  }
  return s
}

function unescapePdfString(s: string): string {
  return s.replace(/\\(n|r|t|b|f|\(|\)|\\|[0-7]{1,3})/g, (_, g) => {
    switch (g) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      case 'b': return '\b'
      case 'f': return '\f'
      case '(': return '('
      case ')': return ')'
      case '\\': return '\\'
      default: return String.fromCharCode(parseInt(g, 8))
    }
  })
}

/* ---------------- 按位置还原行与段 ---------------- */

function layout(pieces: TextPiece[]): string {
  // 同一行的碎片按 x 排好，再按 y 从上往下
  const lines: { y: number; size: number; page: number; text: string }[] = []
  const sorted = [...pieces].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)

  for (const p of sorted) {
    const last = lines[lines.length - 1]
    if (last && last.page === p.page && Math.abs(last.y - p.y) < Math.max(2, p.size * 0.4)) {
      last.text += p.text
      last.size = Math.max(last.size, p.size)
    } else {
      lines.push({ y: p.y, size: p.size, page: p.page, text: p.text })
    }
  }

  const clean = lines
    .map((l) => ({ ...l, text: normalizeCjk(l.text).replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text)
  if (!clean.length) return ''

  // 正文字号取中位数，明显更大的当标题
  const sizes = clean.map((l) => l.size).sort((a, b) => a - b)
  const body = sizes[Math.floor(sizes.length / 2)] || 12
  const gaps = clean.slice(1).map((l, i) => (l.page === clean[i].page ? clean[i].y - l.y : 0)).filter((g) => g > 0).sort((a, b) => a - b)
  const normalGap = gaps[Math.floor(gaps.length / 2)] || body * 1.5

  const out: string[] = []
  clean.forEach((l, i) => {
    const prev = clean[i - 1]
    const newParagraph =
      !prev || prev.page !== l.page || prev.y - l.y > normalGap * 1.6
    const ratio = l.size / body

    // 标题除了字号大，还得短。只看字号会把正文里字号略大的段落整段判成标题
    const short = l.text.length <= 40
    if (ratio >= 1.45 && short) out.push('', `# ${l.text}`, '')
    else if (ratio >= 1.25 && short) out.push('', `## ${l.text}`, '')
    else if (ratio >= 1.12 && l.text.length <= 30) out.push('', `### ${l.text}`, '')
    else if (newParagraph) out.push('', l.text)
    else out[out.length - 1] = `${out[out.length - 1] ?? ''}${l.text}`
  })

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * 把康熙部首（⼀⽂⾮，U+2F00 区）和 CJK 部首补充区归一成正常汉字。
 * 网页打印成 PDF 时非常常见，不归一的话满屏都是长得像但编码不同的字。
 *
 * 只对这两段做，不能整串 NFKC：那会把中文全角标点也转成半角，
 * 「，」变「,」、「（）」变「()」，中文正文就毁了。
 */
/** CJK 部首补充区（U+2E80–2EFF）没有 NFKC 映射，常见的简体部首手工补一张表 */
const RADICALS: Record<string, string> = {
  '⺁': '厂', '⺄': '乙', '⺈': '勹', '⺊': '卜', '⺌': '尚', '⺍': '尚',
  '⻅': '见', '⻆': '角', '⻋': '车', '⻉': '贝', '⻍': '辶', '⻐': '钅',
  '⻒': '长', '⻓': '长', '⻔': '门', '⻖': '阝', '⻘': '青', '⻛': '风',
  '⻜': '飞', '⻝': '食', '⻟': '食', '⻡': '首', '⻢': '马', '⻣': '骨',
  '⻤': '鬼', '⻥': '鱼', '⻦': '鸟', '⻧': '卤', '⻩': '黄', '⻬': '齐',
  '⻮': '齿', '⻰': '龙', '⻳': '龟', '⺮': '竹', '⺼': '月', '⻎': '辶',
}

function normalizeCjk(s: string): string {
  return s.replace(/[\u2E80-\u2EFF\u2F00-\u2FDF]/g, (ch) => {
    const manual = RADICALS[ch]
    if (manual) return manual
    const n = ch.normalize('NFKC')
    return n.length === 1 ? n : ch
  })
}

function latin(bytes: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return s
}
