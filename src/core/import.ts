/**
 * 本地 Markdown 文件的解码与预处理。
 * 只吃 ArrayBuffer 不碰 DOM，这样 Node 里能直接测。
 */

export interface ImportResult {
  text: string
  /** 实际用到的编码，用于提示用户 */
  encoding: string
  /** front matter 里解析出的字段 */
  frontMatter: Record<string, string>
  warnings: string[]
}

const BOM_UTF8 = [0xef, 0xbb, 0xbf]
const BOM_UTF16LE = [0xff, 0xfe]
const BOM_UTF16BE = [0xfe, 0xff]

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b)
}

/**
 * 解码。中文环境里从 Windows 传过来的 .md 经常是 GBK，
 * 直接按 UTF-8 读会整篇乱码，所以先用严格模式试 UTF-8，失败再退 GB18030。
 */
function decode(buf: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buf)

  if (startsWith(bytes, BOM_UTF8)) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8 (BOM)' }
  }
  if (startsWith(bytes, BOM_UTF16LE)) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16 LE' }
  }
  if (startsWith(bytes, BOM_UTF16BE)) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16 BE' }
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' }
  } catch {
    // 不是合法 UTF-8，中文场景下基本就是 GBK/GB2312，GB18030 是它们的超集
    try {
      return { text: new TextDecoder('gb18030').decode(bytes), encoding: 'GB18030' }
    } catch {
      return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'UTF-8 (有乱码)' }
    }
  }
}

/** 解析 YAML front matter 里的简单 key: value，嵌套结构直接忽略 */
function parseFrontMatter(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (!value) continue
    // 去掉包裹的引号和 YAML 的行尾注释
    value = value.replace(/^["'](.*)["']$/, '$1').trim()
    if (value === '[]' || value.startsWith('[')) continue
    out[m[1].toLowerCase()] = value
  }
  return out
}

const RE_FRONT_MATTER = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * 解码 + 预处理：
 *   统一换行、去掉 front matter（标题回填成 H1）、检查本地图片引用
 */
export function prepareMarkdown(buf: ArrayBuffer): ImportResult {
  const warnings: string[] = []
  const { text: raw, encoding } = decode(buf)

  if (encoding.startsWith('GB')) {
    warnings.push('文件不是 UTF-8，已按 GB18030 解码；如果正文有乱码，请把原文件另存为 UTF-8')
  }
  if (encoding.includes('乱码')) {
    warnings.push('文件编码无法识别，正文可能有乱码')
  }

  let text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n')

  // front matter
  let frontMatter: Record<string, string> = {}
  const fm = RE_FRONT_MATTER.exec(text)
  if (fm) {
    frontMatter = parseFrontMatter(fm[1])
    text = text.slice(fm[0].length).replace(/^\n+/, '')
    const title = frontMatter.title
    if (title && !/^#\s/m.test(text)) {
      text = `# ${title}\n\n${text}`
      warnings.push(`已去掉文件头部的 front matter，并把 title「${title}」变成大标题`)
    } else {
      warnings.push('已去掉文件头部的 front matter')
    }
  }

  // 本地图片引用：公众号抓不到，必须先上图床
  const localImages = new Set<string>()
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    const src = m[1]
    if (!/^(https?:|data:)/i.test(src)) localImages.add(src)
  }
  for (const m of text.matchAll(/!\[\[([^\]]+)\]\]/g)) localImages.add(m[1])

  if (localImages.size) {
    const sample = [...localImages].slice(0, 3).join('、')
    warnings.push(
      `有 ${localImages.size} 处引用的是本地图片（${sample}${localImages.size > 3 ? ' 等' : ''}），` +
        '公众号抓不到本地文件，需要先把图片传到图床再把链接换成 http(s) 地址',
    )
  }

  return { text: text.trim() + '\n', encoding, frontMatter, warnings }
}

/** 纯文本类，直接按文字读 */
export const TEXT_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.txt']
/** 需要先解析成 Markdown 的 */
export const RICH_EXTENSIONS = ['.docx', '.pdf']

export const IMPORT_EXTENSIONS = [...TEXT_EXTENSIONS, ...RICH_EXTENSIONS]
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(',')

/** Word 和 PDF 本来就比纯文本大，上限放宽一些 */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_RICH_BYTES = 30 * 1024 * 1024

export type ImportKind = 'text' | 'docx' | 'pdf'

export function kindOf(name: string): ImportKind | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'text'
  return null
}

export function checkImportFile(name: string, size: number): string | null {
  const kind = kindOf(name)
  if (!kind) {
    const lower = name.toLowerCase()
    if (lower.endsWith('.doc')) {
      return '旧版 .doc 不支持，请用 Word 另存为 .docx 再导入'
    }
    return `支持 ${IMPORT_EXTENSIONS.join(' / ')}，「${name}」不在其中`
  }
  const max = kind === 'text' ? MAX_IMPORT_BYTES : MAX_RICH_BYTES
  if (size > max) {
    return `文件太大了（${(size / 1024 / 1024).toFixed(1)} MB，上限 ${max / 1024 / 1024} MB）`
  }
  return null
}
