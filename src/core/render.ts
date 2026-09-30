import { Marked, type RendererObject, type Tokens } from 'marked'
import { attr, mergeDecls } from './css'
import { getCodeTheme, highlightToInline } from './highlight'
import { expandDecor } from './themes'
import { resolveStyles } from './styles'
import { auditForWechat, mergeWarnings, sanitizeHtml } from './sanitize'
import { applyTypography } from './typography'
import { type Decls, type RenderOptions, type RenderResult } from './types'

/** marked 只对未被实体化的 & 做转义，这里保持一致，避免 &amp; 被二次转义 */
const RE_LOOSE_AMP = /&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g

function escapeText(s: string): string {
  return s
    .replace(RE_LOOSE_AMP, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return s.replace(RE_LOOSE_AMP, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** 公众号正文里唯一还能跳转的站内域名 */
function isWechatSafeHref(href: string): boolean {
  return /^https?:\/\/mp\.weixin\.qq\.com\//i.test(href)
}

/** 渲染器方法里能拿到的 marked 上下文 */
interface Ctx {
  parser: {
    parse(tokens: Tokens.Generic[], top?: boolean): string
    parseInline(tokens: Tokens.Generic[]): string
  }
  /** marked 会把自定义渲染器挂到实例上，list 需要回调 listitem */
  listitem(item: Tokens.ListItem): string
}

export function render(markdown: string, userOptions: Partial<RenderOptions> = {}): RenderResult {
  const resolved = resolveStyles(userOptions)
  const o = resolved.options
  const { theme, primary, styles } = resolved
  const codeTheme = getCodeTheme(o.codeTheme)
  const warnings: string[] = [...resolved.warnings]

  const footnotes: RenderResult['footnotes'] = []
  const seenHref = new Map<string, number>()
  let blockquoteDepth = 0
  let listDepth = 0
  /** 有序列表的序号是内容，不能像项目符号那样弱化上色 */
  let inOrderedList = false
  /** 各级标题的序号，用于装饰里的 {{n}} / {{nn}} */
  const counters = [0, 0, 0, 0, 0, 0]
  /** 首字放大只作用在全文第一段 */
  let seenFirstParagraph = false

  const typo = (s: string) => applyTypography(s, { autoSpacing: o.autoSpacing, punctuation: o.punctuation })
  /** 正文颜色，列表内容需要显式带上，否则会继承到 marker 色 */
  const textColor = styles.li?.color ?? styles.container?.color ?? '#3f3f3f'
  /**
   * 微信旧版行高检测会把 Range.getClientRects() 的矩形数误当成视觉行数。
   * 不能把整段内容再套一个 span：当段内还有 strong/em 时，父 span 会为同一行
   * 返回重复矩形，反而把单行误判成多行。这里只包块元素的顶层文字片段，
   * 让块元素没有直接文本节点，同时不制造“外层 span 包内联元素”的重复测量。
   */
  const guardDirectText = (html: string, color = textColor): string => {
    let depth = 0
    return (html.match(/<[^>]+>|[^<]+/g) ?? []).map((part) => {
      if (!part.startsWith('<')) {
        return depth === 0 && part.length
          ? `<span style="color:${color};font-size:inherit;line-height:inherit">${part}</span>`
          : part
      }
      if (/^<\//.test(part)) depth = Math.max(0, depth - 1)
      const out = part
      if (/^<(?!\/|!)[a-z][^>]*>$/i.test(part) && !/^<(?:br|hr|img|input|source|wbr)\b/i.test(part) && !/\/>$/.test(part)) {
        depth++
      }
      return out
    }).join('')
  }

  const guardPlainText = (text: string, color = textColor) =>
    `<span style="color:${color};font-size:inherit;line-height:inherit">${text}</span>`

  const imageParts = (token: Tokens.Image) => {
    const src = escapeAttr((token.href || '').trim())
    const alt = escapeAttr(token.text || '')
    return {
      img: `<img src="${src}" alt="${alt}"${attr(styles.img)} />`,
      caption: o.imageCaption && token.text
        ? `<section${attr(styles.figcaption)}>${guardPlainText(escapeText(typo(token.text)), styles.figcaption?.color ?? textColor)}</section>`
        : '',
    }
  }

  /** 段落在引用/列表内部要换用更紧凑的样式 */
  const paragraphDecls = (): Decls | undefined => {
    if (blockquoteDepth > 0) return styles.blockquoteP
    if (listDepth > 0) return styles.liP
    return styles.p
  }
  const paragraphColor = () =>
    paragraphDecls()?.color ??
    (blockquoteDepth > 0 ? styles.blockquote?.color : listDepth > 0 ? styles.li?.color : undefined) ??
    textColor

  const renderer = {
    /* ---------------- 块级 ---------------- */

    paragraph(this: Ctx, token: Tokens.Paragraph): string {
      // 只含一张图片的段落直接输出块级 figure。普通行内图片只输出 img，
      // 否则会生成非法的 p > section，进入 ProseMirror 后会重组、吞字或把表格并进段落。
      if (token.tokens.length === 1 && (token.tokens[0] as Tokens.Generic).type === 'image') {
        const { img, caption } = imageParts(token.tokens[0] as Tokens.Image)
        return `<section${attr(styles.figure)}>${img}${caption}</section>`
      }
      let inner = this.parser.parseInline(token.tokens as Tokens.Generic[])
      const isTopLevel = blockquoteDepth === 0 && listDepth === 0
      if (isTopLevel && !seenFirstParagraph) {
        seenFirstParagraph = true
        if (theme.raisedCap) inner = raiseFirstChar(inner, styles.raisedCap)
      }
      return `<p${attr(paragraphDecls())}>${guardDirectText(inner, paragraphColor())}</p>`
    },

    heading(this: Ctx, token: Tokens.Heading): string {
      const depth = Math.min(6, Math.max(1, token.depth))
      const tag = `h${depth}` as 'h1'
      const innerKey = `h${depth}Inner` as 'h1Inner'
      const content = this.parser.parseInline(token.tokens as Tokens.Generic[])

      // 本级 +1，更深的层级归零，这样 {{n}} 是「本节内的第几个」
      counters[depth - 1] += 1
      for (let i = depth; i < counters.length; i++) counters[i] = 0
      const ctx = { primary, n: counters[depth - 1] }

      const decor = theme.decor?.[tag as 'h1' | 'h2' | 'h3' | 'h4']
      const before = expandDecor(decor?.before, ctx)
      const after = expandDecor(decor?.after, ctx)

      const innerDecls = styles[innerKey]
      const body = innerDecls
        ? `<span${attr(innerDecls)}>${before}${content}${after}</span>`
        : `${before}${content}${after}`

      return `<${tag}${attr(styles[tag])}>${guardDirectText(body, styles[tag]?.color ?? textColor)}</${tag}>`
    },

    blockquote(this: Ctx, token: Tokens.Blockquote): string {
      blockquoteDepth++
      const inner = this.parser.parse(token.tokens as Tokens.Generic[])
      blockquoteDepth--
      const d = theme.decor?.blockquote
      const before = expandDecor(d?.before, { primary, n: 0 })
      const after = expandDecor(d?.after, { primary, n: 0 })
      return `<blockquote${attr(styles.blockquote)}>${before}${dropLastBottomMargin(inner)}${after}</blockquote>`
    },

    list(this: Ctx, token: Tokens.List): string {
      const tag = token.ordered ? 'ol' : 'ul'
      const startAttr = token.ordered && token.start !== 1 && token.start !== '' ? ` start="${token.start}"` : ''
      listDepth++
      const prevOrdered = inOrderedList
      inOrderedList = token.ordered
      const body = token.items.map((item) => this.listitem(item)).join('')
      inOrderedList = prevOrdered
      listDepth--
      const decls = mergeDecls(styles[tag], listDepth > 0 ? { margin: '0.35em 0 0' } : undefined)
      return `<${tag}${startAttr}${attr(decls)}>${body}</${tag}>`
    },

    listitem(this: Ctx, item: Tokens.ListItem): string {
      let inner = this.parser.parse(item.tokens as Tokens.Generic[], !!item.loose)
      let decls = mergeDecls(styles.li, item.task ? { 'list-style-type': 'none' } : undefined)
      // 公众号里改不了 ::marker，只能给 li 上 marker 色、再把内容包一层文字色
      const markerColor = styles.liMarker?.color
      if (markerColor && !item.task && !inOrderedList) {
        decls = mergeDecls(decls, { color: markerColor })
        // 只给直接文字片段恢复正文色，不能再用一个 span 包住整个列表项。
        inner = guardDirectText(inner, textColor)
      } else if (!/<(?:p|h[1-6]|blockquote|ul|ol|pre|table|section|figure)\b/i.test(inner)) {
        // 紧凑列表项可能直接输出文字；同样避免成为微信行高检测的直接文本节点。
        inner = guardDirectText(inner)
      }
      return `<li${attr(decls)}>${inner}</li>`
    },

    // 公众号会剥掉 <input>，任务列表改用字符复选框
    checkbox(token: Tokens.Checkbox): string {
      const d = token.checked ? styles.taskChecked : styles.taskUnchecked
      return `<span${attr(d)}>${token.checked ? '☑' : '☐'}</span>`
    },

    code(_token: Tokens.Code): string {
      const { text, lang } = _token
      const { html, language } = highlightToInline(text, lang, codeTheme)
      const bar = o.codeLangLabel
        ? `<section${attr(styles.codeLang)}>` +
          dots(codeTheme.dark) +
          `<span style="letter-spacing:0">${escapeText(language)}</span>` +
          `</section>`
        : ''
      return (
        `<section${attr(styles.codeBlock)}>` +
        bar +
        `<pre${attr(styles.pre)}><code${attr(styles.code)}>${html}</code></pre>` +
        `</section>`
      )
    },

    hr(): string {
      const ornament = theme.decor?.hr
      if (ornament) {
        return `<section${attr(styles.hr)}>${expandDecor(ornament, { primary, n: 0 })}</section>`
      }
      return `<hr${attr(styles.hr)} />`
    },

    table(this: Ctx, token: Tokens.Table): string {
      const head = token.header
        .map((cell, i) => {
          const align = token.align[i]
          const decls = mergeDecls(styles.th, align ? { 'text-align': align } : undefined)
          return `<th${attr(decls)}>${guardDirectText(this.parser.parseInline(cell.tokens as Tokens.Generic[]), decls?.color ?? textColor)}</th>`
        })
        .join('')
      const body = token.rows
        .map((row) => {
          const tds = row
            .map((cell, i) => {
              const align = token.align[i]
              const decls = mergeDecls(styles.td, align ? { 'text-align': align } : undefined)
              return `<td${attr(decls)}>${guardDirectText(this.parser.parseInline(cell.tokens as Tokens.Generic[]), decls?.color ?? textColor)}</td>`
            })
            .join('')
          return `<tr>${tds}</tr>`
        })
        .join('')
      // 只输出 table > tbody > tr > th|td 这一种结构。
      // 公众号后台用的是 prosemirror-tables，它的表格 schema 只认这几层，
      // 给它 caption / colgroup / thead 会被揉乱：见过表格被套进别的表格的
      // 单元格里、正文内容跑进 <tfoot> 的情况。
      // caption 尤其不能给——它的 style 会被剥掉，空 caption 就成了表格上方一条虚线空带。
      return (
        `<section style="overflow-x:auto">` +
        `<table${attr(styles.table)}>` +
        `<tbody><tr>${head}</tr>${body}</tbody>` +
        `</table></section>`
      )
    },

    html(token: Tokens.HTML | Tokens.Tag): string {
      const result = sanitizeHtml(token.text)
      for (const w of result.warnings) if (!warnings.includes(w)) warnings.push(w)
      return result.html
    },

    space(): string {
      return ''
    },

    /* ---------------- 行内 ---------------- */

    strong(this: Ctx, token: Tokens.Strong): string {
      return `<strong${attr(styles.strong)}>${this.parser.parseInline(token.tokens as Tokens.Generic[])}</strong>`
    },

    em(this: Ctx, token: Tokens.Em): string {
      return `<em${attr(styles.em)}>${this.parser.parseInline(token.tokens as Tokens.Generic[])}</em>`
    },

    del(this: Ctx, token: Tokens.Del): string {
      return `<span${attr(styles.del)}>${this.parser.parseInline(token.tokens as Tokens.Generic[])}</span>`
    },

    codespan(token: Tokens.Codespan): string {
      return `<code${attr(styles.codespan)}>${token.text}</code>`
    },

    br(): string {
      return '<br />'
    },

    link(this: Ctx, token: Tokens.Link): string {
      const href = (token.href || '').trim()
      const label = this.parser.parseInline(token.tokens as Tokens.Generic[])

      // 锚点、邮件、站内文章：保留可点击的 <a>
      if (!href || href.startsWith('#') || /^mailto:/i.test(href) || isWechatSafeHref(href)) {
        const t = token.title ? ` title="${escapeAttr(token.title)}"` : ''
        return `<a href="${escapeAttr(href)}"${t}${attr(styles.link)}>${guardDirectText(label, styles.link?.color ?? textColor)}</a>`
      }

      if (!o.linksToFootnotes) {
        // 公众号会把站外 <a> 变成不可点的纯文本，这里直接输出带样式的文字
        return `<span${attr(styles.link)}>${label}</span>`
      }

      let index = seenHref.get(href)
      if (index === undefined) {
        index = footnotes.length + 1
        seenHref.set(href, index)
        footnotes.push({ index, text: stripTags(label), href })
      }
      return `<span${attr(styles.link)}>${label}</span><sup${attr(styles.linkRef)}>[${index}]</sup>`
    },

    image(token: Tokens.Image): string {
      return imageParts(token).img
    },

    text(this: Ctx, token: Tokens.Text | Tokens.Escape): string {
      if ('tokens' in token && token.tokens) {
        return this.parser.parseInline(token.tokens as Tokens.Generic[])
      }
      if ('escaped' in token && token.escaped) return token.text
      return escapeText(typo(token.text))
    },
  }

  const marked = new Marked({
    gfm: true,
    breaks: o.lineBreaks,
    renderer: renderer as unknown as RendererObject,
  })

  let body = marked.parse(markdown ?? '', { async: false }) as string

  if (footnotes.length) {
    const items = footnotes
      .map(
        (f) =>
          `<p${attr(styles.footnoteItem)}>${guardPlainText(`[${f.index}] ${escapeText(f.text)}: ${escapeText(f.href)}`, styles.footnoteItem?.color ?? textColor)}</p>`,
      )
      .join('')
    body +=
      `<section${attr(styles.footnotes)}>` +
      `<p${attr(styles.footnotesTitle)}>${guardPlainText('参考资料', styles.footnotesTitle?.color ?? textColor)}</p>` +
      items +
      `</section>`
  }

  const html = `<section${attr(styles.container)} data-tool="wx-typeset">${body}</section>`
  warnings.push(...auditForWechat(html))

  return {
    html,
    text: toPlainText(markdown ?? ''),
    footnotes,
    warnings: mergeWarnings(warnings),
  }
}

/** 深色代码主题加上三个窗口圆点，浅色的不加，免得显脏 */
function dots(dark: boolean): string {
  if (!dark) return ''
  const d = (c: string) =>
    `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${c};margin-right:6px"></span>`
  return d('#ff5f56') + d('#ffbd2e') + d('#27c93f')
}

/**
 * 去掉容器内最后一个块级元素的下边距。
 * 公众号里 blockquote 无法用 :last-child，只能在字符串层面处理。
 */
function dropLastBottomMargin(html: string): string {
  const needle = 'margin:0 0 0.6em'
  const at = html.lastIndexOf(needle)
  if (at === -1) return html
  return html.slice(0, at) + 'margin:0' + html.slice(at + needle.length)
}

/**
 * 首字放大。公众号不支持 ::first-letter，也不能指望 float，
 * 所以做成「抬升的大写首字」：把第一个可见字符包一层放大的 span。
 * 段落以标签开头（比如第一句就是加粗）时直接跳过，不硬来。
 */
function raiseFirstChar(inner: string, decls: Decls | undefined): string {
  if (!decls) return inner
  const m = /^([^<>\s])/.exec(inner)
  if (!m) return inner
  return `<span${attr(decls)}>${m[1]}</span>` + inner.slice(m[1].length)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/** 剪贴板的 text/plain 兜底：去掉 Markdown 记号的朴素文本 */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/^```[\s\S]*?^```$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1（$2）')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
