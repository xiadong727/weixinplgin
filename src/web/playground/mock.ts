/**
 * 开发用的假公众号后台。
 * 目的：在没有公众号登录态的情况下，端到端验证 content script 的注入降级链路。
 * 只在 vite dev 下使用，不会进生产构建。
 */

const logEl = document.getElementById('log')!
const slot = document.getElementById('editor-slot')!
const optPaste = document.getElementById('opt-paste') as HTMLInputElement
const optExec = document.getElementById('opt-exec') as HTMLInputElement
const optEditor = document.getElementById('opt-editor') as HTMLInputElement
const optNormalize = document.getElementById('opt-normalize') as HTMLInputElement
const optRevert = document.getElementById('opt-revert') as HTMLInputElement
const optRevertPrev = document.getElementById('opt-revert-prev') as HTMLInputElement
const optProseMirror = document.getElementById('opt-pm') as HTMLInputElement
const optAlwaysAppend = document.getElementById('opt-append') as HTMLInputElement
const optPmTable = document.getElementById('opt-pm-table') as HTMLInputElement

let lines: string[] = []
function log(msg: string) {
  lines.push(`${new Date().toLocaleTimeString('zh-CN', { hour12: false })}  ${msg}`)
  lines = lines.slice(-60)
  logEl.textContent = lines.join('\n')
  logEl.scrollTop = logEl.scrollHeight
}

/* ---------- chrome API 打桩，让真实的 content script 能跑起来 ---------- */

type Listener = (msg: unknown, sender: unknown, respond: (r: unknown) => void) => void
const listeners: Listener[] = []

;(window as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      async get(key: string) {
        const raw = localStorage.getItem(`mock:${key}`)
        return raw ? { [key]: JSON.parse(raw) } : {}
      },
      async set(obj: Record<string, unknown>) {
        for (const [k, v] of Object.entries(obj)) localStorage.setItem(`mock:${k}`, JSON.stringify(v))
      },
    },
  },
  runtime: {
    onMessage: { addListener: (fn: Listener) => listeners.push(fn) },
  },
}

/* ---------- 构造 UEditor 风格的编辑器 ---------- */

