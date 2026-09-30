/**
 * 公众号后台正文编辑器桥接层。
 *
 * 微信的编辑器是 UEditor 系的「iframe + contenteditable」结构，
 * 直接改 innerHTML 会绕过它自己的变更追踪，导致自动保存不触发。
 * 所以插入分三级降级，优先让微信自己的粘贴逻辑接管：
 *   1. 合成 paste 事件（等价于用户手动粘贴，兼容性最好）
 *   2. execCommand('insertHTML')（会触发 input 事件）
 *   3. 直接写 innerHTML（最后手段，会提示用户手动改一个字来触发保存）
 * 三级都失败就退回剪贴板，让用户自己 Ctrl+V。
 */

import { containsSameContent, hasColor, hasStyleFragments, hasStyleSignature, plainTextOf, styleSignature } from '@core/index'

export interface EditorTarget {
  doc: Document
  root: HTMLElement
  /** 命中方式，用于排查问题 */
  how: string
}

export type InsertMode = 'replace' | 'cursor'
export type InsertVia = 'paste' | 'execCommand' | 'innerHTML' | 'skipped'

export class EditorNotFoundError extends Error {
  constructor() {
    super('没找到公众号正文编辑器，请确认已打开「新建图文消息」页面并点进正文区域')
    this.name = 'EditorNotFoundError'
  }
}

const EDITABLE = '[contenteditable="true"], [contenteditable=""]'

/** 正文区至少这么大，用来排除标题、摘要等小输入框 */
const MIN_AREA = 120 * 120

/**
 * 不能用 `el instanceof HTMLElement` 判断：
 * iframe 里的元素属于 iframe 自己的 window，和主页面的 HTMLElement 不是同一个构造函数，
 * instanceof 永远为 false —— 正文区会被整个过滤掉，然后退而选中主文档里的标题框，
 * 表现就是「提示已同步，但正文一点没变」。这里改用鸭子类型判断。
 */
function isElement(el: unknown): el is HTMLElement {
  return !!el && (el as Node).nodeType === 1 && typeof (el as HTMLElement).getBoundingClientRect === 'function'
}

function isUsable(el: Element | null): el is HTMLElement {
  if (!isElement(el)) return false
  const rect = el.getBoundingClientRect()
  // 面板收起时编辑区可能是 0 尺寸，此时放宽判断
  return rect.width * rect.height >= MIN_AREA || rect.width === 0
}

/**
 * 收集页面里所有可编辑区域。
 * 不能一命中就返回：公众号后台的标题、摘要也是 contenteditable，
 * 页面里还可能有别的 iframe，选错目标就会「显示已同步但正文没动」。
 */
export function collectEditors(): EditorTarget[] {
  const found: EditorTarget[] = []

  const addFrom = (doc: Document, label: string) => {
    const body = doc.body
    if (body && (body.isContentEditable || body.getAttribute('contenteditable') !== null)) {
      found.push({ doc, root: body, how: `${label} > body` })
    }
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(EDITABLE))) {
      if (el === body) continue
      found.push({ doc, root: el, how: `${label} ${describe(el)}` })
    }
  }

  for (const frame of Array.from(document.querySelectorAll('iframe'))) {
    let doc: Document | null = null
    try {
      doc = frame.contentDocument
    } catch {
      continue // 跨域 iframe，读不到就跳过
    }
    if (doc) addFrom(doc, `iframe#${frame.id || '(无 id)'}`)
  }
  addFrom(document, 'document')

  return found
}

/**
 * 正文是页面上最大的那块可编辑区域。
 * 标题、摘要这类单行框宽度和正文差不多，所以除了面积还要看高度：
 * 明显比一行高的优先，避免在窄屏下和标题框打平。
 */
export function findEditor(): EditorTarget | null {
  const usable = collectEditors().filter((t) => isUsable(t.root))
  if (!usable.length) return null
  const score = (t: EditorTarget) => {
    const r = t.root.getBoundingClientRect()
    const tall = r.height >= 120 ? 1 : 0
    return tall * 1e9 + r.width * r.height
  }
  return usable.sort((a, b) => score(b) - score(a))[0]
}

