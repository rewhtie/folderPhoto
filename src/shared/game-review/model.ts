export interface GameReviewItem {
  appId: string
  appName: string
  coverUrl: string
}

export interface GameReviewDraft {
  type: string[]
  experience: string
  duration: string
  rating: number
  recommendation: string
  coverBlurred: boolean
}

export interface StoredGameReview extends GameReviewDraft {
  appName: string
  coverUrl?: string
}

export interface StoredCustomGame {
  appId: string
  appName: string
  review: GameReviewDraft
}
