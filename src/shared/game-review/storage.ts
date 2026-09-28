import type {
  GameReviewDraft,
  GameReviewItem,
  StoredCustomGame,
  StoredGameReview,
} from './model.js'

type ReviewStorage = Pick<Storage, 'getItem' | 'setItem'>

const STORAGE_KEY = 'steam-image-browser-game-review-drafts'
const ORDER_STORAGE_KEY = 'steam-image-browser-game-review-order'
const CUSTOM_GAMES_STORAGE_KEY = 'steam-image-browser-game-review-custom-games'
const STORAGE_VERSION = 2
const CUSTOM_GAMES_STORAGE_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeGameReviewDraft(value: unknown): GameReviewDraft | null {
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
    coverBlurred: value.coverBlurred === true,
  }
}

function normalizeReviews(
  values: Record<string, unknown>,
  fallbackName?: string,
): Record<string, StoredGameReview> {
  const reviews: Record<string, StoredGameReview> = {}
  for (const [appId, value] of Object.entries(values)) {
    const draft = normalizeGameReviewDraft(value)
    if (!appId || !draft || !isRecord(value)) continue

    const savedName = typeof value.appName === 'string' ? value.appName.trim() : ''
    const appName = savedName && savedName !== appId ? savedName : fallbackName ?? '未知游戏'
    const coverUrl = typeof value.coverUrl === 'string' ? value.coverUrl : undefined
    reviews[appId] = { appName, ...draft, ...(coverUrl ? { coverUrl } : {}) }
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
      coverUrl: game.coverUrl || reviews[game.appId]?.coverUrl || '',
    }
  })
  const historicalGames = Object.entries(reviews).flatMap(([appId, review]) =>
    currentIds.has(appId)
      ? []
      : [{ appId, appName: review.appName, coverUrl: review.coverUrl ?? '' }],
  )
  return [...currentGames, ...historicalGames]
}

export function loadGameReviewOrder(storage: ReviewStorage): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(ORDER_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(value)) return []
    return value.filter((appId): appId is string => typeof appId === 'string' && appId.length > 0)
  } catch {
    return []
  }
}

export function saveGameReviewOrder(storage: ReviewStorage, order: string[]): void {
  try {
    storage.setItem(ORDER_STORAGE_KEY, JSON.stringify([...new Set(order)]))
  } catch {
    // localStorage may be unavailable or full; sorting should continue in memory.
  }
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

export function loadStoredCustomGames(storage: ReviewStorage): StoredCustomGame[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(CUSTOM_GAMES_STORAGE_KEY) ?? 'null')
    if (
      !isRecord(value) ||
      value.version !== CUSTOM_GAMES_STORAGE_VERSION ||
      !Array.isArray(value.games)
    ) {
      return []
    }

    const seen = new Set<string>()
    return value.games.flatMap((item) => {
      if (!isRecord(item)) return []
      const appId = typeof item.appId === 'string' ? item.appId.trim() : ''
      const appName = typeof item.appName === 'string' ? item.appName : ''
      const review = normalizeGameReviewDraft(item.review)
      if (!appId.startsWith('custom-') || seen.has(appId) || !review) return []
      seen.add(appId)
      return [{ appId, appName, review }]
    })
  } catch {
    return []
  }
}

export function saveStoredCustomGames(
  storage: ReviewStorage,
  games: StoredCustomGame[],
): void {
  try {
    storage.setItem(
      CUSTOM_GAMES_STORAGE_KEY,
      JSON.stringify({
        version: CUSTOM_GAMES_STORAGE_VERSION,
        games: games.map((game) => ({
          appId: game.appId,
          appName: game.appName,
          review: { ...game.review, type: [...game.review.type] },
        })),
      }),
    )
  } catch {
    // localStorage may be unavailable or full; editing should continue in memory.
  }
}
