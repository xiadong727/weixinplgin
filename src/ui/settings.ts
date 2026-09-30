import { CODE_THEMES, THEMES, THEME_GROUPS, type RenderOptions } from '@core/index'
import { FONT_OPTIONS, PRESET_COLORS } from './presets'

type Group = { title: string; controls: Control[] }

/** group:true 的项渲染成 optgroup 分隔标签，不可选中 */
type SelectOption = { value: string; label: string; title?: string; group?: true }

type Control =
  | { kind: 'select'; key: keyof RenderOptions; label: string; options: SelectOption[] }
  | { kind: 'color'; key: 'primary'; label: string }
  | { kind: 'range'; key: keyof RenderOptions; label: string; min: number; max: number; step: number; unit: string }
  | { kind: 'toggle'; key: keyof RenderOptions; label: string; hint?: string }
  | { kind: 'textarea'; key: 'customCss'; label: string; placeholder: string }

const GROUPS: Group[] = [
  {
    title: '主题',
    controls: [
      {
        kind: 'select', key: 'theme', label: '排版主题',
        options: THEME_GROUPS.flatMap((g) => [
          { value: '', label: `── ${g} ──`, group: true as const },
          ...THEMES.filter((t) => t.group === g).map((t) => ({ value: t.id, label: t.name, title: t.desc })),
        ]),
      },
      { kind: 'color', key: 'primary', label: '主色调' },
    ],
  },
  {
    title: '版式',
    controls: [
      {
        kind: 'select', key: 'fontFamily', label: '正文字体',
        options: FONT_OPTIONS.map((f) => ({ value: f.value, label: f.name })),
      },
      { kind: 'range', key: 'fontSize', label: '字号', min: 13, max: 20, step: 1, unit: 'px' },
      { kind: 'range', key: 'lineHeight', label: '行高', min: 1.4, max: 2.2, step: 0.05, unit: '' },
      { kind: 'range', key: 'paragraphSpacing', label: '段间距', min: 8, max: 40, step: 2, unit: 'px' },
      { kind: 'toggle', key: 'indentFirstLine', label: '段落首行缩进', hint: '每段开头空两格' },
    ],
  },
  {
    title: '中文排版',
    controls: [
      { kind: 'toggle', key: 'autoSpacing', label: '中英文间自动空格', hint: '「这是 English」比「这是English」好读' },
      { kind: 'toggle', key: 'punctuation', label: '标点规范化', hint: '紧贴中文的半角标点转全角，... 转 ……' },
      { kind: 'toggle', key: 'lineBreaks', label: '单个换行即换行', hint: '关闭后需要空一行才分段' },
      { kind: 'toggle', key: 'linksToFootnotes', label: '站外链接转文末脚注', hint: '公众号正文里的站外链接点不动' },
      { kind: 'toggle', key: 'imageCaption', label: '图片 alt 作为图注' },
    ],
  },
  {
    title: '代码块',
    controls: [
      {
        kind: 'select', key: 'codeTheme', label: '高亮配色',
        options: CODE_THEMES.map((t) => ({ value: t.id, label: t.name })),
      },
      { kind: 'toggle', key: 'codeLangLabel', label: '显示语言标签' },
      { kind: 'toggle', key: 'codeWrap', label: '代码自动换行', hint: '关闭则横向滚动，长代码更好看' },
    ],
  },
  {
    title: '高级',
    controls: [
      {
        kind: 'textarea', key: 'customCss', label: '自定义 CSS',
        placeholder: 'h2 { color: #d03050; border-left-color: #d03050 }\np { text-align: justify }\n\n支持 p / h1-h6 / blockquote / a / code / pre / img / table / li 等选择器',
      },
    ],
  },
]

export interface SettingsPanel {
  el: HTMLElement
  /** 外部改了选项后回写控件（例如重置） */
  sync(o: RenderOptions): void
}

