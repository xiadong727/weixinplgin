/**
 * 中文排版细节处理。
 * 全部作用在「未转义的纯文本」上，因此必须在 HTML 转义之前调用，
 * 否则会污染 &amp; 之类的实体。
 */

/** CJK 汉字 / 假名 / 部首等 */
const CJK = '\\u2e80-\\u2eff\\u2f00-\\u2fdf\\u3040-\\u309f\\u30a0-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff'

/** 中文标点：两侧不应再补空格 */
const CJK_PUNCT = '\\u3000-\\u303f\\uff00-\\uff0f\\uff1a-\\uff20\\uff3b-\\uff40\\uff5b-\\uff65'

const RE_CJK_LEFT = new RegExp(`([${CJK}])([A-Za-z0-9@$%^&*\\-+\\\\=|/([{<])`, 'g')
const RE_CJK_RIGHT = new RegExp(`([A-Za-z0-9!~;:,.?)\\]}>%$^&*\\-+\\\\=|/])([${CJK}])`, 'g')
const RE_CJK_ANY = new RegExp(`[${CJK}]`)
const RE_NO_SPACE = new RegExp(`([${CJK_PUNCT}]) | ([${CJK_PUNCT}])`, 'g')

/** 在中文与半角字母/数字之间补一个空格（pangu 风格） */
export function autoSpace(input: string): string {
  if (!RE_CJK_ANY.test(input)) return input
  let out = input
  // 反复两次，处理「中A中」这类交替情况
  for (let i = 0; i < 2; i++) {
    out = out.replace(RE_CJK_LEFT, '$1 $2').replace(RE_CJK_RIGHT, '$1 $2')
  }
  // 中文标点自带宽度，两侧不要空格
  out = out.replace(RE_NO_SPACE, (_m, a, b) => (a ?? '') + (b ?? ''))
  return out.replace(/ {2,}/g, ' ')
}

const HALF_TO_FULL: Record<string, string> = {
  ',': '，',
  '!': '！',
  '?': '？',
  ':': '：',
  ';': '；',
}

/** 中文标点规范化：紧贴中文的半角标点转全角，省略号规范化等 */
export function normalizePunctuation(input: string): string {
  if (!RE_CJK_ANY.test(input)) return input
  let out = input

  // 省略号
  out = out.replace(/\.{3,}/g, '……').replace(/。{3,}/g, '……').replace(/…{2,}/g, '……')

  // 紧跟在中文后面的半角 , ! ? : ; → 全角
  out = out.replace(new RegExp(`([${CJK}])([,!?:;])`, 'g'), (_m, c, p) => c + (HALF_TO_FULL[p] ?? p))

  // 中文后的句点：仅当其后是空白或结尾时才认为是句号，避免误伤 "文件.md"
  out = out.replace(new RegExp(`([${CJK}])\\.(?=\\s|$)`, 'g'), '$1。')

  // 括号：紧邻中文的半角括号转全角
  out = out.replace(new RegExp(`\\((?=[${CJK}])`, 'g'), '（')
  out = out.replace(new RegExp(`([${CJK}])\\)`, 'g'), '$1）')

  // 重复标点收敛
  out = out.replace(/([，。；：])\1+/g, '$1')

  // 全角标点后不需要空格
  out = out.replace(new RegExp(`([${CJK_PUNCT}]) +`, 'g'), '$1')

  return out
}

/** 按选项组合应用 */
export function applyTypography(
  text: string,
  opts: { autoSpacing: boolean; punctuation: boolean },
): string {
  let out = text
  if (opts.punctuation) out = normalizePunctuation(out)
  if (opts.autoSpacing) out = autoSpace(out)
  return out
}
