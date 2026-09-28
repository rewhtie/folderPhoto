export interface GameTypeDefinition {
  label: string
  color: string
  aliases?: readonly string[]
}

export interface GameTypeOption extends GameTypeDefinition {
  id: string
}

export const GAME_TYPES: Readonly<Record<string, GameTypeDefinition>> = {
  butter: { label: '🧈', color: '#ffcfdf' },
  galgame: { label: 'Galgame', color: '#f472b6' },
  horror: { label: '恐怖游戏', color: '#dc2626' },
  rpg: { label: 'RPG', color: '#8b5cf6' },
  jrpg: { label: 'JRPG', color: '#ec4899' },
  soulslike: { label: '类魂', color: '#48466d' },
  roguelike: { label: '肉鸽', color: '#c084fc' },
  card: { label: '卡牌', color: '#fbbf24' },
  management: { label: '建造经营', color: '#9896f1', aliases: ['养成经营'] },
  slg: { label: 'SLG', color: '#ff165d', aliases: ['SLG养成'] },
  towerDefense: { label: '塔防', color: '#6639a6' },
  casual: { label: '休闲', color: '#00adb5' },
  puzzle: { label: '解谜', color: '#60a5fa' },
  metroidvania: { label: '类银河恶魔城', color: '#769fcd' },
  bulletHell: { label: '弹幕', color: '#ffd3b6' },
  sideScroller: { label: '横版闯关', color: '#f87171' },
  platformer: { label: '平台跳跃', color: '#67e8f9' },
  openWorld: { label: '开放世界', color: '#5eead4' },
  hakoniwa: { label: '箱庭地图', color: '#ff9a8b', aliases: ['箱体地图'] },
  multiplayer: { label: '联机', color: '#311d3f' },
  sokoban: { label: '推箱子', color: '#d6b978' },
  action: { label: '动作游戏', color: '#112d4e' },
  shooter: { label: '射击游戏', color: '#38bdf8' },
  meta: { label: 'Meta', color: '#f59e0b' },
  turnBased: { label: '回合制', color: '#14b8a6' },
  visualNovel: { label: '视觉小说', color: '#fc5185' },
}

export const GAME_TYPE_OPTIONS: readonly GameTypeOption[] = Object.entries(GAME_TYPES).map(
  ([id, definition]) => ({ id, ...definition }),
)

const typeAliases = new Map<string, string>()
for (const type of GAME_TYPE_OPTIONS) {
  typeAliases.set(type.id, type.id)
  typeAliases.set(type.label, type.id)
  for (const alias of type.aliases ?? []) typeAliases.set(alias, type.id)
}

export function normalizeGameTypeIds(types: readonly string[]): string[] {
  const typeIds = new Set<string>()

  for (const type of types) {
    const typeId = typeAliases.get(type)
    if (typeId) typeIds.add(typeId)
  }

  return [...typeIds]
}

export function gameTypeLabel(typeId: string): string {
  return GAME_TYPES[typeId]?.label ?? typeId
}

export function gameTypeColor(typeId: string): string | undefined {
  return GAME_TYPES[typeId]?.color
}
