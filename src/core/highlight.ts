import hljs from 'highlight.js/lib/common'
import type { Decls } from './types'

/** 高亮配色角色 —— hljs 的几十个 class 会归到这几类里 */
type Role =
  | 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'className'
  | 'variable' | 'builtin' | 'operator' | 'punctuation' | 'tag' | 'attr'
  | 'meta' | 'literal' | 'regexp' | 'title' | 'deletion' | 'addition'

export interface CodeTheme {
  id: string
  name: string
  dark: boolean
  bg: string
  fg: string
  /** 头部语言条背景 */
  bar: string
  barFg: string
  colors: Record<Role, string>
}

/** hljs class（去掉 hljs- 前缀）→ 配色角色 */
const CLASS_ROLE: Record<string, Role> = {
  keyword: 'keyword',
  'selector-tag': 'keyword',
  'doctag': 'keyword',
  'section': 'title',
  string: 'string',
  'char': 'string',
  'char.escape_': 'string',
  'template-variable': 'variable',
  'quote': 'comment',
  comment: 'comment',
  number: 'number',
  'symbol': 'number',
  'bullet': 'number',
  title: 'title',
  'title.function_': 'function',
  'title.class_': 'className',
  'function_': 'function',
  'class_': 'className',
  name: 'tag',
  tag: 'punctuation',
  attr: 'attr',
  attribute: 'attr',
  'selector-attr': 'attr',
  'selector-class': 'attr',
  'selector-id': 'attr',
  'selector-pseudo': 'attr',
  variable: 'variable',
  'variable.language_': 'keyword',
  'variable.constant_': 'literal',
  params: 'variable',
  property: 'variable',
  'built_in': 'builtin',
  type: 'className',
  literal: 'literal',
  regexp: 'regexp',
  meta: 'meta',
  'meta.prompt_': 'meta',
  'meta-keyword': 'keyword',
  'meta-string': 'string',
  operator: 'operator',
  punctuation: 'punctuation',
  addition: 'addition',
  deletion: 'deletion',
  link: 'string',
  formula: 'meta',
  'strong': 'keyword',
  'emphasis': 'keyword',
  'code': 'string',
  subst: 'punctuation',
}

const GITHUB: CodeTheme = {
  id: 'github', name: 'GitHub 浅色', dark: false,
  bg: '#f6f8fa', fg: '#24292f', bar: '#eaeef2', barFg: '#57606a',
  colors: {
    keyword: '#cf222e', string: '#0a3069', comment: '#6e7781', number: '#0550ae',
    function: '#8250df', className: '#953800', variable: '#953800', builtin: '#0550ae',
    operator: '#cf222e', punctuation: '#24292f', tag: '#116329', attr: '#0550ae',
    meta: '#6e7781', literal: '#0550ae', regexp: '#0a3069', title: '#8250df',
    deletion: '#82071e', addition: '#116329',
  },
}

const XCODE: CodeTheme = {
  id: 'xcode', name: 'Xcode 浅色', dark: false,
  bg: '#fafafa', fg: '#2e2e2e', bar: '#f0f0f0', barFg: '#7a7a7a',
  colors: {
    keyword: '#ad3da4', string: '#d12f1b', comment: '#707f8c', number: '#272ad8',
    function: '#326d74', className: '#3f6e75', variable: '#2e2e2e', builtin: '#5c2699',
    operator: '#ad3da4', punctuation: '#2e2e2e', tag: '#5c2699', attr: '#836c28',
    meta: '#643820', literal: '#272ad8', regexp: '#d12f1b', title: '#326d74',
    deletion: '#d12f1b', addition: '#326d74',
  },
}

const ATOM_ONE_DARK: CodeTheme = {
  id: 'atom-one-dark', name: 'One Dark', dark: true,
  bg: '#282c34', fg: '#abb2bf', bar: '#21252b', barFg: '#7f8796',
  colors: {
    keyword: '#c678dd', string: '#98c379', comment: '#5c6370', number: '#d19a66',
    function: '#61afef', className: '#e5c07b', variable: '#e06c75', builtin: '#56b6c2',
    operator: '#56b6c2', punctuation: '#abb2bf', tag: '#e06c75', attr: '#d19a66',
    meta: '#61afef', literal: '#56b6c2', regexp: '#98c379', title: '#61afef',
    deletion: '#e06c75', addition: '#98c379',
  },
}

