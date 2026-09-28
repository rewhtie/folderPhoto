<script setup lang="ts">
import { toPng } from 'html-to-image'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { GameReviewItem } from '../shared/gameReview'
import {
  createGameReviewBackup,
  GameReviewBackupError,
  mergeGameReviewImport,
  parseGameReviewImport,
  type GameReviewBackupState,
} from '../shared/gameReviewBackup'
import {
  loadGameReviewOrder,
  loadGameReviews,
  loadStoredCustomGames,
  mergeGamesWithStoredReviews,
  saveGameReviewOrder,
  saveGameReviews,
  saveStoredCustomGames,
  type GameReviewDraft,
  type StoredCustomGame,
  type StoredGameReview,
} from '../shared/gameReviewStorage'
import { pickLocalImages } from '../shared/localImagePicker'

interface CustomReviewGame extends GameReviewItem {
  isCustom: true
}

const props = defineProps<{
  games: GameReviewItem[]
}>()

const emit = defineEmits<{
  reorder: [games: GameReviewItem[]]
}>()

const reviewBadgeDefinitions = [
  { id: 'crown', label: '皇冠', width: 32, height: 24, rotation: 42 },
  { id: 'stamp', label: '点赞印章', width: 30, height: 30, rotation: -15 },
] as const

type ReviewBadgeStyle = (typeof reviewBadgeDefinitions)[number]['id']
type ReviewBadgeDefinition = (typeof reviewBadgeDefinitions)[number]

const drafts = reactive<Record<string, GameReviewDraft>>({})
const savedReviews = reactive<Record<string, StoredGameReview>>(
  loadGameReviews(window.localStorage),
)
const storedCustomGames = reactive<Record<string, StoredCustomGame>>(
  Object.fromEntries(
    loadStoredCustomGames(window.localStorage).map((game) => [game.appId, game]),
  ),
)
const reviewBadgeStyles = reactive<Record<string, ReviewBadgeStyle>>({})
const customGames = ref<CustomReviewGame[]>(
  Object.values(storedCustomGames).map((game) => ({
    appId: game.appId,
    appName: game.appName,
    coverUrl: '',
    isCustom: true,
  })),
)
const hoveredRating = ref<{ appId: string; rating: number } | null>(null)
const recordFileInput = ref<HTMLInputElement | null>(null)
const isImportingRecords = ref(false)
const isExportingRecords = ref(false)
const recordTransferMessage = ref('')
const recordTransferError = ref('')
let isApplyingRecordImport = false
let customGameSequence = 0
interface FloatingMenu {
  appId: string
  top: number
  left: number
  width: number
}

