import type { GameReviewDraft, GameReviewItem } from './model.js'

export interface RankedGameReview extends GameReviewItem {
  rank: number
  rating: number
  recommendation: string
  duration: string
  durationHours: number
}

const recommendationRanks = new Map(
  ['', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+'].map((value, index) => [value, index]),
)

function durationHours(value: string): number {
  const hours = Number(value.trim())
  return Number.isFinite(hours) && hours >= 0 ? hours : 0
}

export function rankGameReviews(
  games: readonly GameReviewItem[],
  drafts: Readonly<Record<string, GameReviewDraft>>,
  limit = 20,
): RankedGameReview[] {
  return games
    .flatMap((game, index) => {
      const draft = drafts[game.appId]
      if (!draft) return []
      return [{
        game,
        index,
        rating: draft.rating,
        recommendation: draft.recommendation,
        duration: draft.duration,
        durationHours: durationHours(draft.duration),
      }]
    })
    .sort((left, right) =>
      right.rating - left.rating ||
      (recommendationRanks.get(right.recommendation) ?? 0) -
        (recommendationRanks.get(left.recommendation) ?? 0) ||
      right.durationHours - left.durationHours ||
      left.index - right.index,
    )
    .slice(0, Math.max(0, limit))
    .map(({ game, index: _index, ...review }, index) => ({
      ...game,
      ...review,
      rank: index + 1,
    }))
}
