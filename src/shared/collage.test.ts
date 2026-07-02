import { describe, expect, it } from 'vitest'
import { computeLayout, dominantAspectRatio } from './collage'

describe('dominantAspectRatio', () => {
  it('returns the most common ratio rounded to 0.01', () => {
    // 3 张 2:1（ratio 2），2 张 1:1（ratio 1）→ 众数 2
    const images = [
      { width: 200, height: 100 },
      { width: 400, height: 200 },
      { width: 100, height: 50 },
      { width: 64, height: 64 },
      { width: 128, height: 128 },
    ]
    expect(dominantAspectRatio(images)).toBeCloseTo(2, 2)
  })

  it('defaults to 1 when empty', () => {
    expect(dominantAspectRatio([])).toBe(1)
  })

  it('skips zero-height images', () => {
    expect(dominantAspectRatio([{ width: 100, height: 0 }])).toBe(1)
  })
})

describe('computeLayout', () => {
  it('computes canvas size from totalWidth, cols, and aspect', () => {
    // 2 行 2 列，总宽 1000，单格比例 1（正方）→ cellW 500，cellH 500，画布 1000×1000
    const images = [{ width: 100, height: 100 }, { width: 100, height: 100 }, { width: 100, height: 100 }, { width: 100, height: 100 }]
    const layout = computeLayout(images, 2, 2, 1000)
    expect(layout.canvasWidth).toBe(1000)
    expect(layout.canvasHeight).toBe(1000)
    expect(layout.cellW).toBe(500)
    expect(layout.cellH).toBe(500)
    expect(layout.draws).toHaveLength(4)
  })

  it('places cells row-major and clips to cover', () => {
    // 横图 200×100 放进 100×100 格子：cover 居中裁剪，sw=100, sh=100, sx=50, sy=0
    const images = [{ width: 200, height: 100 }]
    const layout = computeLayout(images, 1, 1, 100)
    const d = layout.draws[0]
    expect(d.index).toBe(0)
    expect(d.dx).toBe(0)
    expect(d.dy).toBe(0)
    expect(d.dw).toBe(100)
    expect(d.dh).toBe(100)
    expect(d.sw).toBe(100)
    expect(d.sh).toBe(100)
    expect(d.sx).toBe(50) // (200-100)/2
    expect(d.sy).toBe(0)
  })

  it('clips vertical images centered', () => {
    // 竖图 100×200 放进 100×100 格子：sh=100, sy=50, sx=0, sw=100
    const images = [{ width: 100, height: 200 }]
    const layout = computeLayout(images, 1, 1, 100)
    const d = layout.draws[0]
    expect(d.sw).toBe(100)
    expect(d.sh).toBe(100)
    expect(d.sx).toBe(0)
    expect(d.sy).toBe(50)
  })

  it('leaves empty cells when grid exceeds image count (tolerance)', () => {
    const images = [{ width: 100, height: 100 }, { width: 100, height: 100 }]
    const layout = computeLayout(images, 2, 2, 100)
    expect(layout.draws).toHaveLength(2) // 只画 2 格，另外 2 格留空
  })

  it('ignores extra images when images exceed grid (tolerance)', () => {
    const images = [
      { width: 100, height: 100 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ]
    const layout = computeLayout(images, 1, 2, 100)
    expect(layout.draws).toHaveLength(2)
    expect(layout.draws[0].index).toBe(0)
    expect(layout.draws[1].index).toBe(1)
  })

  it('places second row at correct y offset', () => {
    const images = Array.from({ length: 4 }, () => ({ width: 100, height: 100 }))
    const layout = computeLayout(images, 2, 2, 200)
    expect(layout.draws[0].dx).toBe(0)
    expect(layout.draws[0].dy).toBe(0)
    expect(layout.draws[1].dx).toBe(100)
    expect(layout.draws[1].dy).toBe(0)
    expect(layout.draws[2].dx).toBe(0)
    expect(layout.draws[2].dy).toBe(100)
    expect(layout.draws[3].dx).toBe(100)
    expect(layout.draws[3].dy).toBe(100)
  })

  it('respects totalWidth bounds via caller; function itself just divides', () => {
    const images = [{ width: 100, height: 100 }]
    const layout = computeLayout(images, 1, 1, 256)
    expect(layout.canvasWidth).toBe(256)
    expect(layout.cellW).toBe(256)
  })
})
