import panelCss from '@ui/panel.css?inline'
import ownCss from './content.css?inline'
import { DEFAULT_OPTIONS, THEMES, render, restyleElement, type RenderOptions } from '@core/index'
import { createSettings } from '@ui/settings'
import { chromeStore } from '@ui/storage'
import { copyRichText } from '@ui/clipboard'
import { enableDropImport, pickMarkdownFile, readMarkdownFile } from '@ui/import'
import { IMPORT_ACCEPT } from '@core/index'
import { SAMPLE_MARKDOWN } from '@ui/presets'
import { EditorNotFoundError, buildDiagnostics, describeEditor, insertIntoEditor, readEditorSnapshot, type InsertMode } from './wechat-editor'

const HOST_ID = 'wx-typeset-host'

if (!document.getElementById(HOST_ID)) {
  void mount()
}

async function mount() {
  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'all:initial'
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = ownCss + '\n' + panelCss
  shadow.appendChild(style)

  const root = document.createElement('div')
  root.className = 'wxt-root'
  root.innerHTML = template()
  shadow.appendChild(root)
  document.documentElement.appendChild(host)

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T

  const launcher = $<HTMLButtonElement>('.wxt-launcher')
  const panel = $<HTMLElement>('.wxt-panel')
  const editor = $<HTMLTextAreaElement>('.wxt-editor')
  const previewFrame = $<HTMLIFrameElement>('.wxt-preview')
  const settingsHost = $<HTMLElement>('.wxt-settings-host')
  const statusEl = $<HTMLElement>('.wxt-status')
  const modeSel = $<HTMLSelectElement>('.wxt-mode')
  const btnInsert = $<HTMLButtonElement>('[data-act="insert"]')
  const btnCopy = $<HTMLButtonElement>('[data-act="copy"]')
  const btnSample = $<HTMLButtonElement>('[data-act="sample"]')
  const liveToggle = $<HTMLInputElement>('.wxt-live')
  const liveHint = $<HTMLElement>('[data-live-hint]')
  const conflictBox = $<HTMLElement>('.wxt-conflict')
  const autoFollow = $<HTMLInputElement>('.wxt-autofollow')
  const sourceSel = $<HTMLSelectElement>('.wxt-source')
  const sourceNote = $<HTMLElement>('[data-source-note]')
  const counter = $<HTMLElement>('[data-counter]')
  const editorInfo = $<HTMLElement>('[data-editor-info]')
  const fileInput = $<HTMLInputElement>('.wxt-file')
  const writeView = $<HTMLElement>('[data-view="write"]')
  const dropzone = $<HTMLElement>('.wxt-dropzone')

  let options: RenderOptions = await chromeStore.loadOptions()
  /** 排版结果：内容可能来自面板的 Markdown，也可能来自正文现有内容 */
  let latest: { html: string; text: string; warnings: string[] } | null = null
  /** panel = 内容用面板的 Markdown；editor = 内容用正文现有的，只换样式 */
  let source: 'panel' | 'editor' = 'panel'

  /**
   * 只换样式模式：内容从正文读，套上当前主题再写回去。
   * 这样正文是内容的唯一来源，用户在左边怎么改都不会被面板覆盖。
   */
  function buildFromEditor(): { html: string; text: string; warnings: string[] } {
    const snapshot = readEditorSnapshot()
    if (snapshot === null) {
      return { html: '', text: '', warnings: ['没找到正文编辑器'] }
    }
    const box = document.createElement('div')
    box.innerHTML = snapshot
    const r = restyleElement(box, options)
    return { html: box.innerHTML, text: box.textContent ?? '', warnings: r.warnings }
  }

  /* ---------- 预览 ---------- */

  function initPreview() {
    const doc = previewFrame.contentDocument
    if (!doc) return
    doc.open()
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
        'html,body{margin:0;padding:0}body{padding:18px 14px}img{max-width:100%}' +
        '</style></head><body><div id="root"></div></body></html>',
    )
    doc.close()
  }

  let timer: number | undefined
  function scheduleRender() {
    window.clearTimeout(timer)
    timer = window.setTimeout(update, 140)
  }

  function update() {
    try {
      renderNow()
    } catch (err) {
      // 渲染一旦抛异常，预览和同步都会停在旧状态，必须让用户看见
      console.error('[一键排版] 渲染失败', err)
      status(`排版出错：${err instanceof Error ? err.message : String(err)}`, 'err')
    }
  }

  function renderNow() {
    if (source === 'editor') {
      latest = buildFromEditor()
    } else {
      const r = render(editor.value, options)
      latest = { html: r.html, text: r.text, warnings: r.warnings }
    }
    const node = previewFrame.contentDocument?.getElementById('root')
    if (node) node.innerHTML = latest.html
    counter.textContent =
      source === 'editor'
        ? `正文 ${(latest?.text ?? '').replace(/\s/g, '').length} 字`
        : `${editor.value.replace(/\s/g, '').length} 字`
    // 空的时候把导入提示亮出来，不然「导入 .md」很容易被忽略
    dropzone.hidden = source === 'editor' || editor.value.trim().length > 0
    void chromeStore.saveDraft(editor.value)
    if (latest.warnings.length) status(latest.warnings[0], 'warn')
    scheduleLiveSync()
  }

  /* ---------- 实时同步：改设置就自动刷新左边的正文 ---------- */

  let liveOn = false
  /** 上一次同步完成时正文的文字指纹，用来判断用户有没有手动改过 */
  let lastSynced: string | null = null
  let syncTimer: number | undefined
  let syncing = false
  let syncSeq = 0

  /**
   * 只取文字、丢掉标签和属性。
   * 微信在粘贴之后会自己规整 HTML（补 data-*、重写 style、懒加载图片），
   * 拿 innerHTML 全等去判断，第二次同步就会被误判成「用户手动改过」而停掉。
   */
  /** 正文有多少个非空白字符 */
  function textLengthOf(html: string | null): number {
    return html ? html.replace(/<[^>]*>/g, '').replace(/\s/g, '').length : 0
  }

  function fingerprint(html: string): string {
    return html
      .replace(/<[^>]*>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, '')
  }

  function stopLive(reason: string, kind: 'warn' | 'err' = 'warn') {
    liveOn = false
    liveToggle.checked = false
    lastSynced = null
    conflictPending = false
    conflictBox.hidden = true
    lastSeenFingerprint = null
    quietTicks = 0
    window.clearTimeout(syncTimer)
    stopEditWatch()
    updateLiveHint()
    status(reason, kind)
  }

  function updateLiveHint() {
    const row = $<HTMLElement>('[data-autofollow-row]')
    row.hidden = source !== 'editor'
    const replaceMode = modeSel.value === 'replace'
    liveToggle.disabled = !replaceMode
    if (!replaceMode) {
      liveHint.textContent = '仅「替换全文」模式可用'
    } else if (liveOn) {
      liveHint.textContent =
        source === 'editor' ? '改设置后自动给正文换样式' : '改设置后约 0.8 秒自动刷新正文'
    } else {
      liveHint.textContent =
        source === 'editor'
          ? '打开后改主题、拖滑块，正文的样式自动跟着变（内容不动）'
          : '打开后改主题、拖滑块，左边正文自动跟着变'
    }
  }

  let syncingSince = 0
  /** 正文被手动改过，正在等你决定以哪边为准 */
  let conflictPending = false
  let editWatchTimer: number | undefined

  /**
   * 「清了还在」连续发生的次数。
   * 注意计的不是总次数：用户每次保存草稿都是独立操作，
   * 按总数封顶会让人存几次之后就再也不自动清了。
   * 这里只防「编辑器立刻补回来」造成的无限对拉。
   */
  let failedCleans = 0
  let cleanGiveUpNotified = false
  let lastAutoClean = 0

  /** 保存草稿后微信会把空骨架补回来，这里盯着自动再清一次 */
  async function janitorTick() {
    if (!liveOn || syncing || conflictPending || source !== 'editor') return
    if (Date.now() - lastAutoClean < 8000) return
    if (countVisibleBlanks() < 2) return

    if (failedCleans >= 3) {
      if (!cleanGiveUpNotified) {
        cleanGiveUpNotified = true
        status('空白格被编辑器反复补回来，已停止自动清理。需要时点「清理空白格」', 'warn')
      }
      return
    }

    lastAutoClean = Date.now()
    update()
    await runLiveSync(true)

    if (countVisibleBlanks() < 2) {
      failedCleans = 0
      cleanGiveUpNotified = false
      status('保存后空白格又出现了，已自动清理掉', 'warn')
    } else {
      failedCleans++
    }
  }

  /** 上一轮看到的正文指纹，用来判断用户停手没有 */
  let lastSeenFingerprint: string | null = null
  let quietTicks = 0

  /**
   * 只改样式模式下，正文里新加的内容也要自动套上样式。
   * 但不能一边打字一边重写——整篇重写会把光标顶走。
   * 所以等指纹连续两拍（约 3 秒）不变、也就是用户停手了，再动。
   */
  async function restyleNewContent() {
    const current = readEditorSnapshot()
    if (current === null) return
    const fp = fingerprint(current)
    if (fp === lastSynced) {
      quietTicks = 0
      lastSeenFingerprint = fp
      return
    }
    if (fp !== lastSeenFingerprint) {
      lastSeenFingerprint = fp
      quietTicks = 0
      return
    }
    if (++quietTicks < 2) return
    quietTicks = 0
    update()
    await runLiveSync(true)
  }

  /** 实时同步开着时，持续留意正文有没有被手动编辑 */
  function startEditWatch() {
    stopEditWatch()
    editWatchTimer = window.setInterval(() => {
      if (!liveOn || syncing || conflictPending || lastSynced === null) return
      if (source === 'editor') {
        // 正文是内容来源，改它不算冲突。
        // 「自动跟随」只管「新写的内容要不要自动套样式」——那个会在打字时打断人，默认关着。
        // 保存后冒出来的空白格是另一回事，跟打字无关，不能被这个开关连坐。
        void janitorTick()
        if (autoFollow.checked) void restyleNewContent()
        return
      }
      const current = readEditorSnapshot()
      if (current === null) return
      if (fingerprint(current) !== lastSynced) raiseConflict()
    }, 1500)
  }

  function stopEditWatch() {
    window.clearInterval(editWatchTimer)
    editWatchTimer = undefined
  }

  /**
   * 正文被手动改过。方向该由用户定，插件不替他做主：
   * 要么保留正文里的改动（停同步），要么以面板为准（覆盖正文）。
   */
  function raiseConflict() {
    if (conflictPending) return
    conflictPending = true
    window.clearTimeout(syncTimer)
    conflictBox.hidden = false
    status('正文被手动改过，请在上方选择以哪边为准', 'warn')
  }

  function resolveConflict(keep: 'editor' | 'panel') {
    conflictPending = false
    conflictBox.hidden = true
    if (keep === 'editor') {
      stopLive('已以正文为准：保留你在正文里的改动，实时同步已关闭')
    } else {
      // 以面板为准：重新对齐基线，立刻覆盖一次
      lastSynced = null
      forceNextSync = true
      status('以面板为准，正在覆盖正文……')
      void runLiveSync()
    }
  }

  function scheduleLiveSync() {
    if (!liveOn || conflictPending) return
    // 看门狗：syncing 万一卡住，后面所有同步都会静默失效
    if (syncing && Date.now() - syncingSince > 8000) {
      console.warn('[一键排版] 上一次同步超时未结束，已强制解锁')
      syncing = false
    }
    window.clearTimeout(syncTimer)
    // 防抖：拖滑块时不能每动一下就重写一次正文，否则微信的撤销栈和自动保存都会被刷爆
    syncTimer = window.setTimeout(() => void runLiveSync(), 800)
  }

  let pendingSync = false

  /** 下一次同步强制覆盖（用户选了「以面板为准」） */
  let forceNextSync = false

  async function runLiveSync(manual = false) {
    if ((!liveOn && !manual) || !latest) return
    if (!latest.html.trim()) return
    // 同步进行中又来了新改动：记下来，等这次结束后补一次，否则最后一次设置会丢
    if (syncing) {
      pendingSync = true
      return
    }
    if (manual) forceNextSync = true

    // 正文被手动改过就停下，宁可不同步也不能覆盖掉用户自己写的东西
    const current = readEditorSnapshot()
    if (current === null) {
      stopLive('正文编辑器不见了，实时同步已关闭', 'err')
      return
    }
    // 只换样式模式下正文就是内容来源，用户改它是天经地义的，不算冲突
    if (source === 'panel' && lastSynced !== null && fingerprint(current) !== lastSynced) {
      raiseConflict()
      return
    }

    syncing = true
    syncingSince = Date.now()
    // 插入前的字数，用来识别「替换退化成追加」
    const preSyncLength = textLengthOf(readEditorSnapshot())
    // 先取出再清零，请求里要用取出来的那个值
    const forcedThisTime = forceNextSync
    forceNextSync = false
    // 同步要 focus 正文来放光标，会把焦点从面板抢走：
    // 正在面板里打字的话，后续按键就跑进文章里了。先存着，插完还回去。
    const restoreFocus = captureFocus()
    try {
      const { resultHtml, via, persisted } = await insertIntoEditor({
        html: latest.html,
        plain: latest.text,
        mode: 'replace',
        markers: currentMarkers(),
        styleMarkers: currentStyleMarkers(),
        // 只改样式模式下内容就是从正文读的，文字永远相等，
        // 「已是最新」的判断恒成立——新加的段落会永远套不上样式
        force: forcedThisTime || source === 'editor',
        preserveCaret: source === 'editor',
        onProgress: (msg) => status(msg),
        onRevert: (result) => {
          if (result === 'repaired') {
            status('编辑器还原过一次，已自动补插', 'warn')
            lastSynced = fingerprint(readEditorSnapshot() ?? '')
          } else {
            stopLive('内容反复被编辑器还原，实时同步已关闭。请点「仅复制」手动粘贴', 'err')
          }
        },
      })
      const themeName = THEMES.find((t) => t.id === options.theme)?.name ?? options.theme
      syncSeq++
      if (via === 'skipped') {
        status(`正文已是最新 · ${themeName}`, 'ok')
        lastSynced = fingerprint(readEditorSnapshot() ?? resultHtml)
        return
      }
      if (!persisted) {
        // 写进去了又被编辑器还原回去——继续同步只会空转，不如停下来说清楚
        lastSynced = null
        stopLive(
          `第 ${syncSeq} 次同步写入后被编辑器还原了（通道：${via}），实时同步已关闭。` +
            '请点「仅复制」手动粘贴，并点「诊断」把报告发给开发者',
          'err',
        )
        return
      }
      lastSynced = fingerprint(readEditorSnapshot() ?? resultHtml)

      // 硬防护：比的是「这一次插入前后」的字数。
      // 换样式本身绝不该改变文字，前后不等就一定是重复插入。
      // 不能拿「开启同步时的字数」当基准——用户正常写新内容也会超，会误报停机。
      const afterLen = textLengthOf(readEditorSnapshot())
      if (preSyncLength > 200 && afterLen > preSyncLength * 1.15) {
        stopLive(
          `这次同步把正文从 ${preSyncLength} 字撑到了 ${afterLen} 字，内容被重复插入了，已停止同步。` +
            '请用后台的「历史版本」回退到干净的版本',
          'err',
        )
        return
      }

      status(`正文已同步 · ${themeName} · 第 ${syncSeq} 次${via === 'paste' ? '' : `（${via}）`}`, 'ok')
    } catch (err) {
      console.error('[一键排版] 同步失败', err)
      stopLive(err instanceof Error ? `${err.message}；实时同步已关闭` : '同步失败，实时同步已关闭', 'err')
    } finally {
      syncing = false
      restoreFocus()
      if (pendingSync) {
        pendingSync = false
        if (liveOn) scheduleLiveSync()
      }
    }
  }

  /** 记下面板里当前的焦点与光标位置，返回一个还原函数 */
  function captureFocus(): () => void {
    const active = shadow.activeElement as HTMLElement | null
    if (!active || !root.contains(active)) return () => {}
    const field = active as HTMLTextAreaElement
    const canSelect = typeof field.selectionStart === 'number'
    const start = canSelect ? field.selectionStart : null
    const end = canSelect ? field.selectionEnd : null
    const scroll = field.scrollTop
    return () => {
      if (!active.isConnected) return
      active.focus({ preventScroll: true })
      if (start !== null && end !== null && typeof field.setSelectionRange === 'function') {
        try {
          field.setSelectionRange(start, end)
          field.scrollTop = scroll
        } catch {
          // 有些控件不支持设选区，忽略即可
        }
      }
    }
  }

  liveToggle.addEventListener('change', async () => {
    if (!liveToggle.checked) {
      liveOn = false
      lastSynced = null
      conflictPending = false
      conflictBox.hidden = true
      window.clearTimeout(syncTimer)
      stopEditWatch()
      updateLiveHint()
      status('已关闭实时同步')
      return
    }
    update()
    if (!latest?.html.trim()) {
      liveToggle.checked = false
      status(source === 'editor' ? '正文是空的，没有可以套样式的内容' : '先写点内容再开实时同步', 'warn')
      return
    }
    // 开启时确认一次，之后每次自动同步不再打断
    if (!confirm('开启后，每次改设置都会用排版结果覆盖正文的全部内容。\n这会占用微信的撤销记录，建议在草稿上使用。\n\n确定开启？')) {
      liveToggle.checked = false
      return
    }
    liveOn = true
    lastSynced = null
    conflictPending = false
    conflictBox.hidden = true
    updateLiveHint()
    update()
    await runLiveSync()
    startEditWatch()
  })

  sourceSel.addEventListener('change', () => {
    source = sourceSel.value === 'editor' ? 'editor' : 'panel'
    void chromeStore.saveUi({
      insertMode: modeSel.value === 'cursor' ? 'cursor' : 'replace',
      source,
    })
    applySourceMode()
    lastSynced = null
    conflictPending = false
    conflictBox.hidden = true
    update()
  })

  /** 来源不同，按钮文案、插入方式、提示都要跟着变 */
  function applySourceMode() {
    const editorSource = source === 'editor'
    btnInsert.textContent = editorSource ? '应用样式到正文' : '一键排版并插入正文'
    modeSel.disabled = editorSource
    if (editorSource) modeSel.value = 'replace'
    sourceNote.hidden = !editorSource
    updateLiveHint()
  }

  modeSel.addEventListener('change', () => {
    void chromeStore.saveUi({ insertMode: modeSel.value === 'cursor' ? 'cursor' : 'replace', source })
    if (modeSel.value !== 'replace' && liveOn) stopLive('切到「插入到末尾」后实时同步已关闭')
    else updateLiveHint()
  })

  /* ---------- 状态提示 ---------- */

  /**
   * 正文里还有多少「会显形的空白结构」。
   *
   * 微信在保存草稿时会给每个表格重新补上空的 caption / tfoot / 空表格，
   * 这发生在我们清理之后，所以存完稿子空白格会回来。
   * 只数真会占位的那几种，col/colgroup/空 span 不渲染，不用管。
   */
  function countVisibleBlanks(): number {
    const target = readEditorSnapshot()
    if (target === null) return 0
    const box = document.createElement('div')
    box.innerHTML = target
    const blank = (el: Element) =>
      !el.querySelector('img,video,iframe,svg,canvas,hr') && !(el.textContent ?? '').trim()
    // 只数我们真能清掉的。
    //
    // 表格里的 caption / colgroup 不算：公众号后台用 prosemirror-tables，
    // 这些是它 NodeView 画出来的外壳（旁边还有个 div.tableWrapper），
    // 不在文档数据里。删掉下一帧就重新画出来，白白整篇重写一遍——
    // 污染撤销栈、触发自动保存，得不偿失。
    let n = 0
    for (const el of Array.from(box.querySelectorAll('tfoot,thead,table,tr,blockquote'))) {
      if (blank(el)) n++
    }
    return n
  }

  /** 当前这套样式的标志色，用来确认正文里的样式确实是它 */
  function currentMarkers(): string[] {
    const theme = THEMES.find((t) => t.id === options.theme)
    const primary = options.primary || theme?.primary
    return primary ? [primary] : []
  }

  /**
   * 版式类参数的标志片段。
   * 字体、字号、行高、段间距改了之后文字和颜色都不变，
   * 不带上这些就会被判成「已是最新」，改了等于没改。
   */
  function currentStyleMarkers(): string[] {
    const lineHeightPx = Math.round(options.fontSize * options.lineHeight * 100) / 100
    return [
      `font-size:${options.fontSize}px`,
      `line-height:${lineHeightPx}px`,
      `margin:0 0 ${options.paragraphSpacing}px`,
      `font-family:${options.fontFamily.split(',')[0].trim()}`,
    ]
  }

  function status(msg: string, kind: 'ok' | 'warn' | 'err' | '' = '') {
    statusEl.textContent = msg
    statusEl.className = 'wxt-status' + (kind ? ` is-${kind}` : '')
  }

  function refreshEditorInfo() {
    const how = describeEditor()
    editorInfo.textContent = how ? `v2.1.0 · 已连上正文编辑器` : 'v2.1.0 · 未检测到正文编辑器'
    editorInfo.title = how ?? '请确认当前是「新建/编辑图文消息」页面'
  }

  /* ---------- 交互 ---------- */

  const open = () => {
    panel.hidden = false
    launcher.hidden = true
    refreshEditorInfo()
    update()
  }
  const close = () => {
    panel.hidden = true
    launcher.hidden = false
  }

  launcher.addEventListener('click', open)
  $('.wxt-close').addEventListener('click', close)

  root.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.wxt-tab')
    if (!tab?.dataset.tab) return
    const name = tab.dataset.tab
    root.querySelectorAll<HTMLElement>('.wxt-tab').forEach((t) => t.classList.toggle('is-active', t === tab))
    root.querySelectorAll<HTMLElement>('.wxt-view').forEach((v) => { v.hidden = v.dataset.view !== name })
    if (name === 'preview') update()
  })

  editor.addEventListener('input', scheduleRender)
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const { selectionStart: s, selectionEnd: t, value } = editor
    editor.value = value.slice(0, s) + '  ' + value.slice(t)
    editor.selectionStart = editor.selectionEnd = s + 2
    scheduleRender()
  })

  btnSample.addEventListener('click', () => {
    editor.value = SAMPLE_MARKDOWN
    update()
    status('已填入示例，可直接试排版')
  })

  /* ---------- 导入本地 .md ---------- */

  fileInput.accept = IMPORT_ACCEPT

  async function loadFile(file: File, extra = 0) {
    if (editor.value.trim() && !confirm(`用「${file.name}」的内容替换面板里当前的文字？`)) return
    status(`正在解析 ${file.name}……`)
    try {
      const result = await readMarkdownFile(file)
      editor.value = result.text
      update()
      const tail = extra ? `，另外 ${extra} 个文件已忽略` : ''
      if (result.warnings.length) status(`已导入 ${file.name}${tail}。${result.warnings[0]}`, 'warn')
      else status(`已导入 ${file.name}（${result.encoding}）${tail}`, 'ok')
    } catch (err) {
      status(err instanceof Error ? err.message : '导入失败', 'err')
    }
  }

  $('[data-act="keep-editor"]').addEventListener('click', () => resolveConflict('editor'))
  $('[data-act="keep-panel"]').addEventListener('click', () => resolveConflict('panel'))

  $('[data-act="clean"]').addEventListener('click', async () => {
    const before = countVisibleBlanks()
    if (!before) return status('正文里没有会显形的空白格', 'ok')
    if (source !== 'editor') {
      return status('清理空白格要在「只改样式」模式下用（内容以正文为准）', 'warn')
    }
    status(`发现 ${before} 处空白结构，正在清理……`)
    failedCleans = 0
    cleanGiveUpNotified = false
    update()
    await runLiveSync(true)
    const after = countVisibleBlanks()
    status(after ? `清掉了 ${before - after} 处，还剩 ${after} 处` : `已清掉 ${before} 处空白格`, after ? 'warn' : 'ok')
  })

  $('[data-act="diag"]').addEventListener('click', async () => {
    update()
    const report =
      buildDiagnostics(latest?.html ?? '', modeSel.value as InsertMode) +
      `\n实时同步: ${liveOn ? '开' : '关'} | 已同步次数: ${syncSeq}` +
      `\n当前主题: ${options.theme} | 字号: ${options.fontSize} | 行高: ${options.lineHeight}` +
      `\n面板字数: ${editor.value.length}`
    console.log('[一键排版] 诊断报告\n' + report)
    try {
      await copyRichText(report.replace(/\n/g, '<br>'), report)
      status('诊断报告已复制到剪贴板，粘贴发给开发者即可（控制台也打印了一份）', 'ok')
    } catch {
      status('诊断报告已打印到控制台（F12 → Console），请复制发给开发者', 'warn')
    }
  })

  $('[data-act="import"]').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const { file, extra } = pickMarkdownFile(fileInput.files)
    if (file) void loadFile(file, extra)
    fileInput.value = ''
  })

  // 拖到面板任意位置都能导入
  enableDropImport(root, {
    onFile: (file, extra) => void loadFile(file, extra),
    onDragState: (dragging) => {
      writeView.classList.toggle('is-dragover', dragging)
      if (dragging && panel.hidden) open()
    },
  })

  btnInsert.addEventListener('click', async () => {
    update()
    if (!latest?.html.trim()) {
      return status(source === 'editor' ? '正文是空的，没有可以套样式的内容' : '先写点内容吧', 'warn')
    }
    const mode = modeSel.value as InsertMode
    if (mode === 'replace' && !confirm('将用排版结果替换正文里的全部内容，继续？')) return

    btnInsert.disabled = true
    status('正在插入……')
    try {
      const { via, resultHtml, persisted } = await insertIntoEditor({
        html: latest!.html,
        plain: latest!.text,
        mode,
        markers: currentMarkers(),
        styleMarkers: currentStyleMarkers(),
        // 用户已确认“替换全文”时必须真正重写，避免代码升级后旧 HTML 被误判为最新。
        force: mode === 'replace',
        onProgress: (msg) => status(msg),
        onRevert: (result) =>
          result === 'repaired'
            ? status('编辑器把内容还原过一次，已自动补插', 'warn')
            : status('内容反复被编辑器还原，请点「仅复制」手动粘贴', 'err'),
      })
      if (mode === 'replace') lastSynced = fingerprint(resultHtml)
      if (!persisted) {
        status(
          `内容写进去了但被编辑器还原了（通道：${via}）。请点「仅复制」手动粘贴，` +
            '并点「诊断」把报告发给开发者',
          'err',
        )
      } else if (via === 'skipped') {
        status('正文已经是当前排版效果，无需重复插入', 'ok')
      } else if (via === 'innerHTML') {
        status('已插入，但走的是兜底通道：请在正文里随便敲一下再删掉，触发微信的自动保存', 'warn')
      } else {
        status(`已插入正文（${via === 'paste' ? '模拟粘贴' : '编辑命令'}），确认无误后保存`, 'ok')
      }
    } catch (err) {
      if (err instanceof EditorNotFoundError) {
        status(err.message + '；也可以点「仅复制」再手动粘贴', 'err')
      } else {
        // 注入这条路走不通时，剪贴板永远是可用的退路
        try {
          await copyRichText(latest!.html, latest!.text)
          status('自动插入失败，已把排版结果复制到剪贴板，请在正文里 Ctrl/Cmd+V', 'warn')
        } catch {
          status(err instanceof Error ? err.message : '插入失败', 'err')
        }
      }
    } finally {
      btnInsert.disabled = false
      refreshEditorInfo()
    }
  })

  btnCopy.addEventListener('click', async () => {
    update()
    if (!latest?.html.trim()) {
      return status(source === 'editor' ? '正文是空的，没有可以套样式的内容' : '先写点内容吧', 'warn')
    }
    try {
      await copyRichText(latest!.html, latest!.text)
      status('已复制，在正文里 Ctrl/Cmd+V 粘贴即可', 'ok')
    } catch (err) {
      status(err instanceof Error ? err.message : '复制失败', 'err')
    }
  })

  /* ---------- 设置 ---------- */

  const settings = createSettings(options, (patch) => {
    failedCleans = 0
    cleanGiveUpNotified = false
    options = { ...options, ...patch }
    void chromeStore.saveOptions(options)
    update()
  })
  settingsHost.appendChild(settings.el)

  $('[data-act="reset"]').addEventListener('click', () => {
    options = { ...DEFAULT_OPTIONS }
    settings.sync(options)
    void chromeStore.saveOptions(options)
    update()
    status('已恢复默认设置')
  })

  /* ---------- 来自 popup 的开关消息 ---------- */

  chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
    if (msg?.type === 'wxt:toggle') {
      panel.hidden ? open() : close()
      sendResponse({ ok: true })
    }
    if (msg?.type === 'wxt:ping') sendResponse({ ok: true, editor: describeEditor() })
    return true
  })

  /* ---------- 启动 ---------- */

  previewFrame.addEventListener('load', () => { initPreview(); update() })
  initPreview()
  const ui = await chromeStore.loadUi()
  modeSel.value = ui.insertMode
  source = ui.source
  sourceSel.value = source
  applySourceMode()
  const draft = await chromeStore.loadDraft()
  editor.value = draft ?? ''
  update()
  refreshEditorInfo()
}

