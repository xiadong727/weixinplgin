import { attr, mergeDecls, serialize } from './css'
import { getCodeTheme, highlightToInline } from './highlight'
import { resolveStyles } from './styles'
import { expandDecor } from './themes'
import type { Decls, RenderOptions, Styles } from './types'

/**
 * 给「正文里已有的内容」换一套样式。
 *
 * 和 render() 的区别：内容来源是编辑器里现有的 DOM，不是面板里的 Markdown。
 * 这样用户可以直接在公众号后台改字，右边只负责调样式，两边不会互相覆盖。
 *
 * 三条刻意的取舍（都是为了「反复换主题不会越换越脏」）：
 *  1. 标题内部按纯文字重建 —— 否则上一套主题留下的序号、◆ 这类装饰会层层累加
 *  2. 不做分隔线纹样、引用大引号、首字放大 —— 这几样都会在重复应用时叠加
 *  3. 代码块按纯文字重新高亮 —— 既能跟着换配色，也避免旧的高亮 span 堆积
 */

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
type HeadingTag = (typeof HEADINGS)[number]

/** 各主题标题装饰里用到的符号，重建前要从首尾剥掉，否则反复换主题会一层层叠上去 */
const DECOR_GLYPHS = '◆❖✦✿●■▸▍✎❋§›—–#/【】「」✒❤✺◇·'

/**
 * 取出标题「真正的文字」。
 *
 * 上一套主题留下的序号和符号都混在 textContent 里，
 * 不剥掉就会 01 → 0101 → 010101 这样越滚越长。
 *
 * 两个要点：
 *  · 符号和数字要交替反复剥。「◆01第一节◆」里数字被符号挡在后面，
 *    只剥一轮的话数字会留下来，下次再补一个就成了 0101。
 *  · 数字只剥「这个标题本来会拿到的那个序号」（第 1 个 h2 只剥 01 或 1）。
 *    无差别剥数字会吃掉「2026 年回顾」这种真实标题。
 */
function cleanHeadingText(raw: string, index: number): string {
  const glyphHead = new RegExp(`^[${DECOR_GLYPHS}\\s]+`)
  const glyphTail = new RegExp(`[${DECOR_GLYPHS}\\s]+$`)
  const pad = String(index).padStart(2, '0')
  // 只收拾「一串重复的补零序号」和「单独一个序号」这两种明显是我们加的形态：
  //   02022026 年回顾 → 2026 年回顾      （02 重复了两次，肯定是叠出来的）
  //   2026 年回顾     → 2026 年回顾      （原样保留，这是真标题）
  // 靠「序号后面不能跟数字」之类的边界判断是走不通的：
  // 真标题本身以数字开头时，两种规则怎么调都会顾此失彼。
  const numRuns = new RegExp(`^(?:${pad})+\\s*[.、．]?\\s*`)
  const numOnce = new RegExp(`^(?:${pad}|${index})(?!\\d)\\s*[.、．]?\\s*`)

  let t = raw.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 4; i++) {
    const before = t
    t = t.replace(glyphHead, '').replace(glyphTail, '').replace(numRuns, '').replace(numOnce, '').trim()
    if (t === before) break
  }
  return t || raw.trim()
}

/** 我们自己加的装饰都打这个标记，重建前按标记精确删掉，不用靠猜 */
const DECOR_ATTR = 'data-wxt-d'

function markDecor(html: string): string {
  return html ? `<span ${DECOR_ATTR}="1">${html}</span>` : ''
}

/**
 * 旧版本曾把一整段内容包进保护 span；span 内再有 strong/em 时，旧版微信
 * 会把父子矩形重复计数。先拆掉这种“保护层套行内元素”的结构，只保留叶子 span。
 */
