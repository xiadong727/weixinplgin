/** 一条 CSS 声明集合，最终会被序列化成元素的 style="" */
export type Decls = Record<string, string>

/** 主题里可被样式化的结构位置 */
export type StyleToken =
  | 'container'
  | 'p'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'h1Inner' | 'h2Inner' | 'h3Inner' | 'h4Inner' | 'h5Inner' | 'h6Inner'
  | 'blockquote' | 'blockquoteP'
  | 'ul' | 'ol' | 'li' | 'liP' | 'liMarker'
  | 'hr'
  | 'link' | 'linkRef'
  | 'strong' | 'em' | 'del'
  | 'codespan'
  | 'codeBlock' | 'pre' | 'code' | 'codeLang'
  | 'figure' | 'img' | 'figcaption'
  | 'table' | 'thead' | 'th' | 'td'
  | 'footnotes' | 'footnotesTitle' | 'footnoteItem'
  | 'taskUnchecked' | 'taskChecked'
  | 'raisedCap'

export type Styles = Partial<Record<StyleToken, Decls>>

/**
 * 装饰片段：插到元素内部前后的真实 HTML。
 * 公众号会剥掉 ::before/::after，所以所有装饰都必须是真标签。
 *
 * 支持的占位符：
 *   {{primary}} {{primaryDark}} {{primaryLight}} {{primaryFaint}}  颜色
 *   {{n}}   当前层级标题的序号（1、2、3……）
 *   {{nn}}  两位补零的序号（01、02、03……）
 */
export interface Decor {
  before?: string
  after?: string
}

/** 兼容旧名字 */
export type HeadingDecor = Decor

export interface Theme {
  id: string
  name: string
  /** 主色，可被用户覆盖 */
  primary: string
  /** 主题描述，用于 UI */
  desc: string
  /** 生成样式表；primary 由外部传入以支持换色 */
  build(primary: string): Styles
  /** 主题归类，UI 里按组展示 */
  group: '通用' | '装饰' | '技术' | '杂志' | '文艺' | '商务' | '活泼'
  /** 推荐搭配的代码高亮配色，换主题时自动跟着换 */
  codeTheme: string
  /** 各处的装饰片段 */
  decor?: {
    h1?: Decor
    h2?: Decor
    h3?: Decor
    h4?: Decor
    /** 引用块开头的装饰，比如大引号 */
    blockquote?: Decor
    /** 分隔线纹样：给了就整条替换掉 <hr> */
    hr?: string
  }
  /** 全文第一段的首字放大 */
  raisedCap?: boolean
}

export interface RenderOptions {
  /** 主题 id */
  theme: string
  /** 覆盖主题主色，如 '#0F4C81' */
  primary?: string
  /** 代码高亮主题 id */
  codeTheme: string
  /** 正文字号 px */
  fontSize: number
  /** 正文行高倍数 */
  lineHeight: number
  /** 段落间距 px */
  paragraphSpacing: number
  /** 字体族 */
  fontFamily: string
  /** 中英文之间插入细空格 */
  autoSpacing: boolean
  /** 中文标点规范化（半角转全角等） */
  punctuation: boolean
  /** 段落首行缩进 2 字符 */
  indentFirstLine: boolean
  /** 把站外链接转成文末脚注（公众号正文不支持外链跳转） */
  linksToFootnotes: boolean
  /** 代码块自动换行（关闭则横向滚动） */
  codeWrap: boolean
  /** 代码块显示语言标签 */
  codeLangLabel: boolean
  /** 图片 alt 作为图注展示 */
  imageCaption: boolean
  /** 单个换行也当作换行处理（中文写作里常见的习惯） */
  lineBreaks: boolean
  /** 用户自定义 CSS 覆盖（极简选择器语法） */
  customCss?: string
}

export interface RenderResult {
  /** 可直接粘贴进公众号的 HTML（全内联样式） */
  html: string
  /** 纯文本版本，写剪贴板时作为 text/plain */
  text: string
  /** 被转成脚注的链接 */
  footnotes: { index: number; text: string; href: string }[]
  /** 排版过程中的提示 */
  warnings: string[]
}

export const DEFAULT_OPTIONS: RenderOptions = {
  theme: 'minimal',
  codeTheme: 'github',
  fontSize: 16,
  lineHeight: 1.75,
  paragraphSpacing: 20,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  autoSpacing: true,
  punctuation: false,
  indentFirstLine: false,
  linksToFootnotes: true,
  codeWrap: false,
  codeLangLabel: true,
  imageCaption: true,
  lineBreaks: true,
}
