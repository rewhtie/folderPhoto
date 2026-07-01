const UNITS = ['B', 'KB', 'MB', 'GB'] as const

export function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return '0 B'
  }

  let value = sizeBytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1)
  return `${rounded} ${UNITS[unitIndex]}`
}