function unwrapLegacyLineHeightGuards(root: HTMLElement): number {
  let changed = 0
  const spans = Array.from(root.querySelectorAll<HTMLSpanElement>('span')).reverse()
  for (const span of spans) {
    if (span.style.fontSize !== 'inherit' || span.style.lineHeight !== 'inherit' || !span.children.length) continue
    const color = span.style.color
    const nodes = Array.from(span.childNodes)
    if (color) {
      for (const node of nodes) {
        if (node.nodeType === 3 && (node.textContent ?? '').length) {
          const leaf = span.ownerDocument.createElement('span')
          leaf.setAttribute('style', `color:${color};font-size:inherit;line-height:inherit`)
          span.replaceChild(leaf, node)
          leaf.appendChild(node)
        } else if (node.nodeType === 1) {
          const child = node as HTMLElement
          if (!child.style.color) child.style.color = color
        }
      }
    }
    span.replaceWith(...Array.from(span.childNodes))
    changed++
  }
  return changed
}

/**
 * 微信会用 Range.getClientRects() 的矩形数估算视觉行数；块元素夹有 strong 等
 * 行内节点时，同一行会产生多个矩形并被误判为叠字。只把块元素的直接文本片段
 * 分别放进叶子 span，不能再用一个 span 包住整段内容。
 */
function guardLineHeightText(root: HTMLElement): number {
  const selector = 'p,div,section,h1,h2,h3,h4,h5,h6,li,td,th,a'
  const inheritedColor = (start: HTMLElement): string => {
    let current: HTMLElement | null = start
    while (current) {
      if (current.style.color) return current.style.color
      if (current === root) break
      current = current.parentElement
    }
    return '#3c3c3c'
  }
  let changed = 0
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType !== 3 || !(node.textContent ?? '').trim()) continue
      const span = el.ownerDocument.createElement('span')
      span.setAttribute('style', `color:${inheritedColor(el)};font-size:inherit;line-height:inherit`)
      el.replaceChild(span, node)
      span.appendChild(node)
      changed++
    }
  }
  return changed
}

export interface RestyleResult {
  changed: number
  warnings: string[]
}

/**
 * 把表格拍平成 table > tbody > tr > th|td 这一种结构。
 *
 * 公众号后台用的是 prosemirror-tables，它的表格 schema 只认这几层。
 * 多出来的 caption / colgroup / thead / tfoot 它消化不了，会把结构揉乱——
 * 见过表格被套进别的表格的单元格里、正文内容跑进 <tfoot> 的情况。
 *
 * caption 尤其要清掉：它身上的 style 会被剥掉，
 * 一个空 caption 就是表格正上方那条虚线空带。
 * 有文字的 caption 转成表格前面的一个段落，内容不丢。
 */
function flattenTables(root: HTMLElement, captionStyle: Decls | undefined): number {
  let changed = 0
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const doc = table.ownerDocument

    for (const caption of Array.from(table.querySelectorAll(':scope > caption'))) {
      const text = (caption.textContent ?? '').trim()
      if (text) {
        // 有文字的说明是真标题，挪到表格前面当一段，别丢
        const p = doc.createElement('p')
        p.setAttribute('style', serialize(captionStyle))
        p.textContent = text
        table.parentNode?.insertBefore(p, table)
      }
      caption.remove()
      changed++
    }

    for (const col of Array.from(table.querySelectorAll(':scope > colgroup'))) {
      col.remove()
      changed++
    }

    // thead / tfoot 里的行并进 tbody，顺序保持不变
    let tbody = table.querySelector(':scope > tbody')
    if (!tbody) {
      tbody = doc.createElement('tbody')
      table.appendChild(tbody)
    }
    // 空行不并进来：空 thead / tfoot 会变成表格里一条空带
    const keepRow = (tr: Element) => (tr.textContent ?? '').trim().length > 0
    for (const group of Array.from(table.querySelectorAll(':scope > thead'))) {
      for (const tr of Array.from(group.children).reverse()) {
        if (keepRow(tr)) tbody.insertBefore(tr, tbody.firstChild)
      }
      group.remove()
      changed++
    }
    for (const group of Array.from(table.querySelectorAll(':scope > tfoot'))) {
      for (const tr of Array.from(group.children)) {
        if (keepRow(tr)) tbody.appendChild(tr)
      }
      group.remove()
      changed++
    }
    // 散落在 table 下的 tr 也收进 tbody
    for (const tr of Array.from(table.querySelectorAll(':scope > tr'))) tbody.appendChild(tr)
  }
  return changed
}

