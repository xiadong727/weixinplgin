/**
 * 极简 ZIP 解包。docx 就是个 zip，为它引一个几百 KB 的库不值当。
 * 解压用浏览器和 Node 都内置的 DecompressionStream('deflate-raw')，零依赖。
 */

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const eocd = findEocd(view)
  if (eocd < 0) throw new Error('不是有效的压缩包')

  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const out = new Map<string, Uint8Array>()

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== SIG_CENTRAL) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder('utf-8').decode(bytes.subarray(offset + 46, offset + 46 + nameLen))

    if (view.getUint32(localOffset, true) === SIG_LOCAL) {
      const lNameLen = view.getUint16(localOffset + 26, true)
      const lExtraLen = view.getUint16(localOffset + 28, true)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const raw = bytes.subarray(dataStart, dataStart + compressedSize)
      out.set(name, method === 0 ? raw : await inflateRaw(raw))
    }
    offset += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** 从尾部往前找 EOCD，注释最长 64KB */
function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 65557)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i
  }
  return -1
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function textOf(bytes: Uint8Array | undefined): string {
  return bytes ? new TextDecoder('utf-8').decode(bytes) : ''
}