export function createSettings(
  initial: RenderOptions,
  onChange: (patch: Partial<RenderOptions>) => void,
): SettingsPanel {
  const el = document.createElement('div')
  el.className = 'wxt-settings'
  el.innerHTML = GROUPS.map(renderGroup).join('')

  const sync = (o: RenderOptions) => {
    for (const group of GROUPS) {
      for (const c of group.controls) {
        const node = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          `[data-key="${c.key}"]`,
        )
        if (!node) continue
        const value = o[c.key]
        if (c.kind === 'toggle') (node as HTMLInputElement).checked = Boolean(value)
        else if (c.kind === 'color') (node as HTMLInputElement).value = String(value ?? currentThemeColor(o.theme))
        else node.value = String(value ?? '')
        if (c.kind === 'range') updateRangeLabel(el, c.key, Number(value), c.unit)
      }
    }
    highlightSwatch(el, String(o.primary ?? currentThemeColor(o.theme)))
  }

  const read = (node: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Partial<RenderOptions> | null => {
    const key = node.dataset.key as keyof RenderOptions | undefined
    const kind = node.dataset.kind
    if (!key || !kind) return null
    switch (kind) {
      case 'toggle':
        return { [key]: (node as HTMLInputElement).checked } as Partial<RenderOptions>
      case 'range': {
        const num = Number(node.value)
        const ctrl = findControl(key)
        if (ctrl && ctrl.kind === 'range') updateRangeLabel(el, key, num, ctrl.unit)
        return { [key]: num } as Partial<RenderOptions>
      }
      case 'color':
        highlightSwatch(el, node.value)
        return { primary: node.value }
      default:
        return { [key]: node.value } as Partial<RenderOptions>
    }
  }

  /** 色板和「默认」按钮是普通按钮，只能靠 click */
  const onClick = (e: Event) => {
    const target = e.target as HTMLElement
    if (target.dataset?.swatch) {
      const color = target.dataset.swatch
      const picker = el.querySelector<HTMLInputElement>('[data-key="primary"]')
      if (picker) picker.value = color
      highlightSwatch(el, color)
      onChange({ primary: color })
      return
    }
    if (target.dataset?.resetColor !== undefined) {
      // 排版会回落到主题主色，控件也得跟着回去，否则取色器还停在旧的自定义色上
      const themeId = el.querySelector<HTMLSelectElement>('[data-key="theme"]')?.value ?? ''
      const fallback = currentThemeColor(themeId)
      const picker = el.querySelector<HTMLInputElement>('[data-key="primary"]')
      if (picker) picker.value = fallback
      highlightSwatch(el, fallback)
      onChange({ primary: '' })
    }
  }

  /**
   * 表单控件只认 input / change。
   * 千万别把 click 也接到这里：点开 <select> 下拉框就会触发一次 click，
   * 于是「还没选」就被当成一次变更 —— 会白白重排一次、把自定义主色重置掉，
   * 在扩展里还会排定一次实时同步，800ms 后抢走焦点把下拉框关掉。
   */
  const onFormEvent = (e: Event) => {
    const node = (e.target as HTMLElement | null)?.closest<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('[data-key]')
    if (!node) return
    const patch = read(node)
    if (!patch) return
    // 换主题时清掉自定义主色、并跟随主题推荐的代码配色
    if ('theme' in patch) {
      patch.primary = ''
      const next = THEMES.find((t) => t.id === patch.theme)
      if (next) {
        patch.codeTheme = next.codeTheme
        // 联动改的字段要同步回控件，否则下拉框会显示上一套主题的值
        const codeNode = el.querySelector<HTMLSelectElement>('[data-key="codeTheme"]')
        if (codeNode) codeNode.value = next.codeTheme
        const picker = el.querySelector<HTMLInputElement>('[data-key="primary"]')
        if (picker) picker.value = next.primary
        highlightSwatch(el, next.primary)
      }
    }
    onChange(patch)
  }

  el.addEventListener('input', onFormEvent)
  el.addEventListener('change', onFormEvent)
  el.addEventListener('click', onClick)

  // 主题下拉的说明文字
  el.addEventListener('change', () => updateThemeHint(el))

  sync(initial)
  updateThemeHint(el)
  return { el, sync }
}

