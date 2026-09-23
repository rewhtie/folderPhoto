import type { ImageAsset } from './imageLibrary.js'

export interface GameReviewItem {
  appId: string
  appName: string
  coverUrl: string
}

export function selectedGamesForReview(
  images: ImageAsset[],
  selectedPaths: ReadonlySet<string>,
): GameReviewItem[] {
  const games = new Map<string, GameReviewItem>()

  for (const image of images) {
    if (!image.appId || !selectedPaths.has(image.absolutePath) || games.has(image.appId)) continue

    games.set(image.appId, {
      appId: image.appId,
      appName: image.appName || image.appId,
      coverUrl: image.fileUrl,
    })
  }

  return [...games.values()]
}
