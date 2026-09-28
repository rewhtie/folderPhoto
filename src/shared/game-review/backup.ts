import { normalizeGameReviewDraft } from './storage.js'
import type {
  GameReviewDraft,
  StoredCustomGame,
  StoredGameReview,
} from './model.js'

export const GAME_REVIEW_BACKUP_FORMAT = 'steam-pc-game-reviews'
export const GAME_REVIEW_BACKUP_VERSION = 1

export interface GameReviewBackupState {
  reviews: Record<string, StoredGameReview>
  customGames: StoredCustomGame[]
  order: string[]
}

export interface GameReviewBackupV1 extends GameReviewBackupState {
  format: typeof GAME_REVIEW_BACKUP_FORMAT
  version: typeof GAME_REVIEW_BACKUP_VERSION
  exportedAt: string
}

export interface ParsedGameReviewImport {
  reviews: Record<string, StoredGameReview>
  customGames: StoredCustomGame[] | null
  order: string[] | null
}

export class GameReviewBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameReviewBackupError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneDraft(draft: GameReviewDraft): GameReviewDraft {
  return { ...draft, type: [...draft.type] }
}

function parseReviews(value: unknown): Record<string, StoredGameReview> {
  if (!isRecord(value)) throw new GameReviewBackupError('测评记录格式无效')

  return Object.fromEntries(
    Object.entries(value).map(([appId, item]) => {
      if (!appId.trim() || !isRecord(item)) {
        throw new GameReviewBackupError('测评记录包含无效游戏')
      }
      const draft = normalizeGameReviewDraft(item)
      if (!draft) throw new GameReviewBackupError('测评记录包含无效字段')
      const appName = typeof item.appName === 'string' ? item.appName.trim() : ''
      return [appId, { appName: appName || '未知游戏', ...draft }]
    }),
  )
}

function parseCustomGames(value: unknown): StoredCustomGame[] {
  if (!Array.isArray(value)) throw new GameReviewBackupError('自定义游戏格式无效')

  const seen = new Set<string>()
  return value.map((item) => {
    if (!isRecord(item)) throw new GameReviewBackupError('自定义游戏格式无效')
    const appId = typeof item.appId === 'string' ? item.appId.trim() : ''
    const appName = typeof item.appName === 'string' ? item.appName : ''
    const review = normalizeGameReviewDraft(item.review)
    if (!appId.startsWith('custom-') || seen.has(appId) || !review) {
      throw new GameReviewBackupError('自定义游戏包含无效或重复的 ID')
    }
    seen.add(appId)
    return { appId, appName, review }
  })
}

function parseOrder(value: unknown): string[] {
  if (!Array.isArray(value)) throw new GameReviewBackupError('游戏排序格式无效')
  return [...new Set(value.filter((appId): appId is string => typeof appId === 'string'))]
}

export function parseGameReviewImport(value: unknown): ParsedGameReviewImport {
  if (!isRecord(value)) throw new GameReviewBackupError('无法读取 JSON 文件')

  if (value.format === GAME_REVIEW_BACKUP_FORMAT) {
    if (value.version !== GAME_REVIEW_BACKUP_VERSION) {
      throw new GameReviewBackupError('不支持该游戏测评备份版本')
    }
    const reviews = parseReviews(value.reviews)
    const customGames = parseCustomGames(value.customGames)
    const reviewIds = new Set(Object.keys(reviews))
    if (customGames.some((game) => reviewIds.has(game.appId))) {
      throw new GameReviewBackupError('普通游戏与自定义游戏 ID 冲突')
    }
    return { reviews, customGames, order: parseOrder(value.order) }
  }

  if (value.version === 2 && isRecord(value.reviews)) {
    return { reviews: parseReviews(value.reviews), customGames: null, order: null }
  }
  if (value.version === 1 && isRecord(value.drafts)) {
    return { reviews: parseReviews(value.drafts), customGames: null, order: null }
  }

  throw new GameReviewBackupError('不是受支持的游戏测评备份')
}

function durationNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function longerDuration(local: string, imported: string): string {
  const localValue = durationNumber(local)
  const importedValue = durationNumber(imported)
  if (localValue === null) return importedValue === null ? '' : imported
  if (importedValue === null) return local
  return importedValue > localValue ? imported : local
}

function mergeDraft(local: GameReviewDraft | undefined, imported: GameReviewDraft): GameReviewDraft {
  return {
    ...cloneDraft(imported),
    duration: local ? longerDuration(local.duration, imported.duration) : imported.duration,
  }
}

export function mergeGameReviewImport(
  local: GameReviewBackupState,
  imported: ParsedGameReviewImport,
): GameReviewBackupState {
  const reviews = Object.fromEntries(
    Object.entries(local.reviews).map(([appId, review]) => [
      appId,
      { ...review, type: [...review.type] },
    ]),
  )
  for (const [appId, review] of Object.entries(imported.reviews)) {
    reviews[appId] = {
      appName: review.appName,
      ...mergeDraft(reviews[appId], review),
    }
  }

  const customGamesById = new Map(
    local.customGames.map((game) => [
      game.appId,
      { ...game, review: cloneDraft(game.review) },
    ]),
  )
  for (const game of imported.customGames ?? []) {
    const localGame = customGamesById.get(game.appId)
    customGamesById.set(game.appId, {
      appId: game.appId,
      appName: game.appName,
      review: mergeDraft(localGame?.review, game.review),
    })
  }
  const customGames = [...customGamesById.values()]

  const validIds = new Set([...Object.keys(reviews), ...customGames.map((game) => game.appId)])
  const preferredOrder = imported.order ?? local.order
  const order: string[] = []
  const seen = new Set<string>()
  for (const appId of [...preferredOrder, ...local.order, ...validIds]) {
    if (!validIds.has(appId) || seen.has(appId)) continue
    seen.add(appId)
    order.push(appId)
  }

  return { reviews, customGames, order }
}

export function createGameReviewBackup(
  state: GameReviewBackupState,
  exportedAt = new Date().toISOString(),
): GameReviewBackupV1 {
  return {
    format: GAME_REVIEW_BACKUP_FORMAT,
    version: GAME_REVIEW_BACKUP_VERSION,
    exportedAt,
    reviews: Object.fromEntries(
      Object.entries(state.reviews).map(([appId, review]) => [
        appId,
        { ...review, type: [...review.type] },
      ]),
    ),
    customGames: state.customGames.map((game) => ({
      appId: game.appId,
      appName: game.appName,
      review: cloneDraft(game.review),
    })),
    order: [...state.order],
  }
}
