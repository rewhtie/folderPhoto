export type DropPosition = 'before' | 'after'
export type GameReviewSort =
  | 'manual'
  | 'recommendation-desc'
  | 'recommendation-asc'
  | 'rating-desc'
  | 'rating-asc'
  | 'type-selection'

export interface GameReviewSortValues {
  recommendation: string
  rating: number
  types: readonly string[]
}

const recommendationRanks = new Map(
  ['', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+'].map((value, index) => [value, index]),
)

export function sortGamesByReview<T>(
  games: readonly T[],
  sort: GameReviewSort,
  valuesFor: (game: T) => GameReviewSortValues,
  typeOrder: readonly string[] = [],
): T[] {
  if (sort === 'manual') return [...games]

  return games
    .map((game, index) => ({ game, index, values: valuesFor(game) }))
    .sort((left, right) => {
      if (sort === 'type-selection') {
        const typeRank = (types: readonly string[]) => {
          const ranks = types
            .map((type) => typeOrder.indexOf(type))
            .filter((rank) => rank >= 0)
          return ranks.length > 0 ? Math.min(...ranks) : Number.POSITIVE_INFINITY
        }
        const leftRank = typeRank(left.values.types)
        const rightRank = typeRank(right.values.types)
        return leftRank === rightRank ? left.index - right.index : leftRank - rightRank
      }

      const byRecommendation = sort.startsWith('recommendation')
      const descending = sort.endsWith('desc')
      const leftValue = byRecommendation
        ? recommendationRanks.get(left.values.recommendation) ?? 0
        : left.values.rating
      const rightValue = byRecommendation
        ? recommendationRanks.get(right.values.recommendation) ?? 0
        : right.values.rating
      if (leftValue === rightValue) return left.index - right.index
      return descending ? rightValue - leftValue : leftValue - rightValue
    })
    .map(({ game }) => game)
}

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
