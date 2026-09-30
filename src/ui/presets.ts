export interface FontOption { id: string; name: string; value: string }

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'system',
    name: '系统无衬线（推荐）',
    value:
      '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'serif',
    name: '宋体 / 衬线',
    value: 'Georgia, "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif',
  },
  {
    id: 'kai',
    name: '楷体',
    value: '"Kaiti SC", KaiTi, STKaiti, "PingFang SC", serif',
  },
  {
    id: 'mono',
    name: '等宽',
    value: 'Menlo, Consolas, "PingFang SC", monospace',
  },
]

export function fontIdOf(value: string): string {
  return FONT_OPTIONS.find((f) => f.value === value)?.id ?? 'system'
}

/**
 * 主色预设。按「冷 → 暖土 → 中性」排，方便对着封面挑。
 * 暖土那一排是给金调、牛皮纸、复古封面用的，这类封面很常见。
 */
export const PRESET_COLORS = [
  // 冷色
  '#576B95', '#1E6FD9', '#002FA7', '#4F46E5', '#1F4E79', '#2F6F6B', '#3F9E9C', '#3F6B52',
  // 暖土：金 / 棕 / 赤陶，配金调渐变封面
  '#D9A84E', '#B8873B', '#A8762F', '#8C6A3F', '#B5451B', '#8F4B2E', '#4A3728',
  // 暖色
  '#E08B3C', '#E8543F', '#C0503A', '#C8102E', '#D9536F',
  // 中性
  '#8C8C8C', '#404040',
]

export const SAMPLE_MARKDOWN = `# 一键排版效果演示

这是一段正文，混排了 English words 和数字 2026，插件会自动在中英文之间补一个空格，读起来更松一点。

## 二级标题看这里

> 引用块适合放金句、结论或者引用别人的话。
> 支持多行。

### 三级标题

无序列表：

- 第一点，说明某个 feature
- 第二点，嵌套也支持
  - 子项 A
  - 子项 B

有序列表：

1. 先做这个
2. 再做那个

任务清单：

- [x] 已经完成的事
- [ ] 还没做的事

行内样式：**加粗**、*斜体*、~~删除线~~、\`inline code\`。

代码块带语言标签和高亮：

\`\`\`typescript
interface Article {
  title: string
  words: number
}

function typeset(md: string): Article {
  return { title: md.slice(0, 10), words: md.length }
}
\`\`\`

表格：

| 主题 | 适合题材 | 特点 |
|:---|:---|---:|
| 极简白 | 通用 | 留白多 |
| 科技蓝 | 技术号 | 色块标题 |
| 墨韵 | 随笔 | 书刊感 |

图片会自动带上图注：

![这行 alt 文字会变成图注](https://mmbiz.qpic.cn/mmbiz_png/placeholder.png)

站外链接会被转成文末脚注，比如 [Vite 官网](https://vitejs.dev)，因为公众号正文里的站外链接点不动。

---

最后一段收尾。
`
