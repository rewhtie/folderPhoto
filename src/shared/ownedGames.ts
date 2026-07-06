export interface OwnedGame {
  appid: number
  name: string
  playtimeForever: number // 分钟
  isFamily?: boolean // 家庭共享游戏（无 API 时长数据）
}

export interface OwnedGamesResult {
  games: OwnedGame[]
  error?: string
}