function describe(el: HTMLElement): string {
  return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${String(el.className).split(/\s+/)[0]}` : '')
}

/** 把光标放到正文里；replace 模式下选中全部内容以便被覆盖 */
function placeSelection(target: EditorTarget, mode: InsertMode) {
  const { doc, root } = target
  root.focus({ preventScroll: true })
  const win = doc.defaultView
  const sel = win?.getSelection()
  if (!sel) return

  if (mode === 'replace') {
    // ProseMirror 这类受控编辑器维护自己的选区模型，
    // 手工造的 Range 它不一定认，全选就变成了「没选中」——粘贴于是成了追加。
    // execCommand('selectAll') 走编辑器自己的命令通道，它能正确映射成全文选区。
    // 但删除正文后可能残留空的 blockquote/p 外壳；此时 selectAll 会把选区落在
    // 外壳内部，后续整篇内容就会被塞进引用块。没有文字时必须直接选中 root 的子节点。
    const hasText = (root.textContent ?? '').replace(/\s+/g, '').length > 0
    if (hasText) {
      try {
        if (doc.execCommand('selectAll') && selectionCoversRoot(doc, root)) return
      } catch {
        // 不支持就退回手工 Range
      }
    }
  }

  const range = doc.createRange()
  range.selectNodeContents(root)
  // UI 的 cursor 模式语义是“插入到末尾”。不能沿用正文内已有光标，否则整篇
  // section/table 会被粘进当前 p，ProseMirror 重组非法嵌套时可能吞字并触发结构告警。
  if (mode !== 'replace') range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

/* ---------------- 光标位置保持 ---------------- */

/** 光标在正文纯文字里的绝对偏移 */
function caretOffset(root: HTMLElement, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null
  let total = 0
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    if (n === node) return total + offset
    total += (n.nodeValue ?? '').length
  }
  // 光标落在元素节点上时，按它前面所有文字的长度算
  return total
}

function setCaretAtOffset(target: EditorTarget, offset: number) {
  const { doc, root } = target
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let seen = 0
  let n: Node | null
  while ((n = walker.nextNode())) {
    const len = (n.nodeValue ?? '').length
    if (seen + len >= offset) {
      const range = doc.createRange()
      range.setStart(n, Math.max(0, Math.min(len, offset - seen)))
      range.collapse(true)
      const sel = doc.defaultView?.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
    seen += len
  }
}

/**
 * 记住光标在正文里的位置，返回还原函数。
 *
 * 换样式时整篇会被重写一遍，光标会跑到文末。
 * 用户正在正文里打字时这非常打断人，所以按「纯文字里的第几个字」记，
 * 重写后再按同一个偏移找回去——换样式不改文字，偏移是稳的。
 */
function captureCaret(target: EditorTarget): () => void {
  const sel = target.doc.defaultView?.getSelection()
  if (!sel || !sel.rangeCount) return () => {}
  const range = sel.getRangeAt(0)
  const offset = caretOffset(target.root, range.startContainer, range.startOffset)
  if (offset === null) return () => {}
  return () => {
    try {
      setCaretAtOffset(target, offset)
    } catch {
      // 结构变化太大时找不回来就算了
    }
  }
}

/* ---------------- 滚动位置保持 ---------------- */

/** 锚点的身份：用文字内容而不是序号，换主题时文字不变、结构可能变 */
function blockKey(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
}

/**
 * 在重排后的块里找回锚点。
 * 先看原序号处是不是同一段，不是就从原序号向两侧找最近的同文本块，
 * 都找不到（比如正文是空的、或内容整个换了）才退回按序号取。
 */
function matchAnchor(blocks: HTMLElement[], index: number, key: string): HTMLElement | null {
  if (!blocks.length) return null
  const at = blocks[Math.min(index, blocks.length - 1)]
  if (key && blockKey(at) === key) return at
  if (key) {
    for (let step = 1; step < blocks.length; step++) {
      const before = blocks[index - step]
      if (before && blockKey(before) === key) return before
      const after = blocks[index + step]
      if (after && blockKey(after) === key) return after
      if (index - step < 0 && index + step >= blocks.length) break
    }
  }
  return at
}

/**
 * 全选是不是真的把正文区选住了。
 *
 * execCommand('selectAll') 在焦点没落进编辑器时会选中整个页面，
 * range 非空但根本不是正文——粘贴就变成了追加，正文越滚越大。
 * 所以要确认选区落在正文区内，而且覆盖了它绝大部分文字。
 */
function selectionCoversRoot(doc: Document, root: HTMLElement): boolean {
  const sel = doc.defaultView?.getSelection()
  if (!sel || !sel.rangeCount) return false
  const range = sel.getRangeAt(0)
  if (range.collapsed) return false
  if (!root.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== root) return false
  const selected = sel.toString().replace(/\s+/g, '').length
  const whole = (root.textContent ?? '').replace(/\s+/g, '').length
  if (whole === 0) {
    // 空文字不等于空结构：<blockquote><br></blockquote> 仍会污染下一次插入。
    // 只有选区边界确实覆盖 root 的全部子节点，才算真正全选。
    return range.startContainer === root && range.startOffset === 0 &&
      range.endContainer === root && range.endOffset === root.childNodes.length
  }
  return selected >= whole * 0.9
}

/** 排版结果最外层容器的标记，用来发现重复/嵌套 */
const CONTAINER_MARK = '[data-tool="wx-typeset"]'

export function countContainers(root: HTMLElement): number {
  return root.querySelectorAll(CONTAINER_MARK).length
}

/**
 * 只保留最后插入的那一个排版容器。
 *
 * 全选后粘贴时，选区可能落在已有容器的**内部**，新容器就套进了旧容器里：
 * 正文每同步一次就多一层壳，外层的字体和颜色还会串到内层上。
 * 并列的旧容器同理，直接删掉。
 */
function dedupeContainers(root: HTMLElement): number {
  const all = Array.from(root.querySelectorAll<HTMLElement>(CONTAINER_MARK))
  if (all.length < 2) return all.length

  // 保留文字最多的那个。
  // 不能一律保留内层：新内容写在旧容器外面时，外层才是全的，
  // 留内层会把新写的段落整个丢掉。按文字多少选，两种情况都不会丢内容。
  const textLen = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, '').length
  let keep = all[0]
  for (const el of all) {
    if (textLen(el) > textLen(keep)) keep = el
  }

  for (const el of all) {
    if (el === keep || !el.isConnected) continue
    if (el.contains(keep)) {
      el.replaceWith(keep) // 嵌套且内层更全：用内层顶替外层
    } else if (keep.contains(el)) {
      // 被保留者包着的旧壳：拆掉壳、内容留下，否则会一层层套下去
      el.replaceWith(...Array.from(el.childNodes))
    } else {
      el.remove() // 并列：旧的丢掉
    }
  }
  return root.querySelectorAll(CONTAINER_MARK).length
}

/** 正文的哪个祖先在滚动 */
function findScroller(root: HTMLElement, doc: Document): HTMLElement {
  const win = doc.defaultView
  let el: HTMLElement | null = root
  while (el && win) {
    const overflow = win.getComputedStyle(el).overflowY
    if (/(auto|scroll|overlay)/.test(overflow) && el.scrollHeight > el.clientHeight + 4) return el
    el = el.parentElement
  }
  return (doc.scrollingElement as HTMLElement | null) ?? doc.documentElement
}

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,blockquote,li,pre,table,figure,img,hr,section'

/**
 * 只取「叶子块」——内部不再包含其他块级元素的那些。
 * 排版结果最外层是一个包住全文的 <section>，不排除掉的话它永远第一个命中，
 * 锚点就退化成了纯 scrollTop 还原，换字号后位置会整体偏掉。
 */
function leafBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
    (el) => !el.querySelector(BLOCK_SELECTOR),
  )
}

/**
 * 记住「当前看到哪儿」，返回还原函数。
 *
 * 微信的粘贴处理器插完会把光标收到末尾，浏览器随即把光标滚进可视区，
 * 于是每同步一次正文就跳到文末。换主题又会改变内容高度，所以不能只记 scrollTop，
 * 而是记住视口顶部那个块元素的序号和它距顶的偏移，重排后按序号找回去。
 */
function captureScroll(root: HTMLElement, doc: Document): () => void {
  const scroller = findScroller(root, doc)
  const fallbackTop = scroller.scrollTop
  const isDocScroller =
    scroller === doc.scrollingElement || scroller === doc.documentElement || scroller === doc.body
  const refTop = () => (isDocScroller ? 0 : scroller.getBoundingClientRect().top)

  const blocks = leafBlocks(root)
  const base = refTop()
  let anchorIndex = -1
  let anchorText = ''
  let anchorOffset = 0
  for (let i = 0; i < blocks.length; i++) {
    const rect = blocks[i].getBoundingClientRect()
    if (rect.height === 0) continue
    if (rect.bottom > base) {
      anchorIndex = i
      anchorText = blockKey(blocks[i])
      anchorOffset = rect.top - base
      break
    }
  }

  const restore = () => {
    const next = leafBlocks(root)
    if (anchorIndex < 0 || !next.length) {
      scroller.scrollTop = fallbackTop
      return
    }
    const target = matchAnchor(next, anchorIndex, anchorText)
    if (!target) {
      scroller.scrollTop = fallbackTop
      return
    }
    const delta = target.getBoundingClientRect().top - refTop() - anchorOffset
    scroller.scrollTop += delta
  }

  return () => {
    // 微信把光标收到文末后浏览器才去滚动，而且不一定在同一帧；
    // 编辑器自身的事件回调也可能再滚一次。所以在随后的几帧里持续校正，
    // 直到位置稳定为止——单次还原挡不住这些晚到的滚动。
    restore()
    const win = doc.defaultView
    if (!win) return
    let frames = 0
    const settle = () => {
      restore()
      if (++frames < 4) win.requestAnimationFrame(settle)
    }
    win.requestAnimationFrame(settle)
    win.setTimeout(restore, 60)
    win.setTimeout(restore, 160)
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 等到正文变成我们要的样子。
 *
 * 不能用「innerHTML 有没有变化」当成功标准：
 * 要插入的内容和正文里已有的内容一样时（重复插入、或某个设置不影响渲染），
 * 内容不会变，却被判成失败，于是白等一个超时再降级到下一个通道。
 */
async function waitForMatch(matches: () => boolean, timeout = 1500): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (matches()) return true
    await wait(50)
  }
  return matches()
}

function notifyChange(target: EditorTarget) {
  const { doc, root } = target
  for (const type of ['input', 'change', 'keyup'] as const) {
    root.dispatchEvent(new Event(type, { bubbles: true }))
  }
  // UEditor 靠 body 上的事件做脏检查，再补一次 selectionchange
  doc.dispatchEvent(new Event('selectionchange'))
}

/** 一级：合成 paste，让微信自己的粘贴处理器接管 HTML */
async function tryPaste(
  target: EditorTarget,
  html: string,
  plain: string,
  matches: () => boolean,
): Promise<boolean> {
  if (typeof DataTransfer === 'undefined' || typeof ClipboardEvent === 'undefined') return false
  try {
    const dt = new DataTransfer()
    dt.setData('text/html', html)
    dt.setData('text/plain', plain)
    const ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    })
    const receiver = (target.doc.activeElement as HTMLElement | null) ?? target.root
    receiver.dispatchEvent(ev)
  } catch {
    return false
  }
  return waitForMatch(matches)
}

/** 二级：execCommand，仍然走浏览器的编辑命令，会触发 input */
async function tryExecCommand(target: EditorTarget, html: string, matches: () => boolean): Promise<boolean> {
  try {
    target.doc.execCommand('insertHTML', false, html)
  } catch {
    return false
  }
  if (!(await waitForMatch(matches, 1200))) return false
  notifyChange(target)
  return true
}

/** 三级：直接写 DOM。会绕过编辑器的脏检查，调用方要提示用户 */
function tryInnerHtml(target: EditorTarget, html: string, mode: InsertMode, matches: () => boolean): boolean {
  try {
    if (mode === 'replace') target.root.innerHTML = html
    else target.root.insertAdjacentHTML('beforeend', html)
  } catch {
    return false
  }
  if (!matches()) return false
  notifyChange(target)
  return true
}

export interface InsertOutcome {
  via: InsertVia
  how: string
  /** 插入完成后正文的快照，实时同步靠它判断用户有没有手动改过 */
  resultHtml: string
  /**
   * 插入的内容有没有留住。
   * 有些编辑器是「受控组件」，我们写进 DOM 之后它会按自己的数据模型再渲染一遍，
   * 把内容还原回去——这种情况下插入看起来成功了，实际正文没变。
   */
  persisted: boolean
}

/**
 * 插入后在后台盯一段时间。
 *
 * 编辑器按自己的模型重渲染是异步的，可能几百毫秒后才把正文换回上一版
 * （文字一样、样式回退，就是「闪一下又变回去」）。
 * 阻塞等这么久会让每次同步都慢得难受，所以先快速返回，再在后台盯着：
 * 发现被还原就自动补插一次，补不回来才告诉用户。
 */
/**
 * 每次插入都有一个代号，后台盯梢只在自己仍是「最新那次」时才动手。
 *
 * 少了这个判断就会出事：换主题时新内容插进去了，上一次的盯梢还活着，
 * 它发现「我负责的那版内容不见了」，于是把**旧主题**的内容又插一遍 ——
 * 表现就是新效果闪一下，又被旧的盖回去，而且正文越滚越大。
 */
let insertGeneration = 0

function watchForRevert(
  generation: number,
  matches: () => boolean,
  reinsert: () => Promise<InsertVia | null>,
  onResult: (result: 'repaired' | 'lost') => void,
  windowMs = 2500,
): void {
  const deadline = Date.now() + windowMs
  let repairing = false

  const tick = async () => {
    if (repairing || generation !== insertGeneration) return
    if (matches()) {
      if (Date.now() < deadline) setTimeout(tick, 150)
      return
    }
    repairing = true
    const again = await reinsert()
    if (generation !== insertGeneration) return // 补插期间又有新的插入，结果作废
    onResult(again && matches() ? 'repaired' : 'lost')
  }

  setTimeout(tick, 150)
}

export interface InsertRequest {
  html: string
  plain: string
  mode: InsertMode
  /**
   * 必须出现在正文里的颜色（当前主题的主色）。
   * 这是判断「正文是不是已经是这套样式」最硬的依据：
   * 只靠文字和颜色频次做指纹会误判，一旦误判就会跳过插入却报「已是最新」。
   */
  markers?: string[]
  /**
   * 必须出现在正文里的样式片段，比如 `font-size:16px`、`line-height:1.75`。
   * 换字体、字号、行高时文字和颜色都不变，光看那两样会被判成「已是最新」。
   */
  styleMarkers?: string[]
  /** 保持正文当前的阅读位置，实时同步时必须开，否则每次都跳到文末 */
  preserveScroll?: boolean
  /** 过程反馈，插入可能要重试，不给提示的话界面像卡住 */
  onProgress?: (msg: string) => void
  /** 插入后若被编辑器还原，后台补插的结果会通过这里回报 */
  onRevert?: (result: 'repaired' | 'lost') => void
  /** 强制覆盖：跳过「已是最新就不插」的优化 */
  force?: boolean
  /** 插入后把光标放回原来的位置。用户正在正文里打字时必须开 */
  preserveCaret?: boolean
}

export async function insertIntoEditor(req: InsertRequest): Promise<InsertOutcome> {
  const {
    html, plain, mode, markers = [], styleMarkers = [],
    preserveScroll = true, preserveCaret = false, onProgress, onRevert,
  } = req
  // 新的一次插入作废掉之前所有还在盯梢的任务
  const generation = ++insertGeneration
  const target = findEditor()
  if (!target) throw new EditorNotFoundError()

  const signature = styleSignature(html)
  /** 正文现在是不是就是我们要的那篇（文字和样式都对得上） */
  /**
   * 正文现在是不是就是我们要的那篇。
   *
   * 这里**不查**样式片段：浏览器会把 `margin:0 0 20px` 规范成 `0px 0px 20px`、
   * 给字体名加引号，片段对不上就会把成功的插入判成失败，三级通道全废。
   * 判「成功」宁可宽松——真没插进去还有后台盯梢兜底。
   */
  const matches = () => {
    const now = target.root.innerHTML
    if (!markers.every((c) => hasColor(now, c))) return false
    return containsSameContent(html, now) && hasStyleSignature(now, signature)
  }

  /**
   * 「无需插入」要比「插入成功」严格得多：
   * 判成功错了顶多多插一次，判「已是最新」错了就是整个跳过、样式永远不更新。
   * 样式片段只在这里查——判错了只是多插一次，无害。
   */
  const alreadyUpToDate = () => {
    if (!markers.length) return false
    const now = target.root.innerHTML
    if (!markers.every((c) => hasColor(now, c))) return false
    if (!hasStyleFragments(now, styleMarkers)) return false
    if (!signature.every((hex) => hasColor(now, hex))) return false
    if (!containsSameContent(html, now)) return false
    // 文字必须一模一样。
    // 只检查「我们的内容在不在」是不够的：正文里多一段手打的字也会被当成
    // 「已是最新」而跳过插入，用户选了「以面板为准」却发现改动还在。
    // 留容差同样不行——手打几个字占全文的比例本来就很小。
    // 跳过插入只是个优化，判严了最多多插一次，无害。
    const want = plainTextOf(html)
    return want.length > 0 && plainTextOf(now) === want
  }

  // 用户明确要求覆盖时不再做任何猜测
  if (mode === 'replace' && !req.force && alreadyUpToDate()) {
    return { via: 'skipped', how: target.how, resultHtml: target.root.innerHTML, persisted: true }
  }

  const restoreScroll = preserveScroll ? captureScroll(target.root, target.doc) : () => {}
  const restoreCaret = preserveCaret ? captureCaret(target) : () => {}

  const textLeft = () => (target.root.textContent ?? '').replace(/\s+/g, '').length

  /**
   * 替换全文时先真正清空——粘贴不一定会替换选区，不清就成了追加。
   *
   * 三条路依次试，都是为了走编辑器自己的命令通道：
   *   1. execCommand('delete')
   *   2. 模拟 Backspace 和 beforeinput（ProseMirror 这类受控编辑器认这个，不认 execCommand）
   *   3. 直接清 DOM（受控编辑器会撤销，但聊胜于无）
   */
  const clearAll = async () => {
    if (mode !== 'replace') return

    placeSelection(target, 'replace')
    try {
      target.doc.execCommand('delete')
    } catch {
      // 不支持就往下走
    }
    await wait(60)
    if (textLeft() === 0) {
      // delete 可能只删掉文字，留下 <blockquote><br></blockquote> 之类的空壳。
      // replace 模式的语义就是彻底替换，必须连空壳一起清掉，否则新正文会继承引用格式。
      if (target.root.childNodes.length) {
        target.root.innerHTML = ''
        notifyChange(target)
        await wait(60)
      }
      return
    }

    // 受控编辑器往往只认自己的按键/输入事件
    placeSelection(target, 'replace')
    const receiver = (target.doc.activeElement as HTMLElement | null) ?? target.root
    try {
      const opts = { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true }
      receiver.dispatchEvent(new KeyboardEvent('keydown', opts))
      if (typeof InputEvent !== 'undefined') {
        receiver.dispatchEvent(
          new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }),
        )
      }
      receiver.dispatchEvent(new KeyboardEvent('keyup', opts))
    } catch {
      // 继续往下兜
    }
    await wait(80)
    if (textLeft() === 0) {
      if (target.root.childNodes.length) {
        target.root.innerHTML = ''
        notifyChange(target)
        await wait(60)
      }
      return
    }

    try {
      target.root.innerHTML = ''
      notifyChange(target)
      await wait(60)
    } catch {
      /* 忽略 */
    }
  }

  const attempt = async (): Promise<InsertVia | null> => {
    await clearAll()
    placeSelection(target, mode)
    if (await tryPaste(target, html, plain, matches)) return 'paste'
    // paste 失败后选区可能已被清掉，重新放一次
    placeSelection(target, mode)
    if (await tryExecCommand(target, html, matches)) return 'execCommand'
    if (tryInnerHtml(target, html, mode, matches)) return 'innerHTML'
    return null
  }

  const beforeLength = mode === 'replace' ? plainTextOf(html).length : 0

  let via = await attempt()
  if (!via) {
    restoreScroll()
    throw new Error('插入失败，请点「仅复制」后在正文里手动粘贴')
  }
  restoreScroll()

  // 替换退化成追加时，正文会明显比「该有的长度」长。
  // 这里用待插入内容的长度当基准，和正文自身无关，所以正文已经插重了也测得出来。
  if (beforeLength > 200) {
    const after = plainTextOf(target.root.innerHTML).length
    if (after > beforeLength * 1.15) {
      onProgress?.('替换变成了追加，正在清空重插……')
      await clearAll()
      placeSelection(target, 'replace')
      if (await tryPaste(target, html, plain, matches)) via = 'paste'
      else if (await tryExecCommand(target, html, matches)) via = 'execCommand'
      restoreScroll()
    }
  }

  // 马上再确认一次：有些编辑器是同步重渲染，这里就能抓到
  if (!matches() && generation === insertGeneration) {
    onProgress?.('编辑器把内容还原了，正在重试……')
    const again = await attempt()
    if (again) {
      via = again
      restoreScroll()
    }
  }
  // 清掉多余的排版容器（我们自己的标记还在时有效）
  if (mode === 'replace' && countContainers(target.root) > 1) {
    dedupeContainers(target.root)
  }

  /**
   * 体积兜底：编辑器会剥掉我们的 data-* 标记，容器计数就失灵了，
   * 所以直接比文字长度——正文明显比该有的长，说明旧内容还堆在里面。
   */
  if (mode === 'replace') {
    const want = plainTextOf(html).length
    const got = plainTextOf(target.root.innerHTML).length
    if (want > 0 && got > want * 1.4) {
      onProgress?.('正文里残留了旧内容，正在清空重插……')
      await clearAll()
      placeSelection(target, 'replace')
      if (await tryPaste(target, html, plain, matches)) via = 'paste'
      else if (await tryExecCommand(target, html, matches)) via = 'execCommand'
      restoreScroll()
    }
  }

  restoreCaret()
  const persisted = matches()

  // 异步重渲染要靠后台盯梢，阻塞等会让每次同步都慢上一两秒
  if (persisted && onRevert) {
    watchForRevert(
      generation,
      matches,
      async () => {
        const again = await attempt()
        restoreScroll()
        return again
      },
      onRevert,
    )
  }

  return { via, how: target.how, resultHtml: target.root.innerHTML, persisted }
}

/** 读当前正文快照，用于比对是否被手动编辑过 */
export function readEditorSnapshot(): string | null {
  return findEditor()?.root.innerHTML ?? null
}

/**
 * 正文里有哪些「没文字也没图」的元素，按标签计数。
 * 这些东西平时隐形，一旦套上边框或底色就变成一格格空框。
 */
function blankBreakdown(root: HTMLElement): string {
  const counts = new Map<string, number>()
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase()
    if (['br', 'hr', 'img', 'video', 'iframe', 'svg', 'canvas', 'source'].includes(tag)) continue
    if (el.querySelector('img,video,iframe,svg,canvas,hr')) continue
    if ((el.textContent ?? '').trim()) continue
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  if (!counts.size) return '无'
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `${tag}×${n}`)
    .join(' ')
}

/**
 * 表格上方那条空白带是不是编辑器自己的界面组件。
 *
 * div.tableWrapper 是 prosemirror-tables 的 NodeView 外壳，
 * 它和同级的 colgroup / 空 caption 都是编辑器实时画的，不在文档数据里。
 * 这种东西删了会被立刻重画，只能靠「预览」确认发布后不显示。
 */
function editorChromeVerdict(root: HTMLElement): string {
  const wrappers = root.querySelectorAll('div.tableWrapper').length
  if (!wrappers) return ''
  const bareCaptions = Array.from(root.querySelectorAll('table > caption')).filter(
    (c) => !c.getAttribute('style') && !(c.textContent ?? '').trim(),
  ).length
  if (!bareCaptions) return `检测到 ${wrappers} 个 prosemirror-tables 外壳，没有多余的空 caption`
  return (
    `检测到 ${wrappers} 个 prosemirror-tables 外壳、${bareCaptions} 个编辑器自带的空 caption。` +
    '这些是编辑器的渲染层组件（不带内联样式、删了会被立刻重画），' +
    '不在文章内容里——请点后台「预览」用手机确认发布后是否显示'
  )
}

/**
 * 表格前面到底是什么东西。
 *
 * 「表格上方有空白格」查了好几轮，光看标签统计不够——
 * 得知道那个框是我们画的（有内联样式），还是编辑器自己的界面辅助线
 * （没有内联样式，边框来自编辑器的 CSS）。这两种的处理方式完全不同。
 */
function tableSurroundings(root: HTMLElement): string[] {
  const out: string[] = []
  const tables = Array.from(root.querySelectorAll('table')).slice(0, 2)
  if (!tables.length) return ['（正文里没有表格）']

  const describeEl = (el: Element, note: string) => {
    const style = el.getAttribute('style') ?? ''
    const cls = el.className ? `.${String(el.className).split(/\s+/).slice(0, 2).join('.')}` : ''
    const text = (el.textContent ?? '').replace(/\s+/g, '').slice(0, 12)
    const rect = (el as HTMLElement).getBoundingClientRect()
    let border = ''
    try {
      const cs = el.ownerDocument.defaultView?.getComputedStyle(el)
      if (cs && cs.borderTopStyle !== 'none') border = ` 实际边框=${cs.borderTopStyle} ${cs.borderTopColor}`
    } catch {
      /* 读不到就算了 */
    }
    return (
      `${note} <${el.tagName.toLowerCase()}${cls}> ${Math.round(rect.width)}x${Math.round(rect.height)}` +
      ` 内联样式=${style ? style.length + '字符' : '无'}` +
      ` 文字=${text ? `"${text}"` : '空'}${border}`
    )
  }

  tables.forEach((table, i) => {
    out.push(`表格 ${i + 1}：`)
    // 往上数三层祖先
    let parent = table.parentElement
    for (let depth = 1; depth <= 3 && parent && parent !== root; depth++) {
      out.push(describeEl(parent, `第${depth}层外框`))
      parent = parent.parentElement
    }
    // 前面两个兄弟
    let prev = table.previousElementSibling
    for (let k = 1; k <= 2 && prev; k++) {
      out.push(describeEl(prev, `前方兄弟${k}`))
      prev = prev.previousElementSibling
    }
    // 表格自己的头几个子元素
    for (const child of Array.from(table.children).slice(0, 2)) {
      out.push(describeEl(child, '表内首元素'))
    }
  })
  return out
}

interface LineHeightProbe {
  scanned: number
  findings: string[]
}

function lineHeightStructureSummary(root: ParentNode): string {
  const legacyGuards = Array.from(root.querySelectorAll<HTMLElement>('span')).filter(
    (span) => span.style.fontSize === 'inherit' && span.style.lineHeight === 'inherit' && span.children.length > 0,
  ).length
  const illegalBlocks = Array.from(root.querySelectorAll('p')).filter(
    (p) => !!p.querySelector('div,section,table,figure,blockquote,ul,ol,h1,h2,h3,h4,h5,h6'),
  ).length
  return `旧式整段保护层 ${legacyGuards} 个，p 内块级嵌套 ${illegalBlocks} 个`
}

function pendingStructureSummary(html: string): string {
  if (!html) return '无待插入内容'
  const template = document.createElement('template')
  template.innerHTML = html
  return lineHeightStructureSummary(template.content)
}

/**
 * 复现微信公开规范 2.3.2 的行高实测算法。
 * 额外输出按 top 去重后的视觉行数，用来识别 getClientRects() 把同一行的
 * strong/em 等行内片段重复计数所造成的误报。
 */
function probeWechatLineHeight(root: HTMLElement): LineHeightProbe {
  const selector = 'p,div,section,h1,h2,h3,h4,h5,h6,li,td,a'
  const findings: string[] = []
  let scanned = 0

  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    const directText = Array.from(el.childNodes).some(
      (node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0,
    )
    if (!directText) continue
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
    if (!text) continue
    scanned++

    try {
      const view = el.ownerDocument.defaultView
      if (!view) continue
      const cs = view.getComputedStyle(el)
      const fontSize = Number.parseFloat(cs.fontSize)
      const lineHeight = cs.lineHeight === 'normal' ? fontSize * 1.2 : Number.parseFloat(cs.lineHeight)
      const range = el.ownerDocument.createRange()
      range.selectNodeContents(el)
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.height > 0)
      const contentHeight = range.getBoundingClientRect().height
      const average = rects.length ? contentHeight / rects.length : 0
      const threshold = fontSize * 0.95
      const overlapping = lineHeight === 0 || (rects.length >= 2 && average < threshold)
      if (!overlapping) continue

      const visualRows = new Set(rects.map((rect) => Math.round(rect.top * 2) / 2)).size
      const children = Array.from(el.children)
        .slice(0, 8)
        .map((child) => child.tagName.toLowerCase())
        .join(',')
      findings.push(
        `<${el.tagName.toLowerCase()}> font=${fontSize.toFixed(1)}px line=${lineHeight.toFixed(1)}px ` +
          `矩形=${rects.length} 视觉行≈${visualRows} 内容高=${contentHeight.toFixed(1)}px ` +
          `微信均值=${average.toFixed(1)}px 阈值=${threshold.toFixed(1)}px ` +
          `子元素=${children || '无'} 文字="${text.slice(0, 48)}"`,
      )
    } catch {
      // 个别不可测节点不影响整份诊断。
    }
  }

  return { scanned, findings: findings.slice(0, 20) }
}

/** 生成一份可以直接发给开发者的诊断报告 */
export function buildDiagnostics(sampleHtml: string, mode: InsertMode = 'replace'): string {
  const lines: string[] = []
  const push = (k: string, v: unknown) => lines.push(`${k}: ${v}`)

  push('页面地址', location.href.split('?')[0])
  push('时间', new Date().toLocaleString('zh-CN'))
  push('iframe 数量', document.querySelectorAll('iframe').length)

  const all = collectEditors()
  push('可编辑区域数量', all.length)
  all.forEach((t, i) => {
    const r = t.root.getBoundingClientRect()
    lines.push(
      `  [${i}] ${t.how} | ${Math.round(r.width)}x${Math.round(r.height)} | ` +
        `contenteditable=${t.root.isContentEditable} | 内容长度=${t.root.innerHTML.length}`,
    )
  })

  const chosen = findEditor()
  push('选中的正文区', chosen ? chosen.how : '(没找到)')
  if (chosen) {
    const r = chosen.root.getBoundingClientRect()
    push('  尺寸', `${Math.round(r.width)}x${Math.round(r.height)}`)
    push('  当前内容长度', chosen.root.innerHTML.length)
    push('  内容前 120 字', chosen.root.innerText.replace(/\s+/g, ' ').slice(0, 120))
    const marks = countContainers(chosen.root)
    push('  排版容器个数', `${marks}${marks > 1 ? '  ← 大于 1 说明新内容套进了旧容器，替换全文没生效' : ''}`)
    if (sampleHtml.length) {
      const want = plainTextOf(sampleHtml).length
      const got = plainTextOf(chosen.root.innerHTML).length
      push('  正文纯文字长度', got)
      if (mode === 'replace') {
        push('  应有的纯文字长度', want)
        const ratio = want ? got / want : 0
        push('  文字长度比', `${ratio.toFixed(2)}${ratio > 1.4 ? '  ← 正文里堆了旧内容，替换全文没生效' : ratio < 0.9 ? '  ← 正文内容不完整或本次插入尚未确认' : ''}`)
      } else {
        push('  待追加内容纯文字长度', want)
        push('  说明', '当前为“插入到末尾”，两者不是同一篇全文，不计算文字长度比')
      }
    }
    push('  编辑器类型', /ProseMirror/.test(chosen.root.className) ? 'ProseMirror（受控组件）' : '其他')
    push('  空白块统计', blankBreakdown(chosen.root))
    push('  当前正文行高保护结构', lineHeightStructureSummary(chosen.root))
    push('  待插入行高保护结构', pendingStructureSummary(sampleHtml))
    const lineHeightProbe = probeWechatLineHeight(chosen.root)
    push('  微信行高算法扫描', `${lineHeightProbe.scanned} 个直接文本块，命中 ${lineHeightProbe.findings.length} 个`)
    for (const finding of lineHeightProbe.findings) lines.push('    ' + finding)
    const verdict = editorChromeVerdict(chosen.root)
    if (verdict) push('  表格外壳判定', verdict)
    lines.push('  表格上方的结构：')
    for (const line of tableSurroundings(chosen.root)) lines.push('    ' + line)
  }
  push('待插入 HTML 长度', sampleHtml.length)
  push('DataTransfer 可用', typeof DataTransfer !== 'undefined')
  push('ClipboardEvent 可用', typeof ClipboardEvent !== 'undefined')

  return lines.join('\n')
}

/** 供 UI 显示当前是否已经能找到编辑器 */
export function describeEditor(): string | null {
  return findEditor()?.how ?? null
}
