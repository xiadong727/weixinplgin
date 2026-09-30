import { rgba, shade, tint } from './css'
import type { Decls, Styles, Theme } from './types'

/**
 * 主题只负责「颜色 + 装饰」，字号/行高/字体/段距由 RenderOptions 统一注入，
 * 所以这里的尺寸尽量用 em，跟随正文字号缩放。
 *
 * 公众号后台会过滤掉的东西一律不用：
 *   ::before/::after（改用 decor 里的真实 HTML）
 *   position、负 margin、flex、CSS 变量、渐变、float
 * 能用的只有：border / background-color / padding / margin / border-radius /
 * text-align / display:inline-block / letter-spacing / box-shadow（谨慎）。
 */

/** 标题样式的常用骨架 */
function H(size: string, mt: string, mb: string, extra: Decls = {}): Decls {
  return { 'font-weight': 'bold', 'line-height': '1.4em', 'font-size': size, margin: `${mt} 0 ${mb}`, ...extra }
}

/** 居中一段装饰用的行内块 */
function bar(color: string, w: string, h: string): string {
  return `<span style="display:inline-block;width:${w};height:${h};background-color:${color};vertical-align:middle"></span>`
}

/* ================================================================== */
/* 通用                                                                */
/* ================================================================== */

/** 1. 极简白 —— 克制的细线与留白，什么题材都不出错 */
const minimal: Theme = {
  id: 'minimal',
  name: '极简白',
  group: '通用',
  codeTheme: 'github',
  primary: '#576B95',
  desc: '细竖条标题 + 只有横线的表格，留白舒服，通用性最强',
  build: (p) => ({
    container: { color: '#3c3c3c' },
    h1: H('1.5em', '1.6em', '0.9em', { color: '#1a1a1a', 'text-align': 'center', 'letter-spacing': '0.06em' }),
    h2: H('1.25em', '2em', '0.9em', { color: '#1a1a1a', 'padding-left': '0.62em', 'border-left': `3px solid ${p}` }),
    h3: H('1.1em', '1.6em', '0.7em', { color: '#1a1a1a' }),
    h4: H('1em', '1.3em', '0.6em', { color: '#4a4a4a' }),
    blockquote: { margin: '1.3em 0', padding: '0.85em 1.05em', 'background-color': '#f7f8f9', 'border-left': `3px solid ${tint(p, 0.55)}`, 'border-radius': '2px', color: '#5a5f66' },
    link: { color: p, 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.45)}` },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: '#1a1a1a' },
    codespan: { 'background-color': '#f2f3f5', color: '#c0392b', padding: '0.14em 0.4em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: tint(p, 0.75) },
    hr: { border: 'none', 'border-top': '1px solid #e8e8e8', margin: '2.2em 0', height: '1px' },
    figcaption: { color: '#9aa0a6' },
    // 只留横线的表格比全框线清爽
    table: { 'border-color': '#e8e8e8' },
    th: { border: 'none', 'border-bottom': '2px solid #d8dbe0', 'background-color': 'transparent', color: '#1a1a1a', padding: '9px 6px' },
    td: { border: 'none', 'border-bottom': '1px solid #eeeeee', padding: '9px 6px' },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.4em;font-weight:normal">—</span>' },
  },
}

/** 2. 微信原生 —— 刻意不像模板，接近后台默认观感 */
const native: Theme = {
  id: 'native',
  name: '微信原生',
  group: '通用',
  codeTheme: 'github',
  primary: '#576B95',
  desc: '几乎不加装饰，就是公众号默认的样子，适合不想显得「套模板」的号',
  build: (p) => ({
    container: { color: '#3e3e3e' },
    h1: H('1.4em', '1.5em', '0.8em', { color: '#2b2b2b' }),
    h2: H('1.2em', '1.6em', '0.7em', { color: '#2b2b2b' }),
    h3: H('1.08em', '1.4em', '0.6em', { color: '#2b2b2b' }),
    h4: H('1em', '1.2em', '0.5em', { color: '#4e4e4e' }),
    blockquote: { margin: '1.2em 0', padding: '0 0 0 0.9em', 'border-left': '3px solid #dbdbdb', color: '#888888' },
    link: { color: p, 'text-decoration': 'none' },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: '#2b2b2b' },
    codespan: { 'background-color': '#f4f4f4', color: '#5a5a5a', padding: '0.12em 0.35em', 'border-radius': '2px', 'font-size': '0.9em' },
    hr: { border: 'none', 'border-top': '1px solid #e5e5e5', margin: '1.8em 0', height: '1px' },
    figcaption: { color: '#a0a0a0' },
    th: { 'background-color': '#f7f7f7', color: '#2b2b2b' },
  }),
}

/** 3. 编号序章 —— 大号序号领起每一节，编辑部味道 */
const numbered: Theme = {
  id: 'numbered',
  name: '编号序章',
  group: '通用',
  codeTheme: 'one-light',
  primary: '#C0503A',
  desc: '每节前面一个大号 01 / 02 序号，长文分段感最强',
  build: (p) => ({
    container: { color: '#333333' },
    h1: H('1.5em', '1.4em', '1em', { color: '#171717', 'text-align': 'center', 'letter-spacing': '0.08em' }),
    h2: H('1.26em', '2.5em', '1.05em', { color: '#171717', 'border-bottom': '1px solid #e2e2e2', 'padding-bottom': '0.55em' }),
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.2) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#4a4a4a' }),
    blockquote: { margin: '1.4em 0', padding: '0.2em 0 0.2em 1.1em', 'border-left': `2px solid ${p}`, color: '#5c5c5c' },
    link: { color: shade(p, 0.1), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.1), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.15) },
    codespan: { 'background-color': '#f6f2f1', color: shade(p, 0.2), padding: '0.14em 0.4em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', margin: '2.4em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#9a9a9a' },
    th: { border: 'none', 'border-bottom': `2px solid ${p}`, 'background-color': 'transparent', color: '#171717' },
    td: { border: 'none', 'border-bottom': '1px solid #eeeeee' },
  }),
  decor: {
    h2: {
      before:
        '<span style="display:block;font-size:1.75em;font-weight:bold;color:{{primary}};line-height:1em;margin-bottom:0.3em;letter-spacing:0.02em">{{nn}}</span>',
    },
    hr: `${bar('#e2e2e2', '28px', '1px')}<span style="display:inline-block;margin:0 10px;color:{{primary}};font-size:0.9em;vertical-align:middle">✦</span>${bar('#e2e2e2', '28px', '1px')}`,
  },
}

/* ================================================================== */
/* 技术                                                                */
/* ================================================================== */

/** 4. 科技蓝 —— 色块标题 + 深色代码块 */
const tech: Theme = {
  id: 'tech',
  name: '科技蓝',
  group: '技术',
  codeTheme: 'atom-one-dark',
  primary: '#1E6FD9',
  desc: '色块标题配深色代码块，技术、产品、AI 类长文的稳妥选择',
  build: (p) => ({
    container: { color: '#2c3038' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: shade(p, 0.2) }),
    h2: H('1.2em', '2.1em', '1em', { 'text-align': 'left' }),
    h2Inner: { display: 'inline-block', 'background-color': p, color: '#ffffff', padding: '0.36em 0.95em', 'border-radius': '4px', 'letter-spacing': '0.06em' },
    h3: H('1.08em', '1.7em', '0.7em', { color: shade(p, 0.22), 'padding-left': '0.55em', 'border-left': `3px solid ${p}` }),
    h4: H('1em', '1.3em', '0.6em', { color: '#4a5160' }),
    blockquote: { margin: '1.35em 0', padding: '0.9em 1.1em', 'background-color': tint(p, 0.07), 'border-left': `4px solid ${p}`, 'border-radius': '0 4px 4px 0', color: '#4a5160' },
    link: { color: p, 'text-decoration': 'none', 'font-weight': 'bold' },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.12) },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.28), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    codeBlock: { 'border-radius': '6px', 'box-shadow': '0 2px 10px rgba(30,111,217,0.1)' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': `2px solid ${tint(p, 0.28)}`, margin: '2.2em 0', height: '2px' },
    figcaption: { color: '#8a91a0' },
    table: { 'border-color': tint(p, 0.32) },
    th: { 'background-color': p, color: '#ffffff', 'border-color': tint(p, 0.32) },
    td: { 'border-color': tint(p, 0.32) },
    li: { 'margin-bottom': '0.45em' },
    footnotesTitle: { color: shade(p, 0.18) },
  }),
}

/** 5. 深邃 —— 深色横条标题，像终端里的分节 */
const midnight: Theme = {
  id: 'midnight',
  name: '深邃',
  group: '技术',
  codeTheme: 'github-dark',
  primary: '#4F46E5',
  desc: '深色横条标题 + 紫调强调，配深色代码块很整体，适合硬核技术文',
  build: (p) => ({
    container: { color: '#30343d' },
    h1: H('1.48em', '1.5em', '1em', { 'text-align': 'center', color: '#111827' }),
    h2: H('1.16em', '2.2em', '1em', {
      color: '#ffffff',
      'background-color': '#111827',
      padding: '0.55em 0.95em',
      'border-radius': '4px',
      'border-left': `4px solid ${p}`,
      'letter-spacing': '0.05em',
    }),
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.25) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#4b5563' }),
    blockquote: { margin: '1.35em 0', padding: '0.9em 1.1em', 'background-color': '#f6f6fb', 'border-left': `4px solid ${p}`, 'border-radius': '0 4px 4px 0', color: '#4b5563' },
    link: { color: p, 'text-decoration': 'none', 'font-weight': 'bold' },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: '#111827' },
    codespan: { 'background-color': '#111827', color: '#c7d2fe', padding: '0.16em 0.45em', 'border-radius': '3px', 'font-size': '0.86em' },
    codeBlock: { 'border-radius': '6px' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': '1px solid #d8dae0', margin: '2.2em 0', height: '1px' },
    figcaption: { color: '#9095a1' },
    table: { 'border-color': '#dcdee4' },
    th: { 'background-color': '#111827', color: '#ffffff', 'border-color': '#111827' },
    td: { 'border-color': '#dcdee4' },
    footnotesTitle: { color: '#111827' },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.4em">▸</span>' },
  },
}

/* ================================================================== */
/* 杂志                                                                */
/* ================================================================== */

/** 6. 杂志双线 —— 居中双线标题 + 首字放大 + 拉引言 */
const magazine: Theme = {
  id: 'magazine',
  name: '杂志双线',
  group: '杂志',
  codeTheme: 'solarized-light',
  primary: '#A8762F',
  desc: '居中双线标题、首字放大、居中拉引言，最有纸刊感的一套',
  raisedCap: true,
  build: (p) => ({
    container: { color: '#38332c', 'letter-spacing': '0.07em' },
    h1: H('1.5em', '1.4em', '1.1em', { color: '#241f19', 'text-align': 'center', 'letter-spacing': '0.2em' }),
    h2: H('1.14em', '2.5em', '1.2em', {
      color: '#241f19',
      'text-align': 'center',
      'letter-spacing': '0.24em',
      'border-top': `3px double ${tint(p, 0.55)}`,
      'border-bottom': `1px solid ${tint(p, 0.55)}`,
      padding: '0.6em 0',
    }),
    h3: H('1.05em', '1.8em', '0.7em', { color: shade(p, 0.25), 'letter-spacing': '0.14em' }),
    h4: H('1em', '1.4em', '0.6em', { color: '#5b5348' }),
    // 拉引言：无底色，上下细线，居中
    blockquote: { margin: '1.8em 0', padding: '1em 0.5em', 'border-top': `1px solid ${tint(p, 0.5)}`, 'border-bottom': `1px solid ${tint(p, 0.5)}`, color: shade(p, 0.2), 'text-align': 'center' },
    blockquoteP: { 'font-size': '1.02em', 'line-height': '1.85em', margin: '0', 'letter-spacing': '0.1em' },
    link: { color: shade(p, 0.18), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.18), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.28) },
    em: { 'font-style': 'normal', color: shade(p, 0.15), 'letter-spacing': '0.12em' },
    codespan: { 'background-color': '#f6f1e8', color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '2px', 'font-size': '0.86em', 'letter-spacing': '0' },
    liMarker: { color: tint(p, 0.5) },
    hr: { border: 'none', margin: '2.6em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    raisedCap: { 'font-size': '2.4em', 'font-weight': 'bold', color: p, 'line-height': '1em', 'vertical-align': '-0.16em', 'margin-right': '0.06em', 'letter-spacing': '0' },
    figcaption: { color: '#a89b86', 'letter-spacing': '0.1em' },
    table: { 'border-color': tint(p, 0.5) },
    th: { border: 'none', 'border-top': `1px solid ${tint(p, 0.45)}`, 'border-bottom': `1px solid ${tint(p, 0.45)}`, 'background-color': 'transparent', color: shade(p, 0.3), 'letter-spacing': '0.08em' },
    td: { border: 'none', 'border-bottom': `1px solid ${tint(p, 0.7)}` },
    footnotesTitle: { color: shade(p, 0.25), 'letter-spacing': '0.14em' },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.5em;font-weight:normal">❖</span>' },
    hr: `<span style="color:{{primary}};font-size:0.95em;letter-spacing:0.6em">❖ ❖ ❖</span>`,
  },
}

/** 7. 暖阳橙 —— 米色底 + 居中细线标题 */
const warm: Theme = {
  id: 'warm',
  name: '暖阳橙',
  group: '杂志',
  codeTheme: 'solarized-light',
  primary: '#E08B3C',
  desc: '米色引用块配居中细线标题，生活、观点、随笔都很搭',
  build: (p) => ({
    container: { color: '#3d3733' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: '#2b2521', 'letter-spacing': '0.1em' }),
    h2: H('1.2em', '2.3em', '1.1em', { 'text-align': 'center', color: '#2b2521', 'border-top': `1px solid ${tint(p, 0.5)}`, 'border-bottom': `1px solid ${tint(p, 0.5)}`, padding: '0.55em 0', 'letter-spacing': '0.1em' }),
    h3: H('1.08em', '1.8em', '0.7em', { color: shade(p, 0.28) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5c534c' }),
    blockquote: { margin: '1.45em 0', padding: '1em 1.2em', 'background-color': '#fdf7f0', 'border-left': `4px solid ${p}`, color: '#6b6058' },
    link: { color: shade(p, 0.18), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.18), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.24), 'background-color': rgba(p, 0.13), padding: '0 0.16em', 'border-radius': '2px' },
    codespan: { 'background-color': '#f6efe7', color: '#a05a1e', padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': `1px dashed ${tint(p, 0.55)}`, margin: '2.3em 0', height: '1px' },
    figcaption: { color: '#a89c92' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.4)}`, 'background-color': '#fdf7f0', color: shade(p, 0.32) },
    td: { border: 'none', 'border-bottom': '1px solid #f0e8de' },
    footnotesTitle: { color: shade(p, 0.24) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.4em">◆</span>' },
    blockquote: { before: '<span style="display:block;font-size:1.5em;line-height:1em;color:{{primaryLight}};margin-bottom:0.1em">“</span>' },
  },
}

