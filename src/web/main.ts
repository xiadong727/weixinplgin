import './app.css'
import { render, DEFAULT_OPTIONS, type RenderOptions, type RenderResult } from '@core/index'
import { createSettings } from '@ui/settings'
import { localStore } from '@ui/storage'
import { copyRichText, downloadFile } from '@ui/clipboard'
import { enableDropImport, pickMarkdownFile, readMarkdownFile } from '@ui/import'
import { IMPORT_ACCEPT, mergeWarnings } from '@core/index'
import { SAMPLE_MARKDOWN } from '@ui/presets'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const editor = $<HTMLTextAreaElement>('editor')
const preview = $<HTMLIFrameElement>('preview')
const counter = $('counter')
const warnCount = $('warn-count')
const warningsBox = $('warnings')
const toastBox = $('toast')
const fileInput = $<HTMLInputElement>('file-input')
const dropZone = $('drop-zone')
const dropHint = $('dropzone')

let options: RenderOptions = { ...DEFAULT_OPTIONS }
let latest: RenderResult | null = null

/* ---------------- 预览 iframe ---------------- */

function previewDoc(): Document | null {
  return preview.contentDocument ?? null
}

function initPreview() {
  const doc = previewDoc()
  if (!doc) return
  doc.open()
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8">' +
      '<style>html,body{margin:0;padding:0}' +
      'body{padding:20px 16px;-webkit-text-size-adjust:100%}' +
      'img{max-width:100%}</style></head><body><div id="root"></div></body></html>',
  )
  doc.close()
}

/* ---------------- 渲染 ---------------- */

let timer: number | undefined

function scheduleRender() {
  window.clearTimeout(timer)
  timer = window.setTimeout(update, 120)
}

function update() {
  const md = editor.value
  latest = render(md, options)

  const root = previewDoc()?.getElementById('root')
  if (root) root.innerHTML = latest.html

  const chars = md.replace(/\s/g, '').length
  counter.textContent = `${chars} 字`
  // 空的时候把导入提示亮出来，不然「导入 .md」不容易被注意到
  dropHint.hidden = md.trim().length > 0
  showWarnings(latest.warnings)
  void localStore.saveDraft(md)
}

function showWarnings(list: string[]) {
  if (!list.length) {
    warningsBox.hidden = true
    warnCount.textContent = ''
    return
  }
  warnCount.textContent = `${list.length} 条提示`
  warningsBox.hidden = false
  warningsBox.innerHTML =
    `<div class="warnings-head"><span class="warnings-title">排版提示</span>` +
    `<button class="warnings-close" type="button" title="收起">×</button></div><ul>` +
    list.map((w) => `<li>${escapeHtml(w)}</li>`).join('') +
    `</ul>`
  warningsBox.querySelector('.warnings-close')?.addEventListener('click', () => {
    warningsBox.hidden = true
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

let toastTimer: number | undefined
function toast(msg: string) {
  toastBox.textContent = msg
  toastBox.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastBox.hidden = true }, 2600)
}

/* ---------------- 交互 ---------------- */

editor.addEventListener('input', scheduleRender)

// Tab 缩进而不是跳焦点
editor.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const { selectionStart: s, selectionEnd: t, value } = editor
  editor.value = value.slice(0, s) + '  ' + value.slice(t)
  editor.selectionStart = editor.selectionEnd = s + 2
  scheduleRender()
})

$('btn-copy').addEventListener('click', async () => {
  update()
  if (!latest || !editor.value.trim()) return toast('先写点内容吧')
  try {
    const via = await copyRichText(latest.html, latest.text)
    toast(
      via === 'async'
        ? '已复制，去公众号后台正文里粘贴（Cmd/Ctrl+V）即可'
        : '已复制（兼容模式），去公众号后台粘贴即可',
    )
  } catch (err) {
    toast(err instanceof Error ? err.message : '复制失败')
  }
})

$('btn-sample').addEventListener('click', () => {
  editor.value = SAMPLE_MARKDOWN
  update()
})

$('btn-clear').addEventListener('click', () => {
  if (editor.value.trim() && !confirm('清空当前内容？')) return
  editor.value = ''
  update()
})

$('btn-export').addEventListener('click', () => {
  update()
  if (!latest) return
  const doc =
    '<!doctype html><html><head><meta charset="utf-8"><title>排版结果</title></head>' +
    `<body style="margin:0;padding:20px">${latest.html}</body></html>`
  downloadFile('wx-article.html', doc, 'text/html;charset=utf-8')
  toast('已导出 HTML，可用浏览器打开后全选复制')
})

fileInput.accept = IMPORT_ACCEPT
fileInput.multiple = true

$('btn-import').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const { file, extra } = pickMarkdownFile(fileInput.files)
  if (file) void loadFile(file, extra)
  fileInput.value = ''
})

async function loadFile(file: File, extra = 0) {
  if (editor.value.trim() && !confirm(`用「${file.name}」的内容替换当前编辑器里的文字？`)) return
  toast(`正在解析 ${file.name}……`)
  try {
    const result = await readMarkdownFile(file)
    editor.value = result.text
    update()
    // 导入产生的提示要和排版提示一起显示，否则编码/图片问题会被吞掉
    if (result.warnings.length) showWarnings(mergeWarnings(result.warnings, latest?.warnings ?? []))
    toast(
      `已导入 ${file.name}（${result.encoding}）` +
        (extra ? `，另外 ${extra} 个文件已忽略，一次只排一篇` : ''),
    )
  } catch (err) {
    toast(err instanceof Error ? err.message : '导入失败')
  }
}

// 整个编辑区都能接住拖进来的文件
enableDropImport(dropZone, {
  onFile: (file, extra) => void loadFile(file, extra),
  onDragState: (dragging) => dropZone.classList.toggle('is-dragover', dragging),
})

// Cmd/Ctrl+Shift+C 直接复制排版结果
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    $('btn-copy').click()
  }
})

/* ---------------- 启动 ---------------- */

async function boot() {
  initPreview()
  options = await localStore.loadOptions()

  const settings = createSettings(options, (patch) => {
    options = { ...options, ...patch }
    void localStore.saveOptions(options)
    update()
  })
  $('settings-host').appendChild(settings.el)

  $('btn-reset').addEventListener('click', () => {
    options = { ...DEFAULT_OPTIONS }
    settings.sync(options)
    void localStore.saveOptions(options)
    update()
    toast('已恢复默认设置')
  })

  const draft = await localStore.loadDraft()
  editor.value = draft && draft.trim() ? draft : SAMPLE_MARKDOWN
  update()
}

preview.addEventListener('load', () => { initPreview(); update() })
void boot()
