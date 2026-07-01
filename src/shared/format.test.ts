import { describe, expect, it } from 'vitest'
import { formatFileSize } from './format'

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kibibytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats mebibytes', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2 MB')
  })
})
