import { DEFAULT_OPTIONS, DEFAULT_UI, sanitizeOptions, sanitizeUi, type RenderOptions, type UiPrefs } from '@core/index'

const KEY = 'wx-typeset:options'
const DRAFT_KEY = 'wx-typeset:draft'
const UI_KEY = 'wx-typeset:ui'

export interface Store {
  loadOptions(): Promise<RenderOptions>
  saveOptions(o: RenderOptions): Promise<void>
  loadDraft(): Promise<string | null>
  saveDraft(md: string): Promise<void>
  loadUi(): Promise<UiPrefs>
  saveUi(ui: UiPrefs): Promise<void>
}

/** 网页版：localStorage */
export const localStore: Store = {
  async loadOptions() {
    try {
      return sanitizeOptions(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    } catch {
      return { ...DEFAULT_OPTIONS }
    }
  },
  async saveOptions(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)) } catch { /* 隐私模式下忽略 */ }
  },
  async loadDraft() {
    try { return localStorage.getItem(DRAFT_KEY) } catch { return null }
  },
  async saveDraft(md) {
    try { localStorage.setItem(DRAFT_KEY, md) } catch { /* 忽略 */ }
  },
  async loadUi() {
    try { return sanitizeUi(JSON.parse(localStorage.getItem(UI_KEY) ?? 'null')) } catch { return { ...DEFAULT_UI } }
  },
  async saveUi(ui) {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)) } catch { /* 忽略 */ }
  },
}

/** 扩展版：chrome.storage.local，跨标签页共享设置 */
export const chromeStore: Store = {
  async loadOptions() {
    try {
      const r = await chrome.storage.local.get(KEY)
      return sanitizeOptions(r[KEY])
    } catch {
      return { ...DEFAULT_OPTIONS }
    }
  },
  async saveOptions(o) {
    try { await chrome.storage.local.set({ [KEY]: o }) } catch { /* 忽略 */ }
  },
  async loadDraft() {
    try {
      const r = await chrome.storage.local.get(DRAFT_KEY)
      return typeof r[DRAFT_KEY] === 'string' ? r[DRAFT_KEY] : null
    } catch {
      return null
    }
  },
  async saveDraft(md) {
    try { await chrome.storage.local.set({ [DRAFT_KEY]: md }) } catch { /* 忽略 */ }
  },
  async loadUi() {
    try {
      const r = await chrome.storage.local.get(UI_KEY)
      return sanitizeUi(r[UI_KEY])
    } catch {
      return { ...DEFAULT_UI }
    }
  },
  async saveUi(ui) {
    try { await chrome.storage.local.set({ [UI_KEY]: ui }) } catch { /* 忽略 */ }
  },
}
