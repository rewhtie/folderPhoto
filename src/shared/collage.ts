export interface CollageImage {
  width: number
  height: number
}

export interface CollageDraw {
  index: number
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

export interface CollageLayout {
  canvasWidth: number
  canvasHeight: number
  cellW: number
  cellH: number
  draws: CollageDraw[]
}

// 把宽高比按 0.01 精度分桶取众数；空数组或全部退化时默认 1
export function dominantAspectRatio(images: CollageImage[]): number {
  const counts = new Map<number, number>()
  for (const img of images) {
    if (!img.height) continue
    const ratio = Math.round((img.width / img.height) * 100) / 100
    counts.set(ratio, (counts.get(ratio) ?? 0) + 1)
  }
  if (counts.size === 0) return 1
  let best = 1
  let bestCount = 0
  for (const [ratio, count] of counts) {
    if (count > bestCount) {
      best = ratio
      bestCount = count
    }
  }
  return best
}

// cover 居中裁剪：把 src 原图按比例裁出与目标格同比例的区域
function coverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const srcRatio = srcW / srcH
  const dstRatio = dstW / dstH
  let sw: number
  let sh: number
  if (srcRatio > dstRatio) {
    // 原图更宽 → 高度对齐，宽度裁剪
    sh = srcH
    sw = srcH * dstRatio
  } else {
    sw = srcW
    sh = srcW / dstRatio
  }
  const sx = (srcW - sw) / 2
  const sy = (srcH - sh) / 2
  return { sx, sy, sw, sh }
}

export function computeLayout(
  images: CollageImage[],
  rows: number,
  cols: number,
  totalWidth: number,
): CollageLayout {
  const safeCols = Math.max(1, Math.floor(cols))
  const safeRows = Math.max(1, Math.floor(rows))
  const cellW = totalWidth / safeCols
  const cellH = cellW
  const canvasWidth = totalWidth
  const canvasHeight = cellH * safeRows

  const draws: CollageDraw[] = []
  const totalCells = safeRows * safeCols
  const usable = Math.min(images.length, totalCells)
  for (let i = 0; i < usable; i++) {
    const row = Math.floor(i / safeCols)
    const col = i % safeCols
    const dx = col * cellW
    const dy = row * cellH
    const img = images[i]
    const { sx, sy, sw, sh } = coverRect(img.width, img.height, cellW, cellH)
    draws.push({ index: i, sx, sy, sw, sh, dx, dy, dw: cellW, dh: cellH })
  }

  return { canvasWidth, canvasHeight, cellW, cellH, draws }
}