/** 就地给一棵 DOM 子树换样式 */
export function restyleElement(root: HTMLElement, userOptions: Partial<RenderOptions> = {}): RestyleResult {
  const { options, theme, primary, styles, warnings } = resolveStyles(userOptions)
  const codeTheme = getCodeTheme(options.codeTheme)
  let changed = 0

  const setStyle = (el: Element, decls: Decls | undefined, extra?: Decls) => {
    const css = serialize(mergeDecls(decls, extra))
    if (!css) return
    el.setAttribute('style', css)
    changed++
  }

  /* ---------- 先清掉空白装饰块和旧版整段保护层 ---------- */
  const blanks = removeBlankBlocks(root)
  changed += unwrapLegacyLineHeightGuards(root)

  /* ---------- 代码块：按纯文字重新高亮 ---------- */
  for (const pre of Array.from(root.querySelectorAll('pre'))) {
    const text = pre.textContent ?? ''
    const { html, language } = highlightToInline(text, undefined, codeTheme)
    const code = pre.ownerDocument.createElement('code')
    code.setAttribute('style', serialize(styles.code))
    code.innerHTML = html
    pre.innerHTML = ''
    pre.appendChild(code)
    setStyle(pre, styles.pre)

    // 外面那层容器（背景、圆角）顺带处理一下
    const wrap = pre.parentElement
    if (wrap && wrap !== root && wrap.children.length <= 2 && /section|div/i.test(wrap.tagName)) {
      setStyle(wrap, styles.codeBlock)
      const bar = wrap.firstElementChild
      if (bar && bar !== pre) {
        setStyle(bar, styles.codeLang)
        bar.textContent = language
      }
    }
  }

  /* ---------- 标题：按纯文字重建，避免装饰累加 ---------- */
  for (const tag of HEADINGS) {
    for (const h of Array.from(root.querySelectorAll<HTMLElement>(tag))) {
      const innerKey = `${tag}Inner` as keyof Styles
      const decor = theme.decor?.[tag as 'h1' | 'h2' | 'h3' | 'h4']
      // 序号在换样式模式下无从得知「第几节」，按文档顺序补
      const ctx = { primary, n: indexOfHeading(root, h, tag) }
      // 先按标记删掉上一轮的装饰，这是最准的；标记要是被编辑器剥了，
      // 下面 cleanHeadingText 里的符号/序号规则还能兜一层
      const marked = h.querySelectorAll(`[${DECOR_ATTR}]`)
      marked.forEach((el) => el.remove())
      const text = cleanHeadingText(h.textContent ?? '', ctx.n)
      if (!text) continue
      const before = markDecor(expandDecor(decor?.before, ctx))
      const after = markDecor(expandDecor(decor?.after, ctx))
      const escaped = escapeText(text)
      const innerDecls = styles[innerKey] as Decls | undefined
      h.innerHTML = innerDecls
        ? `<span${attr(innerDecls)}>${before}${escaped}${after}</span>`
        : `${before}${escaped}${after}`
      setStyle(h, styles[tag], { 'font-family': options.fontFamily })
    }
  }

  /* ---------- 其余块级与行内 ---------- */
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    // 这里不能用 el.isConnected：root 是个游离的 div，没挂到文档上，
    // isConnected 恒为 false，整个循环会被静默跳过（段落、列表全都套不上样式）
    if (!root.contains(el)) continue
    const tag = el.tagName.toLowerCase()
    if (HEADINGS.includes(tag as HeadingTag)) continue
    if (tag === 'pre' || (tag === 'code' && el.closest('pre'))) continue

    switch (tag) {
      case 'p':
        setStyle(el, el.closest('blockquote') ? styles.blockquoteP : el.closest('li') ? styles.liP : styles.p)
        break
      case 'blockquote':
        setStyle(el, styles.blockquote)
        break
      case 'ul':
        setStyle(el, styles.ul)
        break
      case 'ol':
        setStyle(el, styles.ol)
        break
      case 'li':
        setStyle(el, styles.li, markerColorFor(el, styles))
        break
      case 'hr':
        setStyle(el, styles.hr)
        break
      case 'section':
      case 'div': {
        // 没有任何内联样式的「裸」容器会吃到编辑器自己的 CSS，
        // 在正文里表现为一个虚线空框（多见于表格外面那层包裹）。
        // 显式抹掉边框和底色把它中和掉。
        // 有内联样式的不动——那是用户自己的装饰容器。
        if (el === root) break
        if ((el.getAttribute('style') ?? '').trim()) break
        if (el.getAttribute('data-tool') === 'wx-typeset') break
        setStyle(el, { border: 'none', 'background-color': 'transparent', 'box-shadow': 'none' })
        break
      }
      case 'a':
        setStyle(el, styles.link)
        break
      case 'strong':
      case 'b':
        setStyle(el, styles.strong)
        break
      case 'em':
      case 'i':
        setStyle(el, styles.em)
        break
      case 'del':
      case 's':
        setStyle(el, styles.del)
        break
      case 'code':
        setStyle(el, styles.codespan)
        break
      case 'table':
        setStyle(el, styles.table)
        break
      case 'thead':
        setStyle(el, styles.thead)
        break
      case 'th':
        setStyle(el, styles.th, keepAlign(el))
        break
      case 'td':
        setStyle(el, styles.td, keepAlign(el))
        break
      case 'img':
        setStyle(el, styles.img)
        break
      default:
        break
    }
  }

  flattenTables(root, styles.figcaption)

  // 字体、行高这些靠继承的属性挂在最外层容器上。
  // 但调用方取的是 root.innerHTML —— 挂在 root 自己身上会被丢掉，
  // 表现就是「改字体没反应」。所以必须落到 root 里面的一个真实 section 上。
  setStyle(ensureContainer(root), styles.container)
  changed += guardLineHeightText(root)

  if (blanks) {
    warnings.push(`清掉了 ${blanks} 个空白块（没有文字也没有图，套上样式后会变成一格格空框）`)
  }
  if (root.querySelector('pre')) {
    warnings.push('代码块按纯文字重新高亮，语言是自动识别的，可能和原来不同')
  }
  if (root.querySelector('h1,h2,h3,h4,h5,h6')) {
    warnings.push('标题按纯文字重建，标题内部的加粗、链接等行内格式会被去掉')
  }

  return { changed, warnings: [...new Set(warnings)] }
}

