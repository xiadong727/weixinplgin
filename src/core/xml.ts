/**
 * 够用就好的 XML 遍历器。
 *
 * 不用 DOMParser 是为了让 docx 解析在 Node 里也能跑（测试要覆盖它），
 * OOXML 结构规整、没有 CDATA，一个标签级的扫描器就够。
 */

export interface XmlNode {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

const TAG = /<([?!/]?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let last = 0
  let m: RegExpExecArray | null
  TAG.lastIndex = 0

  while ((m = TAG.exec(xml))) {
    const [full, prefix, tag, rawAttrs, selfClose] = m
    const between = xml.slice(last, m.index)
    if (between) appendText(stack[stack.length - 1], between)
    last = m.index + full.length

    if (prefix === '?' || prefix === '!') continue
    if (prefix === '/') {
      // 容错：遇到不匹配的闭合标签就一路回退到它
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }

    const node: XmlNode = { tag, attrs: parseAttrs(rawAttrs), children: [], text: '' }
    stack[stack.length - 1].children.push(node)
    if (!selfClose) stack.push(node)
  }
  return root
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  let m: RegExpExecArray | null
  ATTR.lastIndex = 0
  while ((m = ATTR.exec(raw))) out[m[1]] = decodeEntities(m[2] ?? m[3] ?? '')
  return out
}

function appendText(node: XmlNode, raw: string) {
  node.text += decodeEntities(raw)
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

/** 直接子节点里第一个叫 tag 的 */
export function child(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  return node?.children.find((c) => c.tag === tag)
}

/** 整棵子树里所有叫 tag 的节点 */
export function findAll(node: XmlNode, tag: string): XmlNode[] {
  const out: XmlNode[] = []
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.tag === tag) out.push(c)
      walk(c)
    }
  }
  walk(node)
  return out
}
