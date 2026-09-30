/**
 * 把富文本写进剪贴板。
 * 公众号后台读 text/html，所以必须同时提供 html 和 plain 两种格式。
 */
export async function copyRichText(html: string, plain: string): Promise<'async' | 'fallback'> {
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      return 'async'
    } catch {
      // 权限或非用户手势触发，走 execCommand 兜底
    }
  }
  if (!copyViaExecCommand(html, plain)) throw new Error('复制失败，请手动全选预览区复制')
  return 'fallback'
}

function copyViaExecCommand(html: string, plain: string): boolean {
  const onCopy = (e: ClipboardEvent) => {
    e.preventDefault()
    e.clipboardData?.setData('text/html', html)
    e.clipboardData?.setData('text/plain', plain)
  }
  document.addEventListener('copy', onCopy, { once: true, capture: true })
  try {
    // 需要一个真实选区，否则部分浏览器会拒绝 execCommand('copy')
    const holder = document.createElement('div')
    holder.setAttribute('style', 'position:fixed;left:-9999px;top:0;white-space:pre')
    holder.textContent = plain || ' '
    document.body.appendChild(holder)
    const range = document.createRange()
    range.selectNodeContents(holder)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    const ok = document.execCommand('copy')
    sel?.removeAllRanges()
    holder.remove()
    return ok
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', onCopy, true)
  }
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