const recommendationMenu = ref<FloatingMenu | null>(null)
const typeMenu = ref<FloatingMenu | null>(null)
const recommendationOptions = ['', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+']
const selectedTypeFilters = ref<string[]>([])
const selectedRecommendationFilters = ref<string[]>([])
const gameNameQuery = ref('')
const pageSizeOptions = [5, 10, 20, 50, 100]
const pageSize = ref(20)
const currentPage = ref(1)
const gameOrder = ref<string[]>(loadGameReviewOrder(window.localStorage))
const tableEl = ref<HTMLElement | null>(null)
const isExporting = ref(false)
const exportError = ref('')
const availableGames = computed<Array<GameReviewItem | CustomReviewGame>>(() => [
  ...mergeGamesWithStoredReviews(props.games, savedReviews),
  ...customGames.value,
])
const allGames = computed<Array<GameReviewItem | CustomReviewGame>>(() => {
  const gamesById = new Map(availableGames.value.map((game) => [game.appId, game]))
  const orderedGames = gameOrder.value.flatMap((appId) => {
    const game = gamesById.get(appId)
    return game ? [game] : []
  })
  const orderedIds = new Set(gameOrder.value)
  return [...orderedGames, ...availableGames.value.filter((game) => !orderedIds.has(game.appId))]
})

watch(
  availableGames,
  (games) => {
    const availableIds = new Set(games.map((game) => game.appId))
    const retainedIds = gameOrder.value.filter((appId) => availableIds.has(appId))
    const retainedSet = new Set(retainedIds)
    gameOrder.value = [
      ...retainedIds,
      ...games.map((game) => game.appId).filter((appId) => !retainedSet.has(appId)),
    ]
    saveGameReviewOrder(window.localStorage, gameOrder.value)
  },
  { immediate: true },
)

function reviewBadgeDefinition(appId: string): ReviewBadgeDefinition {
  const selectedId = reviewBadgeStyles[appId] ?? reviewBadgeDefinitions[0].id
  return (
    reviewBadgeDefinitions.find((definition) => definition.id === selectedId) ??
    reviewBadgeDefinitions[0]
  )
}

function reviewBadgeStyle(appId: string): Record<string, string> {
  const badge = reviewBadgeDefinition(appId)
  return {
    '--badge-width': `${badge.width}px`,
    '--badge-height': `${badge.height}px`,
    '--badge-rotation': `${badge.rotation}deg`,
  }
}

function toggleReviewBadge(appId: string): void {
  const currentBadge = reviewBadgeDefinition(appId)
  const currentIndex = reviewBadgeDefinitions.findIndex(
    (definition) => definition.id === currentBadge.id,
  )
  const nextBadge = reviewBadgeDefinitions[(currentIndex + 1) % reviewBadgeDefinitions.length]
  reviewBadgeStyles[appId] = nextBadge.id
}

function normalizeGameTypeIds(types: string[]): string[] {
  const typeIds = new Set<string>()

  for (const type of types) {
    const typeId = typeAliases.get(type)
    if (typeId) typeIds.add(typeId)
  }

  return [...typeIds]
}

function newReviewDraft(appId?: string): GameReviewDraft {
  const savedDraft = appId
    ? savedReviews[appId] ?? storedCustomGames[appId]?.review
    : undefined
  if (savedDraft) {
    return {
      ...savedDraft,
      type: normalizeGameTypeIds(savedDraft.type),
    }
  }

  return {
    type: [],
    experience: '',
    duration: '',
    rating: 0,
    recommendation: '',
    coverBlurred: false,
  }
}

function addCustomGame(): void {
  customGameSequence += 1
  const appId = `custom-${Date.now()}-${customGameSequence}`
  customGames.value.push({
    appId,
    appName: '',
    coverUrl: '',
    isCustom: true,
  })
  drafts[appId] = newReviewDraft()
  clearFilters()
  void nextTick(() => {
    currentPage.value = totalPages.value
  })
}

async function chooseCustomCover(appId: string): Promise<void> {
  const selected = await pickLocalImages({ multiple: false })
  if (selected.length === 0) return

  const game = customGames.value.find((item) => item.appId === appId)
  if (game) game.coverUrl = selected[0]
}

function removeGame(game: GameReviewItem | CustomReviewGame): void {
  if (isCustomGame(game)) {
    customGames.value = customGames.value.filter((item) => item.appId !== game.appId)
    delete storedCustomGames[game.appId]
  } else {
    delete savedReviews[game.appId]
    emit(
      'reorder',
      props.games.filter((item) => item.appId !== game.appId),
    )
    saveGameReviews(window.localStorage, savedReviews)
  }

  delete drafts[game.appId]
  delete reviewBadgeStyles[game.appId]
  if (typeMenu.value?.appId === game.appId) typeMenu.value = null
  if (recommendationMenu.value?.appId === game.appId) recommendationMenu.value = null
}

function isCustomGame(game: GameReviewItem | CustomReviewGame): game is CustomReviewGame {
  return 'isCustom' in game && game.isCustom
}

function toggleFilter(filters: string[], value: string): void {
  const index = filters.indexOf(value)
  if (index >= 0) {
    filters.splice(index, 1)
  } else {
    filters.push(value)
  }
}

function clearFilters(): void {
  selectedTypeFilters.value = []
  selectedRecommendationFilters.value = []
}

const hasActiveFilters = computed(
  () => selectedTypeFilters.value.length > 0 || selectedRecommendationFilters.value.length > 0,
)

type DropPosition = 'before' | 'after'

interface PendingDrag {
  appId: string
  pointerId: number
  startX: number
  startY: number
  handle: HTMLElement
}

const draggedAppId = ref<string | null>(null)
const dropTarget = ref<{ appId: string; position: DropPosition } | null>(null)
let pendingDrag: PendingDrag | null = null
let suppressedCoverClickAppId: string | null = null

function resetDrag(): void {
  pendingDrag = null
  draggedAppId.value = null
  dropTarget.value = null
  window.removeEventListener('pointermove', handleDragPointerMove)
  window.removeEventListener('pointerup', handleDragPointerUp)
  window.removeEventListener('pointercancel', cancelDrag)
}

function beginCoverDrag(appId: string, event: PointerEvent): void {
  if (hasActiveFilters.value || event.button !== 0) return

  resetDrag()
  pendingDrag = {
    appId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    handle: event.currentTarget as HTMLElement,
  }
  window.addEventListener('pointermove', handleDragPointerMove, { passive: false })
  window.addEventListener('pointerup', handleDragPointerUp)
  window.addEventListener('pointercancel', cancelDrag)
}

function handleDragPointerMove(event: PointerEvent): void {
  if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return

  if (!draggedAppId.value) {
    const distance = Math.hypot(
      event.clientX - pendingDrag.startX,
      event.clientY - pendingDrag.startY,
    )
    if (distance <= 8) return

    draggedAppId.value = pendingDrag.appId
    suppressedCoverClickAppId = pendingDrag.appId
    pendingDrag.handle.setPointerCapture?.(pendingDrag.pointerId)
  }

  event.preventDefault()
  const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(
    'tr[data-review-app-id]',
  )
  const targetAppId = row?.dataset.reviewAppId
  if (!row || !targetAppId || targetAppId === draggedAppId.value) {
    dropTarget.value = null
    return
  }

  const rect = row.getBoundingClientRect()
  dropTarget.value = {
    appId: targetAppId,
    position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
  }
}

function applyReorder(): void {
  if (!draggedAppId.value || !dropTarget.value) return

  const orderedIds = allGames.value.map((game) => game.appId)
  const sourceIndex = orderedIds.indexOf(draggedAppId.value)
  if (sourceIndex < 0) return

  const [movedId] = orderedIds.splice(sourceIndex, 1)
  const targetIndex = orderedIds.indexOf(dropTarget.value.appId)
  if (targetIndex < 0) return
  orderedIds.splice(targetIndex + (dropTarget.value.position === 'after' ? 1 : 0), 0, movedId)
  gameOrder.value = orderedIds
  saveGameReviewOrder(window.localStorage, orderedIds)

  const gamesById = new Map(props.games.map((game) => [game.appId, game]))
  emit(
    'reorder',
    orderedIds.flatMap((appId) => {
      const game = gamesById.get(appId)
      return game ? [game] : []
    }),
  )
}

function handleDragPointerUp(event: PointerEvent): void {
  if (!pendingDrag || event.pointerId !== pendingDrag.pointerId) return
  const completedDragAppId = draggedAppId.value
  applyReorder()
  resetDrag()
  if (completedDragAppId) {
    window.setTimeout(() => {
      if (suppressedCoverClickAppId === completedDragAppId) suppressedCoverClickAppId = null
    }, 0)
  }
}

function cancelDrag(): void {
  resetDrag()
}

function handleCustomCoverClick(appId: string): void {
  if (suppressedCoverClickAppId === appId) {
    suppressedCoverClickAppId = null
    return
  }
  void chooseCustomCover(appId)
}

onBeforeUnmount(resetDrag)

const filteredGames = computed(() => {
  const normalizedQuery = gameNameQuery.value.trim().toLocaleLowerCase()

  return allGames.value.filter((game) => {
    const draft = drafts[game.appId]
    if (!draft) return false

    const matchesName =
      normalizedQuery.length === 0 || game.appName.toLocaleLowerCase().includes(normalizedQuery)
    const matchesType =
      selectedTypeFilters.value.length === 0 ||
      selectedTypeFilters.value.some((type) => draft.type.includes(type))
    const matchesRecommendation =
      selectedRecommendationFilters.value.length === 0 ||
      selectedRecommendationFilters.value.includes(draft.recommendation)

    return matchesName && matchesType && matchesRecommendation
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredGames.value.length / pageSize.value)))
const pageStartIndex = computed(() => (currentPage.value - 1) * pageSize.value)
const paginatedGames = computed(() =>
  filteredGames.value.slice(pageStartIndex.value, pageStartIndex.value + pageSize.value),
)
const visibleRangeStart = computed(() =>
  filteredGames.value.length === 0 ? 0 : pageStartIndex.value + 1,
)
const visibleRangeEnd = computed(() =>
  Math.min(pageStartIndex.value + pageSize.value, filteredGames.value.length),
)

watch(
  [
    () => selectedTypeFilters.value.join('\u0000'),
    () => selectedRecommendationFilters.value.join('\u0000'),
    () => gameNameQuery.value,
  ],
  () => {
    currentPage.value = 1
  },
)

watch(pageSize, () => {
  currentPage.value = 1
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

watch(filteredGames, (games) => {
  const visibleAppIds = new Set(games.map((game) => game.appId))

  if (typeMenu.value && !visibleAppIds.has(typeMenu.value.appId)) {
    typeMenu.value = null
  }
  if (recommendationMenu.value && !visibleAppIds.has(recommendationMenu.value.appId)) {
    recommendationMenu.value = null
  }
})

function menuPosition(
  appId: string,
  event: MouseEvent,
  expectedHeight: number,
): FloatingMenu {
  const button = event.currentTarget as HTMLButtonElement
  const rect = button.getBoundingClientRect()
  const gap = 8
  const viewportMargin = 12
  const spaceBelow = window.innerHeight - rect.bottom - viewportMargin
  const spaceAbove = rect.top - viewportMargin
  const shouldOpenUp = spaceBelow < expectedHeight && spaceAbove > spaceBelow
  const top = shouldOpenUp
    ? Math.max(viewportMargin, rect.top - gap - Math.min(expectedHeight, spaceAbove))
    : rect.bottom + gap

  return {
    appId,
    top,
    left: rect.left,
    width: rect.width,
  }
}

function toggleTypeMenu(appId: string, event: MouseEvent): void {
  if (typeMenu.value?.appId === appId) {
    typeMenu.value = null
    return
  }

  recommendationMenu.value = null
  typeMenu.value = menuPosition(appId, event, 360)
}

function toggleGameType(appId: string, type: string): void {
  const selectedTypes = drafts[appId].type
  const index = selectedTypes.indexOf(type)
  if (index >= 0) {
    selectedTypes.splice(index, 1)
  } else {
    selectedTypes.push(type)
  }
}

interface GameTypeDefinition {
  label: string
  color: string
  aliases?: string[]
}

const gameTypes: Record<string, GameTypeDefinition> = {
  butter: { label: '🧈', color: '#ffcfdf' },
  galgame: { label: 'Galgame', color: '#f472b6' },
  horror: { label: '恐怖游戏', color: '#dc2626' },
  rpg: { label: 'RPG', color: '#8b5cf6' },
  jrpg: { label: 'JRPG', color: '#ec4899' },
  soulslike: { label: '类魂', color: '#222831' },
  roguelike: { label: '肉鸽', color: '#c084fc' },
  card: { label: '卡牌', color: '#fbbf24' },
  management: { label: '建造经营', color: '#9896f1', aliases: ['养成经营'] },
  slg: { label: 'SLG', color: '#ff165d', aliases: ['SLG养成'] },
  towerDefense: { label: '塔防', color: '#6639a6' },
  casual: { label: '休闲', color: '#a5dee5' },
  puzzle: { label: '解谜', color: '#60a5fa' },
  metroidvania: { label: '类银河恶魔城', color: '#a8e6cf' },
  bulletHell: { label: '弹幕', color: '#ffd3b6' },
  sideScroller: { label: '横版闯关', color: '#f87171' },
  platformer: { label: '平台跳跃', color: '#67e8f9' },
  openWorld: { label: '开放世界', color: '#5eead4' },
  hakoniwa: { label: '箱庭地图', color: '#ff9a8b', aliases: ['箱体地图'] },
  multiplayer: { label: '联机', color: '#86efac' },
  sokoban: { label: '推箱子', color: '#d6b978' },
  action: { label: '动作游戏', color: '#112d4e' },
  shooter: { label: '射击游戏', color: '#38bdf8' },
  meta: { label: 'Meta', color: '#f59e0b' },
  turnBased: { label: '回合制', color: '#14b8a6' },
  visualNovel: { label: '视觉小说', color: '#fc5185' },
}

const typeOptions = Object.entries(gameTypes).map(([id, definition]) => ({
  id,
  ...definition,
}))
const typeAliases = new Map<string, string>()
for (const type of typeOptions) {
  typeAliases.set(type.id, type.id)
  typeAliases.set(type.label, type.id)
  for (const alias of type.aliases ?? []) typeAliases.set(alias, type.id)
}

function typeLabel(typeId: string): string {
  return gameTypes[typeId]?.label ?? typeId
}

function typeStyle(typeId: string): { color?: string } {
  return { color: gameTypes[typeId]?.color }
}

function toggleRecommendationMenu(appId: string, event: MouseEvent): void {
  if (recommendationMenu.value?.appId === appId) {
    recommendationMenu.value = null
    return
  }

  typeMenu.value = null
  recommendationMenu.value = menuPosition(appId, event, 320)
}

function selectRecommendation(appId: string, recommendation: string): void {
  drafts[appId].recommendation = recommendation
  recommendationMenu.value = null
}

function recommendationClass(recommendation: string): string {
  const classes: Record<string, string> = {
    C: 'grade-c',
    'C+': 'grade-c-plus',
    B: 'grade-b',
    'B+': 'grade-b-plus',
    A: 'grade-a',
    'A+': 'grade-a-plus',
    S: 'grade-s',
    'S+': 'grade-s-plus',
  }
  return classes[recommendation] ?? 'grade-empty'
}

function durationClass(duration: string): string {
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*(?:h|小时)?$/i)
  if (!match) return 'duration-default'

  const hours = Number(match[1])
  if (hours >= 150) return 'duration-rainbow'
  if (hours >= 99) return 'duration-gold'
  if (hours >= 60) return 'duration-orange'
  if (hours >= 30) return 'duration-purple'
  if (hours >= 10) return 'duration-blue'
  return 'duration-green'
}

function normalizeDuration(value: string): string {
  return value
    .replace(/(?:h|小时)/gi, '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

function updateDuration(appId: string, event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  const rawValue = input.value
  const caretPosition = input.selectionStart ?? rawValue.length
  const normalized = normalizeDuration(rawValue)

  if (rawValue !== normalized) {
    const normalizedCaretPosition = normalizeDuration(rawValue.slice(0, caretPosition)).length
    input.value = normalized
    input.setSelectionRange(normalizedCaretPosition, normalizedCaretPosition)
  }

  drafts[appId].duration = normalized
}

const reviewFieldMinHeight = 112
const reviewFieldPadding = 12

function resizeTextareaElement(textarea: HTMLTextAreaElement): void {
  textarea.style.minHeight = '0'
  textarea.style.height = '0'
  textarea.style.paddingBlock = '0'

  const contentHeight = textarea.scrollHeight
  const verticalPadding = Math.max(
    reviewFieldPadding,
    (reviewFieldMinHeight - contentHeight) / 2,
  )

  textarea.style.paddingBlock = `${verticalPadding}px`
  textarea.style.height = `${Math.max(
    reviewFieldMinHeight,
    contentHeight + verticalPadding * 2,
  )}px`
  textarea.style.minHeight = `${reviewFieldMinHeight}px`
}

function resizeTextarea(event: Event): void {
  resizeTextareaElement(event.currentTarget as HTMLTextAreaElement)
}

const vResizeTextarea = {
  mounted: resizeTextareaElement,
  updated: resizeTextareaElement,
}

async function waitForExportAssets(root: HTMLElement): Promise<void> {
  await document.fonts?.ready
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        })
      }

      await image.decode?.().catch(() => undefined)
    }),
  )
}