/* ================================================================== */
/* 文艺                                                                */
/* ================================================================== */

/** 8. 墨韵 —— 墨绿双线，中文书刊的节奏 */
const ink: Theme = {
  id: 'ink',
  name: '墨韵',
  group: '文艺',
  codeTheme: 'solarized-light',
  primary: '#3F6B52',
  desc: '墨绿双线标题配大引号，随笔、书评、连载长文很合',
  build: (p) => ({
    container: { color: '#33383a' },
    h1: H('1.45em', '1.5em', '1em', { 'text-align': 'center', color: '#22282a', 'letter-spacing': '0.12em' }),
    h2: H('1.18em', '2.1em', '1em', { color: shade(p, 0.18), 'border-bottom': `3px double ${tint(p, 0.6)}`, 'padding-bottom': '0.38em' }),
    h3: H('1.05em', '1.7em', '0.7em', { color: shade(p, 0.22) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#4c5254' }),
    blockquote: { margin: '1.45em 0', padding: '0.9em 1.1em', 'background-color': '#f5f8f6', 'border-left': `3px solid ${p}`, color: '#5b6360' },
    link: { color: shade(p, 0.12), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.45)}` },
    linkRef: { color: shade(p, 0.12), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.18) },
    em: { 'font-style': 'normal', color: shade(p, 0.12), 'border-bottom': `1px dotted ${tint(p, 0.6)}` },
    codespan: { 'background-color': '#eef2ef', color: '#2f5a44', padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', margin: '2.4em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#9aa3a0' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.45)}`, 'background-color': '#f2f6f3', color: shade(p, 0.28) },
    td: { border: 'none', 'border-bottom': '1px solid #e8eee9' },
    footnotesTitle: { color: shade(p, 0.18) },
  }),
  decor: {
    h2: { before: '<span style="color:{{primary}};margin-right:0.42em;font-weight:normal">§</span>' },
    blockquote: { before: '<span style="display:block;font-size:1.6em;line-height:1em;color:{{primaryLight}};margin-bottom:0.05em">“</span>' },
    hr: `<span style="color:{{primaryLight}};letter-spacing:0.7em;font-size:1.1em">· · ·</span>`,
  },
}

