import type { GameReviewItem } from './gameReview.js'

export interface GameReviewDraft {
  type: string[]
  experience: string
  duration: string
  rating: number
  recommendation: string
}

export interface StoredGameReview extends GameReviewDraft {
  appName: string
}

type ReviewStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'steam-image-browser-game-review-drafts'
const STORAGE_VERSION = 2

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDraft(value: unknown): GameReviewDraft | null {
  if (!isRecord(value)) return null

  return {
    type: Array.isArray(value.type)
      ? value.type.filter((item): item is string => typeof item === 'string')
      : [],
    experience: typeof value.experience === 'string' ? value.experience : '',
    duration: typeof value.duration === 'string' ? value.duration : '',
    rating:
      typeof value.rating === 'number' &&
      Number.isInteger(value.rating) &&
      value.rating >= 0 &&
      value.rating <= 5
        ? value.rating
        : 0,
    recommendation: typeof value.recommendation === 'string' ? value.recommendation : '',
  }
}

function normalizeReviews(
  values: Record<string, unknown>,
  fallbackName?: string,
): Record<string, StoredGameReview> {
  const reviews: Record<string, StoredGameReview> = {}
  for (const [appId, value] of Object.entries(values)) {
    const draft = normalizeDraft(value)
    if (!appId || !draft || !isRecord(value)) continue

    const savedName = typeof value.appName === 'string' ? value.appName.trim() : ''
    const appName = savedName && savedName !== appId ? savedName : fallbackName ?? '未知游戏'
    reviews[appId] = { appName, ...draft }
  }
  return reviews
}

export function loadGameReviews(storage: ReviewStorage): Record<string, StoredGameReview> {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')
    if (!isRecord(value)) return {}

    if (value.version === STORAGE_VERSION && isRecord(value.reviews)) {
      return normalizeReviews(value.reviews)
    }
    if (value.version === 1 && isRecord(value.drafts)) {
      return normalizeReviews(value.drafts, '未知游戏')
    }
    return {}
  } catch {
    return {}
  }
}

export function mergeGamesWithStoredReviews(
  games: GameReviewItem[],
  reviews: Record<string, StoredGameReview>,
): GameReviewItem[] {
  const currentIds = new Set(games.map((game) => game.appId))
  const currentGames = games.map((game) => {
    const savedName = reviews[game.appId]?.appName
    const hasRealCurrentName =
      game.appName.trim() !== '' &&
      game.appName !== game.appId &&
      game.appName !== '未知游戏'

    return {
      ...game,
      appName: hasRealCurrentName ? game.appName : savedName || '未知游戏',
    }
  })
  const historicalGames = Object.entries(reviews).flatMap(([appId, review]) =>
    currentIds.has(appId)
      ? []
      : [{ appId, appName: review.appName, coverUrl: '' }],
  )
  return [...currentGames, ...historicalGames]
}

export function saveGameReviews(
  storage: ReviewStorage,
  reviews: Record<string, StoredGameReview>,
): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        reviews,
      }),
    )
  } catch {
    // localStorage may be unavailable or full; editing should continue in memory.
  }
}