function findControl(key: keyof RenderOptions): Control | undefined {
  for (const g of GROUPS) for (const c of g.controls) if (c.key === key) return c
  return undefined
}

function currentThemeColor(themeId: string): string {
  return THEMES.find((t) => t.id === themeId)?.primary ?? '#576B95'
}

function renderGroup(g: Group): string {
  return (
    `<section class="wxt-group"><h4 class="wxt-group-title">${g.title}</h4>` +
    g.controls.map(renderControl).join('') +
    `</section>`
  )
}

function renderControl(c: Control): string {
  switch (c.kind) {
    case 'select':
      return (
        `<label class="wxt-row"><span class="wxt-label">${c.label}</span>` +
        `<select class="wxt-select" data-key="${c.key}" data-kind="select">` +
        c.options
          .map((o) =>
            o.group
              ? `<option disabled>${o.label}</option>`
              : `<option value="${escapeAttr(o.value)}"${o.title ? ` title="${escapeAttr(o.title)}"` : ''}>${o.label}</option>`,
          )
          .join('') +
        `</select></label>` +
        (c.key === 'theme' ? `<p class="wxt-hint" data-theme-hint></p>` : '')
      )
    case 'color':
      return (
        `<div class="wxt-row wxt-row-col"><span class="wxt-label">${c.label}</span>` +
        `<div class="wxt-colors">` +
        PRESET_COLORS.map(
          (hex) => `<button type="button" class="wxt-swatch" data-swatch="${hex}" style="background:${hex}" title="${hex}"></button>`,
        ).join('') +
        `<input type="color" class="wxt-color" data-key="primary" data-kind="color" title="自定义主色" />` +
        `<button type="button" class="wxt-reset" data-reset-color title="恢复主题默认主色">默认</button>` +
        `</div></div>`
      )
    case 'range':
      return (
        `<label class="wxt-row"><span class="wxt-label">${c.label}` +
        `<em class="wxt-value" data-value="${c.key}"></em></span>` +
        `<input type="range" class="wxt-range" data-key="${c.key}" data-kind="range" min="${c.min}" max="${c.max}" step="${c.step}" /></label>`
      )
    case 'toggle':
      return (
        `<label class="wxt-row wxt-row-toggle">` +
        `<input type="checkbox" class="wxt-check" data-key="${c.key}" data-kind="toggle" />` +
        `<span class="wxt-label">${c.label}${c.hint ? `<em class="wxt-hint-inline">${c.hint}</em>` : ''}</span>` +
        `</label>`
      )
    case 'textarea':
      return (
        `<div class="wxt-row wxt-row-col"><span class="wxt-label">${c.label}</span>` +
        `<textarea class="wxt-textarea" rows="5" data-key="${c.key}" data-kind="textarea" placeholder="${escapeAttr(c.placeholder)}"></textarea></div>`
      )
  }
}

function updateRangeLabel(root: HTMLElement, key: string, value: number, unit: string) {
  const node = root.querySelector(`[data-value="${key}"]`)
  if (node) node.textContent = `${Number.isInteger(value) ? value : value.toFixed(2)}${unit}`
}

function highlightSwatch(root: HTMLElement, color: string) {
  const lower = color.toLowerCase()
  root.querySelectorAll<HTMLElement>('[data-swatch]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.swatch?.toLowerCase() === lower)
  })
}

function updateThemeHint(root: HTMLElement) {
  const select = root.querySelector<HTMLSelectElement>('[data-key="theme"]')
  const hint = root.querySelector<HTMLElement>('[data-theme-hint]')
  if (!select || !hint) return
  hint.textContent = THEMES.find((t) => t.id === select.value)?.desc ?? ''
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