/** 9. 禅意 —— 细体、大留白、几乎没有色彩 */
const zen: Theme = {
  id: 'zen',
  name: '禅意',
  group: '文艺',
  codeTheme: 'one-light',
  primary: '#8C8C8C',
  desc: '细体标题、极细线、大量留白，安静的长文和诗歌散文',
  build: (p) => ({
    container: { color: '#4a4a4a', 'letter-spacing': '0.1em' },
    h1: { 'font-weight': 'normal', 'line-height': '1.5em', 'font-size': '1.4em', margin: '1.8em 0 1.3em', color: '#2e2e2e', 'text-align': 'center', 'letter-spacing': '0.3em' },
    h2: { 'font-weight': 'normal', 'line-height': '1.5em', 'font-size': '1.12em', margin: '2.8em 0 1.3em', color: '#2e2e2e', 'text-align': 'center', 'letter-spacing': '0.24em' },
    h2Inner: { display: 'inline-block', 'border-bottom': `1px solid ${tint(p, 0.7)}`, 'padding-bottom': '0.5em' },
    h3: { 'font-weight': 'normal', 'line-height': '1.5em', 'font-size': '1.02em', margin: '2em 0 0.8em', color: '#5a5a5a', 'letter-spacing': '0.18em' },
    h4: { 'font-weight': 'normal', 'font-size': '1em', margin: '1.5em 0 0.6em', color: '#6e6e6e', 'letter-spacing': '0.16em' },
    blockquote: { margin: '2em 0', padding: '0 0 0 1.4em', 'border-left': '1px solid #dcdcdc', color: '#7a7a7a' },
    blockquoteP: { 'line-height': '2em', margin: '0 0 0.7em', 'letter-spacing': '0.12em' },
    link: { color: '#5a5a5a', 'text-decoration': 'none', 'border-bottom': '1px solid #d4d4d4' },
    linkRef: { color: '#8c8c8c', 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: '#2e2e2e' },
    em: { 'font-style': 'normal', color: '#2e2e2e', 'letter-spacing': '0.16em' },
    codespan: { 'background-color': '#f5f5f5', color: '#5a5a5a', padding: '0.14em 0.4em', 'border-radius': '2px', 'font-size': '0.86em', 'letter-spacing': '0' },
    liMarker: { color: '#c4c4c4' },
    hr: { border: 'none', margin: '3em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#b0b0b0', 'letter-spacing': '0.14em' },
    table: { 'border-color': '#e8e8e8' },
    th: { border: 'none', 'border-bottom': '1px solid #d4d4d4', 'background-color': 'transparent', color: '#2e2e2e', 'font-weight': 'normal', 'letter-spacing': '0.12em' },
    td: { border: 'none', 'border-bottom': '1px solid #f0f0f0' },
    footnotesTitle: { color: '#6e6e6e', 'font-weight': 'normal', 'letter-spacing': '0.16em' },
  }),
  decor: {
    hr: `<span style="color:#c8c8c8;font-size:1.1em">❋</span>`,
  },
}

/* ================================================================== */
/* 商务                                                                */
/* ================================================================== */

/** 10. 商务蓝 —— 编号 + 粗底线，汇报和研报的调子 */
const business: Theme = {
  id: 'business',
  name: '商务蓝',
  group: '商务',
  codeTheme: 'github',
  primary: '#1F4E79',
  desc: '编号标题 + 深底表头，适合行业分析、汇报、政策解读',
  build: (p) => ({
    container: { color: '#2f3336' },
    h1: H('1.45em', '1.4em', '1em', { color: '#14293d', 'text-align': 'center', 'letter-spacing': '0.06em' }),
    h2: H('1.18em', '2.1em', '0.95em', { color: '#14293d', 'border-bottom': `2px solid ${p}`, 'padding-bottom': '0.42em' }),
    h3: H('1.06em', '1.6em', '0.65em', { color: p, 'padding-left': '0.55em', 'border-left': `3px solid ${tint(p, 0.5)}` }),
    h4: H('1em', '1.3em', '0.55em', { color: '#4a4f54' }),
    blockquote: { margin: '1.3em 0', padding: '0.85em 1.05em', 'background-color': tint(p, 0.055), 'border-left': `4px solid ${p}`, color: '#4a4f54' },
    link: { color: p, 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.15) },
    codespan: { 'background-color': tint(p, 0.09), color: shade(p, 0.15), padding: '0.14em 0.4em', 'border-radius': '2px', 'font-size': '0.88em' },
    liMarker: { color: tint(p, 0.5) },
    hr: { border: 'none', 'border-top': `1px solid ${tint(p, 0.7)}`, margin: '2.2em 0', height: '1px' },
    figcaption: { color: '#8f959b' },
    table: { 'border-color': tint(p, 0.6) },
    th: { 'background-color': p, color: '#ffffff', 'border-color': p, 'letter-spacing': '0.04em' },
    td: { 'border-color': tint(p, 0.6) },
    footnotesTitle: { color: p },
  }),
  decor: {
    h2: { before: '<span style="color:{{primary}};margin-right:0.5em;font-weight:bold">{{nn}}</span>' },
  },
}

/** 11. 学术 —— 零彩色干扰，层级靠编号和线 */
const academic: Theme = {
  id: 'academic',
  name: '学术',
  group: '商务',
  codeTheme: 'github',
  primary: '#404040',
  desc: '纯黑白灰配自动编号，论文解读、研报、说明性长文',
  build: () => ({
    container: { color: '#262626' },
    h1: H('1.42em', '1.4em', '1em', { color: '#111111', 'text-align': 'center' }),
    h2: H('1.14em', '2em', '0.9em', { color: '#111111', 'border-bottom': '2px solid #111111', 'padding-bottom': '0.32em' }),
    h3: H('1.05em', '1.6em', '0.6em', { color: '#1f1f1f' }),
    h4: H('1em', '1.25em', '0.5em', { color: '#3d3d3d' }),
    blockquote: { margin: '1.25em 0', padding: '0.7em 1em', 'background-color': '#f5f5f5', 'border-left': '3px solid #8c8c8c', color: '#4d4d4d', 'font-size': '0.96em' },
    link: { color: '#1a1a1a', 'text-decoration': 'underline' },
    linkRef: { color: '#1a1a1a', 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: '#000000' },
    codespan: { 'background-color': '#f0f0f0', color: '#1a1a1a', padding: '0.14em 0.4em', 'border-radius': '2px', 'font-size': '0.88em' },
    liMarker: { color: '#8c8c8c' },
    hr: { border: 'none', 'border-top': '1px solid #bfbfbf', margin: '2.1em 0', height: '1px' },
    figcaption: { color: '#737373' },
    table: { 'border-color': '#8c8c8c' },
    th: { 'background-color': '#f0f0f0', color: '#111111', 'border-color': '#8c8c8c' },
    td: { 'border-color': '#bfbfbf' },
    footnotesTitle: { color: '#333333' },
  }),
  decor: {
    h2: { before: '<span style="margin-right:0.45em;color:#595959">{{n}}.</span>' },
    h3: { before: '<span style="margin-right:0.4em;color:#737373">◦</span>' },
  },
}

/* ================================================================== */
/* 活泼                                                                */
/* ================================================================== */