async function exportTable(): Promise<void> {
  if (isExporting.value || !tableEl.value) return

  isExporting.value = true
  exportError.value = ''
  hoveredRating.value = null
  typeMenu.value = null
  recommendationMenu.value = null

  try {
    await nextTick()
    const node = tableEl.value
    await waitForExportAssets(node)

    const exportBackground = getComputedStyle(document.documentElement)
      .getPropertyValue('--panel-background-solid')
      .trim()
    const table = node.querySelector('table')
    const exportPadding = 12
    const exportWidth = (table?.offsetWidth ?? node.scrollWidth) + exportPadding * 2
    const exportHeight = (table?.offsetHeight ?? node.scrollHeight) + exportPadding * 2
    const dataUrl = await toPng(node, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: exportBackground,
      width: exportWidth,
      height: exportHeight,
      style: {
        boxSizing: 'border-box',
        padding: `${exportPadding}px`,
        overflow: 'visible',
        background: exportBackground,
      },
      filter: (element) =>
        !(element instanceof HTMLElement && element.dataset.exportIgnore === 'true'),
    })
    const blob = await (await fetch(dataUrl)).blob()
    await window.imageLibrary.saveCollage(await blob.arrayBuffer(), 'game-review.png')
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出图片失败'
  } finally {
    isExporting.value = false
  }
}

watch(
  allGames,
  (games) => {
    const activeAppIds = new Set(games.map((game) => game.appId))

    for (const appId of Object.keys(drafts)) {
      if (!activeAppIds.has(appId)) {
        delete drafts[appId]
        delete reviewBadgeStyles[appId]
      }
    }

    for (const game of games) {
      drafts[game.appId] ??= newReviewDraft(game.appId)
      reviewBadgeStyles[game.appId] ??= reviewBadgeDefinitions[0].id
    }
  },
  { immediate: true },
)

function formatSteamPlaytime(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10)
}

let playtimeRequestSequence = 0

async function fillSteamPlaytime(games: GameReviewItem[]): Promise<void> {
  if (games.length === 0) return

  const requestSequence = ++playtimeRequestSequence
  try {
    const result = await window.imageLibrary.fetchOwnedGames(false)
    if (requestSequence !== playtimeRequestSequence) return

    const selectedAppIds = new Set(props.games.map((game) => game.appId))
    const playtimeByAppId = new Map(
      result.games.map((game) => [String(game.appid), game.playtimeForever]),
    )

    for (const game of games) {
      if (!selectedAppIds.has(game.appId)) continue
      const minutes = playtimeByAppId.get(game.appId)
      const draft = drafts[game.appId]
      if (minutes === undefined || minutes <= 0 || !draft) continue

      const currentHours = Number(draft.duration.trim())
      const steamHours = minutes / 60
      if (Number.isFinite(currentHours) && currentHours > 0 && steamHours <= currentHours) continue
      draft.duration = formatSteamPlaytime(minutes)
    }
  } catch {
    // 获取失败时保留已有时长，测评编辑不受影响。
  }
}

let saveDraftsTimer: number | undefined

function snapshotGameReviews(): void {
  const activeCustomIds = new Set(customGames.value.map((game) => game.appId))
  for (const appId of Object.keys(storedCustomGames)) {
    if (!activeCustomIds.has(appId)) delete storedCustomGames[appId]
  }

  for (const game of allGames.value) {
    const draft = drafts[game.appId]
    if (!draft) continue

    if (isCustomGame(game)) {
      storedCustomGames[game.appId] = {
        appId: game.appId,
        appName: game.appName,
        review: { ...draft, type: [...draft.type] },
      }
      continue
    }

    savedReviews[game.appId] = {
      appName: game.appName || game.appId,
      coverUrl: game.coverUrl,
      ...draft,
      type: [...draft.type],
    }
  }
}