const VSCODE_DARK: CodeTheme = {
  id: 'vscode-dark', name: 'VS Code 深色', dark: true,
  bg: '#1e1e1e', fg: '#d4d4d4', bar: '#252526', barFg: '#858585',
  colors: {
    keyword: '#569cd6', string: '#ce9178', comment: '#6a9955', number: '#b5cea8',
    function: '#dcdcaa', className: '#4ec9b0', variable: '#9cdcfe', builtin: '#4ec9b0',
    operator: '#d4d4d4', punctuation: '#d4d4d4', tag: '#569cd6', attr: '#9cdcfe',
    meta: '#c586c0', literal: '#569cd6', regexp: '#d16969', title: '#dcdcaa',
    deletion: '#f14c4c', addition: '#6a9955',
  },
}

const DRACULA: CodeTheme = {
  id: 'dracula', name: 'Dracula', dark: true,
  bg: '#282a36', fg: '#f8f8f2', bar: '#21222c', barFg: '#8d90a0',
  colors: {
    keyword: '#ff79c6', string: '#f1fa8c', comment: '#6272a4', number: '#bd93f9',
    function: '#50fa7b', className: '#8be9fd', variable: '#f8f8f2', builtin: '#8be9fd',
    operator: '#ff79c6', punctuation: '#f8f8f2', tag: '#ff79c6', attr: '#50fa7b',
    meta: '#ffb86c', literal: '#bd93f9', regexp: '#f1fa8c', title: '#50fa7b',
    deletion: '#ff5555', addition: '#50fa7b',
  },
}

const SOLARIZED_LIGHT: CodeTheme = {
  id: 'solarized-light', name: 'Solarized 浅色', dark: false,
  bg: '#fdf6e3', fg: '#586e75', bar: '#eee8d5', barFg: '#93a1a1',
  colors: {
    keyword: '#859900', string: '#2aa198', comment: '#93a1a1', number: '#d33682',
    function: '#268bd2', className: '#b58900', variable: '#cb4b16', builtin: '#268bd2',
    operator: '#859900', punctuation: '#586e75', tag: '#268bd2', attr: '#b58900',
    meta: '#cb4b16', literal: '#d33682', regexp: '#2aa198', title: '#268bd2',
    deletion: '#dc322f', addition: '#859900',
  },
}

const ONE_LIGHT: CodeTheme = {
  id: 'one-light', name: 'One Light', dark: false,
  bg: '#fafafa', fg: '#383a42', bar: '#f0f0f1', barFg: '#8a8b91',
  colors: {
    keyword: '#a626a4', string: '#50a14f', comment: '#a0a1a7', number: '#986801',
    function: '#4078f2', className: '#c18401', variable: '#e45649', builtin: '#0184bc',
    operator: '#0184bc', punctuation: '#383a42', tag: '#e45649', attr: '#986801',
    meta: '#4078f2', literal: '#0184bc', regexp: '#50a14f', title: '#4078f2',
    deletion: '#e45649', addition: '#50a14f',
  },
}

const GITHUB_DARK: CodeTheme = {
  id: 'github-dark', name: 'GitHub 深色', dark: true,
  bg: '#0d1117', fg: '#c9d1d9', bar: '#161b22', barFg: '#8b949e',
  colors: {
    keyword: '#ff7b72', string: '#a5d6ff', comment: '#8b949e', number: '#79c0ff',
    function: '#d2a8ff', className: '#ffa657', variable: '#ffa657', builtin: '#79c0ff',
    operator: '#ff7b72', punctuation: '#c9d1d9', tag: '#7ee787', attr: '#79c0ff',
    meta: '#8b949e', literal: '#79c0ff', regexp: '#a5d6ff', title: '#d2a8ff',
    deletion: '#ffa198', addition: '#7ee787',
  },
}