function buildEditor() {
  slot.innerHTML = ''
  if (!optEditor.checked) {
    slot.innerHTML = '<p style="color:#b42318;font-size:13px">（已模拟「页面里没有编辑器」的情况）</p>'
    log('编辑器已移除')
    return
  }

  const frame = document.createElement('iframe')
  frame.id = 'ueditor_0'
  slot.appendChild(frame)

  const doc = frame.contentDocument!
  doc.open()
  doc.write(
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'html,body{margin:0}body{padding:16px;font:16px/1.75 -apple-system,"PingFang SC",sans-serif;outline:none}' +
      '</style></head><body contenteditable="true"><p>这里是原有正文，一行占位内容。</p></body></html>',
  )
  doc.close()

  const body = doc.body

  // 模拟 UEditor 的粘贴处理：读 text/html 塞进选区
  body.addEventListener('paste', (e) => {
    const ev = e as ClipboardEvent
    if (!optPaste.checked) {
      log('paste 事件到达，但编辑器被配置为忽略（模拟一级通道失效）')
      return
    }
    const html = ev.clipboardData?.getData('text/html')
    log(`paste 事件到达，text/html 长度 ${html?.length ?? 0}`)
    if (!html) return
    ev.preventDefault()

    // 最坏情况：不管选区是什么，粘贴一律追加
    if (optAlwaysAppend.checked) {
      body.insertAdjacentHTML('beforeend', html)
      log('模拟最坏情况：粘贴只追加，不替换选区')
      selectAllUsed = false
      return
    }

    // ProseMirror 模式：只认自己命令通道产生的全选，外部手工 Range 当成没选中
    if (optProseMirror.checked && !selectAllUsed) {
      body.insertAdjacentHTML('beforeend', html)
      log('模拟 ProseMirror：外部选区不被认可，粘贴退化成「追加」')
      selectAllUsed = false
      return
    }
    selectAllUsed = false

    const sel = doc.defaultView!.getSelection()!
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const frag = range.createContextualFragment(html)
      range.insertNode(frag)
      sel.collapseToEnd()
    } else {
      body.innerHTML = html
    }
    if (optPmTable.checked) {
      // prosemirror-tables 的 schema 不带这些节点的属性，style 会被剥掉。
      // 一个没了 style 的空 caption，就是表格正上方那条虚线空带。
      let n = 0
      body.querySelectorAll('caption,colgroup,col,thead,tfoot').forEach((el) => {
        if (el.getAttribute('style')) {
          el.removeAttribute('style')
          n++
        }
      })
      if (n) log(`模拟 prosemirror-tables：剥掉了 ${n} 处 caption/colgroup 的 style`)
    }
    log('一级通道生效：内容已由编辑器自己的 paste 处理器写入')
    if (optNormalize.checked) {
      // 微信粘贴完会异步把 HTML 规整一遍，这会让「按 innerHTML 全等」的
      // 脏检查误判成用户手动改过
      setTimeout(() => {
        let n = 0
        body.querySelectorAll<HTMLElement>('section,p,h1,h2,h3,span').forEach((el) => {
          el.setAttribute('data-mp-normalized', String(++n))
          if (el.style.cssText) el.style.cssText = el.style.cssText.replace(/;\s*$/, '') + ';'
        })
        log(`模拟微信规整 HTML：改写了 ${n} 个元素的属性`)
      }, 120)
    }
  })

  body.addEventListener('input', () => log('编辑器收到 input 事件（脏检查会触发自动保存）'))

  // 受控组件：任何外部对 DOM 的改动都会被它按自己的数据模型重渲染掉
  const MODEL = '<p>这里是原有正文，一行占位内容。</p>'
  let reverting = false
  /** 编辑器「自己模型里」的那一版，用来模拟样式回退 */
  let previousVersion = MODEL
  const observer = new MutationObserver(() => {
    if (reverting) return
    if (!optRevert.checked && !optRevertPrev.checked) {
      // 没开还原时，把当前内容记为「上一版」
      previousVersion = body.innerHTML
      return
    }
    const target = optRevert.checked ? MODEL : previousVersion
    reverting = true
    setTimeout(() => {
      body.innerHTML = target
      log(
        optRevert.checked
          ? '模拟受控编辑器：已把外部写入的内容还原回占位内容'
          : '模拟受控编辑器：已回退到上一版（文字不变、样式回退）',
      )
      setTimeout(() => { reverting = false }, 50)
    }, 400)
  })
  observer.observe(body, { childList: true, subtree: true, characterData: true })

  /** 编辑器自己的命令通道有没有被用过（ProseMirror 模式下判断全选是否可信） */
  let selectAllUsed = false

  // 模拟「execCommand 被拦掉」的情况
  const nativeExec = doc.execCommand.bind(doc)
  doc.execCommand = ((cmd: string, ui?: boolean, value?: string) => {
    if (cmd === 'selectAll') {
      const ok = nativeExec(cmd, ui, value)
      selectAllUsed = ok
      log(`execCommand("selectAll") → ${ok}（编辑器认可这个全选）`)
      return ok
    }
    if (!optExec.checked) {
      log(`execCommand("${cmd}") 被配置为失效（模拟二级通道失效）`)
      return false
    }
    const ok = nativeExec(cmd, ui, value)
    log(`execCommand("${cmd}") → ${ok}`)
    return ok
  }) as typeof doc.execCommand

  log('编辑器已就绪：iframe#ueditor_0 > body[contenteditable]')
}

for (const el of [optPaste, optExec, optEditor, optNormalize, optRevert, optRevertPrev, optProseMirror, optAlwaysAppend, optPmTable]) {
  el.addEventListener('change', () => {
    if (el === optEditor) buildEditor()
    log(`选项变更：${el.id} = ${el.checked}`)
  })
}

document.getElementById('btn-clear-log')!.addEventListener('click', () => {
  lines = []
  logEl.textContent = '（已清空）'
})

/**
 * 复现微信保存草稿时的行为：给每个表格补上空的 caption / tfoot / colgroup，
 * 再塞一张空表格。这些是在我们清理之后出现的，所以存完稿空白格会回来。
 */
document.getElementById('btn-save')!.addEventListener('click', () => {
  const doc = (document.getElementById('ueditor_0') as HTMLIFrameElement | null)?.contentDocument
  if (!doc) return log('没有编辑器')
  let n = 0
  for (const table of Array.from(doc.body.querySelectorAll('table'))) {
    // 微信的规整逻辑是「保证有一个 caption」，已经有了就不再补。
    // 所以主动放一个隐藏的占位能挡住它——这正是要验证的点。
    if (!table.querySelector('caption')) {
      table.insertAdjacentHTML('afterbegin', '<caption></caption>')
      n++
    }
    if (!table.querySelector('tfoot')) {
      table.insertAdjacentHTML('beforeend', '<tfoot><tr><td></td></tr></tfoot>')
      n++
    }
    if (!table.querySelector('colgroup')) {
      table.insertAdjacentHTML('afterbegin', '<colgroup><col><col></colgroup>')
      n++
    }
  }
  log(`模拟保存草稿：给表格补了 ${n} 处空骨架`)
})

document.getElementById('btn-dump')!.addEventListener('click', () => {
  const body = (document.getElementById('ueditor_0') as HTMLIFrameElement | null)?.contentDocument?.body
  log(body ? `当前正文 HTML 长度：${body.innerHTML.length}` : '没有编辑器')
})

buildEditor()

// 打桩就位后再加载真实的 content script
void import('../../extension/content/content').then(() => log('content script 已注入'))