function persistGameReviews(): void {
  if (saveDraftsTimer !== undefined) {
    window.clearTimeout(saveDraftsTimer)
    saveDraftsTimer = undefined
  }
  snapshotGameReviews()
  saveGameReviews(window.localStorage, savedReviews)
  saveStoredCustomGames(window.localStorage, Object.values(storedCustomGames))
}

function scheduleGameReviewSave(): void {
  if (isApplyingRecordImport) return
  snapshotGameReviews()
  if (saveDraftsTimer !== undefined) window.clearTimeout(saveDraftsTimer)
  saveDraftsTimer = window.setTimeout(persistGameReviews, 300)
}

function replaceReactiveRecord<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, source)
}

function currentBackupState(): GameReviewBackupState {
  persistGameReviews()
  return {
    reviews: Object.fromEntries(
      Object.entries(savedReviews).map(([appId, review]) => [
        appId,
        { ...review, type: [...review.type] },
      ]),
    ),
    customGames: Object.values(storedCustomGames).map((game) => ({
      appId: game.appId,
      appName: game.appName,
      review: { ...game.review, type: [...game.review.type] },
    })),
    order: [...gameOrder.value],
  }
}

function chooseReviewRecordFile(): void {
  if (isImportingRecords.value || !recordFileInput.value) return
  recordFileInput.value.value = ''
  recordFileInput.value.click()
}

function applyImportedReviewState(
  state: GameReviewBackupState,
  importedCustomIds: Set<string>,
): void {
  const existingCoverById = new Map(customGames.value.map((game) => [game.appId, game.coverUrl]))

  isApplyingRecordImport = true
  try {
    replaceReactiveRecord(savedReviews, state.reviews)
    replaceReactiveRecord(
      storedCustomGames,
      Object.fromEntries(state.customGames.map((game) => [game.appId, game])),
    )
    customGames.value = state.customGames.map((game) => ({
      appId: game.appId,
      appName: game.appName,
      coverUrl: importedCustomIds.has(game.appId) ? '' : existingCoverById.get(game.appId) ?? '',
      isCustom: true,
    }))

    const nextDrafts: Record<string, GameReviewDraft> = {}
    for (const [appId, review] of Object.entries(state.reviews)) {
      nextDrafts[appId] = { ...review, type: normalizeGameTypeIds(review.type) }
    }
    for (const game of state.customGames) {
      nextDrafts[game.appId] = {
        ...game.review,
        type: normalizeGameTypeIds(game.review.type),
      }
    }
    replaceReactiveRecord(drafts, nextDrafts)

    gameOrder.value = [...state.order]
    clearFilters()
    gameNameQuery.value = ''
    currentPage.value = 1
    persistGameReviews()
    saveGameReviewOrder(window.localStorage, gameOrder.value)
  } finally {
    isApplyingRecordImport = false
  }
}

async function importReviewRecords(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  isImportingRecords.value = true
  recordTransferMessage.value = ''
  recordTransferError.value = ''

  try {
    let value: unknown
    try {
      value = JSON.parse(await file.text())
    } catch {
      throw new Error('无法读取 JSON 文件')
    }

    const imported = parseGameReviewImport(value)
    const merged = mergeGameReviewImport(currentBackupState(), imported)
    applyImportedReviewState(
      merged,
      new Set(imported.customGames?.map((game) => game.appId) ?? []),
    )
    recordTransferMessage.value = `已导入 ${Object.keys(imported.reviews).length + (imported.customGames?.length ?? 0)} 条测评记录`
  } catch (error) {
    recordTransferError.value =
      error instanceof GameReviewBackupError || error instanceof Error
        ? error.message
        : '导入测评记录失败'
  } finally {
    isImportingRecords.value = false
  }
}