function template(): string {
  return `
  <button class="wxt-launcher" type="button" title="打开一键排版面板">排<br />版</button>
  <aside class="wxt-panel" hidden>
    <div class="wxt-head">
      <div class="wxt-title">公众号一键排版<small data-editor-info>v2.1.0 · 检测中……</small></div>
      <button class="wxt-close" type="button" title="收起">×</button>
    </div>
    <div class="wxt-tabs">
      <button class="wxt-tab is-active" type="button" data-tab="write">写作</button>
      <button class="wxt-tab" type="button" data-tab="preview">预览</button>
      <button class="wxt-tab" type="button" data-tab="settings">设置</button>
    </div>
    <div class="wxt-body">
      <div class="wxt-meta">
        <span data-counter>0 字</span>
        <span>
          <button class="wxt-import" type="button" data-act="import" title="支持 Markdown / txt / Word(.docx) / PDF"><span class="wxt-import-icon">⤓</span>导入文件</button>
          <button class="wxt-mini" type="button" data-act="clean">清理空白格</button>
          <button class="wxt-mini" type="button" data-act="diag">诊断</button>
          <button class="wxt-mini" type="button" data-act="sample">填入示例</button>
          <button class="wxt-mini" type="button" data-act="reset">重置设置</button>
        </span>
      </div>
      <div class="wxt-view" data-view="write">
        <p class="wxt-source-note" data-source-note hidden>
          当前是<b>只改样式</b>模式：内容以左边正文为准，这里写的 Markdown 不会被用上。
          你可以直接在正文里改字，然后在「设置」里调主题。
        </p>
        <div class="wxt-editor-wrap">
          <textarea class="wxt-editor" spellcheck="false" placeholder="在这里写 Markdown……"></textarea>
          <div class="wxt-dropzone" hidden>
            <div class="wxt-dropzone-icon">⤓</div>
            <p class="wxt-dropzone-title">把文件拖到这里</p>
            <p class="wxt-dropzone-sub">支持 Markdown / txt / Word(.docx) / PDF<br />也可以点上方的「导入文件」，或直接在这里开始写</p>
          </div>
        </div>
      </div>
      <input class="wxt-file" type="file" hidden />
      <div class="wxt-view" data-view="preview" hidden>
        <div class="wxt-preview-wrap"><iframe class="wxt-preview" title="排版预览"></iframe></div>
      </div>
      <div class="wxt-view" data-view="settings" hidden>
        <div class="wxt-settings-host"></div>
      </div>
    </div>
    <div class="wxt-foot">
      <div class="wxt-foot-row wxt-source-row">
        <span class="wxt-source-label">内容来源</span>
        <select class="wxt-source" title="排版的内容从哪来">
          <option value="panel">面板里的 Markdown</option>
          <option value="editor">正文现有内容（只改样式）</option>
        </select>
      </div>
      <div class="wxt-foot-row">
        <select class="wxt-mode" title="插入方式">
          <option value="replace">替换全文</option>
          <option value="cursor">插入到末尾</option>
        </select>
        <button class="wxt-btn wxt-btn-primary" type="button" data-act="insert">一键排版并插入正文</button>
        <button class="wxt-btn" type="button" data-act="copy">仅复制</button>
      </div>
      <div class="wxt-conflict" hidden>
        <p class="wxt-conflict-title">正文被手动改过了</p>
        <p class="wxt-conflict-desc">继续同步会覆盖你在正文里的修改。以哪边为准？</p>
        <div class="wxt-conflict-btns">
          <button class="wxt-btn" type="button" data-act="keep-editor">以正文为准（停止同步）</button>
          <button class="wxt-btn wxt-btn-primary" type="button" data-act="keep-panel">以面板为准（覆盖正文）</button>
        </div>
      </div>
      <label class="wxt-live-row">
        <input type="checkbox" class="wxt-live" />
        <span>实时同步到正文<em data-live-hint></em></span>
      </label>
      <label class="wxt-live-row" data-autofollow-row>
        <input type="checkbox" class="wxt-autofollow" />
        <span>正文改动后自动套样式<em>默认关闭。打开后你在正文里停手约 3 秒就会整篇重排，写作时会打断你</em></span>
      </label>
      <p class="wxt-status"></p>
    </div>
  </aside>`
}
