const MAGIC = 0x07564429
const APP_METADATA_SIZE = 60

export interface AppInfoEntry {
  name: string
  type: string
}

// 解析 Steam appcache/appinfo.vdf（v29 二进制，magic 0x07564429，含末尾字符串表）
// 返回 { [appId]: { name, type } }
export function parseAppInfo(buffer: Buffer): Record<string, AppInfoEntry> {
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== MAGIC) {
    return {}
  }

  const stringTableOffset = Number(buffer.readBigInt64LE(8))
  if (stringTableOffset <= 0 || stringTableOffset >= buffer.length) {
    return {}
  }

  const strings = readStringTable(buffer, stringTableOffset)
  const entries: Record<string, AppInfoEntry> = {}

  let offset = 16
  while (offset + 8 <= stringTableOffset) {
    const appId = buffer.readUInt32LE(offset)
    offset += 4
    if (appId === 0) {
      break
    }
    const size = buffer.readUInt32LE(offset)
    offset += 4
    const blockEnd = offset + size

    const info = extractCommonFields(buffer, offset + APP_METADATA_SIZE, blockEnd, strings)
    if (info.name) {
      entries[String(appId)] = { name: info.name, type: info.type }
    }

    offset = blockEnd
  }

  return entries
}

function readStringTable(buffer: Buffer, offset: number): string[] {
  const count = buffer.readInt32LE(offset)
  const strings: string[] = []
  let p = offset + 4
  for (let i = 0; i < count && p < buffer.length; i++) {
    const start = p
    while (p < buffer.length && buffer[p] !== 0) {
      p++
    }
    strings.push(buffer.toString('utf8', start, p))
    p++
  }
  return strings
}

// 遍历 KV 树，抽取 common.name / common.type / common.name_localized.schinese
function extractCommonFields(
  buffer: Buffer,
  start: number,
  end: number,
  strings: string[],
): { name: string; type: string } {
  let name = ''
  let schineseName = ''
  let type = ''

  function walk(offset: number, parentKey: string | null): number {
    let o = offset
    while (o < end) {
      const t = buffer[o]
      o += 1
      if (t === 0x08) {
        break
      }
      const keyIndex = buffer.readInt32LE(o)
      o += 4
      const key = strings[keyIndex] ?? ''

      if (t === 0x00) {
        o = walk(o, key)
      } else if (t === 0x01) {
        const s = o
        while (o < end && buffer[o] !== 0) {
          o++
        }
        const value = buffer.toString('utf8', s, o)
        o += 1
        if (parentKey === 'common') {
          if (key === 'name') name = value
          else if (key === 'type') type = value
        } else if (parentKey === 'name_localized' && key === 'schinese') {
          schineseName = value
        }
      } else if (t === 0x02) {
        o += 4
      } else if (t === 0x07) {
        o += 8
      } else {
        throw new Error(`未知的 VDF 类型 0x${t.toString(16)}`)
      }
    }
    return o
  }

  try {
    walk(start, null)
  } catch {
    // 单个 app 解析失败忽略
  }

  return { name: schineseName || name, type }
}
