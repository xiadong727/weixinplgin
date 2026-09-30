import { checkImportFile, docxToMarkdown, kindOf, pdfToMarkdown, prepareMarkdown, type ImportResult } from '@core/index'

export type { ImportResult }

/** 读一个本地文件，转成 Markdown 并附上提示 */
export async function readMarkdownFile(file: File): Promise<ImportResult> {
  const problem = checkImportFile(file.name, file.size)
  if (problem) throw new Error(problem)

  const kind = kindOf(file.name)
  const buf = await file.arrayBuffer()

  if (kind === 'docx') {
    const r = await docxToMarkdown(buf)
    return { text: r.markdown, encoding: 'Word', frontMatter: {}, warnings: r.warnings }
  }
  if (kind === 'pdf') {
    const r = await pdfToMarkdown(buf)
    return { text: r.markdown, encoding: 'PDF', frontMatter: {}, warnings: r.warnings }
  }
  return prepareMarkdown(buf)
}

/** 从一次选择/拖拽里挑出第一个 Markdown 文件 */
export function pickMarkdownFile(files: FileList | File[] | null | undefined): {
  file: File | null
  extra: number
} {
  const list = Array.from(files ?? [])
  const md = list.filter((f) => !checkImportFile(f.name, 0))
  const chosen = md[0] ?? list[0] ?? null
  return { file: chosen, extra: Math.max(0, list.length - 1) }
}

/**
 * 给一块区域装上拖放导入。
 * 返回解绑函数，方便扩展面板卸载时清理。
 */
export function enableDropImport(
  zone: HTMLElement,
  handlers: {
    onFile: (file: File, extra: number) => void
    onDragState?: (dragging: boolean) => void
  },
): () => void {
  let depth = 0

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  const onEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth++
    handlers.onDragState?.(true)
  }
  const onOver = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const onLeave = () => {
    depth = Math.max(0, depth - 1)
    if (depth === 0) handlers.onDragState?.(false)
  }
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    handlers.onDragState?.(false)
    const { file, extra } = pickMarkdownFile(e.dataTransfer?.files)
    if (file) handlers.onFile(file, extra)
  }

  zone.addEventListener('dragenter', onEnter)
  zone.addEventListener('dragover', onOver)
  zone.addEventListener('dragleave', onLeave)
  zone.addEventListener('drop', onDrop)

  return () => {
    zone.removeEventListener('dragenter', onEnter)
    zone.removeEventListener('dragover', onOver)
    zone.removeEventListener('dragleave', onLeave)
    zone.removeEventListener('drop', onDrop)
  }
}
