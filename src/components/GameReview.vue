<script setup lang="ts">
import { toPng } from 'html-to-image'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { GameReviewItem } from '../shared/gameReview'
import {
  loadGameReviews,
  mergeGamesWithStoredReviews,
  saveGameReviews,
  type GameReviewDraft,
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
const reviewBadgeStyles = reactive<Record<string, ReviewBadgeStyle>>({})
const customGames = ref<CustomReviewGame[]>([])
const hoveredRating = ref<{ appId: string; rating: number } | null>(null)
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
const pageSizeOptions = [5, 10, 20, 100]
const pageSize = ref(10)
const currentPage = ref(1)
const gameOrder = ref<string[]>([])
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

function newReviewDraft(appId?: string): GameReviewDraft {
  const savedDraft = appId ? savedReviews[appId] : undefined
  if (savedDraft) {
    return {
      ...savedDraft,
      type: [...savedDraft.type],
    }
  }

  return {
    type: [],
    experience: '',
    duration: '',
    rating: 0,
    recommendation: '',
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

const typeColors: Record<string, string> = {
  黄油: '#ffcfdf',
  Galgame: '#f472b6',
  恐怖游戏: '#dc2626',
  RPG: '#8b5cf6',
  JRPG: '#ec4899',
  类魂: '#222831',
  肉鸽: '#c084fc',
  卡牌: '#fbbf24',
  建造经营: '#9896f1',
  SLG: '#ff165d',
  塔防: '#6639a6',
  休闲: '#a5dee5',
  解谜: '#60a5fa',
  类银河恶魔城: '#a8e6cf',
  弹幕: '#ffd3b6',
  横版闯关: '#f87171',
  平台跳跃: '#67e8f9',
  开放世界: '#5eead4',
  箱庭地图: '#ff9a8b',
  联机: '#86efac',
  推箱子: '#d6b978',
  动作游戏: '#112d4e',
  射击游戏: '#38bdf8',
  Meta: '#f59e0b',
  回合制: '#14b8a6',
  视觉小说: '#fc5185'
}
const typeOptions = Object.keys(typeColors)

function typeStyle(type: string): { color?: string } {
  return { color: typeColors[type] }
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
    const overflowRight = 48
    const exportWidth = (table?.offsetWidth ?? node.scrollWidth) + overflowRight
    const exportHeight = table?.offsetHeight ?? node.scrollHeight
    const dataUrl = await toPng(node, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: exportBackground,
      width: exportWidth,
      height: exportHeight,
      style: {
        boxSizing: 'border-box',
        paddingRight: `${overflowRight}px`,
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
      if (draft.duration.trim() !== '' && currentHours !== 0) continue
      draft.duration = formatSteamPlaytime(minutes)
    }
  } catch {
    // 获取失败时保留已有时长，测评编辑不受影响。
  }
}

let saveDraftsTimer: number | undefined

function snapshotGameReviews(): void {
  for (const game of allGames.value) {
    if (isCustomGame(game)) continue

    const draft = drafts[game.appId]
    if (!draft) continue

    savedReviews[game.appId] = {
      appName: game.appName || game.appId,
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
}

function scheduleGameReviewSave(): void {
  snapshotGameReviews()
  if (saveDraftsTimer !== undefined) window.clearTimeout(saveDraftsTimer)
  saveDraftsTimer = window.setTimeout(persistGameReviews, 300)
}

watch(drafts, scheduleGameReviewSave, { deep: true, flush: 'sync' })
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
  <main class="review-page">
    <section class="review-header">
      <h1>游戏测评</h1>
      <p>已选择 {{ allGames.length }} 款游戏，可在表格中记录你的游玩感受。</p>
    </section>

    <section class="review-content">
      <div v-if="allGames.length === 0" class="empty-state custom-empty-state">
        <span>请先在图片浏览器中选择游戏，或添加一个自定义游戏。</span>
        <button type="button" @click="addCustomGame">＋ 添加自定义游戏</button>
      </div>

      <div v-else class="review-results">
        <div class="filter-bar" aria-label="筛选游戏测评">
          <label class="game-name-search">
            <span class="filter-heading">游戏名</span>
            <input
              v-model="gameNameQuery"
              type="search"
              placeholder="搜索游戏名"
              aria-label="搜索游戏名"
            />
          </label>

          <div
            class="filter-group type-filter-group"
            role="group"
            aria-labelledby="type-filter-heading"
          >
            <span id="type-filter-heading" class="filter-heading">类型</span>
            <div class="filter-options">
              <button
                v-for="type in typeOptions"
                :key="type"
                class="filter-chip type-filter-chip"
                :class="{ 'is-selected': selectedTypeFilters.includes(type) }"
                :style="typeStyle(type)"
                type="button"
                :aria-pressed="selectedTypeFilters.includes(type)"
                @click="toggleFilter(selectedTypeFilters, type)"
              >
                {{ type }}
              </button>
            </div>
          </div>

          <div class="filter-divider"></div>

          <div
            class="filter-group recommendation-filter-group"
            role="group"
            aria-labelledby="recommendation-filter-heading"
          >
            <span id="recommendation-filter-heading" class="filter-heading">推荐度</span>
            <div class="filter-options recommendation-filter-options">
              <button
                v-for="recommendation in recommendationOptions.slice(1)"
                :key="recommendation"
                class="filter-chip recommendation-filter-chip"
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

          <div class="filter-summary" aria-live="polite">
            <span>显示 {{ filteredGames.length }} / {{ allGames.length }}</span>
            <button v-if="hasActiveFilters" type="button" @click="clearFilters">清除筛选</button>
          </div>
        </div>

        <div class="review-actions">
          <p v-if="exportError" class="export-error" role="alert">{{ exportError }}</p>
          <button
            class="export-button"
            type="button"
            :disabled="isExporting || filteredGames.length === 0"
            @click="exportTable"
          >
            {{ isExporting ? '导出中…' : '导出图片' }}
          </button>
        </div>

        <div v-if="filteredGames.length > 0" class="table-scroll">
          <div ref="tableEl" class="table-export-frame">
            <table class="review-table">
            <thead>
              <tr>
                <th class="cover-column" scope="col"><span class="visually-hidden">游戏封面</span></th>
                <th class="game-name-column" scope="col">游戏名</th>
                <th scope="col">类型</th>
                <th class="experience-column" scope="col">体验</th>
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
                <td class="cover-cell">
                  <button
                    v-if="isCustomGame(game)"
                    class="custom-cover-button cover-drag-handle"
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
                      :src="game.coverUrl"
                      :alt="game.appName || '自定义游戏封面'"
                      draggable="false"
                    />
                    <span v-else>上传封面</span>
                  </button>
                  <div
                    v-else
                    class="cover-frame cover-drag-handle"
                    :class="{ 'drag-disabled': hasActiveFilters }"
                    :title="hasActiveFilters ? '筛选时不可排序' : '按住拖动以调整顺序'"
                    @pointerdown="beginCoverDrag(game.appId, $event)"
                    @dragstart.prevent
                  >
                    <img :src="game.coverUrl" :alt="game.appName" draggable="false" />
                  </div>
                </td>
                <td>
                  <div class="game-name-cell">
                    <div v-if="isCustomGame(game)" class="custom-name-editor">
                      <span class="book-title-mark">《</span>
                      <input
                        v-model="game.appName"
                        class="custom-name-input"
                        type="text"
                        aria-label="自定义游戏名"
                        placeholder="输入游戏名"
                      />
                      <span class="book-title-mark">》</span>
                    </div>
                    <strong v-else class="game-name" :title="game.appName">
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
                    class="type-control"
                    type="button"
                    :aria-label="`${game.appName}的游戏类型`"
                    :aria-expanded="typeMenu?.appId === game.appId"
                    @click="toggleTypeMenu(game.appId, $event)"
                  >
                    <span v-if="drafts[game.appId].type.length === 0" class="type-placeholder">
                      选择类型
                    </span>
                    <span v-else class="selected-types">
                      <span
                        v-for="type in drafts[game.appId].type"
                        :key="type"
                        class="type-label"
                        :style="typeStyle(type)"
                      >
                        {{ type }}
                      </span>
                    </span>
                  </button>
                </td>
                <td>
                  <textarea
                    v-model="drafts[game.appId].experience"
                    v-resize-textarea
                    class="review-field experience-field"
                    :aria-label="`${game.appName}的游玩体验`"
                    placeholder="记录画面、玩法、剧情和整体感受"
                    rows="1"
                    @input="resizeTextarea"
                  ></textarea>
                </td>
                <td>
                  <div class="duration-review-cell">
                    <div class="duration-row">
                      <span class="duration-label">时长：</span>
                      <span
                        class="duration-value"
                        :class="durationClass(drafts[game.appId].duration)"
                      >
                        <input
                          class="duration-field"
                          :class="{ empty: !drafts[game.appId].duration }"
                          :value="drafts[game.appId].duration"
                          type="text"
                          inputmode="decimal"
                          :aria-label="`${game.appName}的游玩时长（小时）`"
                          placeholder="35"
                          @input="updateDuration(game.appId, $event)"
                        />
                        <span class="duration-unit" aria-hidden="true">h</span>
                      </span>
                    </div>
                    <div class="rating-row">
                      <span class="rating-label">评价：</span>
                      <div
                        class="star-rating"
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
                          class="star-button"
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
                    class="recommendation-control"
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

        <div v-else class="empty-state filtered-empty-state">
          没有符合当前条件的游戏。
          <button type="button" @click="clearFilters">清除筛选</button>
        </div>

        <nav v-if="filteredGames.length > 0" class="pagination" aria-label="游戏测评分页">
          <span class="pagination-summary">
            第 {{ visibleRangeStart }}–{{ visibleRangeEnd }} 条，共 {{ filteredGames.length }} 条
          </span>
          <div class="pagination-controls">
            <button
              type="button"
              :disabled="currentPage === 1"
              @click="currentPage -= 1"
            >
              上一页
            </button>
            <span class="pagination-page">{{ currentPage }} / {{ totalPages }}</span>
            <button
              type="button"
              :disabled="currentPage === totalPages"
              @click="currentPage += 1"
            >
              下一页
            </button>
          </div>
          <label class="page-size-control">
            每页
            <select v-model.number="pageSize">
              <option v-for="size in pageSizeOptions" :key="size" :value="size">
                {{ size }} 条
              </option>
            </select>
          </label>
        </nav>

        <div v-if="currentPage === totalPages" class="add-custom-row">
          <button type="button" @click="addCustomGame">＋ 添加自定义游戏</button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="typeMenu || recommendationMenu"
        class="recommendation-backdrop"
        @click="typeMenu = null; recommendationMenu = null"
      ></div>
      <div
        v-if="typeMenu"
        class="type-menu"
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
          :key="type"
          class="type-option"
          :style="typeStyle(type)"
          type="button"
          role="option"
          :aria-selected="drafts[typeMenu.appId].type.includes(type)"
          @click="toggleGameType(typeMenu.appId, type)"
        >
          <span>{{ type }}</span>
          <span v-if="drafts[typeMenu.appId].type.includes(type)" class="type-check">✓</span>
        </button>
      </div>
      <div
        v-if="recommendationMenu"
        class="recommendation-menu"
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
          class="recommendation-option"
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
.review-page {
  min-height: 100vh;
  padding: 40px;
  background:
    var(--page-background);
}

.review-header,
.review-content {
  max-width: 1180px;
  margin: 0 auto;
}

.review-header {
  padding: 32px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--panel-background);
  box-shadow: var(--shadow-panel);
}

.review-header h1 {
  margin: 0 0 12px;
  font-size: 36px;
}

.review-header p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.7;
}

.review-content {
  margin-top: 24px;
}

.review-results {
  display: grid;
  gap: 14px;
}

.review-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.export-button {
  padding: 9px 18px;
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  color: var(--accent-text);
  background: var(--accent);
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.export-button:hover:not(:disabled),
.export-button:focus-visible:not(:disabled) {
  filter: brightness(1.08);
  outline: none;
}

.export-button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.export-error {
  margin: 0;
  color: var(--danger-text);
  font-size: 13px;
  font-weight: 700;
}

.filter-bar {
  display: grid;
  grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1fr) auto;
  grid-template-areas:
    'search recommendation summary'
    'divider divider divider'
    'types types types';
  gap: 14px 18px;
  padding: 16px 18px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--panel-background);
  box-shadow: var(--shadow-panel);
}

.game-name-search {
  grid-area: search;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.game-name-search input {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  color: var(--text-bright);
  background: var(--input-background);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.game-name-search input:focus {
  border-color: var(--accent-border);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.game-name-search input::placeholder {
  color: var(--text-faint);
}

.filter-group {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.type-filter-group {
  grid-area: types;
  width: 100%;
  align-items: flex-start;
}

.type-filter-group .filter-options {
  flex: 1 1 auto;
}

.recommendation-filter-group {
  grid-area: recommendation;
}

.filter-heading {
  flex: 0 0 auto;
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 900;
}

.filter-options {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.filter-chip:hover {
  border-color: var(--border-strong);
  background: var(--accent-hover);
}

.filter-chip:focus-visible {
  border-color: var(--border-strong);
  background: var(--accent-hover);
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.filter-chip.is-selected {
  border-color: currentColor;
  background: var(--accent-hover);
  box-shadow: inset 0 -2px currentColor;
}

.recommendation-filter-chip {
  width: 34px;
  padding-inline: 4px;
}

.recommendation-filter-chip .recommendation-label {
  font-size: 13px;
  font-weight: 900;
}

.filter-divider {
  grid-area: divider;
  width: 100%;
  height: 1px;
  background: var(--border-soft);
}

.filter-summary {
  grid-area: summary;
  display: grid;
  min-width: 74px;
  justify-items: end;
  gap: 4px;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
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

.filtered-empty-state {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.custom-empty-state {
  display: grid;
  justify-items: center;
  gap: 16px;
}

.custom-empty-state button,
.add-custom-row button {
  padding: 9px 16px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-bright);
  background: var(--accent-hover);
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.custom-empty-state button:hover,
.custom-empty-state button:focus-visible,
.add-custom-row button:hover,
.add-custom-row button:focus-visible {
  border-color: currentColor;
  outline: none;
}

.pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pagination button,
.page-size-control select {
  padding: 7px 11px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-bright);
  background: var(--input-background);
  font: inherit;
}

.pagination button {
  cursor: pointer;
}

.pagination button:hover:not(:disabled),
.pagination button:focus-visible,
.page-size-control select:focus-visible {
  border-color: var(--accent-border);
  outline: none;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-page {
  min-width: 58px;
  color: var(--text-bright);
  text-align: center;
}

.page-size-control {
  display: flex;
  align-items: center;
  gap: 7px;
}

.add-custom-row {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.table-scroll {
  width: 100%;
  padding-right: 22px;
  overflow-x: auto;
  box-sizing: content-box;
  background: transparent
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

.cover-column {
  width: 142px;
}

.game-name-column {
  width: 180px;
}

.experience-column {
  width: 250px;
}

.cover-cell {
  padding: 12px;
}

.cover-frame {
  display: flex;
  width: 110px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 9px;
  background: var(--image-well-background);
}

.cover-frame img {
  display: block;
  width: 100%;
  height: auto;
}

.missing-cover {
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.custom-cover-button {
  display: flex;
  width: 110px;
  min-height: 68px;
  padding: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px dashed var(--border-strong);
  border-radius: 9px;
  color: var(--text-muted);
  background: var(--image-well-background);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.custom-cover-button:hover,
.custom-cover-button:focus-visible {
  border-color: var(--text-bright);
  color: var(--text-bright);
  outline: none;
}

.custom-cover-button img {
  display: block;
  width: 100%;
  height: auto;
}

.game-name {
  display: block;
  overflow-wrap: anywhere;
  color: var(--text-bright);
  font-size: 15px;
  font-weight: 800;
}

.game-name-cell {
  position: relative;
  display: flex;
  min-height: 112px;
  align-items: center;
  justify-content: center;
}

.custom-name-editor {
  display: grid;
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px;
}

.book-title-mark {
  color: var(--text-bright);
  font-weight: 800;
}

.custom-name-input {
  width: 100%;
  min-width: 0;
  padding: 8px 2px;
  border: 0;
  color: var(--text-bright);
  background: transparent;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  text-align: center;
  outline: none;
}

.custom-name-input::placeholder {
  color: var(--text-faint);
  font-weight: 500;
}

.custom-name-input:focus {
  background: var(--accent-hover);
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

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.type-control {
  display: flex;
  width: 100%;
  min-height: 112px;
  padding: 12px;
  align-items: center;
  justify-content: center;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  outline: none;
}

.type-control:hover,
.type-control:focus-visible {
  background: var(--accent-hover);
}

.type-placeholder {
  color: var(--text-faint);
  font-size: 14px;
  font-weight: 700;
}

.selected-types {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
}

.type-label {
  font-size: 14px;
  font-weight: 800;
  line-height: 1.35;
}

.type-menu {
  position: fixed;
  z-index: 100;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  max-height: min(360px, calc(100vh - 24px));
  padding: 8px;
  overflow-y: auto;
  border: 0;
  border-radius: 12px;
  background: var(--panel-background-solid);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
}

.type-option {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  color: inherit;
  background: transparent;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.type-option:hover,
.type-option[aria-selected='true'] {
  background: var(--accent-hover);
}

.type-check {
  color: var(--text-bright);
}

.review-field {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 112px;
  padding: 12px 14px;
  border: 0;
  color: var(--text-bright);
  background: transparent;
  font: inherit;
  line-height: 1.55;
  text-align: center;
  outline: none;
}

.experience-field {
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  resize: none;
}

.duration-review-cell {
  display: grid;
  min-height: 112px;
  grid-template-rows: 1fr 1fr;
}

.duration-row,
.rating-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.duration-label,
.rating-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.duration-value {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  color: var(--text-bright);
  font-style: italic;
  font-weight: 800;
}

.duration-field {
  display: inline-block;
  width: 5ch;
  min-width: 2ch;
  padding: 8px 0.25em 8px 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-style: inherit;
  font-weight: inherit;
  line-height: 1.5;
  text-align: left;
  text-shadow: inherit;
  white-space: nowrap;
  outline: none;
}

.duration-field:focus {
  background: transparent;
}

.duration-field::placeholder {
  color: var(--text-faint);
  font-style: normal;
  font-weight: 400;
  text-shadow: none;
  opacity: 1;
}

.duration-unit {
  flex: 0 0 auto;
  color: inherit;
  text-shadow: inherit;
  padding-right: 2px;
}

.star-rating {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.star-button {
  padding: 3px;
  border: 0;
  color: var(--text-faint);
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  outline: none;
  transition: color 0.12s ease, filter 0.12s ease, text-shadow 0.12s ease, transform 0.12s ease;
}

.star-button:hover,
.star-button:focus-visible {
  transform: scale(1.16);
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

.review-field::placeholder {
  color: var(--text-faint);
  font-weight: 400;
}

.review-field:focus {
  background: var(--accent-hover);
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

.recommendation-control {
  display: flex;
  width: 100%;
  min-height: 112px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  outline: none;
  box-shadow: none;
  transition: background 0.15s ease;
}

.recommendation-control:hover,
.recommendation-control:focus-visible {
  background: var(--accent-hover);
}

.recommendation-label {
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
  pointer-events: none;
}

.recommendation-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
  background: transparent;
}

.recommendation-menu {
  position: fixed;
  z-index: 100;
  display: grid;
  max-height: min(320px, calc(100vh - 24px));
  padding: 6px;
  overflow-y: auto;
  border: 0;
  border-radius: 12px;
  background: var(--panel-background-solid);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
}

.recommendation-option {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
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
  color: #94a3b8;
}

.grade-c-plus .recommendation-label {
  color: #5eead4;
}

.grade-b .recommendation-label {
  color: #60a5fa;
}

.grade-b-plus .recommendation-label {
  color: #22d3ee;
}

.grade-a .recommendation-label {
  color: #a78bfa;
}

.grade-a-plus .recommendation-label {
  color: #f472b6;
}

.grade-s .recommendation-label {
  color: #facc15;
  text-shadow: 0 0 18px rgba(250, 204, 21, 0.3);
}

.grade-s-plus .recommendation-label {
  color: transparent;
  background: linear-gradient(90deg, #f87171, #facc15, #4ade80, #38bdf8, #a78bfa, #f472b6);
  background-clip: text;
  -webkit-background-clip: text;
  text-shadow: 0 0 22px rgba(167, 139, 250, 0.3);
}

.empty-state {
  padding: 32px;
  border: 1px dashed var(--border-strong);
  border-radius: 20px;
  color: var(--text-muted);
  background: var(--panel-background-soft);
  text-align: center;
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