/** 12. 荧光笔 —— 标题像被马克笔涂过 */
const marker: Theme = {
  id: 'marker',
  name: '荧光笔',
  group: '活泼',
  codeTheme: 'one-light',
  primary: '#E8543F',
  desc: '标题和重点像被马克笔涂过，轻松、口语化的内容很合适',
  build: (p) => ({
    container: { color: '#39332f' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: '#221c19' }),
    h2: H('1.2em', '2em', '1em', {}),
    h2Inner: { display: 'inline', 'background-color': tint(p, 0.34), color: shade(p, 0.42), padding: '0.12em 0.34em', 'border-radius': '3px', 'box-decoration-break': 'clone' },
    h3: H('1.08em', '1.7em', '0.7em', { color: shade(p, 0.2) }),
    h3Inner: { display: 'inline', 'border-bottom': `5px solid ${tint(p, 0.42)}`, 'padding-bottom': '0.06em' },
    h4: H('1em', '1.3em', '0.6em', { color: '#5c534f' }),
    blockquote: { margin: '1.35em 0', padding: '0.9em 1.1em', 'background-color': tint(p, 0.08), 'border-left': `4px solid ${tint(p, 0.55)}`, 'border-radius': '4px', color: '#6b605b' },
    link: { color: shade(p, 0.15), 'text-decoration': 'none', 'border-bottom': `2px solid ${tint(p, 0.45)}` },
    linkRef: { color: shade(p, 0.15), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.3), 'background-color': tint(p, 0.22), padding: '0 0.18em', 'border-radius': '2px' },
    codespan: { 'background-color': tint(p, 0.12), color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: tint(p, 0.4) },
    hr: { border: 'none', 'border-top': `3px solid ${tint(p, 0.35)}`, margin: '2.2em 0', height: '3px' },
    figcaption: { color: '#a89a94' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.4)}`, 'background-color': tint(p, 0.09), color: shade(p, 0.32) },
    td: { border: 'none', 'border-bottom': '1px solid #f1e7e4' },
    footnotesTitle: { color: shade(p, 0.2) },
  }),
}

/** 13. 克莱因蓝 —— 大色块，设计感最强 */
const klein: Theme = {
  id: 'klein',
  name: '克莱因蓝',
  group: '活泼',
  codeTheme: 'nord',
  primary: '#002FA7',
  desc: '整条蓝色块标题 + 极简正文，视觉冲击最强的一套',
  build: (p) => ({
    container: { color: '#2b2b2b' },
    h1: H('1.55em', '1.4em', '1.1em', { 'text-align': 'center', color: p, 'letter-spacing': '0.06em' }),
    h2: H('1.14em', '2.3em', '1.1em', { 'background-color': p, color: '#ffffff', padding: '0.6em 0.9em', 'letter-spacing': '0.1em' }),
    h3: H('1.08em', '1.8em', '0.7em', { color: p }),
    h4: H('1em', '1.3em', '0.6em', { color: '#4a4a4a' }),
    blockquote: { margin: '1.5em 0', padding: '0.2em 0 0.2em 1.2em', 'border-left': `4px solid ${p}`, color: '#55555f' },
    link: { color: p, 'text-decoration': 'none', 'font-weight': 'bold' },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: p },
    codespan: { 'background-color': tint(p, 0.08), color: p, padding: '0.14em 0.42em', 'border-radius': '2px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', margin: '2.5em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#9a9aa4' },
    table: { 'border-color': tint(p, 0.75) },
    th: { 'background-color': p, color: '#ffffff', 'border-color': p, 'letter-spacing': '0.06em' },
    td: { 'border-color': tint(p, 0.75) },
    footnotesTitle: { color: p },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.42em;font-size:0.8em">■</span>' },
    hr: bar('#002FA7', '56px', '4px'),
  },
}

/** 14. 手账 —— 虚线圆角，像贴纸和便签 */
const journal: Theme = {
  id: 'journal',
  name: '手账',
  group: '活泼',
  codeTheme: 'one-light',
  primary: '#3F9E9C',
  desc: '虚线框和圆角便签，教程、清单、日常记录看着轻快',
  build: (p) => ({
    container: { color: '#3a4142' },
    h1: H('1.48em', '1.5em', '1em', { 'text-align': 'center', color: shade(p, 0.32) }),
    h2: H('1.14em', '2.1em', '1.05em', { 'text-align': 'left' }),
    h2Inner: { display: 'inline-block', border: `1px dashed ${p}`, color: shade(p, 0.3), padding: '0.35em 0.9em', 'border-radius': '6px', 'background-color': tint(p, 0.06) },
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.25) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#57605f' }),
    blockquote: { margin: '1.4em 0', padding: '0.9em 1.1em', border: `1px dashed ${tint(p, 0.55)}`, 'border-radius': '8px', 'background-color': tint(p, 0.05), color: '#5e6867' },
    link: { color: shade(p, 0.2), 'text-decoration': 'none', 'border-bottom': `1px dashed ${tint(p, 0.45)}` },
    linkRef: { color: shade(p, 0.2), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.28) },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.32), padding: '0.14em 0.42em', 'border-radius': '4px', 'font-size': '0.88em' },
    codeBlock: { 'border-radius': '8px' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': `1px dashed ${tint(p, 0.5)}`, margin: '2.3em 0', height: '1px' },
    img: { 'border-radius': '8px' },
    figcaption: { color: '#93a09f' },
    table: { 'border-color': tint(p, 0.5) },
    th: { 'background-color': tint(p, 0.12), color: shade(p, 0.3), 'border-color': tint(p, 0.5) },
    td: { 'border-color': tint(p, 0.5) },
    li: { 'margin-bottom': '0.45em' },
    footnotesTitle: { color: shade(p, 0.25) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.4em">✎</span>' },
  },
}

/** 15. 樱粉 —— 圆角胶囊标题，柔和底色 */
const rose: Theme = {
  id: 'rose',
  name: '樱粉',
  group: '活泼',
  codeTheme: 'dracula',
  primary: '#D9536F',
  desc: '圆角胶囊标题配柔和底色，个人号、生活、种草类内容',
  build: (p) => ({
    container: { color: '#413538' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: shade(p, 0.22) }),
    h2: H('1.18em', '2.1em', '1.05em', { 'text-align': 'center' }),
    h2Inner: { display: 'inline-block', 'background-color': tint(p, 0.16), color: shade(p, 0.22), padding: '0.42em 1.15em', 'border-radius': '999px' },
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.16) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#6b585c' }),
    blockquote: { margin: '1.35em 0', padding: '0.9em 1.1em', 'background-color': tint(p, 0.08), 'border-left': `4px solid ${tint(p, 0.7)}`, 'border-radius': '8px', color: '#6b585c' },
    link: { color: shade(p, 0.12), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.12), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.18) },
    codespan: { 'background-color': tint(p, 0.12), color: shade(p, 0.28), padding: '0.14em 0.42em', 'border-radius': '4px', 'font-size': '0.88em' },
    codeBlock: { 'border-radius': '8px' },
    liMarker: { color: tint(p, 0.6) },
    hr: { border: 'none', margin: '2.4em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    img: { 'border-radius': '8px' },
    figcaption: { color: '#b09aa0' },
    table: { 'border-color': tint(p, 0.35) },
    th: { 'background-color': tint(p, 0.12), color: shade(p, 0.22), 'border-color': tint(p, 0.35) },
    td: { 'border-color': tint(p, 0.35) },
    footnotesTitle: { color: shade(p, 0.18) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.4em">❋</span>' },
    hr: `<span style="color:{{primaryLight}};letter-spacing:0.5em;font-size:0.95em">❤ ❤ ❤</span>`,
  },
}


/* ================================================================== */
/* 装饰型（徽章、色块、卡片这类「一看就套了模板」的样式）              */
/* ================================================================== */

/** 16. 徽章序号 —— 圆形数字徽章领起每节 */
const badge: Theme = {
  id: 'badge',
  name: '徽章序号',
  group: '装饰',
  codeTheme: 'one-light',
  primary: '#E2603C',
  desc: '圆形数字徽章 + 延伸细线，清单体、教程、盘点类最适合',
  build: (p) => ({
    container: { color: '#37332f' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: shade(p, 0.3) }),
    h2: H('1.15em', '2.2em', '1em', { color: '#211d1a', 'border-bottom': `2px solid ${tint(p, 0.75)}`, 'padding-bottom': '0.45em' }),
    h3: H('1.05em', '1.7em', '0.7em', { color: shade(p, 0.18) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5a534d' }),
    blockquote: { margin: '1.4em 0', padding: '0.9em 1.1em', 'background-color': tint(p, 0.07), 'border-radius': '6px', 'border-left': `4px solid ${p}`, color: '#615a54' },
    link: { color: shade(p, 0.15), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.15), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.22) },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', margin: '2.3em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#a39a92' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.45)}`, 'background-color': tint(p, 0.07), color: shade(p, 0.28) },
    td: { border: 'none', 'border-bottom': '1px solid #f0ebe7' },
    footnotesTitle: { color: shade(p, 0.2) },
  }),
  decor: {
    h2: {
      before:
        '<span style="display:inline-block;width:1.75em;height:1.75em;line-height:1.75em;text-align:center;border-radius:50%;background-color:{{primary}};color:#ffffff;font-size:0.82em;font-weight:bold;letter-spacing:0;margin-right:0.5em;vertical-align:0.06em">{{nn}}</span>',
    },
    h3: { before: '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:{{primary}};margin-right:0.5em;vertical-align:0.28em"></span>' },
    hr: `${bar('#e6e0da', '30px', '1px')}<span style="display:inline-block;margin:0 10px;color:{{primary}};vertical-align:middle">✦</span>${bar('#e6e0da', '30px', '1px')}`,
  },
}

