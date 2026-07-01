import { describe, expect, it } from 'vitest'
import { parseAppInfo } from './appInfoParser'

// 构造一个最小的 v29 appinfo.vdf 缓冲区，含字符串表 + 三个 app
function buildAppInfo(): Buffer {
  const strings = ['appinfo', 'appid', 'common', 'name', 'name_localized', 'schinese', 'type']
  const idx = (s: string) => strings.indexOf(s)

  const u32 = (n: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n >>> 0)
    return b
  }
  const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])

  const header = Buffer.concat([u32(0x07564429), u32(1)])

  function appEntry(appId: number, name: string, type: string, schinese?: string): Buffer {
    const meta = Buffer.alloc(60)
    const localized = schinese
      ? Buffer.concat([
          Buffer.from([0x00]), u32(idx('name_localized')),
          Buffer.from([0x01]), u32(idx('schinese')), cstr(schinese),
          Buffer.from([0x08]),
        ])
      : Buffer.alloc(0)
    const kv = Buffer.concat([
      Buffer.from([0x00]), u32(idx('appinfo')),
      Buffer.from([0x00]), u32(idx('common')),
      Buffer.from([0x01]), u32(idx('name')), cstr(name),
      Buffer.from([0x01]), u32(idx('type')), cstr(type),
      localized,
      Buffer.from([0x08]),
      Buffer.from([0x08]),
    ])
    const body = Buffer.concat([meta, kv])
    return Buffer.concat([u32(appId), u32(body.length), body])
  }

  const apps = Buffer.concat([
    appEntry(10, 'Counter-Strike', 'Game'),
    appEntry(1598780, 'Silly Polly Beast', 'Game', '傻乎乎的波莉怪兽'),
    appEntry(1054480, 'Kombat Pack 1', 'DLC'),
  ])
  const terminator = u32(0)

  const stringTable = Buffer.concat([u32(strings.length), ...strings.map(cstr)])

  const beforeTable = Buffer.concat([header, Buffer.alloc(8), apps, terminator])
  const stringTableOffset = beforeTable.length
  beforeTable.writeBigInt64LE(BigInt(stringTableOffset), 8)

  return Buffer.concat([beforeTable, stringTable])
}

describe('parseAppInfo', () => {
  it('returns name and type per appId, preferring schinese name', () => {
    const result = parseAppInfo(buildAppInfo())

    expect(result).toEqual({
      '10': { name: 'Counter-Strike', type: 'Game' },
      '1598780': { name: '傻乎乎的波莉怪兽', type: 'Game' },
      '1054480': { name: 'Kombat Pack 1', type: 'DLC' },
    })
  })

  it('returns empty object when magic does not match', () => {
    const bad = Buffer.alloc(32)
    expect(parseAppInfo(bad)).toEqual({})
  })
})
