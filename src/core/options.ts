import { DEFAULT_OPTIONS, type RenderOptions } from './types'

/**
 * 把存下来的东西还原成一份可用的选项。
 *
 * 可选字段（primary / customCss）不在 DEFAULT_OPTIONS 里，必须单独处理。
 * 漏掉的话自定义主色和自定义 CSS 每次重开都会丢，用户会觉得「设置没记住」。
 */
const OPTIONAL_KEYS = ['primary', 'customCss'] as const

/** 数值型选项的合理区间，越界的值直接丢掉，免得存进了坏数据一直用 */
const RANGES: Partial<Record<keyof RenderOptions, [number, number]>> = {
  fontSize: [12, 24],
  lineHeight: [1.2, 2.6],
  paragraphSpacing: [0, 60],
}

export function sanitizeOptions(raw: unknown): RenderOptions {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_OPTIONS }
  const src = raw as Record<string, unknown>
  const out: RenderOptions = { ...DEFAULT_OPTIONS }

  for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof RenderOptions)[]) {
    const v = src[key]
    if (v === undefined || v === null) continue
    if (typeof v !== typeof DEFAULT_OPTIONS[key]) continue
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue
      const range = RANGES[key]
      if (range && (v < range[0] || v > range[1])) continue
    }
    // @ts-expect-error 逐字段拷贝，类型已由上面几行粗筛
    out[key] = v
  }

  for (const key of OPTIONAL_KEYS) {
    const v = src[key]
    if (typeof v !== 'string') continue
    if (key === 'primary' && v && !/^#[0-9a-fA-F]{6}$/.test(v)) continue
    out[key] = v
  }

  return out
}

export interface UiPrefs {
  /** 替换全文 / 插入到末尾 */
  insertMode: 'replace' | 'cursor'
  /** 排版内容从哪来：面板的 Markdown，还是正文现有内容（只换样式） */
  source: 'panel' | 'editor'
}

export const DEFAULT_UI: UiPrefs = { insertMode: 'replace', source: 'panel' }

export function sanitizeUi(raw: unknown): UiPrefs {
  const src = (raw ?? {}) as Record<string, unknown>
  return {
    insertMode: src.insertMode === 'cursor' ? 'cursor' : 'replace',
    source: src.source === 'editor' ? 'editor' : 'panel',
  }
}
