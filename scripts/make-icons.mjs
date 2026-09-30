// 生成扩展图标（微信绿圆角方块 + 三条白色文字线），避免仓库里放二进制素材
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/extension/icons')
mkdirSync(OUT, { recursive: true })

const GREEN = [7, 193, 96]
const WHITE = [255, 255, 255]

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixels(x, y)
      const at = row + 1 + x * 4
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; raw[at + 3] = a
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 圆角方块内部判定，radius 为圆角半径 */
function insideRounded(x, y, size, radius) {
  const rx = Math.min(x, size - 1 - x)
  const ry = Math.min(y, size - 1 - y)
  if (rx >= radius || ry >= radius) return true
  const dx = radius - rx
  const dy = radius - ry
  return dx * dx + dy * dy <= radius * radius
}

for (const size of [16, 48, 128]) {
  const radius = Math.round(size * 0.22)
  // 三条白线：模拟排好版的文字
  const bars = [
    { top: 0.28, height: 0.09, left: 0.2, right: 0.8 },
    { top: 0.45, height: 0.09, left: 0.2, right: 0.66 },
    { top: 0.62, height: 0.09, left: 0.2, right: 0.74 },
  ].map((b) => ({
    y0: Math.round(b.top * size), y1: Math.round((b.top + b.height) * size),
    x0: Math.round(b.left * size), x1: Math.round(b.right * size),
  }))

  const buf = png(size, (x, y) => {
    if (!insideRounded(x, y, size, radius)) return [0, 0, 0, 0]
    for (const b of bars) {
      if (y >= b.y0 && y < b.y1 && x >= b.x0 && x < b.x1) return [...WHITE, 255]
    }
    return [...GREEN, 255]
  })
  writeFileSync(resolve(OUT, `icon${size}.png`), buf)
  console.log(`icon${size}.png  ${buf.length} bytes`)
}
