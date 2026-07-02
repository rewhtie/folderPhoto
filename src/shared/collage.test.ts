import { describe, expect, it } from 'vitest'
import { computeLayout, dominantAspectRatio, moveItem } from './collage'

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

  it('derives cell height from dominant aspect ratio', () => {
    // 单张 200×100（ratio 2）→ cellH = cellW / 2
    const images = [{ width: 200, height: 100 }]
    const layout = computeLayout(images, 1, 1, 100)
    const d = layout.draws[0]
    expect(layout.cellH).toBe(50)
    expect(layout.canvasHeight).toBe(50)
    expect(d.dw).toBe(100)
    expect(d.dh).toBe(50)
    expect(d.sw).toBe(200) // 比例一致，不裁剪
    expect(d.sh).toBe(100)
    expect(d.sx).toBe(0)
    expect(d.sy).toBe(0)
  })

  it('clips wide images whose ratio differs from dominant aspect', () => {
    // 众数比例 1（两张正方），中间一张横图被居中裁剪
    const images = [
      { width: 100, height: 100 },
      { width: 200, height: 100 },
      { width: 100, height: 100 },
    ]
    const layout = computeLayout(images, 1, 3, 300)
    expect(layout.cellH).toBe(100) // dominant=1 → 正方格
    const wide = layout.draws[1]
    expect(wide.sw).toBe(100) // 从 200 宽裁出 100
    expect(wide.sh).toBe(100)
    expect(wide.sx).toBe(50) // 居中
    expect(wide.sy).toBe(0)
    expect(wide.dx).toBe(100)
    expect(wide.dy).toBe(0)
    expect(wide.dw).toBe(100)
    expect(wide.dh).toBe(100)
  })

  it('clips vertical images centered', () => {
    // 众数比例 1，中间一张竖图被居中裁剪
    const images = [
      { width: 100, height: 100 },
      { width: 100, height: 200 },
      { width: 100, height: 100 },
    ]
    const layout = computeLayout(images, 1, 3, 300)
    const tall = layout.draws[1]
    expect(tall.sw).toBe(100)
    expect(tall.sh).toBe(100)
    expect(tall.sx).toBe(0)
    expect(tall.sy).toBe(50) // 居中
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

describe('moveItem', () => {
  it('moves an item forward', () => {
    expect(moveItem([10, 20, 30, 40], 0, 2)).toEqual([20, 30, 10, 40])
  })

  it('moves an item backward', () => {
    expect(moveItem([10, 20, 30, 40], 3, 1)).toEqual([10, 40, 20, 30])
  })

  it('is a no-op when from === to', () => {
    expect(moveItem([10, 20, 30], 1, 1)).toEqual([10, 20, 30])
  })

  it('handles single-element array', () => {
    expect(moveItem([10], 0, 0)).toEqual([10])
  })

  it('does not mutate the original array', () => {
    const arr = [10, 20, 30]
    moveItem(arr, 0, 2)
    expect(arr).toEqual([10, 20, 30])
  })
})
