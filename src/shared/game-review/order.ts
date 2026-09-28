export type DropPosition = 'before' | 'after'

export function reorderIds(
  order: readonly string[],
  sourceId: string,
  targetId: string,
  position: DropPosition,
): string[] {
  const next = [...order]
  const sourceIndex = next.indexOf(sourceId)
  if (sourceIndex < 0 || sourceId === targetId) return next

  const [movedId] = next.splice(sourceIndex, 1)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex < 0) return [...order]

  next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, movedId)
  return next
}
