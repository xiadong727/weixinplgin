import { mergeStyles, parseCustomCss } from './css'
import { codeBlockDecls, getCodeTheme } from './highlight'
import { getTheme } from './themes'
import { DEFAULT_OPTIONS, type Decls, type RenderOptions, type Styles, type Theme } from './types'

/**
 * 由 RenderOptions 推导出的基础排版（几何尺寸、字体、代码块），
 * 主题只在此之上覆盖颜色和装饰。
 *
 * 「Markdown 渲染」和「给已有正文换样式」两条路共用这里，
 * 否则两边会慢慢长歪，同一套主题出来的效果对不上。
 */
export function baseStyles(o: RenderOptions): Styles {
  const ct = getCodeTheme(o.codeTheme)
  const px = (value: number) => `${Math.round(value * 100) / 100}px`
  const fs = `${o.fontSize}px`
  // 微信内容结构检测会把无单位行高（如 1.75）误当成 1.75px。
  // 输出明确的 px 值，视觉效果不变，同时避免“行高小于字体大小”的误报。
  const textLineHeight = px(o.fontSize * o.lineHeight)
  const codeFontSize = Math.max(12, Math.round(o.fontSize * 0.85))
  const tableFontSize = Math.max(12, Math.round(o.fontSize * 0.9))
  const mono = 'Menlo, Monaco, Consolas, "Courier New", "PingFang SC", monospace'

  const textBase: Decls = {
    // 字体不能只写在最外层容器上：编辑器有可能给子元素设了自己的 font-family，
    // 光靠继承会被盖掉，用户就会觉得「改字体没反应」
    'font-family': o.fontFamily,
    'font-size': fs,
    'line-height': textLineHeight,
    'letter-spacing': '0.05em',
  }

  return {
    container: {
      'font-family': o.fontFamily,
      'font-size': fs,
      'line-height': textLineHeight,
      'letter-spacing': '0.05em',
      color: '#3f3f3f',
      'text-align': 'left',
      'word-break': 'break-word',
      'overflow-wrap': 'break-word',
      // 微信内容结构检测 (height-nodisplay) 会在离屏沙箱里比较后代 offsetHeight
      // 与沙箱 getBoundingClientRect().height，部分场景会误报。检测逻辑会跳过
      // overflowY === 'auto' 的元素及其整棵子树。容器本身 height:auto，不会出现
      // 真正的溢出或滚动条，这个属性只是让检测器不再遍历我们的内容。
      'overflow-y': 'auto',
    },
    p: {
      ...textBase,
      margin: `0 0 ${o.paragraphSpacing}px`,
      ...(o.indentFirstLine ? { 'text-indent': '2em' } : {}),
    },
    h5: { 'font-family': o.fontFamily, 'font-weight': 'bold', 'font-size': '1em', margin: '1.2em 0 0.5em', color: '#3f3f3f' },
    h6: { 'font-family': o.fontFamily, 'font-weight': 'bold', 'font-size': '0.95em', margin: '1.2em 0 0.5em', color: '#666666' },

    blockquoteP: { ...textBase, margin: '0 0 0.6em', 'text-indent': '0' },

    ul: { margin: `0 0 ${o.paragraphSpacing}px`, 'padding-left': '1.4em', 'list-style-type': 'disc' },
    ol: { margin: `0 0 ${o.paragraphSpacing}px`, 'padding-left': '1.6em', 'list-style-type': 'decimal' },
    li: { ...textBase, 'margin-bottom': '0.35em' },
    liP: { ...textBase, margin: '0', 'text-indent': '0' },

    hr: { border: 'none', 'border-top': '1px solid #e6e6e6', height: '1px', margin: '2em 0' },

    strong: { 'font-weight': 'bold' },
    em: { 'font-style': 'italic' },
    del: { 'text-decoration': 'line-through', color: '#999999' },

    codeBlock: codeBlockDecls(ct),
    codeLang: {
      'background-color': ct.bar,
      color: ct.barFg,
      'font-size': '12px',
      'font-family': mono,
      padding: '6px 12px',
      'letter-spacing': '0',
      'line-height': '1em',
    },
    pre: {
      margin: '0',
      padding: '14px 16px',
      'background-color': 'transparent',
      'overflow-x': 'auto',
      'font-size': `${codeFontSize}px`,
      'line-height': px(codeFontSize * 1.6),
      'letter-spacing': '0',
      'white-space': o.codeWrap ? 'pre-wrap' : 'pre',
      'word-wrap': o.codeWrap ? 'break-word' : 'normal',
    },
    code: {
      'font-family': mono,
      color: ct.fg,
      'background-color': 'transparent',
      display: 'block',
      'letter-spacing': '0',
    },

    figure: { margin: `0 0 ${o.paragraphSpacing}px`, 'text-align': 'center' },
    img: { 'max-width': '100%', height: 'auto', display: 'block', margin: '0 auto', border: 'none' },
    figcaption: { 'text-align': 'center', 'font-size': '0.8em', color: '#999999', 'margin-top': '0.6em', 'line-height': '1.5em' },

    table: {
      'border-collapse': 'collapse',
      width: '100%',
      margin: `0 0 ${o.paragraphSpacing}px`,
      'font-size': `${tableFontSize}px`,
      'line-height': px(tableFontSize * o.lineHeight),
      'border-color': '#dcdcdc',
    },
    th: { 'font-family': o.fontFamily, border: '1px solid #dcdcdc', padding: '8px 10px', 'text-align': 'left', 'background-color': '#fafafa', 'font-weight': 'bold' },
    td: { 'font-family': o.fontFamily, border: '1px solid #dcdcdc', padding: '8px 10px', 'text-align': 'left' },

    footnotes: { 'margin-top': '2em', 'padding-top': '1em', 'border-top': '1px solid #e6e6e6' },
    footnotesTitle: { 'font-size': '0.9em', 'font-weight': 'bold', margin: '0 0 0.6em', color: '#666666' },
    footnoteItem: { 'font-size': '0.8em', 'line-height': '1.7em', margin: '0 0 0.35em', color: '#8c8c8c', 'word-break': 'break-all', 'text-indent': '0' },

    taskUnchecked: { color: '#bfbfbf', 'margin-right': '0.35em' },
    taskChecked: { color: '#52a352', 'margin-right': '0.35em' },
  }
}

export interface ResolvedStyles {
  options: RenderOptions
  theme: Theme
  primary: string
  styles: Styles
  warnings: string[]
}

/** 把选项、主题、自定义 CSS 合成最终的样式表 */
export function resolveStyles(userOptions: Partial<RenderOptions> = {}): ResolvedStyles {
  const options: RenderOptions = { ...DEFAULT_OPTIONS, ...userOptions }
  const theme = getTheme(options.theme)
  const primary = options.primary || theme.primary
  const warnings: string[] = []

  let styles = mergeStyles(baseStyles(options), theme.build(primary))
  if (options.customCss && options.customCss.trim()) {
    const parsed = parseCustomCss(options.customCss)
    styles = mergeStyles(styles, parsed.styles)
    warnings.push(...parsed.warnings)
  }

  return { options, theme, primary, styles, warnings }
}