/** 这些标签空着也有意义，不能删 */
const KEEP_WHEN_BLANK = new Set(['br', 'hr', 'img', 'td', 'th', 'tr', 'thead', 'tbody', 'table', 'input'])

/** 会被当成装饰容器、空着就该删的标签 */
const DROPPABLE = new Set(['section', 'div', 'blockquote', 'ul', 'ol', 'li'])

/**
 * 藏在 <table> 里、但空着会显形的标签。
 * 空的 <caption> 会在表格正上方渲染成一条空白带，空的 thead / tfoot 同理。
 * 它们躲过了「表格内部一律不动」那条规则。
 * （现在 flattenTables 会把这几样直接拍掉，这里保留规则给 shouldDropWhenBlank 用。）
 */
const DROP_INSIDE_TABLE = new Set(['caption', 'thead', 'tfoot'])

/**
 * 空着的时候该不该删。
 *
 * 空 <p> 要留：很多人用空行调间距，而段落不带边框，空着也不会显形。
 * 表格里的空单元格要留：那是表格结构的一部分。
 */
export function shouldDropWhenBlank(tag: string, insideTable: boolean): boolean {
  const t = tag.toLowerCase()
  if (DROP_INSIDE_TABLE.has(t)) return true
  if (insideTable) return false
  if (KEEP_WHEN_BLANK.has(t)) return false
  return DROPPABLE.has(t)
}

