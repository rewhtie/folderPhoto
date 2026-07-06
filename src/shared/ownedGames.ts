export interface OwnedGame {
  appid: number
  name: string
  playtimeForever: number // 分钟
}

export interface OwnedGamesResult {
  games: OwnedGame[]
  error?: string
}