function exportReviewRecords(): void {
  if (isExportingRecords.value) return

  isExportingRecords.value = true
  recordTransferMessage.value = ''
  recordTransferError.value = ''

  try {
    const backup = createGameReviewBackup(currentBackupState())
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `game-reviews-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    recordTransferMessage.value = '测评记录已导出'
  } catch (error) {
    recordTransferError.value = error instanceof Error ? error.message : '导出测评记录失败'
  } finally {
    isExportingRecords.value = false
  }
}

watch(drafts, scheduleGameReviewSave, { deep: true, flush: 'sync' })
watch(customGames, scheduleGameReviewSave, { deep: true })
watch(
  () => props.games,
  async (games) => {
    scheduleGameReviewSave()
    await nextTick()
    await fillSteamPlaytime(games)
  },
  { deep: true, immediate: true },
)

window.addEventListener('beforeunload', persistGameReviews)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', persistGameReviews)
  persistGameReviews()
})
</script>

<template>
  <main class="review-page min-h-screen bg-[var(--page-background)] p-40px">
    <section
      class="review-header mx-auto max-w-1180px border border-[var(--border)] rounded-24px bg-[var(--panel-background)] p-32px [box-shadow:var(--shadow-panel)]"
    >
      <h1 class="m-0 mb-12px text-36px">游戏测评</h1>
      <p class="m-0 text-[var(--text-secondary)] [line-height:1.7]">
        已选择 {{ allGames.length }} 款游戏，可在表格中记录你的游玩感受。
      </p>
      <div class="mt-20px flex flex-wrap items-center gap-10px">
        <button
          class="cursor-pointer border border-[var(--accent-border)] rounded-10px bg-[var(--accent)] px-16px py-9px text-14px font-800 text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-55"
          type="button"
          :disabled="isImportingRecords"
          @click="chooseReviewRecordFile"
        >
          {{ isImportingRecords ? '导入中…' : '导入记录' }}
        </button>
        <button
          class="cursor-pointer border border-[var(--border-strong)] rounded-10px bg-[var(--accent-hover)] px-16px py-9px text-14px font-800 text-[var(--text-bright)] disabled:cursor-wait disabled:opacity-55"
          type="button"
          :disabled="isExportingRecords"
          @click="exportReviewRecords"
        >
          {{ isExportingRecords ? '导出中…' : '导出记录' }}
        </button>
        <button
          class="cursor-pointer border border-[var(--border-strong)] rounded-10px bg-[var(--accent-hover)] px-16px py-9px text-14px font-800 text-[var(--text-bright)] disabled:cursor-wait disabled:opacity-55"
          type="button"
          :disabled="isExporting || filteredGames.length === 0"
          @click="exportTable"
        >
          {{ isExporting ? '导出中…' : '导出图片' }}
        </button>
        <input
          ref="recordFileInput"
          class="absolute h-1px w-1px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]"
          type="file"
          accept="application/json,.json"
          @change="importReviewRecords"
        />
      </div>
      <p
        v-if="recordTransferError || exportError"
        class="mt-12px text-13px font-700 text-[var(--danger-text)]"
        role="alert"
      >
        {{ recordTransferError || exportError }}
      </p>
      <p
        v-else-if="recordTransferMessage"
        class="mt-12px text-13px font-700 text-[var(--success-text)]"
        aria-live="polite"
      >
        {{ recordTransferMessage }}
      </p>
    </section>

    <section class="mx-auto mt-24px max-w-1180px">
      <div
        v-if="allGames.length === 0"
        class="grid justify-items-center gap-16px border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-32px text-center text-[var(--text-muted)]"
      >
        <span>请先在图片浏览器中选择游戏，或添加一个自定义游戏。</span>
        <button
          class="cursor-pointer border border-[var(--border-strong)] rounded-9px bg-[var(--accent-hover)] px-16px py-9px text-14px font-800 text-[var(--text-bright)] outline-none hover:border-current focus-visible:border-current"
          type="button"
          @click="addCustomGame"
        >
          ＋ 添加自定义游戏
        </button>
      </div>

      <div v-else class="grid gap-14px">
        <div
          class="filter-bar grid items-center gap-x-18px gap-y-14px border border-[var(--border)] rounded-18px bg-[var(--panel-background)] px-18px py-16px [box-shadow:var(--shadow-panel)]"
          aria-label="筛选游戏测评"
        >
          <label class="game-name-search min-w-0 flex items-center gap-10px">
            <span class="flex-none text-13px font-900 text-[var(--text-soft)]">游戏名</span>
            <input
              v-model="gameNameQuery"
              class="w-full min-w-0 border border-[var(--border-soft)] rounded-8px bg-[var(--input-background)] px-10px py-8px text-13px text-[var(--text-bright)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-border)] focus:shadow-[0_0_0_3px_var(--focus-ring)]"
              type="search"
              placeholder="搜索游戏名"
              aria-label="搜索游戏名"
            />
          </label>

          <div
            class="filter-group type-filter-group w-full min-w-0 flex items-start gap-12px"
            role="group"
            aria-labelledby="type-filter-heading"
          >
            <span id="type-filter-heading" class="flex-none text-13px font-900 text-[var(--text-soft)]">
              类型
            </span>
            <div class="filter-options min-w-0 flex flex-1 flex-wrap gap-6px">
              <button
                v-for="type in typeOptions"
                :key="type.id"
                class="filter-chip min-h-30px cursor-pointer border border-[var(--border-soft)] rounded-7px bg-transparent px-9px py-5px text-12px font-800 leading-none text-[var(--text-muted)] [font-family:inherit] hover:border-[var(--border-strong)] hover:bg-[var(--accent-hover)] focus-visible:border-[var(--border-strong)] focus-visible:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
                :class="{ 'is-selected': selectedTypeFilters.includes(type.id) }"
                :style="typeStyle(type.id)"
                type="button"
                :aria-pressed="selectedTypeFilters.includes(type.id)"
                @click="toggleFilter(selectedTypeFilters, type.id)"
              >
                {{ type.label }}
              </button>
            </div>
          </div>

          <div class="filter-divider h-1px w-full bg-[var(--border-soft)]"></div>

          <div
            class="filter-group recommendation-filter-group min-w-0 flex items-center gap-12px"
            role="group"
            aria-labelledby="recommendation-filter-heading"
          >
            <span
              id="recommendation-filter-heading"
              class="flex-none text-13px font-900 text-[var(--text-soft)]"
            >
              推荐度
            </span>
            <div class="min-w-0 flex flex-wrap gap-6px">
              <button
                v-for="recommendation in recommendationOptions.slice(1)"
                :key="recommendation"
                class="filter-chip recommendation-filter-chip min-h-30px w-34px cursor-pointer border border-[var(--border-soft)] rounded-7px bg-transparent px-4px py-5px text-12px font-800 leading-none text-[var(--text-muted)] [font-family:inherit] hover:border-[var(--border-strong)] hover:bg-[var(--accent-hover)] focus-visible:border-[var(--border-strong)] focus-visible:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
                :class="[
                  recommendationClass(recommendation),
                  { 'is-selected': selectedRecommendationFilters.includes(recommendation) },
                ]"
                type="button"
                :aria-pressed="selectedRecommendationFilters.includes(recommendation)"
                @click="toggleFilter(selectedRecommendationFilters, recommendation)"
              >
                <span class="recommendation-label">{{ recommendation }}</span>
              </button>
            </div>
          </div>

          <div
            class="filter-summary grid min-w-74px justify-items-end gap-4px whitespace-nowrap text-12px font-700 text-[var(--text-faint)]"
            aria-live="polite"
          >
            <span>显示 {{ filteredGames.length }} / {{ allGames.length }}</span>
            <button v-if="hasActiveFilters" type="button" @click="clearFilters">清除筛选</button>
          </div>
        </div>

        <div
          v-if="filteredGames.length > 0"
          class="w-full overflow-x-hidden bg-transparent pr-12px [box-sizing:content-box]"
        >
          <div ref="tableEl" class="table-export-frame">
            <table class="review-table">
            <thead>
              <tr>
                <th class="cover-column w-142px" scope="col">
                  <span
                    class="absolute h-1px w-1px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]"
                  >
                    游戏封面
                  </span>
                </th>
                <th class="w-180px" scope="col">游戏名</th>
                <th scope="col">类型</th>
                <th class="w-250px" scope="col">体验</th>
                <th scope="col">游玩</th>
                <th scope="col">推荐度</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="game in paginatedGames"
                :key="game.appId"
                :data-review-app-id="game.appId"
                :class="{
                  'top-rated-row':
                    drafts[game.appId].rating === 5 &&
                    ['S', 'S+'].includes(drafts[game.appId].recommendation),
                  'is-dragging-row': draggedAppId === game.appId,
                  'drop-before':
                    dropTarget?.appId === game.appId && dropTarget.position === 'before',
                  'drop-after':
                    dropTarget?.appId === game.appId && dropTarget.position === 'after',
                }"
              >
                <td class="cover-cell !p-12px">
                  <div class="cover-wrapper relative w-110px inline-flex items-center justify-center">
                    <button
                      v-if="isCustomGame(game)"
                      class="custom-cover-button cover-drag-handle min-h-68px w-110px flex cursor-pointer items-center justify-center overflow-hidden border border-[var(--border-strong)] rounded-9px border-dashed bg-[var(--image-well-background)] p-0 text-12px font-800 text-[var(--text-muted)] [font-family:inherit] hover:border-[var(--text-bright)] hover:text-[var(--text-bright)] focus-visible:border-[var(--text-bright)] focus-visible:text-[var(--text-bright)] focus-visible:outline-none"
                      :class="{ 'drag-disabled': hasActiveFilters }"
                      :data-export-ignore="game.coverUrl ? undefined : 'true'"
                      type="button"
                      :aria-label="game.coverUrl ? `更换${game.appName || '自定义游戏'}的封面` : '上传自定义游戏封面'"
                      :title="hasActiveFilters ? '筛选时不可排序' : '按住拖动以调整顺序'"
                      @pointerdown="beginCoverDrag(game.appId, $event)"
                      @contextmenu.prevent
                      @dragstart.prevent
                      @click="handleCustomCoverClick(game.appId)"
                    >
                      <img
                        v-if="game.coverUrl"
                        class="cover-image block h-auto w-full"
                        :class="{ 'is-blurred': drafts[game.appId].coverBlurred }"
                        :src="game.coverUrl"
                        :alt="game.appName || '自定义游戏封面'"
                        draggable="false"
                      />
                      <span v-else>上传封面</span>
                    </button>
                    <div
                      v-else
                      class="cover-frame cover-drag-handle w-110px flex flex-none items-center justify-center overflow-hidden rounded-9px bg-[var(--image-well-background)]"
                      :class="{ 'drag-disabled': hasActiveFilters }"
                      :title="hasActiveFilters ? '筛选时不可排序' : '按住拖动以调整顺序'"
                      @pointerdown="beginCoverDrag(game.appId, $event)"
                      @dragstart.prevent
                    >
                      <img
                        class="cover-image block h-auto w-full"
                        :class="{ 'is-blurred': drafts[game.appId].coverBlurred }"
                        :src="game.coverUrl"
                        :alt="game.appName"
                        draggable="false"
                      />
                    </div>
                    <button
                      v-if="game.coverUrl"
                      class="cover-blur-toggle absolute right-6px top-6px z-2 cursor-pointer border border-[rgba(255,255,255,0.38)] rounded-6px bg-[rgba(15,23,42,0.78)] px-7px py-4px text-11px font-800 leading-none text-white opacity-0 [font-family:inherit] transition-[opacity,background] duration-150"
                      data-export-ignore="true"
                      type="button"
                      :aria-label="`${drafts[game.appId].coverBlurred ? '关闭' : '开启'}${game.appName || '自定义游戏'}的封面模糊`"
                      :aria-pressed="drafts[game.appId].coverBlurred"
                      @pointerdown.stop
                      @click.stop="drafts[game.appId].coverBlurred = !drafts[game.appId].coverBlurred"
                    >
                      {{ drafts[game.appId].coverBlurred ? '清晰' : '模糊' }}
                    </button>
                  </div>
                </td>
                <td>
                  <div class="game-name-cell relative min-h-112px flex items-center justify-center">
                    <div
                      v-if="isCustomGame(game)"
                      class="w-full grid items-center gap-2px [grid-template-columns:auto_minmax(0,1fr)_auto]"
                    >
                      <span class="font-800 text-[var(--text-bright)]">《</span>
                      <input
                        v-model="game.appName"
                        class="custom-name-input w-full min-w-0 border-0 bg-transparent px-2px py-8px text-center text-15px font-800 text-[var(--text-bright)] outline-none [font:inherit] placeholder:font-500 placeholder:text-[var(--text-faint)] focus:bg-[var(--accent-hover)]"
                        type="text"
                        aria-label="自定义游戏名"
                        placeholder="输入游戏名"
                      />
                      <span class="font-800 text-[var(--text-bright)]">》</span>
                    </div>
                    <strong
                      v-else
                      class="block text-15px font-800 text-[var(--text-bright)] [overflow-wrap:anywhere]"
                      :title="game.appName"
                    >
                      《{{ game.appName }}》
                    </strong>
                    <button
                      class="delete-game-button"
                      data-export-ignore="true"
                      type="button"
                      :aria-label="`删除${game.appName || '自定义游戏'}`"
                      @click="removeGame(game)"
                    >
                      删除
                    </button>
                  </div>
                </td>
                <td>
                  <button
                    class="type-control min-h-112px w-full flex cursor-pointer items-center justify-center border-0 bg-transparent p-12px text-inherit outline-none hover:bg-[var(--accent-hover)] focus-visible:bg-[var(--accent-hover)]"
                    type="button"
                    :aria-label="`${game.appName}的游戏类型`"
                    :aria-expanded="typeMenu?.appId === game.appId"
                    @click="toggleTypeMenu(game.appId, $event)"
                  >
                    <span
                      v-if="drafts[game.appId].type.length === 0"
                      class="text-14px font-700 text-[var(--text-faint)]"
                    >
                      选择类型
                    </span>
                    <span v-else class="flex flex-wrap items-center justify-center gap-x-12px gap-y-8px">
                      <span
                        v-for="type in drafts[game.appId].type"
                        :key="type"
                        class="text-14px font-800 leading-[1.35]"
                        :style="typeStyle(type)"
                      >
                        {{ typeLabel(type) }}
                      </span>
                    </span>
                  </button>
                </td>
                <td>
                  <textarea
                    v-model="drafts[game.appId].experience"
                    v-resize-textarea
                    class="block min-h-112px w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent px-14px py-12px text-center text-15px font-800 leading-[1.55] text-[var(--text-bright)] outline-none [font:inherit] placeholder:font-400 placeholder:text-[var(--text-faint)] focus:bg-[var(--accent-hover)]"
                    :aria-label="`${game.appName}的游玩体验`"
                    placeholder="记录画面、玩法、剧情和整体感受"
                    rows="1"
                    @input="resizeTextarea"
                  ></textarea>
                </td>
                <td>
                  <div class="min-h-112px grid [grid-template-rows:1fr_1fr]">
                    <div class="grid items-center gap-8px [grid-template-columns:48px_minmax(0,1fr)]">
                      <span class="text-12px font-800 text-[var(--text-muted)]">时长：</span>
                      <span
                        class="duration-value min-w-0 flex items-center justify-start gap-2px font-800 italic text-[var(--text-bright)]"
                        :class="durationClass(drafts[game.appId].duration)"
                      >
                        <input
                          class="duration-field inline-block w-5ch min-w-2ch whitespace-nowrap border-0 bg-transparent py-8px pl-0 pr-[0.25em] text-left leading-[1.5] text-inherit outline-none [font-family:inherit] [font-style:inherit] [font-weight:inherit] [text-shadow:inherit] placeholder:font-400 placeholder:not-italic placeholder:opacity-100 placeholder:text-[var(--text-faint)] placeholder:[text-shadow:none] focus:bg-transparent"
                          :class="{ empty: !drafts[game.appId].duration }"
                          :value="drafts[game.appId].duration"
                          type="text"
                          inputmode="decimal"
                          :aria-label="`${game.appName}的游玩时长（小时）`"
                          placeholder="35"
                          @input="updateDuration(game.appId, $event)"
                        />
                        <span class="duration-unit flex-none pr-2px text-inherit [text-shadow:inherit]" aria-hidden="true">h</span>
                      </span>
                    </div>
                    <div class="grid items-center gap-8px [grid-template-columns:48px_minmax(0,1fr)]">
                      <span class="text-12px font-800 text-[var(--text-muted)]">评价：</span>
                      <div
                        class="star-rating flex items-center justify-center gap-2px"
                        :class="{
                          'max-rating':
                            (hoveredRating?.appId === game.appId
                              ? hoveredRating.rating
                              : drafts[game.appId].rating) === 5,
                        }"
                        :aria-label="`${game.appName}的五星评价`"
                        @mouseleave="hoveredRating = null"
                      >
                        <button
                          v-for="star in 5"
                          :key="star"
                          class="star-button cursor-pointer border-0 bg-transparent p-3px text-20px leading-none text-[var(--text-faint)] outline-none transition-[color,filter,text-shadow,transform] duration-120 hover:scale-116 focus-visible:scale-116"
                          :class="{
                            active:
                              star <=
                              (hoveredRating?.appId === game.appId
                                ? hoveredRating.rating
                                : drafts[game.appId].rating),
                          }"
                          type="button"
                          :aria-label="`${star} 星`"
                          :aria-pressed="drafts[game.appId].rating === star"
                          @mouseenter="hoveredRating = { appId: game.appId, rating: star }"
                          @click="drafts[game.appId].rating = drafts[game.appId].rating === star ? 0 : star"
                        >
                          ★
                        </button>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="recommendation-cell">
                  <button
                    v-if="
                      drafts[game.appId].rating === 5 &&
                      drafts[game.appId].recommendation === 'S+'
                    "
                    class="review-badge-button"
                    :style="reviewBadgeStyle(game.appId)"
                    type="button"
                    :aria-label="`当前为${reviewBadgeDefinition(game.appId).label}，点击切换图案`"
                    @click.stop="toggleReviewBadge(game.appId)"
                  >
                    <svg
                      v-if="reviewBadgeDefinition(game.appId).id === 'crown'"
                      class="review-badge s-plus-crown"
                      viewBox="0 0 32 24"
                      aria-hidden="true"
                    >
                      <path d="M3 18 1.5 6l8 6L16 2l6.5 10 8-6L29 18Z" />
                      <path class="crown-band" d="M3 18h26v4H3z" />
                    </svg>
                    <svg
                      v-else
                      class="review-badge approval-stamp"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <circle class="stamp-ring-outer" cx="24" cy="24" r="20.5" />
                      <circle class="stamp-ring-inner" cx="24" cy="24" r="16.5" />
                      <path
                        class="stamp-thumb"
                        d="M18.5 22.5h-4v13h4Zm2.8 13h10.4c1.4 0 2.6-.9 3-2.2l2.2-7.4c.5-1.8-.8-3.6-2.7-3.6h-5.7l.8-4.1c.3-1.7-.6-3.4-2.2-4l-1-.4-5.8 9.2v10.5c0 1.1.9 2 2 2Z"
                      />
                    </svg>
                  </button>
                  <button
                    class="recommendation-control min-h-112px w-full flex cursor-pointer items-center justify-center border-0 rounded-none bg-transparent p-0 text-inherit shadow-none outline-none transition-colors duration-150 hover:bg-[var(--accent-hover)] focus-visible:bg-[var(--accent-hover)]"
                    :class="recommendationClass(drafts[game.appId].recommendation)"
                    type="button"
                    :aria-label="`${game.appName}的推荐度`"
                    :aria-expanded="recommendationMenu?.appId === game.appId"
                    @click="toggleRecommendationMenu(game.appId, $event)"
                  >
                    <span class="recommendation-label">
                      {{ drafts[game.appId].recommendation || '未选择' }}
                    </span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <div
          v-else
          class="filtered-empty-state flex justify-center gap-8px border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-32px text-center text-[var(--text-muted)]"
        >
          没有符合当前条件的游戏。
          <button type="button" @click="clearFilters">清除筛选</button>
        </div>

        <nav
          v-if="filteredGames.length > 0"
          class="flex flex-wrap items-center justify-between gap-12px px-16px py-14px text-13px font-700 text-[var(--text-muted)]"
          aria-label="游戏测评分页"
        >
          <span>
            第 {{ visibleRangeStart }}–{{ visibleRangeEnd }} 条，共 {{ filteredGames.length }} 条
          </span>
          <div class="flex items-center gap-10px">
            <button
              class="cursor-pointer border border-[var(--border-strong)] rounded-8px bg-[var(--input-background)] px-11px py-7px text-[var(--text-bright)] hover:border-[var(--accent-border)] focus-visible:border-[var(--accent-border)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              :disabled="currentPage === 1"
              @click="currentPage -= 1"
            >
              上一页
            </button>
            <span class="min-w-58px text-center text-[var(--text-bright)]">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button
              class="cursor-pointer border border-[var(--border-strong)] rounded-8px bg-[var(--input-background)] px-11px py-7px text-[var(--text-bright)] hover:border-[var(--accent-border)] focus-visible:border-[var(--accent-border)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              :disabled="currentPage === totalPages"
              @click="currentPage += 1"
            >
              下一页
            </button>
          </div>
          <label class="flex items-center gap-7px">
            每页
            <select
              v-model.number="pageSize"
              class="border border-[var(--border-strong)] rounded-8px bg-[var(--input-background)] px-11px py-7px text-[var(--text-bright)] focus-visible:border-[var(--accent-border)] focus-visible:outline-none"
            >
              <option v-for="size in pageSizeOptions" :key="size" :value="size">
                {{ size }} 条
              </option>
            </select>
          </label>
        </nav>

        <div v-if="currentPage === totalPages" class="flex justify-center pt-4px">
          <button
            class="cursor-pointer border border-[var(--border-strong)] rounded-9px bg-[var(--accent-hover)] px-16px py-9px text-14px font-800 text-[var(--text-bright)] outline-none hover:border-current focus-visible:border-current"
            type="button"
            @click="addCustomGame"
          >
            ＋ 添加自定义游戏
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="typeMenu || recommendationMenu"
        class="fixed inset-0 z-99 bg-transparent"
        @click="typeMenu = null; recommendationMenu = null"
      ></div>
      <div
        v-if="typeMenu"
        class="type-menu fixed z-100 grid max-h-[min(360px,calc(100vh-24px))] grid-cols-2 gap-4px overflow-y-auto border-0 rounded-12px bg-[var(--panel-background-solid)] p-8px shadow-[0_16px_36px_rgba(0,0,0,0.42)]"
        :style="{
          top: `${typeMenu.top}px`,
          left: `${typeMenu.left}px`,
          width: `${Math.max(typeMenu.width, 220)}px`,
        }"
        role="listbox"
        aria-multiselectable="true"
      >
        <button
          v-for="type in typeOptions"
          :key="type.id"
          class="type-option min-h-42px flex cursor-pointer items-center justify-between gap-8px border-0 rounded-8px bg-transparent px-10px py-8px text-14px font-800 text-inherit"
          :style="typeStyle(type.id)"
          type="button"
          role="option"
          :aria-selected="drafts[typeMenu.appId].type.includes(type.id)"
          @click="toggleGameType(typeMenu.appId, type.id)"
        >
          <span>{{ type.label }}</span>
          <span
            v-if="drafts[typeMenu.appId].type.includes(type.id)"
            class="text-[var(--text-bright)]"
          >
            ✓
          </span>
        </button>
      </div>
      <div
        v-if="recommendationMenu"
        class="recommendation-menu fixed z-100 grid max-h-[min(320px,calc(100vh-24px))] overflow-y-auto border-0 rounded-12px bg-[var(--panel-background-solid)] p-6px shadow-[0_16px_36px_rgba(0,0,0,0.42)]"
        :style="{
          top: `${recommendationMenu.top}px`,
          left: `${recommendationMenu.left}px`,
          width: `${recommendationMenu.width}px`,
        }"
        role="listbox"
      >
        <button
          v-for="recommendation in recommendationOptions"
          :key="recommendation || 'empty'"
          class="recommendation-option min-h-42px flex cursor-pointer items-center justify-center border-0 rounded-8px bg-transparent px-12px py-8px text-inherit"
          :class="recommendationClass(recommendation)"
          type="button"
          role="option"
          :aria-selected="drafts[recommendationMenu.appId].recommendation === recommendation"
          @click="selectRecommendation(recommendationMenu.appId, recommendation)"
        >
          <span class="recommendation-label">{{ recommendation || '未选择' }}</span>
        </button>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.export-button:hover:not(:disabled),
.export-button:focus-visible:not(:disabled) {
  filter: brightness(1.08);
  outline: none;
}

.filter-bar {
  grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1fr) auto;
  grid-template-areas:
    'search recommendation summary'
    'divider divider divider'
    'types types types';
}

.game-name-search {
  grid-area: search;
}

.type-filter-group {
  grid-area: types;
}

.recommendation-filter-group {
  grid-area: recommendation;
}

.filter-chip.is-selected {
  border-color: currentColor;
  background: var(--accent-hover);
  box-shadow: inset 0 -2px currentColor;
}

.recommendation-filter-chip .recommendation-label {
  font-size: 13px;
  font-weight: 900;
}

.filter-divider {
  grid-area: divider;
}

.filter-summary {
  grid-area: summary;
}

.filter-summary button,
.filtered-empty-state button {
  padding: 0;
  border: 0;
  color: var(--text-bright);
  background: transparent;
  font: inherit;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.filter-summary button:focus-visible,
.filtered-empty-state button:focus-visible {
  border-radius: 3px;
  outline: 2px solid currentColor;
  outline-offset: 3px;
}

.review-table {
  width: 100%;
  min-width: 980px;
  border: 1px solid var(--border);
  border-radius: 18px;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--panel-background);
  box-shadow: 0 14px 18px -18px rgba(0, 0, 0, 0.5);
  table-layout: fixed;
}

.review-table th,
.review-table td {
  padding: 16px;
  border-right: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
  text-align: center;
  vertical-align: middle;
}

.review-table th:last-child,
.review-table td:last-child {
  border-right: 0;
}

.review-table thead th:first-child {
  border-top-left-radius: 17px;
}

.review-table thead th:last-child {
  border-top-right-radius: 17px;
}

.review-table tbody tr:last-child td:first-child {
  border-bottom-left-radius: 17px;
}

.review-table tbody tr:last-child td:last-child {
  border-bottom-right-radius: 17px;
}

.review-table tbody tr:last-child td {
  border-bottom: 0;
}

.review-table th {
  color: var(--text-soft);
  background: var(--table-header-background);
  font-size: 15px;
  font-weight: 900;
}

.review-table tbody tr {
  background: var(--row-background);
}

.review-table tbody tr:nth-child(even) {
  background: var(--row-background-alt);
}

.cover-drag-handle {
  cursor: grab;
  touch-action: pan-x pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.cover-drag-handle:active {
  cursor: grabbing;
}

.cover-drag-handle.drag-disabled {
  cursor: default;
}

.review-table tbody tr.is-dragging-row {
  opacity: 0.45;
}

.review-table tbody tr.drop-before td {
  border-top: 3px solid #38bdf8;
}

.review-table tbody tr.drop-after td {
  border-bottom: 3px solid #38bdf8;
}

.review-table tbody tr.top-rated-row {
  background:
    linear-gradient(90deg, rgba(250, 204, 21, 0.12), rgba(250, 204, 21, 0.06) 52%, rgba(250, 204, 21, 0.025)),
    var(--row-background);
}

.review-table tbody tr.top-rated-row td {
  box-shadow:
    inset 0 1px rgba(250, 204, 21, 0.28),
    inset 0 -1px rgba(250, 204, 21, 0.28);
}

.review-table tbody tr.top-rated-row .cover-frame {
  box-shadow:
    0 0 0 1px rgba(250, 204, 21, 0.58),
    0 0 18px rgba(250, 204, 21, 0.16);
}

:global(:root[data-theme='light']) .review-table tbody tr.top-rated-row {
  background:
    linear-gradient(90deg, rgba(234, 179, 8, 0.11), rgba(234, 179, 8, 0.055) 52%, rgba(234, 179, 8, 0.02)),
    var(--row-background);
}

:global(:root[data-theme='light']) .review-table tbody tr.top-rated-row td {
  box-shadow:
    inset 0 1px rgba(161, 98, 7, 0.24),
    inset 0 -1px rgba(161, 98, 7, 0.24);
}

:global(:root[data-theme='light']) .review-table tbody tr.top-rated-row .cover-frame {
  box-shadow:
    0 0 0 1px rgba(161, 98, 7, 0.42),
    0 4px 12px rgba(161, 98, 7, 0.1);
}

.cover-image {
  transition: filter 0.18s ease, transform 0.18s ease;
}

.cover-image.is-blurred {
  filter: blur(6px);
  transform: scale(1.12);
}

.cover-wrapper:hover .cover-blur-toggle,
.cover-blur-toggle:focus-visible {
  opacity: 1;
}

.cover-blur-toggle:hover,
.cover-blur-toggle:focus-visible,
.cover-blur-toggle[aria-pressed='true'] {
  background: rgba(2, 132, 199, 0.9);
  outline: none;
}

.delete-game-button {
  position: absolute;
  bottom: 4px;
  left: 50%;
  padding: 4px 8px;
  border: 0;
  color: #f87171;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 4px);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.game-name-cell:hover .delete-game-button,
.game-name-cell:focus-within .delete-game-button,
.delete-game-button:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
}

.delete-game-button:hover,
.delete-game-button:focus-visible {
  color: #fecaca;
  text-decoration: underline;
  text-underline-offset: 3px;
  outline: none;
}

.type-option:hover,
.type-option[aria-selected='true'] {
  background: var(--accent-hover);
}

.star-button.active {
  color: #facc15;
  filter: none;
  text-shadow: none;
}

.star-rating.max-rating .star-button.active {
  color: #ff3b30;
  filter: drop-shadow(0 0 3px rgba(255, 77, 46, 0.65));
  text-shadow:
    0 -1px 0 #ff9a62,
    0 1px 0 #a40012,
    0 0 8px rgba(255, 45, 32, 0.72),
    0 0 16px rgba(190, 0, 24, 0.42);
}

.duration-green {
  color: #4ade80;
  text-shadow: 0 0 8px rgba(74, 222, 128, 0.45);
}

.duration-blue {
  color: #60a5fa;
  text-shadow: 0 0 8px rgba(96, 165, 250, 0.45);
}

.duration-purple {
  color: #a78bfa;
  text-shadow: 0 0 8px rgba(167, 139, 250, 0.45);
}

.duration-orange {
  color: #fb923c;
  text-shadow: 0 0 8px rgba(251, 146, 60, 0.45);
}

.duration-gold {
  color: #facc15;
  text-shadow: 0 0 8px rgba(250, 204, 21, 0.45);
}

.duration-rainbow .duration-field,
.duration-rainbow .duration-unit {
  color: transparent;
  background: linear-gradient(90deg, #f87171, #facc15, #4ade80, #38bdf8, #a78bfa, #f472b6);
  background-clip: text;
  -webkit-background-clip: text;
  text-shadow: 0 0 10px rgba(167, 139, 250, 0.45);
}

.duration-rainbow .duration-field {
  caret-color: var(--text-bright);
}

.duration-rainbow .duration-field.empty::before {
  color: var(--text-faint);
  -webkit-text-fill-color: var(--text-faint);
  text-shadow: none;
}

.recommendation-cell {
  position: relative;
  border-right: 1px solid var(--border-soft) !important;
}

.review-badge-button {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  display: grid;
  width: 42px;
  height: 42px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: transparent;
  cursor: pointer;
  outline: none;
  transform: translate(50%, -50%);
  transform-origin: center;
}

.review-badge-button:hover {
  transform: translate(50%, -50%) scale(1.08);
}

.review-badge-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.review-badge {
  display: block;
  width: var(--badge-width);
  height: var(--badge-height);
  overflow: visible;
  pointer-events: none;
  transform: rotate(var(--badge-rotation));
  transform-origin: center;
}

.s-plus-crown {
  fill: #facc15;
  stroke: #92400e;
  stroke-linejoin: round;
  stroke-width: 1.2;
  filter: drop-shadow(0 2px 4px rgba(250, 204, 21, 0.38));
}

.s-plus-crown .crown-band {
  fill: #f59e0b;
}

.approval-stamp {
  fill: none;
  stroke: #ef4444;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 2px 3px rgba(185, 28, 28, 0.28));
}

.stamp-ring-outer {
  stroke-width: 3;
  stroke-dasharray: 72 4 18 3 24 5;
}

.stamp-ring-inner {
  opacity: 0.72;
  stroke-width: 1.5;
  stroke-dasharray: 31 3 19 2;
}

.stamp-thumb {
  stroke-width: 2.6;
}

:global(:root[data-theme='light']) .s-plus-crown {
  fill: #eab308;
  stroke: #78350f;
  filter: drop-shadow(0 2px 3px rgba(120, 53, 15, 0.24));
}

:global(:root[data-theme='light']) .approval-stamp {
  stroke: #c62828;
  filter: drop-shadow(0 1px 2px rgba(127, 29, 29, 0.2));
}

.recommendation-label {
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
  pointer-events: none;
}

.recommendation-option:hover,
.recommendation-option[aria-selected='true'] {
  background: var(--accent-hover);
}

.recommendation-option .recommendation-label {
  font-size: 20px;
}

.grade-empty .recommendation-label {
  color: var(--text-faint);
  font-size: 14px;
  font-weight: 700;
}

.grade-c .recommendation-label {
  color: var(--grade-c);
}

.grade-c-plus .recommendation-label {
  color: var(--grade-c-plus);
}

.grade-b .recommendation-label {
  color: var(--grade-b);
}

.grade-b-plus .recommendation-label {
  color: var(--grade-b-plus);
}

.grade-a .recommendation-label {
  color: var(--grade-a);
}

.grade-a-plus .recommendation-label {
  color: var(--grade-a-plus);
}

.grade-s .recommendation-label {
  color: var(--grade-s);
  text-shadow: 0 0 18px rgba(250, 204, 21, 0.3);
}

.grade-s-plus .recommendation-label {
  color: transparent;
  background: var(--grade-s-plus-gradient);
  background-clip: text;
  -webkit-background-clip: text;
  text-shadow: 0 0 22px rgba(167, 139, 250, 0.3);
}

@media (max-width: 980px) {
  .filter-bar {
    grid-template-columns: 1fr;
    grid-template-areas:
      'search'
      'recommendation'
      'divider'
      'types'
      'summary';
    align-items: start;
  }

  .filter-divider {
    width: 100%;
    height: 1px;
  }

  .filter-summary {
    display: flex;
    min-width: 0;
    justify-content: space-between;
  }
}

@media (max-width: 720px) {
  .review-page {
    padding: 24px;
  }

  .review-header {
    padding: 24px;
  }

  .filter-group {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
</style>