/** 17. 双色块 —— 浅色横幅上压一枚深色标签 */
const duotone: Theme = {
  id: 'duotone',
  name: '双色块',
  group: '装饰',
  codeTheme: 'github',
  primary: '#2C5F8D',
  desc: '浅色横幅上压一枚深色标签，层次感强，适合栏目化的连载',
  build: (p) => ({
    container: { color: '#2f3439' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: shade(p, 0.25) }),
    h2: {
      ...H('1.12em', '2.2em', '1.05em', {}),
      'background-color': tint(p, 0.1),
      padding: '0.5em 0.6em',
      'border-radius': '4px',
    },
    h2Inner: { display: 'inline-block', 'background-color': p, color: '#ffffff', padding: '0.28em 0.75em', 'border-radius': '3px', 'letter-spacing': '0.06em' },
    h3: H('1.05em', '1.7em', '0.7em', { color: shade(p, 0.2), 'padding-left': '0.5em', 'border-left': `3px solid ${tint(p, 0.4)}` }),
    h4: H('1em', '1.3em', '0.6em', { color: '#525a61' }),
    blockquote: { margin: '1.35em 0', padding: '0.9em 1.1em', 'background-color': '#f7f9fb', 'border-left': `4px solid ${tint(p, 0.45)}`, color: '#566069' },
    link: { color: p, 'text-decoration': 'none', 'font-weight': 'bold' },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.2) },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.25), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: tint(p, 0.45) },
    hr: { border: 'none', 'border-top': `2px solid ${tint(p, 0.3)}`, margin: '2.2em 0', height: '2px' },
    figcaption: { color: '#939ba3' },
    table: { 'border-color': tint(p, 0.4) },
    th: { 'background-color': p, color: '#ffffff', 'border-color': p },
    td: { 'border-color': tint(p, 0.4) },
    footnotesTitle: { color: shade(p, 0.2) },
  }),
}

