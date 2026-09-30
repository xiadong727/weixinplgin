// 打包可以直接发给别人的分享包：npm run pack
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, copyFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'dist/extension/manifest.json'), 'utf8'))
const version = manifest.version || pkg.version

const SHARE = resolve(ROOT, 'dist/share')
rmSync(SHARE, { recursive: true, force: true })
mkdirSync(SHARE, { recursive: true })

/* ---------- 1. 扩展 zip（含安装说明） ---------- */

const README_FOR_USER = `公众号一键排版 · 浏览器扩展 v${version}

【安装】只需一次，大约 30 秒
  1. 把这个压缩包解压出来，得到一个 wx-typeset-extension 文件夹
     注意：解压后的文件夹不要删、不要改名、不要移动，
     Chrome 是直接从这个位置读取扩展的
  2. 打开 Chrome，地址栏输入：chrome://extensions
  3. 打开右上角的「开发者模式」开关
  4. 点左上角「加载已解压的扩展程序」，选中第 1 步解压出来的文件夹

【使用】
  1. 进公众号后台 →「新建图文消息」
  2. 页面右侧中间会出现一个绿色的「排版」竖条，点开它
  3. 在「写作」里写 Markdown，或点绿色的「导入 .md」选本地文件
  4. 在「设置」里挑主题、调字号
  5. 点「一键排版并插入正文」

  想边调边看效果：勾上底部的「实时同步到正文」，
  之后换主题、拖滑块，左边正文会自动跟着变。

【常见问题】
  · Chrome 每次启动弹「请停用开发者模式扩展程序」→ 点「取消」即可，不影响使用
  · 面板没出现 → 确认当前是图文编辑页，然后刷新一下页面
  · 点了插入但正文没变 → 点面板上的「诊断」，把报告发给开发者
  · 自动插入不灵 → 点「仅复制」，回正文 Ctrl/Cmd+V 手动粘贴，这条路一定能用

【隐私】
  扩展只在 mp.weixin.qq.com 上运行，所有内容都在你自己的浏览器里处理，
  不上传任何数据，也不连任何服务器。设置和草稿存在浏览器本地。

【不想装扩展？】
  分享包里还有一个「公众号一键排版.html」，双击就能打开，
  写完点「一键排版并复制」，再到公众号后台粘贴即可。
`

const EXT_DIR = resolve(ROOT, 'dist/extension')
if (!existsSync(EXT_DIR)) throw new Error('还没构建扩展，先跑 npm run build:ext')

// 压缩包内部一律用 ASCII 名字：中文名在 Windows 自带解压里经常变乱码，
// 而这个文件夹是要用户在 Chrome 里选中的，名字乱了就没法操作了
const stageParent = resolve(SHARE, '_stage')
const stage = resolve(stageParent, 'wx-typeset-extension')
mkdirSync(stage, { recursive: true })
execFileSync('cp', ['-R', EXT_DIR + '/.', stage])
writeFileSync(resolve(stageParent, 'README.txt'), README_FOR_USER)

const zipName = `wx-typeset-extension-v${version}.zip`
execFileSync('zip', ['-r', '-q', resolve(SHARE, zipName), 'wx-typeset-extension', 'README.txt'], { cwd: stageParent })
rmSync(stageParent, { recursive: true, force: true })

/* ---------- 2. 网页版单文件 ---------- */

const single = resolve(ROOT, 'dist/公众号一键排版.html')
if (existsSync(single)) copyFileSync(single, resolve(SHARE, '公众号一键排版.html'))

/* ---------- 3. 主题对照页 ---------- */

const gallery = resolve(ROOT, 'dist/gallery.html')
if (existsSync(gallery)) copyFileSync(gallery, resolve(SHARE, '主题对照.html'))

writeFileSync(resolve(SHARE, '先看我.txt'), README_FOR_USER)

console.log(`→ ${SHARE}`)
for (const f of [zipName, '公众号一键排版.html', '主题对照.html', '先看我.txt']) {
  console.log(`   ${f}`)
}