const NORD: CodeTheme = {
  id: 'nord', name: 'Nord', dark: true,
  bg: '#2e3440', fg: '#d8dee9', bar: '#272c36', barFg: '#7b88a1',
  colors: {
    keyword: '#81a1c1', string: '#a3be8c', comment: '#616e88', number: '#b48ead',
    function: '#88c0d0', className: '#8fbcbb', variable: '#d8dee9', builtin: '#8fbcbb',
    operator: '#81a1c1', punctuation: '#eceff4', tag: '#81a1c1', attr: '#8fbcbb',
    meta: '#5e81ac', literal: '#81a1c1', regexp: '#ebcb8b', title: '#88c0d0',
    deletion: '#bf616a', addition: '#a3be8c',
  },
}

export const CODE_THEMES: CodeTheme[] = [
  GITHUB, ONE_LIGHT, XCODE, SOLARIZED_LIGHT,
  ATOM_ONE_DARK, GITHUB_DARK, VSCODE_DARK, NORD, DRACULA,
]

export function getCodeTheme(id: string): CodeTheme {
  return CODE_THEMES.find((t) => t.id === id) ?? GITHUB
}

/** 语言别名归一化 */
function resolveLang(lang?: string): string | undefined {
  if (!lang) return undefined
  const l = lang.trim().toLowerCase().split(/[\s:]/)[0]
  const alias: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
    yml: 'yaml', md: 'markdown', py: 'python', rb: 'ruby', golang: 'go',
    'c++': 'cpp', 'c#': 'csharp', h: 'cpp', vue: 'xml', html: 'xml', htm: 'xml',
    docker: 'dockerfile', text: 'plaintext', txt: 'plaintext',
  }
  const resolved = alias[l] ?? l
  return hljs.getLanguage(resolved) ? resolved : undefined
}

/**
 * 高亮并把 hljs 的 class 全部换成 inline style。
 * 公众号只认元素上的 style，class 会被整条剥掉。
 */
export function highlightToInline(code: string, lang: string | undefined, theme: CodeTheme): {
  html: string
  language: string
} {
  const resolved = resolveLang(lang)
  let html: string
  let language = resolved ?? (lang?.trim() || 'text')

  try {
    if (resolved) {
      html = hljs.highlight(code, { language: resolved, ignoreIllegals: true }).value
    } else {
      const auto = hljs.highlightAuto(code)
      html = auto.value
      if (!lang && auto.language) language = auto.language
    }
  } catch {
    html = escapeHtml(code)
  }

  // <span class="hljs-keyword"> → <span style="color:#xxx">
  html = html.replace(/<span class="([^"]*)">/g, (_m, classes: string) => {
    const style = classesToStyle(classes, theme)
    return style ? `<span style="${style}">` : '<span>'
  })

  return { html, language }
}

function classesToStyle(classes: string, theme: CodeTheme): string {
  const list = classes.split(/\s+/).filter(Boolean)
  // hljs v11 会输出 "hljs-title function_" 这类组合，优先用组合键匹配
  const keys: string[] = []
  const stripped = list.map((c) => (c.startsWith('hljs-') ? c.slice(5) : c))
  if (stripped.length > 1) keys.push(`${stripped[0]}.${stripped[1]}`)
  keys.push(...stripped)

  const decls: string[] = []
  for (const key of keys) {
    const role = CLASS_ROLE[key]
    if (role && theme.colors[role]) {
      decls.push(`color:${theme.colors[role]}`)
      break
    }
  }
  if (stripped.includes('emphasis')) decls.push('font-style:italic')
  if (stripped.includes('strong')) decls.push('font-weight:bold')
  return decls.join(';')
}

/** 代码块外层容器的样式 */
export function codeBlockDecls(theme: CodeTheme): Decls {
  return {
    'background-color': theme.bg,
    // 浅色主题跟白底太接近，补一圈淡边框把代码块「框」出来
    border: theme.dark ? 'none' : '1px solid rgba(0,0,0,0.07)',
    'border-radius': '5px',
    margin: '1.3em 0',
    overflow: 'hidden',
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const SUPPORTED_LANGUAGES = hljs.listLanguages()