/** 18. 卡片 —— 引用做成带投影的白卡片 */
const card: Theme = {
  id: 'card',
  name: '卡片',
  group: '装饰',
  codeTheme: 'one-light',
  primary: '#3B7A64',
  desc: '引用是带投影的白卡片，标题压在浅色横幅上，干净有层次',
  build: (p) => ({
    container: { color: '#33393a' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: shade(p, 0.3) }),
    h2: {
      ...H('1.14em', '2.2em', '1.05em', {}),
      color: shade(p, 0.28),
      'background-color': tint(p, 0.09),
      'border-left': `5px solid ${p}`,
      padding: '0.55em 0.85em',
      'border-radius': '0 4px 4px 0',
    },
    h3: H('1.05em', '1.7em', '0.7em', { color: shade(p, 0.2) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#545b5c' }),
    blockquote: {
      margin: '1.5em 0',
      padding: '1em 1.15em',
      'background-color': '#ffffff',
      border: '1px solid #eceeef',
      'border-radius': '10px',
      'box-shadow': '0 2px 10px rgba(0,0,0,0.06)',
      color: '#5b6364',
    },
    link: { color: shade(p, 0.12), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.45)}` },
    linkRef: { color: shade(p, 0.12), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.22) },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    codeBlock: { 'border-radius': '10px', 'box-shadow': '0 2px 10px rgba(0,0,0,0.06)' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': '1px solid #e8eae9', margin: '2.2em 0', height: '1px' },
    img: { 'border-radius': '8px' },
    figcaption: { color: '#9aa3a2' },
    table: { 'border-color': '#e4e8e6' },
    th: { 'background-color': tint(p, 0.09), color: shade(p, 0.3), 'border-color': '#e4e8e6' },
    td: { 'border-color': '#e4e8e6' },
    footnotesTitle: { color: shade(p, 0.22) },
  }),
  decor: {
    blockquote: { before: '<span style="display:block;font-size:1.5em;line-height:1em;color:{{primaryLight}};margin-bottom:0.1em">“</span>' },
  },
}

/** 19. 标签页 —— 圆角标签式标题，像栏目名 */
const tag: Theme = {
  id: 'tag',
  name: '标签页',
  group: '装饰',
  codeTheme: 'dracula',
  primary: '#C2405A',
  desc: '右侧收圆的标签式标题，像栏目名，适合有固定板块的号',
  build: (p) => ({
    container: { color: '#3a3236' },
    h1: H('1.5em', '1.5em', '1em', { 'text-align': 'center', color: shade(p, 0.28) }),
    h2: H('1.12em', '2.2em', '1.05em', { 'border-bottom': `1px solid ${tint(p, 0.7)}`, 'padding-bottom': '0.5em' }),
    h2Inner: {
      display: 'inline-block',
      'background-color': p,
      color: '#ffffff',
      padding: '0.34em 1.1em 0.34em 0.85em',
      'border-radius': '0 999px 999px 0',
      'border-left': `4px solid ${shade(p, 0.3)}`,
      'letter-spacing': '0.06em',
    },
    h3: H('1.05em', '1.7em', '0.7em', { color: shade(p, 0.18) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5d5257' }),
    blockquote: { margin: '1.4em 0', padding: '0.9em 1.1em', 'background-color': tint(p, 0.07), 'border-radius': '6px', color: '#645a5e' },
    link: { color: shade(p, 0.14), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.14), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.2), 'background-color': tint(p, 0.14), padding: '0 0.16em', 'border-radius': '2px' },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.28), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    codeBlock: { 'border-radius': '8px' },
    liMarker: { color: tint(p, 0.5) },
    hr: { border: 'none', margin: '2.3em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#ab9ba1' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.5)}`, 'background-color': tint(p, 0.08), color: shade(p, 0.26) },
    td: { border: 'none', 'border-bottom': '1px solid #f2eaec' },
    footnotesTitle: { color: shade(p, 0.2) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.42em">#</span>' },
    hr: `<span style="color:{{primaryLight}};letter-spacing:0.45em;font-size:0.9em">✿ ✿ ✿</span>`,
  },
}

/** 20. 线框 —— 描边标题配引号角标，克制但有设计感 */
const outline: Theme = {
  id: 'outline',
  name: '线框',
  group: '装饰',
  codeTheme: 'solarized-light',
  primary: '#8A6E4B',
  desc: '描边标题配「」角标，克制但一眼看得出是排过版的',
  build: (p) => ({
    container: { color: '#3b3733' },
    h1: H('1.48em', '1.5em', '1.05em', { 'text-align': 'center', color: shade(p, 0.3), 'letter-spacing': '0.14em' }),
    h2: H('1.1em', '2.3em', '1.1em', { 'text-align': 'center' }),
    h2Inner: {
      display: 'inline-block',
      border: `1px solid ${p}`,
      color: shade(p, 0.25),
      padding: '0.4em 1.1em',
      'border-radius': '2px',
      'letter-spacing': '0.16em',
    },
    h3: H('1.04em', '1.8em', '0.7em', { color: shade(p, 0.2), 'letter-spacing': '0.08em' }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5e574f' }),
    blockquote: { margin: '1.5em 0', padding: '1em 1.15em', border: `1px solid ${tint(p, 0.6)}`, 'background-color': '#fdfbf8', color: '#6a625a' },
    link: { color: shade(p, 0.18), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.18), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.28) },
    codespan: { 'background-color': '#f5f1ea', color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '2px', 'font-size': '0.88em' },
    liMarker: { color: tint(p, 0.45) },
    hr: { border: 'none', margin: '2.4em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#a89c8c', 'letter-spacing': '0.08em' },
    table: { 'border-color': tint(p, 0.55) },
    th: { 'background-color': '#faf7f2', color: shade(p, 0.3), 'border-color': tint(p, 0.55) },
    td: { 'border-color': tint(p, 0.65) },
    footnotesTitle: { color: shade(p, 0.25) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.3em;font-weight:normal">「</span>', after: '<span style="color:{{primary}};margin-left:0.3em;font-weight:normal">」</span>' },
    hr: `${bar('#ddd3c4', '24px', '1px')}<span style="display:inline-block;margin:0 9px;color:{{primary}};font-size:0.85em;vertical-align:middle">◆</span>${bar('#ddd3c4', '24px', '1px')}`,
  },
}

/** 21. 信笺 —— 米色纸张感，整段引用像便签 */
const letter: Theme = {
  id: 'letter',
  name: '信笺',
  group: '装饰',
  codeTheme: 'solarized-light',
  primary: '#A8794A',
  desc: '米色纸张感配便签式引用，书信体、年终总结、personal 向长文',
  raisedCap: true,
  build: (p) => ({
    container: { color: '#403830', 'letter-spacing': '0.06em' },
    h1: H('1.48em', '1.5em', '1.1em', { 'text-align': 'center', color: shade(p, 0.35), 'letter-spacing': '0.16em' }),
    h2: H('1.12em', '2.3em', '1.1em', { 'text-align': 'center', color: shade(p, 0.3), 'letter-spacing': '0.12em' }),
    h2Inner: { display: 'inline-block', 'border-bottom': `2px solid ${tint(p, 0.5)}`, 'padding-bottom': '0.4em' },
    h3: H('1.04em', '1.8em', '0.7em', { color: shade(p, 0.24) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#61574c' }),
    blockquote: { margin: '1.5em 0', padding: '1em 1.15em', 'background-color': '#fbf6ec', border: `1px dashed ${tint(p, 0.55)}`, 'border-radius': '4px', color: '#6d6255' },
    link: { color: shade(p, 0.2), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.2), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.3) },
    em: { 'font-style': 'normal', color: shade(p, 0.2), 'border-bottom': `1px dotted ${tint(p, 0.55)}` },
    codespan: { 'background-color': '#f6efe3', color: shade(p, 0.32), padding: '0.14em 0.42em', 'border-radius': '2px', 'font-size': '0.88em', 'letter-spacing': '0' },
    raisedCap: { 'font-size': '2.3em', 'font-weight': 'bold', color: p, 'line-height': '1em', 'vertical-align': '-0.15em', 'margin-right': '0.06em', 'letter-spacing': '0' },
    liMarker: { color: tint(p, 0.45) },
    hr: { border: 'none', margin: '2.5em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#a8998a', 'letter-spacing': '0.08em' },
    table: { 'border-color': tint(p, 0.55) },
    th: { border: 'none', 'border-top': `1px solid ${tint(p, 0.5)}`, 'border-bottom': `1px solid ${tint(p, 0.5)}`, 'background-color': 'transparent', color: shade(p, 0.3) },
    td: { border: 'none', 'border-bottom': `1px solid ${tint(p, 0.72)}` },
    footnotesTitle: { color: shade(p, 0.28) },
  }),
  decor: {
    hr: `<span style="color:{{primaryLight}};letter-spacing:0.5em;font-size:0.95em">✒ ✒ ✒</span>`,
  },
}


/** 22. 对称线 —— 标题两侧对称的短线与菱形 */
const symmetry: Theme = {
  id: 'symmetry',
  name: '对称线',
  group: '装饰',
  codeTheme: 'one-light',
  primary: '#B8873B',
  desc: '标题两侧对称的短线配菱形，端正好看，通用型的装饰款',
  build: (p) => ({
    container: { color: '#3b3731' },
    h1: H('1.5em', '1.5em', '1.05em', { 'text-align': 'center', color: shade(p, 0.32), 'letter-spacing': '0.14em' }),
    h2: H('1.12em', '2.3em', '1.15em', { 'text-align': 'center', color: shade(p, 0.28), 'letter-spacing': '0.16em' }),
    h3: H('1.04em', '1.8em', '0.7em', { color: shade(p, 0.22), 'letter-spacing': '0.06em' }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5e574d' }),
    blockquote: { margin: '1.5em 0', padding: '0.95em 1.15em', 'background-color': '#fbf8f2', 'border-top': `1px solid ${tint(p, 0.55)}`, 'border-bottom': `1px solid ${tint(p, 0.55)}`, color: '#6b6357' },
    link: { color: shade(p, 0.2), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.2), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.3) },
    codespan: { 'background-color': '#f6f1e7', color: shade(p, 0.32), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: tint(p, 0.45) },
    hr: { border: 'none', margin: '2.4em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#a89a84' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.45)}`, 'background-color': '#fbf8f2', color: shade(p, 0.3) },
    td: { border: 'none', 'border-bottom': '1px solid #f0e9dd' },
    footnotesTitle: { color: shade(p, 0.28) },
  }),
  decor: {
    h2: {
      before: `${bar('{{primaryLight}}', '22px', '1px')}<span style="display:inline-block;margin:0 0.5em;color:{{primary}};font-size:0.7em;vertical-align:middle">◆</span>`,
      after: `<span style="display:inline-block;margin:0 0.5em;color:{{primary}};font-size:0.7em;vertical-align:middle">◆</span>${bar('{{primaryLight}}', '22px', '1px')}`,
    },
    hr: `${bar('{{primaryLight}}', '26px', '1px')}<span style="display:inline-block;margin:0 10px;color:{{primary}};vertical-align:middle">◆</span>${bar('{{primaryLight}}', '26px', '1px')}`,
  },
}

/** 23. 半宽底线 —— 标题下一条短粗色条 */
const underline: Theme = {
  id: 'underline',
  name: '半宽底线',
  group: '装饰',
  codeTheme: 'github',
  primary: '#D1495B',
  desc: '标题下方一条短粗色条，克制又有重量感，观点类长文很合适',
  build: (p) => ({
    container: { color: '#332e2f' },
    h1: H('1.5em', '1.5em', '1.05em', { 'text-align': 'center', color: '#1f1b1c' }),
    h2: H('1.2em', '2.2em', '1em', { color: '#1f1b1c' }),
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.2) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5b5254' }),
    blockquote: { margin: '1.4em 0', padding: '0.2em 0 0.2em 1.15em', 'border-left': `3px solid ${p}`, color: '#5e5557' },
    link: { color: shade(p, 0.15), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.15), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.2) },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': '1px solid #ebe5e6', margin: '2.2em 0', height: '1px' },
    figcaption: { color: '#a39799' },
    th: { border: 'none', 'border-bottom': `2px solid ${p}`, 'background-color': 'transparent', color: '#1f1b1c' },
    td: { border: 'none', 'border-bottom': '1px solid #efe9ea' },
    footnotesTitle: { color: shade(p, 0.2) },
  }),
  decor: {
    // display:block 的装饰会自成一行，正好落在标题下方
    h2: { after: '<span style="display:block;width:46px;height:4px;background-color:{{primary}};margin-top:0.45em;border-radius:2px"></span>' },
    h3: { after: '<span style="display:block;width:26px;height:2px;background-color:{{primaryLight}};margin-top:0.35em"></span>' },
  },
}

/** 24. 方括号 —— 【标题】的港台杂志味 */
const bracket: Theme = {
  id: 'bracket',
  name: '方括号',
  group: '装饰',
  codeTheme: 'solarized-light',
  primary: '#2F6F6B',
  desc: '【标题】配大字距，港台杂志味，影评书评、专栏都合适',
  build: (p) => ({
    container: { color: '#343b3a', 'letter-spacing': '0.08em' },
    h1: H('1.46em', '1.5em', '1.05em', { 'text-align': 'center', color: shade(p, 0.3), 'letter-spacing': '0.2em' }),
    h2: H('1.12em', '2.3em', '1.1em', { color: shade(p, 0.25), 'letter-spacing': '0.18em' }),
    h3: H('1.04em', '1.8em', '0.7em', { color: shade(p, 0.18), 'letter-spacing': '0.1em' }),
    h4: H('1em', '1.3em', '0.6em', { color: '#57605f' }),
    blockquote: { margin: '1.5em 0', padding: '0.95em 1.15em', 'background-color': '#f4f8f7', 'border-left': `3px solid ${tint(p, 0.5)}`, color: '#5d6666', 'letter-spacing': '0.1em' },
    link: { color: shade(p, 0.15), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.15), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.28) },
    codespan: { 'background-color': '#eef4f3', color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '2px', 'font-size': '0.88em', 'letter-spacing': '0' },
    liMarker: { color: tint(p, 0.4) },
    hr: { border: 'none', margin: '2.4em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#94a3a1', 'letter-spacing': '0.1em' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.45)}`, 'background-color': '#f4f8f7', color: shade(p, 0.3) },
    td: { border: 'none', 'border-bottom': '1px solid #e9f0ef' },
    footnotesTitle: { color: shade(p, 0.28) },
  }),
  decor: {
    h2: {
      before: '<span style="color:{{primary}};font-weight:normal;margin-right:0.1em">【</span>',
      after: '<span style="color:{{primary}};font-weight:normal;margin-left:0.1em">】</span>',
    },
    hr: `<span style="color:{{primaryLight}};letter-spacing:0.6em;font-size:0.9em">◇ ◇ ◇</span>`,
  },
}

