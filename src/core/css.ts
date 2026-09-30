import type { Decls, Styles, StyleToken } from './types'

/** 把声明对象序列化成可放进 style="" 的字符串 */
export function serialize(decls?: Decls): string {
  if (!decls) return ''
  const parts: string[] = []
  for (const [prop, value] of Object.entries(decls)) {
    if (value === '' || value == null) continue
    parts.push(`${prop}:${value}`)
  }
  return parts.join(';')
}

/** 生成 ` style="..."`，为空时返回空串 */
export function attr(...decls: (Decls | undefined)[]): string {
  const merged = mergeDecls(...decls)
  const css = serialize(merged)
  return css ? ` style="${css.replace(/"/g, "'")}"` : ''
}

export function mergeDecls(...list: (Decls | undefined)[]): Decls {
  const out: Decls = {}
  for (const d of list) {
    if (!d) continue
    Object.assign(out, d)
  }
  return out
}

export function mergeStyles(base: Styles, override: Styles): Styles {
  const out: Styles = { ...base }
  for (const key of Object.keys(override) as StyleToken[]) {
    out[key] = mergeDecls(base[key], override[key])
  }
  return out
}

/** 自定义 CSS 里允许的「选择器 → 样式位置」映射 */
const SELECTOR_MAP: Record<string, StyleToken> = {
  '#nice': 'container',
  container: 'container',
  body: 'container',
  p: 'p',
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
  'h1 span': 'h1Inner', 'h2 span': 'h2Inner', 'h3 span': 'h3Inner', 'h4 span': 'h4Inner',
  blockquote: 'blockquote',
  'blockquote p': 'blockquoteP',
  ul: 'ul', ol: 'ol', li: 'li',
  hr: 'hr',
  a: 'link',
  strong: 'strong', b: 'strong',
  em: 'em', i: 'em',
  del: 'del', s: 'del',
  'code': 'codespan',
  'p code': 'codespan',
  'pre': 'pre',
  'pre code': 'code',
  'code-block': 'codeBlock',
  img: 'img',
  figure: 'figure',
  figcaption: 'figcaption',
  table: 'table',
  thead: 'thead',
  th: 'th',
  td: 'td',
  footnotes: 'footnotes',
  'footnotes-title': 'footnotesTitle',
  'footnote-item': 'footnoteItem',
}

/**
 * 极简 CSS 解析：只支持 `selector[, selector] { prop: value; ... }`。
 * 不支持嵌套、媒体查询、变量——公众号内联样式场景也用不到。
 */
export function parseCustomCss(css: string): { styles: Styles; warnings: string[] } {
  const styles: Styles = {}
  const warnings: string[] = []
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '')

  for (const rawRule of cleaned.split('}')) {
    const rule = rawRule.trim()
    if (!rule) continue
    const brace = rule.indexOf('{')
    if (brace === -1) continue

    const selectors = rule.slice(0, brace).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const decls: Decls = {}
    for (const decl of rule.slice(brace + 1).split(';')) {
      const colon = decl.indexOf(':')
      if (colon === -1) continue
      const prop = decl.slice(0, colon).trim().toLowerCase()
      const value = decl.slice(colon + 1).trim().replace(/!important$/i, '').trim()
      if (prop && value) decls[prop] = value
    }
    if (!Object.keys(decls).length) continue

    for (const selector of selectors) {
      const token = SELECTOR_MAP[selector]
      if (!token) {
        warnings.push(`自定义 CSS 里的选择器 "${selector}" 不受支持，已忽略`)
        continue
      }
      styles[token] = mergeDecls(styles[token], decls)
    }
  }
  return { styles, warnings }
}

/* ---------- 颜色工具：用于从主色派生浅色/透明变体 ---------- */

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** 主色叠加到白底上的近似效果，alpha 越小越淡 */
export function tint(color: string, alpha: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  const mixed = rgb.map((c) => Math.round(c * alpha + 255 * (1 - alpha)))
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`
}

/** 变暗 */
export function shade(color: string, alpha: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  const mixed = rgb.map((c) => Math.round(c * (1 - alpha)))
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`
}

export function rgba(color: string, alpha: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}
