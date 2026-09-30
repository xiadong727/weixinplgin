/**
 * 只用于清洗「Markdown 里内嵌的原生 HTML」。
 * 排版结果本身由渲染器生成，不需要清洗。
 *
 * 白名单按公众号后台实测保留的标签来定：不在名单里的标签整段丢掉内容，
 * 因为粘贴进去后微信也会剥掉，留着只会让预览和实际结果不一致。
 */

const ALLOWED_TAGS = new Set([
  'section', 'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'del', 's', 'u', 'sub', 'sup',
  'blockquote', 'ul', 'ol', 'li',
  'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'a', 'figure', 'figcaption', 'fieldset', 'legend',
  'mp-common-profile', 'mpvoice', 'mpvideo', 'mp-style-type',
])

/** 会被彻底删除（含内容）的标签 */
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'noscript', 'form', 'input', 'button', 'select', 'textarea'])

const ALLOWED_ATTRS = new Set(['style', 'src', 'href', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'data-src'])

/** style 里对公众号无效或有风险的属性 */
const BANNED_STYLE_PROPS = [
  'position', 'z-index', 'float', 'clear',
  'animation', 'transition', 'transform',
  'cursor', 'user-select', 'pointer-events',
]

export interface SanitizeResult {
  html: string
  warnings: string[]
}

/**
 * 基于正则的轻量清洗。刻意不依赖 DOM，
 * 这样 core 在 Node（测试）和浏览器里行为一致。
 */
export function sanitizeHtml(input: string): SanitizeResult {
  const warnings: string[] = []
  let html = input

  // 1. 整段删除危险标签及其内容
  for (const tag of DROP_TAGS) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?(?:</${tag}>|$)`, 'gi')
    if (re.test(html)) {
      warnings.push(`已移除 <${tag}> 标签（公众号不支持）`)
      html = html.replace(re, '')
    }
    html = html.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '')
  }

  // 2. 注释
  html = html.replace(/<!--[\s\S]*?-->/g, '')

  // 3. 逐个标签过滤属性
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*?)?)(\/?)>/g,
    (_m, slash: string, rawTag: string, rawAttrs: string, selfClose: string) => {
      const tag = rawTag.toLowerCase()
      if (!ALLOWED_TAGS.has(tag)) {
        warnings.push(`已移除不受支持的标签 <${tag}>`)
        return ''
      }
      if (slash) return `</${tag}>`
      return `<${tag}${filterAttrs(rawAttrs, warnings)}${selfClose ? ' /' : ''}>`
    })

  return { html, warnings }
}

function filterAttrs(rawAttrs: string, warnings: string[]): string {
  const out: string[] = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rawAttrs))) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    if (name.startsWith('on')) {
      warnings.push(`已移除事件属性 ${name}`)
      continue
    }
    if (!ALLOWED_ATTRS.has(name)) continue
    if ((name === 'href' || name === 'src') && /^\s*(javascript|data(?!:image\/)):/i.test(value)) {
      warnings.push(`已移除可疑链接 ${name}="${value.slice(0, 40)}"`)
      continue
    }
    const safe = name === 'style' ? cleanStyle(value) : value
    if (!safe) continue
    out.push(`${name}="${safe.replace(/"/g, '&quot;')}"`)
  }
  return out.length ? ' ' + out.join(' ') : ''
}

function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((d) => d.trim())
    .filter((d) => {
      if (!d) return false
      const prop = d.split(':')[0].trim().toLowerCase()
      if (BANNED_STYLE_PROPS.some((b) => prop === b || prop.startsWith(b + '-'))) return false
      if (/expression\s*\(|url\s*\(\s*['"]?javascript/i.test(d)) return false
      return true
    })
    .join(';')
}

/**
 * 同一个问题可能被导入器和排版体检各报一次（比如本地图片），
 * 按主题关键词去重，保留先出现的那条——先出现的通常更具体（带文件名）。
 */
const WARNING_TOPICS = [
  '图床', '外链图片', 'front matter', 'GB18030', '乱码',
  'class', '<style>', 'script', 'position', '事件属性', '可疑链接',
]

export function mergeWarnings(...lists: string[][]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of lists.flat()) {
    const topic = WARNING_TOPICS.find((k) => w.includes(k)) ?? w
    if (seen.has(topic)) continue
    seen.add(topic)
    out.push(w)
  }
  return out
}

/** 粘贴前的最终体检：找出可能在公众号里失效的写法 */
export function auditForWechat(html: string): string[] {
  const warnings: string[] = []
  if (/<style[\s>]/i.test(html)) warnings.push('检测到 <style> 标签，公众号会整条剥掉')
  if (/\sclass=/.test(html)) warnings.push('检测到 class 属性，公众号会剥掉，样式需内联')
  const imgs = html.match(/<img[^>]+src="([^"]*)"/g) ?? []
  const remote = imgs.filter((tag) => /src="https?:\/\//.test(tag))
  const local = imgs.length - remote.length
  if (local > 0) {
    warnings.push(`有 ${local} 张图片不是 http(s) 链接，粘贴到公众号后会丢失，请先传到图床再引用`)
  }
  if (remote.length > 20) {
    warnings.push(`共 ${remote.length} 张外链图片，粘贴时微信要逐张转存，可能比较慢`)
  }
  if (/position\s*:\s*(absolute|fixed)/i.test(html)) warnings.push('检测到 position 定位，公众号会移除')
  return warnings
}