/** 25. 丝带 —— 色块标题带折角 */
const ribbon: Theme = {
  id: 'ribbon',
  name: '丝带',
  group: '装饰',
  codeTheme: 'github-dark',
  primary: '#C75146',
  desc: '色块标题带一个折角，像贴上去的丝带标签，活动、盘点类抓眼',
  build: (p) => ({
    container: { color: '#353031' },
    h1: H('1.5em', '1.5em', '1.05em', { 'text-align': 'center', color: shade(p, 0.3) }),
    h2: H('1.14em', '2.2em', '1.1em', {}),
    h2Inner: {
      display: 'inline-block',
      'background-color': p,
      color: '#ffffff',
      padding: '0.4em 0.9em',
      'border-radius': '3px 3px 3px 0',
      'letter-spacing': '0.08em',
      'box-shadow': `2px 2px 0 ${shade(p, 0.35)}`,
    },
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.2) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5d5354' }),
    blockquote: { margin: '1.4em 0', padding: '0.9em 1.1em', 'background-color': tint(p, 0.08), 'border-left': `4px solid ${p}`, color: '#635859' },
    link: { color: shade(p, 0.15), 'text-decoration': 'none', 'font-weight': 'bold' },
    linkRef: { color: shade(p, 0.15), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.22) },
    codespan: { 'background-color': tint(p, 0.1), color: shade(p, 0.3), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': `2px dashed ${tint(p, 0.5)}`, margin: '2.3em 0', height: '2px' },
    figcaption: { color: '#a89a9b' },
    th: { 'background-color': p, color: '#ffffff', 'border-color': tint(p, 0.45) },
    td: { 'border-color': tint(p, 0.45) },
    footnotesTitle: { color: shade(p, 0.22) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.42em">▍</span>' },
  },
}

/** 26. 杂志红 —— 红黑高对比 */
const editorial: Theme = {
  id: 'editorial',
  name: '杂志红',
  group: '杂志',
  codeTheme: 'github',
  primary: '#C8102E',
  desc: '红黑高对比配粗横线，有力度，适合评论、深度报道、态度鲜明的稿子',
  build: (p) => ({
    container: { color: '#2b2b2b' },
    h1: H('1.55em', '1.4em', '1em', { 'text-align': 'center', color: '#111111', 'letter-spacing': '0.08em' }),
    h2: H('1.2em', '2.2em', '1em', { color: '#111111', 'border-top': `4px solid ${p}`, 'padding-top': '0.5em' }),
    h3: H('1.06em', '1.7em', '0.7em', { color: p }),
    h4: H('1em', '1.3em', '0.6em', { color: '#4a4a4a' }),
    blockquote: { margin: '1.5em 0', padding: '0.3em 0 0.3em 1.2em', 'border-left': `4px solid ${p}`, color: '#4f4f4f', 'font-size': '1.02em' },
    link: { color: p, 'text-decoration': 'none', 'font-weight': 'bold' },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: p },
    codespan: { 'background-color': '#f4f4f4', color: shade(p, 0.15), padding: '0.14em 0.42em', 'border-radius': '2px', 'font-size': '0.88em' },
    liMarker: { color: p },
    hr: { border: 'none', 'border-top': '3px solid #111111', margin: '2.3em 0', height: '3px' },
    figcaption: { color: '#8f8f8f' },
    table: { 'border-color': '#cfcfcf' },
    th: { 'background-color': '#111111', color: '#ffffff', 'border-color': '#111111' },
    td: { 'border-color': '#cfcfcf' },
    footnotesTitle: { color: p },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.35em">/</span>' },
  },
}

/** 27. 薄荷 —— 清爽圆角 */
const mint: Theme = {
  id: 'mint',
  name: '薄荷',
  group: '活泼',
  codeTheme: 'one-light',
  primary: '#2FA98C',
  desc: '清爽薄荷绿配圆角卡片，教程、测评、干货清单读着不累',
  build: (p) => ({
    container: { color: '#33403d' },
    h1: H('1.5em', '1.5em', '1.05em', { 'text-align': 'center', color: shade(p, 0.32) }),
    h2: H('1.14em', '2.2em', '1.05em', {}),
    h2Inner: { display: 'inline-block', 'background-color': tint(p, 0.14), color: shade(p, 0.35), padding: '0.4em 1em', 'border-radius': '8px 8px 8px 0' },
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.25) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#55635f' }),
    blockquote: { margin: '1.4em 0', padding: '0.95em 1.15em', 'background-color': tint(p, 0.07), 'border-radius': '10px', color: '#5c6a66' },
    link: { color: shade(p, 0.22), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.45)}` },
    linkRef: { color: shade(p, 0.22), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.3), 'background-color': tint(p, 0.13), padding: '0 0.16em', 'border-radius': '3px' },
    codespan: { 'background-color': tint(p, 0.11), color: shade(p, 0.35), padding: '0.14em 0.42em', 'border-radius': '4px', 'font-size': '0.88em' },
    codeBlock: { 'border-radius': '10px' },
    liMarker: { color: p },
    hr: { border: 'none', margin: '2.3em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    img: { 'border-radius': '10px' },
    figcaption: { color: '#93a5a1' },
    table: { 'border-color': tint(p, 0.45) },
    th: { 'background-color': tint(p, 0.13), color: shade(p, 0.32), 'border-color': tint(p, 0.45) },
    td: { 'border-color': tint(p, 0.45) },
    li: { 'margin-bottom': '0.45em' },
    footnotesTitle: { color: shade(p, 0.3) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.42em">●</span>' },
    hr: `<span style="color:{{primaryLight}};letter-spacing:0.5em;font-size:0.9em">● ● ●</span>`,
  },
}

/** 28. 石板灰 —— 冷灰单色，极简商务 */
const slate: Theme = {
  id: 'slate',
  name: '石板灰',
  group: '商务',
  codeTheme: 'github',
  primary: '#4A5568',
  desc: '冷灰单色、只有一处强调色，安静的商务感，周报月报和复盘很稳',
  build: (p) => ({
    container: { color: '#2d3138' },
    h1: H('1.45em', '1.5em', '1em', { 'text-align': 'center', color: '#1a1e24', 'letter-spacing': '0.06em' }),
    h2: H('1.15em', '2.1em', '0.95em', { color: '#1a1e24', 'padding-left': '0.65em', 'border-left': `4px solid ${p}` }),
    h3: H('1.05em', '1.7em', '0.65em', { color: shade(p, 0.2) }),
    h4: H('1em', '1.3em', '0.55em', { color: '#4d535c' }),
    blockquote: { margin: '1.35em 0', padding: '0.9em 1.1em', 'background-color': '#f6f7f9', 'border-radius': '4px', color: '#535a64' },
    link: { color: p, 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: p, 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: '#1a1e24' },
    codespan: { 'background-color': '#eef0f3', color: shade(p, 0.2), padding: '0.14em 0.42em', 'border-radius': '3px', 'font-size': '0.88em' },
    liMarker: { color: tint(p, 0.4) },
    hr: { border: 'none', 'border-top': '1px solid #e3e6ea', margin: '2.2em 0', height: '1px' },
    figcaption: { color: '#949aa3' },
    table: { 'border-color': '#dfe3e8' },
    th: { 'background-color': '#eef0f3', color: '#1a1e24', 'border-color': '#dfe3e8' },
    td: { 'border-color': '#dfe3e8' },
    footnotesTitle: { color: shade(p, 0.15) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primaryLight}};margin-right:0.42em">—</span>' },
  },
}

/** 29. 晚霞 —— 暖粉橙双色 */
const sunset: Theme = {
  id: 'sunset',
  name: '晚霞',
  group: '活泼',
  codeTheme: 'dracula',
  primary: '#E8654F',
  desc: '暖粉橙的双色标题条，情绪饱满，随笔、故事、年度总结很搭',
  build: (p) => ({
    container: { color: '#3b3230' },
    h1: H('1.52em', '1.5em', '1.05em', { 'text-align': 'center', color: shade(p, 0.3) }),
    h2: { ...H('1.14em', '2.2em', '1.05em', {}), 'background-color': tint(p, 0.09), padding: '0.5em 0.6em', 'border-radius': '6px' },
    h2Inner: { display: 'inline-block', 'background-color': p, color: '#ffffff', padding: '0.3em 0.85em', 'border-radius': '999px', 'letter-spacing': '0.06em' },
    h3: H('1.06em', '1.7em', '0.7em', { color: shade(p, 0.24) }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5f5350' }),
    blockquote: { margin: '1.45em 0', padding: '0.95em 1.15em', 'background-color': '#fef6f3', 'border-left': `4px solid ${tint(p, 0.55)}`, 'border-radius': '0 8px 8px 0', color: '#675955' },
    link: { color: shade(p, 0.2), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.2), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: shade(p, 0.26) },
    codespan: { 'background-color': tint(p, 0.11), color: shade(p, 0.32), padding: '0.14em 0.42em', 'border-radius': '4px', 'font-size': '0.88em' },
    codeBlock: { 'border-radius': '8px' },
    liMarker: { color: tint(p, 0.4) },
    hr: { border: 'none', margin: '2.4em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    img: { 'border-radius': '8px' },
    figcaption: { color: '#ad9c97' },
    th: { border: 'none', 'border-bottom': `2px solid ${tint(p, 0.45)}`, 'background-color': tint(p, 0.09), color: shade(p, 0.3) },
    td: { border: 'none', 'border-bottom': '1px solid #f5e9e5' },
    footnotesTitle: { color: shade(p, 0.26) },
  }),
  decor: {
    hr: `${bar('{{primaryLight}}', '30px', '2px')}<span style="display:inline-block;margin:0 9px;color:{{primary}};vertical-align:middle">✺</span>${bar('{{primaryLight}}', '30px', '2px')}`,
  },
}


/** 30. 鎏金 —— 金调封面的正文延续 */
const gilt: Theme = {
  id: 'gilt',
  name: '鎏金',
  group: '杂志',
  codeTheme: 'solarized-light',
  primary: '#B8873B',
  desc: '深棕标题配鎏金底线与暖米引用，专门用来接金调、牛皮纸这类封面',
  raisedCap: true,
  build: (p) => ({
    container: { color: '#3a3026', 'letter-spacing': '0.06em' },
    h1: H('1.5em', '1.5em', '1.1em', { 'text-align': 'center', color: '#241c12', 'letter-spacing': '0.14em' }),
    h2: H('1.16em', '2.3em', '1.1em', { color: '#241c12' }),
    h2Inner: { display: 'inline-block', 'border-bottom': `3px solid ${p}`, 'padding-bottom': '0.32em', 'letter-spacing': '0.1em' },
    h3: H('1.05em', '1.8em', '0.7em', { color: shade(p, 0.3), 'letter-spacing': '0.06em' }),
    h4: H('1em', '1.3em', '0.6em', { color: '#5f5341' }),
    blockquote: { margin: '1.5em 0', padding: '1em 1.2em', 'background-color': '#fbf6ea', 'border-left': `4px solid ${p}`, color: '#6a5c48' },
    link: { color: shade(p, 0.28), 'text-decoration': 'none', 'border-bottom': `1px solid ${tint(p, 0.5)}` },
    linkRef: { color: shade(p, 0.28), 'font-size': '0.72em', 'vertical-align': 'super', 'line-height': 'normal' },
    strong: { 'font-weight': 'bold', color: '#241c12', 'background-color': tint(p, 0.2), padding: '0 0.16em', 'border-radius': '2px' },
    em: { 'font-style': 'normal', color: shade(p, 0.3), 'border-bottom': `1px dotted ${tint(p, 0.55)}` },
    codespan: { 'background-color': '#f7f0e2', color: shade(p, 0.35), padding: '0.14em 0.42em', 'border-radius': '2px', 'font-size': '0.88em', 'letter-spacing': '0' },
    raisedCap: { 'font-size': '2.4em', 'font-weight': 'bold', color: shade(p, 0.12), 'line-height': '1em', 'vertical-align': '-0.16em', 'margin-right': '0.06em', 'letter-spacing': '0' },
    liMarker: { color: p },
    hr: { border: 'none', margin: '2.5em 0', height: 'auto', 'text-align': 'center', 'line-height': '1em' },
    figcaption: { color: '#a5947a', 'letter-spacing': '0.08em' },
    table: { 'border-color': tint(p, 0.55) },
    th: { border: 'none', 'border-top': `1px solid ${tint(p, 0.4)}`, 'border-bottom': `2px solid ${p}`, 'background-color': '#fbf6ea', color: '#241c12' },
    td: { border: 'none', 'border-bottom': `1px solid ${tint(p, 0.72)}` },
    footnotesTitle: { color: shade(p, 0.3) },
  }),
  decor: {
    h3: { before: '<span style="color:{{primary}};margin-right:0.45em;font-size:0.85em">◆</span>' },
    hr: `${bar('{{primaryLight}}', '32px', '2px')}<span style="display:inline-block;margin:0 10px;color:{{primary}};vertical-align:middle">❖</span>${bar('{{primaryLight}}', '32px', '2px')}`,
  },
}

export const THEMES: Theme[] = [
  minimal, native, numbered,
  tech, midnight,
  magazine, warm,
  ink, zen,
  business, academic,
  marker, klein, journal, rose,
  badge, duotone, card, tag, outline, letter,
  symmetry, underline, bracket, ribbon, editorial, mint, slate, sunset, gilt,
]

/** UI 里按组展示的顺序 */
export const THEME_GROUPS: Theme['group'][] = ['通用', '装饰', '技术', '杂志', '文艺', '商务', '活泼']

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? minimal
}

/** 展开装饰模板里的占位符 */
export function expandDecor(
  tpl: string | undefined,
  ctx: { primary: string; n: number },
): string {
  if (!tpl) return ''
  return tpl
    .replace(/\{\{primaryFaint\}\}/g, tint(ctx.primary, 0.12))
    .replace(/\{\{primaryLight\}\}/g, tint(ctx.primary, 0.4))
    .replace(/\{\{primaryDark\}\}/g, shade(ctx.primary, 0.22))
    .replace(/\{\{primary\}\}/g, ctx.primary)
    .replace(/\{\{nn\}\}/g, String(ctx.n).padStart(2, '0'))
    .replace(/\{\{n\}\}/g, String(ctx.n))
}

export type { Styles }
