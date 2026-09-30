/**
 * 比较「我们生成的 HTML」和「编辑器里读回来的 HTML」是不是同一篇内容。
 *
 * 不能直接比字符串：
 *  - 我们输出时会把 " 转义成 &quot;、' 转成 &#39;，而浏览器从 DOM 读回来的文本里是原字符
 *  - 微信粘贴后会自己规整 HTML（补 data-*、重写 style、拆分标签）
 *  - 微信还会剥掉一部分它不认的装饰标签
 * 所以只比文字，并且允许局部出入。
 */

/** 去标签、解实体、去空白，只留下纯文字 */
export function plainTextOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '\n')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;|&#60;/g, '<')
    .replace(/&gt;|&#62;/g, '>')
    // &amp; 必须最后处理，否则会把上面几个解出来的结果再解一次
    .replace(/&amp;|&#38;/g, '&')
    .replace(/\s+/g, '')
}

/**
 * 判断 actual 里是不是装着 expected 这篇内容。
 * 从开头、中间、结尾各取一段做抽样比对，容忍编辑器剥掉部分装饰，
 * 但内容被整个还原成别的东西时一定判否。
 */
export function containsSameContent(expectedHtml: string, actualHtml: string): boolean {
  const want = plainTextOf(expectedHtml)
  const got = plainTextOf(actualHtml)
  if (!want) return true
  if (!got) return false
  if (got.includes(want)) return true

  const SAMPLE = 30
  const positions = [0.05, 0.35, 0.65, 0.9]
  const samples = positions
    .map((ratio) => {
      const start = Math.min(Math.floor(want.length * ratio), Math.max(0, want.length - SAMPLE))
      return want.slice(start, start + SAMPLE)
    })
    .filter((s) => s.length >= 8)

  if (!samples.length) return got.includes(want.slice(0, 8))

  const hits = samples.filter((s) => got.includes(s)).length
  // 四段里对上一半就认为是同一篇：编辑器可能剥掉页眉页脚一类的装饰
  return hits * 2 >= samples.length
}

/* ------------------------------------------------------------------ */
/* 样式指纹                                                            */
/* ------------------------------------------------------------------ */

/** #1e6fd9 → "rgb(30, 111, 217)"，浏览器读回 style 时是这个写法 */
function hexToRgb(hex: string): string {
  const n = parseInt(hex, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/**
 * 从我们生成的 HTML 里挑出几个有代表性的颜色值作为「样式指纹」。
 *
 * 只比文字是不够的：编辑器可能把正文重渲染回**同一篇文章的上一套样式**，
 * 这时文字完全一致、样式却回退了，表现就是「闪一下新效果又变回去」。
 */
export function styleSignature(html: string): string[] {
  // 代码块的高亮配色不能算进指纹：不同主题常共用同一套代码配色，
  // 算进去会让两套完全不同的主题互相命中，误判成「已经是这套样式了」
  const body = html.replace(/<pre[\s\S]*?<\/pre>/gi, '')

  const counts = new Map<string, number>()
  for (const m of body.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = m[1].toLowerCase()
    // 纯黑白灰太常见，区分不出主题
    if (/^(0{6}|f{6})$/.test(hex)) continue
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hex]) => hex)
}

/** 编辑器里还留着多少我们的颜色。微信会把 #xxxxxx 重写成 rgb(...)，两种写法都认 */
export function hasStyleSignature(actualHtml: string, signature: string[]): boolean {
  if (!signature.length) return true
  const hay = actualHtml.toLowerCase()
  const present = (hex: string) => hay.includes(`#${hex}`) || hay.includes(hexToRgb(hex))
  // 出现最多的那个颜色基本就是主题主色，它必须在
  if (!present(signature[0])) return false
  return signature.filter(present).length * 2 >= signature.length
}

/** 某个颜色在不在这段 HTML 里（#1e6fd9 和 rgb(30, 111, 217) 两种写法都认） */
export function hasColor(html: string, color: string): boolean {
  const hex = color.trim().replace(/^#/, '').toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(hex)) return true // 认不出的颜色不参与判断
  const hay = html.toLowerCase()
  return hay.includes(`#${hex}`) || hay.includes(hexToRgb(hex))
}

/* ------------------------------------------------------------------ */
/* 样式片段比对                                                        */
/* ------------------------------------------------------------------ */

/**
 * 把 style 文本归一，好做包含判断。
 * 我们输出的是 `font-size:16px`，浏览器读回来是 `font-size: 16px`，
 * 字体栈里的逗号后面也会被补空格，不归一就永远对不上。
 */
export function normalizeStyleText(html: string): string {
  return html
    .toLowerCase()
    .replace(/["']/g, '')            // 浏览器会给带空格的字体名加引号
    .replace(/\b0px\b/g, '0')       // margin:0 0 20px 会被规范成 0px 0px 20px
    .replace(/\s*([:,;])\s*/g, '$1')
    .replace(/\s+/g, ' ')
}

/**
 * 这些样式片段是不是都在正文里。
 *
 * 单靠文字和颜色判断「有没有变」是不够的：换字体、字号、行高、段间距时
 * 一个字都不会变、主题色也不变，会被当成「已是最新」而整个跳过，
 * 表现就是「改字体没反应」。
 */
export function hasStyleFragments(html: string, fragments: string[]): boolean {
  if (!fragments.length) return true
  const hay = normalizeStyleText(html)
  return fragments.every((f) => hay.includes(normalizeStyleText(f)))
}