/** 算不算「有内容」：有文字，或者有图片、分隔线这类没有文字的内容 */
function hasContent(el: Element): boolean {
  if (el.querySelector('img,video,iframe,svg,canvas,hr')) return true
  return !!(el.textContent ?? '').trim()
}

/**
 * 删掉没有任何内容的块。
 *
 * 秀米、壹伴这类排版工具会留下一堆嵌套的空 section 做间距和装饰，
 * 平时看不见，一旦套上边框或底色就变成一格格空框。
 * 从里往外删，这样「空 section 套空 section」能一次清干净。
 */
function removeBlankBlocks(root: HTMLElement): number {
  let removed = 0

  // 整张空表格要先删。只跳过「表格内部」是不够的：
  // 一张所有格子都空的表格，套上主题的单元格边框后就是一片空格子。
  // 它未必有空的包裹层可以带走它（有包裹层时会被下面的循环顺带清掉，没有就得靠这里）
  for (const table of Array.from(root.querySelectorAll('table'))) {
    if (!hasContent(table)) {
      table.remove()
      removed++
    }
  }

  // 留下来的表格里，整行都空的也删——空行会渲染成一条空带
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'))
    if (rows.length <= 1) continue
    for (const tr of rows) {
      if (!hasContent(tr)) {
        tr.remove()
        removed++
      }
    }
  }
  for (let pass = 0; pass < 5; pass++) {
    const gone: Element[] = []
    // 空的 <p> 不删：很多人用空行调间距，而段落不带边框，空着也不会变成框
    for (const el of Array.from(root.querySelectorAll([...DROPPABLE].join(',')))) {
      if (!shouldDropWhenBlank(el.tagName, !!el.closest('table'))) continue
      if (hasContent(el)) continue
      gone.push(el)
    }
    if (!gone.length) break
    for (const el of gone) {
      el.remove()
      removed++
    }
  }
  return removed
}

/**
 * 保证 root 里有且只有一个承载容器样式的 section。
 * 已经有了就复用，避免反复换样式时一层层套娃。
 */
function ensureContainer(root: HTMLElement): HTMLElement {
  const only = root.children.length === 1 ? (root.firstElementChild as HTMLElement | null) : null
  if (only && (only.getAttribute('data-tool') === 'wx-typeset' || only.tagName.toLowerCase() === 'section')) {
    only.setAttribute('data-tool', 'wx-typeset')
    return only
  }
  const box = root.ownerDocument.createElement('section')
  box.setAttribute('data-tool', 'wx-typeset')
  while (root.firstChild) box.appendChild(root.firstChild)
  root.appendChild(box)
  return box
}

/** 同级标题里这是第几个，用来还原 {{n}} / {{nn}} */
function indexOfHeading(root: HTMLElement, target: HTMLElement, tag: string): number {
  const all = Array.from(root.querySelectorAll(tag))
  return all.indexOf(target) + 1
}

/** 无序列表用主色项目符号，有序列表的序号是内容，不弱化 */
function markerColorFor(li: HTMLElement, styles: Styles): Decls | undefined {
  const color = styles.liMarker?.color
  if (!color) return undefined
  const parent = li.parentElement
  if (!parent || parent.tagName.toLowerCase() !== 'ul') return undefined
  return { color }
}

/** 表格对齐是内容的一部分，换样式时要留着 */
function keepAlign(cell: HTMLElement): Decls | undefined {
  const align = cell.style.textAlign || cell.getAttribute('align')
  return align ? { 'text-align': align } : undefined
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
