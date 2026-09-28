<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatFileSize } from './shared/common/format'
import type { ImageAsset } from './shared/common/contracts/image-library'
import { FILE_NAME_CONFIG } from './shared/image-library/file-name-config'
import { addPathsToCollection, removePathFromCollection, type Collections } from './shared/collections/model'
import CollageDialog from './components/CollageDialog.vue'
import GameDetail from './components/GameDetail.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import CareerCollage from './components/CareerCollage.vue'
import ReviewRank from './components/ReviewRank.vue'
import GameReview from './components/GameReview.vue'
import { addToReviewPool } from './shared/review-rank/pool'
import type { GameReviewItem } from './shared/game-review/model'
import { selectedGamesForReview } from './shared/game-review/selection'
import { tierLabelFromUrl, type TierEntry } from './shared/tier-list/model'
import { getSavedTheme, nextTheme, saveTheme, type Theme } from './shared/common/theme'

const DEFAULT_LIBRARYCACHE_PATH = 'C:\\Program Files (x86)\\Steam\\appcache\\librarycache'

const activeTab = ref<'browser' | 'career' | 'review' | 'game-review'>('browser')
const theme = ref<Theme>(getSavedTheme(window.localStorage))

document.documentElement.dataset.theme = theme.value

function toggleTheme(): void {
  theme.value = nextTheme(theme.value)
  document.documentElement.dataset.theme = theme.value
  saveTheme(theme.value, window.localStorage)
}

const directoryPath = ref(DEFAULT_LIBRARYCACHE_PATH)
const images = ref<ImageAsset[]>([])
const errorMessage = ref('')
const isLoading = ref(false)
const isSelectingDirectory = ref(false)
const hasScanned = ref(false)
const includeDlc = ref(false)

const collections = ref<Collections>({})
const steamCollections = ref<Collections>({})
const selectedPaths = ref<Set<string>>(new Set())
const activeCollection = ref('全部')
const isCollectionDialogOpen = ref(false)
const isCollageDialogOpen = ref(false)
const collageInitialUrls = ref<string[]>([])
const isSettingsOpen = ref(false)
const detailGame = ref<{ appId: string; appName: string } | null>(null)
const collectionNameInput = ref('')
const isExporting = ref(false)
const toastMessage = ref('')

// 选中图片的 fileUrl（按选中顺序），供拼图组件加载
const selectedImageUrls = computed(() => {
  const selected = selectedPaths.value
  const urls: string[] = []
  for (const image of images.value) {
    if (selected.has(image.absolutePath)) {
      urls.push(image.fileUrl)
    }
  }
  return urls
})

const gameReviewItems = ref<GameReviewItem[]>([])

function reorderGameReviewItems(games: GameReviewItem[]): void {
  gameReviewItems.value = games
}

function openGameReview(): void {
  const games = selectedGamesForReview(images.value, selectedPaths.value)
  if (games.length === 0) {
    showToast('选中的图片没有可测评的游戏信息')
    return
  }
  gameReviewItems.value = games
  activeTab.value = 'game-review'
}

function openCollageDialog(): void {
  if (selectedPaths.value.size === 0) return
  collageInitialUrls.value = [...selectedImageUrls.value]
  isCollageDialogOpen.value = true
}

function openFreeCollage(): void {
  collageInitialUrls.value = []
  isCollageDialogOpen.value = true
}

function addSelectedToReview(): void {
  if (selectedPaths.value.size === 0) return
  const entries: TierEntry[] = []
  for (const image of images.value) {
    if (!selectedPaths.value.has(image.absolutePath)) continue
    entries.push({
      id: image.fileUrl,
      src: image.fileUrl,
      label: image.appName || tierLabelFromUrl(image.fileUrl, image.relativePath),
      appId: image.appId || undefined,
    })
  }
  addToReviewPool(entries)
  clearSelection()
  showToast(`已把 ${entries.length} 张图加入评测待分区`)
  activeTab.value = 'review'
}

async function importSteamCollections(): Promise<void> {
  if (images.value.length === 0) {
    showToast('请先扫描图片再导入 Steam 收藏夹')
    return
  }

  try {
    const data = await window.imageLibrary.loadSteamCollections(directoryPath.value)
    if (data.length === 0) {
      showToast('未找到 Steam 收藏夹')
      return
    }

    const imagesByAppId = new Map<string, string[]>()
    for (const image of images.value) {
      if (!image.appId) continue
      const list = imagesByAppId.get(image.appId)
      if (list) {
        list.push(image.absolutePath)
      } else {
        imagesByAppId.set(image.appId, [image.absolutePath])
      }
    }

    let imported = 0
    const steam = { ...steamCollections.value }
    for (const sc of data) {
      const paths: string[] = []
      for (const appId of sc.appIds) {
        const matched = imagesByAppId.get(appId)
        if (matched) paths.push(...matched)
      }
      if (paths.length === 0) continue
      steam[sc.name] = paths
      imported += 1
    }

    if (imported === 0) {
      showToast('Steam 收藏夹里没有匹配到本地图片')
      return
    }

    steamCollections.value = steam
    showToast(`已导入 ${imported} 个 Steam 收藏夹`)
  } catch {
    showToast('导入 Steam 收藏夹失败')
  }
}

async function downloadSelected(): Promise<void> {
  if (selectedPaths.value.size === 0) {
    return
  }

  const targetDirectory = await window.imageLibrary.chooseExportDirectory()
  if (!targetDirectory) {
    return
  }

  isExporting.value = true
  try {
    const result = await window.imageLibrary.exportImages(targetDirectory, [...selectedPaths.value])
    const parts = [`新增 ${result.copied} 张`]
    if (result.skipped > 0) {
      parts.push(`已存在跳过 ${result.skipped} 张`)
    }
    if (result.failed.length > 0) {
      parts.push(`失败 ${result.failed.length} 张`)
    }
    showToast(parts.join('，'))
    clearSelection()
  } catch {
    showToast('下载失败')
  } finally {
    isExporting.value = false
  }
}
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(message: string): void {
  toastMessage.value = message
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 2600)
}

async function exportActiveCollection(): Promise<void> {
  if (activeCollection.value === '全部') {
    return
  }

  let paths = collections.value[activeCollection.value] ?? []
  if (paths.length === 0) {
    return
  }

  // 如果当前有 Tab 分类筛选，只导出该分类下的图片
  if (activeGroup.value !== '全部') {
    paths = paths.filter((absolutePath) =>
      images.value.some(
        (img) => img.absolutePath === absolutePath && img.groupName === activeGroup.value,
      ),
    )
    if (paths.length === 0) {
      showToast('当前分类在收藏夹中没有匹配的图片')
      return
    }
  }

  const targetDirectory = await window.imageLibrary.chooseExportDirectory()
  if (!targetDirectory) {
    return
  }

  isExporting.value = true

  try {
    const result = await window.imageLibrary.exportImages(targetDirectory, [...paths])
    const parts = [`新增 ${result.copied} 张`]
    if (result.skipped > 0) {
      parts.push(`已存在跳过 ${result.skipped} 张`)
    }
    if (result.failed.length > 0) {
      parts.push(`失败 ${result.failed.length} 张`)
    }
    showToast(parts.join('，'))
  } catch {
    showToast('导出失败')
  } finally {
    isExporting.value = false
  }
}

async function exportSteamCollection(name: string): Promise<void> {
  let paths = steamCollections.value[name] ?? []
  if (paths.length === 0) {
    return
  }

  if (activeGroup.value !== '全部') {
    paths = paths.filter((absolutePath) =>
      images.value.some(
        (img) => img.absolutePath === absolutePath && img.groupName === activeGroup.value,
      ),
    )
    if (paths.length === 0) {
      showToast('当前分类在收藏夹中没有匹配的图片')
      return
    }
  }

  const targetDirectory = await window.imageLibrary.chooseExportDirectory()
  if (!targetDirectory) {
    return
  }

  isExporting.value = true

  try {
    const result = await window.imageLibrary.exportImages(targetDirectory, [...paths])
    const parts = [`新增 ${result.copied} 张`]
    if (result.skipped > 0) {
      parts.push(`已存在跳过 ${result.skipped} 张`)
    }
    if (result.failed.length > 0) {
      parts.push(`失败 ${result.failed.length} 张`)
    }
    showToast(parts.join('，'))
  } catch {
    showToast('导出失败')
  } finally {
    isExporting.value = false
  }
}

const collectionNames = computed(() =>
  Object.keys(collections.value).sort((a, b) => a.localeCompare(b)),
)
const steamCollectionNames = computed(() =>
  Object.keys(steamCollections.value).sort((a, b) => a.localeCompare(b)),
)

const imageCountLabel = computed(() => `${filteredImages.value.length} / ${images.value.length} 张图片`)

function groupDisplayLabel(groupName: string): string {
  return FILE_NAME_CONFIG[groupName] ?? groupName
}

// 当前收藏夹筛选范围内的图片（仅按收藏夹筛选，不按分类/搜索）
const collectionScopedImages = computed(() => {
  if (activeCollection.value === '全部') {
    return images.value
  }
  const collectionPaths = new Set([
    ...(collections.value[activeCollection.value] ?? []),
    ...(steamCollections.value[activeCollection.value] ?? []),
  ])
  return images.value.filter((image) => collectionPaths.has(image.absolutePath))
})

const imageGroups = computed(() => {
  const scoped = collectionScopedImages.value
  // 按显示标签分组，同名标签合并为一个 Tab
  const counts = new Map<string, { label: string; fileNames: string[] }>()
  const seenGroups = new Set<string>()

  for (const image of scoped) {
    if (seenGroups.has(image.groupName)) continue
    seenGroups.add(image.groupName)
    const label = groupDisplayLabel(image.groupName)

    if (!counts.has(label)) {
      counts.set(label, { label, fileNames: [] })
    }
    counts.get(label)!.fileNames.push(image.groupName)
  }

  // 统计每个 Tab 的实际图片数量
  const imageCounts = new Map<string, number>()
  for (const image of scoped) {
    const label = groupDisplayLabel(image.groupName)
    imageCounts.set(label, (imageCounts.get(label) ?? 0) + 1)
  }

  // 构建 Tab 列表，保留输入顺序
  const tabOrder = [
    ...new Set(
      [...Object.values(FILE_NAME_CONFIG), ...scoped.map((img) => groupDisplayLabel(img.groupName))].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
    ),
  ]

  return tabOrder
    .filter((label) => imageCounts.has(label))
    .map((label) => ({
      name: label,
      count: imageCounts.get(label) ?? 0,
      fileNames: counts.get(label)?.fileNames ?? [label],
    }))
})
const activeGroup = ref('全部')
const searchQuery = ref('')
const debouncedQuery = ref('')
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

watch(searchQuery, (value) => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
  searchDebounceTimer = setTimeout(() => {
    debouncedQuery.value = value
  }, 250)
})

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})

const filteredImages = computed(() => {
  const query = debouncedQuery.value.trim().toLowerCase()
  const collectionPaths =
    activeCollection.value === '全部' ? null : new Set([
      ...(collections.value[activeCollection.value] ?? []),
      ...(steamCollections.value[activeCollection.value] ?? []),
    ])

  return images.value.filter((image) => {
    const matchesGroup =
      activeGroup.value === '全部' ||
      (imageGroups.value.find((g) => g.fileNames.includes(image.groupName))?.name ?? image.groupName) ===
        activeGroup.value
    const matchesQuery =
      !query ||
      image.relativePath.toLowerCase().includes(query) ||
      image.appName.toLowerCase().includes(query)
    const matchesCollection = collectionPaths === null || collectionPaths.has(image.absolutePath)
    return matchesGroup && matchesQuery && matchesCollection
  })
})

function isSelected(path: string): boolean {
  return selectedPaths.value.has(path)
}

// 当前详情游戏的图片
const detailImages = computed(() => {
  if (!detailGame.value) return []
  return images.value.filter((img) => img.appId === detailGame.value!.appId)
})

function openDetail(appId: string, appName: string): void {
  detailGame.value = { appId, appName }
}

function closeDetail(): void {
  detailGame.value = null
}

function toggleSelected(path: string): void {
  const next = new Set(selectedPaths.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  selectedPaths.value = next
}

// 全选当前可见图片（并集追加，不清除已有选中）
function selectVisibleImages(): void {
  const next = new Set(selectedPaths.value)
  for (const image of filteredImages.value) {
    next.add(image.absolutePath)
  }
  selectedPaths.value = next
}

function onCollectionChipClick(name: string): void {
  if (activeCollection.value === name) {
    selectVisibleImages()
  } else {
    activeCollection.value = name
  }
}

function onGroupChipClick(name: string): void {
  if (activeGroup.value === name) {
    selectVisibleImages()
  } else {
    activeGroup.value = name
  }
}

function clearSelection(): void {
  selectedPaths.value = new Set()
}

async function addSelectedToCollection(): Promise<void> {
  if (selectedPaths.value.size === 0) {
    return
  }

  collectionNameInput.value = ''
  isCollectionDialogOpen.value = true
}

function cancelCollectionDialog(): void {
  isCollectionDialogOpen.value = false
}

async function confirmCollectionDialog(): Promise<void> {
  const name = collectionNameInput.value.trim()
  if (!name || selectedPaths.value.size === 0) {
    isCollectionDialogOpen.value = false
    return
  }

  collections.value = addPathsToCollection(collections.value, name, [...selectedPaths.value])
  await window.imageLibrary.saveCollections(toPlainCollections(collections.value))
  const count = selectedPaths.value.size
  clearSelection()
  isCollectionDialogOpen.value = false
  showToast(`已加入「${name}」${count} 张图片`)
}

function toPlainCollections(value: Collections): Collections {
  const plain: Collections = {}
  for (const [name, paths] of Object.entries(value)) {
    plain[name] = [...paths]
  }
  return plain
}

async function deleteCollection(name: string): Promise<void> {
  const next = { ...collections.value }
  delete next[name]
  collections.value = next

  if (activeCollection.value === name) {
    activeCollection.value = '全部'
  }

  await window.imageLibrary.saveCollections(toPlainCollections(collections.value))
  showToast(`已删除收藏夹「${name}」`)
}

async function removeFromCollection(path: string, name: string): Promise<void> {
  collections.value = removePathFromCollection(collections.value, name, path)
  if (!collections.value[activeCollection.value]) {
    activeCollection.value = '全部'
  }
  await window.imageLibrary.saveCollections(toPlainCollections(collections.value))
}

onMounted(async () => {
  collections.value = await window.imageLibrary.loadCollections()
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

const showBackToTop = ref(false)

function handleScroll(): void {
  showBackToTop.value = window.scrollY > 400
}

function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function scrollByScreen(direction: 1 | -1): void {
  window.scrollBy({ top: direction * window.innerHeight * 0.8, behavior: 'smooth' })
}

async function scanImages(pathToScan = directoryPath.value): Promise<void> {
  errorMessage.value = ''
  isLoading.value = true
  hasScanned.value = true

  try {
    const result = await window.imageLibrary.scanImages(pathToScan, { includeDlc: includeDlc.value })
    images.value = result.images
    activeGroup.value = '全部'
    clearSelection()

    // 同步：清除收藏夹里已不再扫描的图片路径
    const validPaths = new Set(result.images.map((img) => img.absolutePath))
    let changed = false
    const cleaned: typeof collections.value = {}
    for (const [name, paths] of Object.entries(collections.value)) {
      const filtered = paths.filter((p) => validPaths.has(p))
      if (filtered.length > 0) {
        cleaned[name] = filtered
      }
      if (filtered.length !== paths.length) {
        changed = true
      }
    }
    if (changed) {
      collections.value = cleaned
      await window.imageLibrary.saveCollections(toPlainCollections(cleaned))
    }
  } catch (error) {
    images.value = []
    const message = error instanceof Error ? error.message : '读取目录失败'
    errorMessage.value = message === '目录不存在' ? '目录不存在，你也可以点击“选择文件夹”。' : message
  } finally {
    isLoading.value = false
  }
}

async function selectDirectory(): Promise<void> {
  errorMessage.value = ''
  isSelectingDirectory.value = true

  try {
    const selectedPath = await window.imageLibrary.selectDirectory()

    if (selectedPath === null) {
      return
    }

    directoryPath.value = selectedPath
    await scanImages(selectedPath)
  } catch {
    errorMessage.value = '选择文件夹失败'
  } finally {
    isSelectingDirectory.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[var(--app-background)] text-[var(--text-primary)]">
    <nav
      class="sticky top-0 z-20 flex gap-4px border-b border-[var(--border)] bg-[var(--nav-background)] px-40px py-8px [backdrop-filter:blur(14px)]"
    >
      <button
        class="cursor-pointer border-0 rounded-10px bg-transparent px-18px py-8px text-14px font-700 text-[var(--text-muted)]"
        :class="{
          '!bg-[var(--accent-background)] !text-[var(--accent)]': activeTab === 'browser',
        }"
        @click="activeTab = 'browser'"
      >
        图片浏览器
      </button>
      <button
        class="cursor-pointer border-0 rounded-10px bg-transparent px-18px py-8px text-14px font-700 text-[var(--text-muted)]"
        :class="{
          '!bg-[var(--accent-background)] !text-[var(--accent)]': activeTab === 'career',
        }"
        @click="activeTab = 'career'"
      >
        职业游戏生涯拼图
      </button>
      <button
        class="cursor-pointer border-0 rounded-10px bg-transparent px-18px py-8px text-14px font-700 text-[var(--text-muted)]"
        :class="{
          '!bg-[var(--accent-background)] !text-[var(--accent)]': activeTab === 'review',
        }"
        @click="activeTab = 'review'"
      >
        游戏评测排名
      </button>
      <button
        class="cursor-pointer border-0 rounded-10px bg-transparent px-18px py-8px text-14px font-700 text-[var(--text-muted)]"
        :class="{
          '!bg-[var(--accent-background)] !text-[var(--accent)]':
            activeTab === 'game-review',
        }"
        @click="activeTab = 'game-review'"
      >
        游戏测评
      </button>
      <button
        class="cursor-pointer border-0 rounded-10px bg-transparent px-18px py-8px text-14px font-700 text-[var(--text-muted)]"
        @click="openFreeCollage"
      >
        自由拼图
      </button>
      <button
        class="ml-auto min-w-92px inline-flex cursor-pointer items-center justify-center gap-7px border border-[var(--accent-border)] rounded-10px bg-[var(--accent-background-soft)] px-18px py-8px text-14px font-700 text-[var(--text-soft)] outline-none hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:text-[var(--accent)]"
        type="button"
        :title="theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'"
        :aria-label="theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'"
        :aria-pressed="theme === 'light'"
        @click="toggleTheme"
      >
        <span class="text-17px leading-none" aria-hidden="true">
          {{ theme === 'dark' ? '☀' : '☾' }}
        </span>
        <span>{{ theme === 'dark' ? '白天' : '黑夜' }}</span>
      </button>
    </nav>

    <div v-show="activeTab === 'browser'">
      <main class="min-h-screen bg-[var(--page-background)] p-40px">
        <section
          class="mx-auto max-w-1180px border border-[var(--border)] rounded-24px bg-[var(--panel-background)] p-32px [box-shadow:var(--shadow-panel)]"
        >
          <h1 class="m-0 mb-12px text-36px">steam本地游戏封面获取</h1>
          <p class="mt-0 max-w-720px text-[var(--text-secondary)] [line-height:1.7]">
            输入 Steam librarycache 文件夹路径，查找 封面图片、背景、宽幅封面图片、徽标。
          </p>

          <form class="mt-28px" @submit.prevent="scanImages()">
            <label
              class="mb-10px block font-700 text-[var(--text-soft)]"
              for="directoryPath"
            >
              librarycache 路径
            </label>
            <div class="flex items-center gap-12px">
              <input
                id="directoryPath"
                v-model="directoryPath"
                class="min-w-0 flex-1 border border-[var(--border-strong)] rounded-14px bg-[var(--input-background)] px-16px py-14px text-15px text-[var(--text-bright)] outline-none focus:border-[var(--accent-strong)] focus:shadow-[0_0_0_4px_var(--focus-ring)]"
                type="text"
                placeholder="请选择或输入 Steam librarycache 路径"
                autocomplete="off"
              />
              <button
                class="cursor-pointer border border-[var(--accent-border)] rounded-14px bg-[var(--accent-background)] px-22px py-11px text-15px font-800 text-[var(--text-soft)] disabled:cursor-wait disabled:opacity-68"
                type="button"
                :disabled="isLoading || isSelectingDirectory"
                @click="selectDirectory"
              >
                {{ isSelectingDirectory ? '选择中...' : '选择文件夹' }}
              </button>
              <button
                class="cursor-pointer border-0 rounded-14px bg-[var(--accent)] px-22px py-11px text-15px font-800 text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-68"
                type="submit"
                :disabled="isLoading || isSelectingDirectory"
              >
                {{ isLoading ? '扫描中...' : '扫描' }}
              </button>
              <button
                class="cursor-pointer border border-[var(--accent-border)] rounded-14px bg-[var(--accent-background)] px-22px py-11px text-15px font-800 text-[var(--text-soft)] disabled:cursor-wait disabled:opacity-68"
                type="button"
                :disabled="isLoading || images.length === 0"
                title="从 Steam 客户端读取本机收藏夹，按 AppID 匹配本地图片并导入"
                @click="importSteamCollections"
              >
                导入 Steam 收藏夹
              </button>
              <button
                class="h-auto w-44px inline-flex flex-none cursor-pointer items-center justify-center border border-[var(--accent-border)] rounded-14px bg-[var(--accent-background)] px-15px py-9px text-18px text-[var(--text-soft)] hover:text-[var(--accent)]"
                type="button"
                title="设置"
                @click="isSettingsOpen = true"
              >
                ⚙
              </button>
            </div>
          </form>
        </section>

        <section class="mx-auto mt-24px max-w-1180px" aria-live="polite">
          <GameDetail
            v-if="detailGame"
            :app-id="detailGame.appId"
            :app-name="detailGame.appName"
            :images="detailImages"
            :directory-path="directoryPath"
            :is-selected="isSelected"
            :toggle-selected="toggleSelected"
            @back="closeDetail"
          />

          <div v-show="!detailGame">
            <div
              v-if="errorMessage"
              class="border border-[var(--danger-border)] rounded-20px border-dashed bg-[var(--danger-background)] p-28px text-center text-[var(--danger-text)]"
            >
              {{ errorMessage }}
            </div>

            <div
              v-else-if="isLoading"
              class="border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-28px text-center text-[var(--text-soft)]"
            >
              正在扫描 Steam 缓存图片，请稍候...
            </div>

            <div
              v-else-if="hasScanned && images.length === 0"
              class="border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-28px text-center text-[var(--text-soft)]"
            >
              没有找到 library_hero、header_schinese 或 header 图片。
            </div>

            <template v-else-if="images.length > 0">
              <div class="mb-18px flex items-center justify-between">
                <h2 class="m-0">Steam 缓存图片扫描结果</h2>
                <span class="font-800 text-[var(--accent-soft)]">{{ imageCountLabel }}</span>
              </div>

              <input
                v-model="searchQuery"
                class="mb-16px w-full min-w-0 flex-1 border border-[var(--border-strong)] rounded-14px bg-[var(--input-background)] px-16px py-14px text-15px text-[var(--text-bright)] outline-none focus:border-[var(--accent-strong)] focus:shadow-[0_0_0_4px_var(--focus-ring)]"
                type="search"
                placeholder="搜索游戏名、路径或 AppID，例如 雀魂麻将 或 1598780"
                autocomplete="off"
              />

              <label
                class="mb-14px inline-flex cursor-pointer items-center gap-8px text-14px text-[var(--text-soft)]"
              >
                <input
                  v-model="includeDlc"
                  class="h-16px w-16px cursor-pointer"
                  type="checkbox"
                  @change="hasScanned && scanImages()"
                />
                显示 DLC 图片
              </label>

              <div class="mb-14px flex flex-wrap items-center gap-8px">
                <span class="font-700 text-[var(--text-soft)]">自定义收藏夹：</span>
                <span
                  class="inline-flex cursor-pointer items-center gap-6px border border-[var(--accent-border)] rounded-full bg-[var(--accent-background-soft)] px-12px py-4px text-14px font-700 text-[var(--text-soft)]"
                  :class="{
                    '!bg-[var(--accent)] !text-[var(--accent-text)]':
                      activeCollection === '全部',
                  }"
                  @click="onCollectionChipClick('全部')"
                >
                  全部
                </span>
                <span
                  v-for="name in collectionNames"
                  :key="name"
                  class="inline-flex cursor-pointer items-center gap-6px border border-[var(--accent-border)] rounded-full bg-[var(--accent-background-soft)] px-12px py-4px text-14px font-700 text-[var(--text-soft)]"
                  :class="{
                    '!bg-[var(--accent)] !text-[var(--accent-text)]':
                      activeCollection === name,
                  }"
                >
                  <button
                    class="cursor-pointer border-0 bg-transparent p-0 text-14px font-700 text-inherit"
                    type="button"
                    @click="onCollectionChipClick(name)"
                  >
                    {{ name }} ({{ collections[name]?.length ?? 0 }})
                  </button>
                  <button
                    v-if="activeCollection === name"
                    class="h-16px w-16px inline-flex cursor-pointer items-center justify-center border-0 rounded-full bg-[rgba(8,47,73,0.25)] p-0 text-12px text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-68"
                    type="button"
                    :disabled="isExporting"
                    title="保存此收藏夹图片（已有会自动略过）"
                    @click="exportActiveCollection"
                  >
                    {{ isExporting ? '⏳' : '⬇' }}
                  </button>
                  <button
                    v-if="activeCollection === name"
                    class="h-16px w-16px inline-flex cursor-pointer items-center justify-center border-0 rounded-full bg-[var(--danger-control-background)] p-0 text-12px text-[var(--danger-control-text)]"
                    type="button"
                    title="删除此收藏夹"
                    @click="deleteCollection(name)"
                  >
                    ✕
                  </button>
                </span>
              </div>

              <div
                v-if="steamCollectionNames.length > 0"
                class="mb-14px flex flex-wrap items-center gap-8px"
              >
                <span class="font-700 text-[var(--text-soft)]">Steam 收藏夹：</span>
                <span
                  v-for="name in steamCollectionNames"
                  :key="name"
                  class="inline-flex cursor-pointer items-center gap-6px border border-[var(--accent-border)] rounded-full bg-[var(--accent-background-soft)] px-12px py-4px text-14px font-700 text-[var(--text-soft)]"
                  :class="{
                    '!bg-[var(--accent)] !text-[var(--accent-text)]':
                      activeCollection === name,
                  }"
                >
                  <button
                    class="cursor-pointer border-0 bg-transparent p-0 text-14px font-700 text-inherit"
                    type="button"
                    @click="onCollectionChipClick(name)"
                  >
                    {{ name }} ({{ steamCollections[name]?.length ?? 0 }})
                  </button>
                  <button
                    v-if="activeCollection === name"
                    class="h-16px w-16px inline-flex cursor-pointer items-center justify-center border-0 rounded-full bg-[rgba(8,47,73,0.25)] p-0 text-12px text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-68"
                    type="button"
                    :disabled="isExporting"
                    title="保存此收藏夹图片（已有会自动略过）"
                    @click="exportSteamCollection(name)"
                  >
                    {{ isExporting ? '⏳' : '⬇' }}
                  </button>
                </span>
              </div>

              <div
                class="mb-14px flex flex-wrap items-center gap-8px"
                role="tablist"
                aria-label="按文件名筛选"
              >
                <span class="font-700 text-[var(--text-soft)]">分类：</span>
                <span
                  class="inline-flex cursor-pointer items-center border border-[var(--accent-border)] rounded-full bg-[var(--accent-background-soft)] px-12px py-8px text-14px font-700 text-[var(--text-soft)]"
                  :class="{
                    '!bg-[var(--accent)] !text-[var(--accent-text)]': activeGroup === '全部',
                  }"
                  role="tab"
                  :aria-selected="activeGroup === '全部'"
                  @click="onGroupChipClick('全部')"
                >
                  全部 ({{ collectionScopedImages.length }})
                </span>
                <span
                  v-for="group in imageGroups"
                  :key="group.name"
                  class="inline-flex cursor-pointer items-center border border-[var(--accent-border)] rounded-full bg-[var(--accent-background-soft)] px-12px py-8px text-14px font-700 text-[var(--text-soft)]"
                  :class="{
                    '!bg-[var(--accent)] !text-[var(--accent-text)]':
                      activeGroup === group.name,
                  }"
                  role="tab"
                  :aria-selected="activeGroup === group.name"
                  @click="onGroupChipClick(group.name)"
                >
                  {{ group.name }} ({{ group.count }})
                </span>
              </div>

              <div
                v-if="filteredImages.length === 0"
                class="border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-28px text-center text-[var(--text-muted)]"
              >
                没有匹配的图片。
              </div>
              <div
                v-else
                class="grid gap-18px [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]"
              >
                <article
                  v-for="image in filteredImages"
                  :key="image.absolutePath"
                  class="relative overflow-hidden border border-[var(--border-soft)] rounded-18px bg-[var(--panel-background)]"
                  :class="{
                    '[outline:2px_solid_var(--accent)]': isSelected(image.absolutePath),
                  }"
                >
                  <label
                    class="absolute right-8px top-8px z-3 h-32px w-32px flex cursor-pointer items-center justify-center rounded-10px bg-[rgba(2,6,23,0.7)]"
                    @click.stop
                  >
                    <input
                      class="h-22px w-22px cursor-pointer"
                      type="checkbox"
                      :checked="isSelected(image.absolutePath)"
                      @change="toggleSelected(image.absolutePath)"
                    />
                  </label>
                  <div
                    class="h-150px flex cursor-pointer items-center justify-center bg-[var(--image-well-background)]"
                    @click="toggleSelected(image.absolutePath)"
                  >
                    <img
                      class="max-h-full max-w-full object-contain"
                      :src="image.fileUrl"
                      :alt="image.name"
                      loading="lazy"
                    />
                  </div>
                  <div class="grid gap-6px p-12px">
                    <strong
                      class="overflow-hidden text-ellipsis whitespace-nowrap text-14px text-[var(--text-bright)]"
                      :title="image.appName || image.relativePath"
                    >
                      {{ image.appName || image.relativePath }}
                    </strong>
                    <span
                      class="flex items-center justify-between text-12px text-[var(--text-muted)]"
                    >
                      <span>{{ image.appId }} · {{ formatFileSize(image.sizeBytes) }}</span>
                      <button
                        v-if="image.appId"
                        class="cursor-pointer border-0 bg-transparent p-0 text-15px text-[var(--text-muted)] opacity-60 transition-[opacity,color] duration-150 hover:text-[var(--accent)] hover:opacity-100"
                        type="button"
                        title="查看详情与成就"
                        @click.stop="openDetail(image.appId, image.appName || image.appId)"
                      >
                        👁️
                      </button>
                    </span>
                    <button
                      v-if="activeCollection !== '全部'"
                      class="mt-4px cursor-pointer border border-[var(--border-strong)] rounded-12px bg-transparent px-12px py-8px text-12px text-[var(--text-soft)]"
                      type="button"
                      @click="removeFromCollection(image.absolutePath, activeCollection)"
                    >
                      从「{{ activeCollection }}」移除
                    </button>
                  </div>
                </article>
              </div>
            </template>

            <div
              v-else
              class="border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-28px text-center text-[var(--text-muted)]"
            >
              选择 Steam librarycache 文件夹后自动扫描图片，或输入路径后点击“扫描”。
            </div>
          </div>

          <div
            v-if="selectedPaths.size > 0"
            class="fixed right-20px top-60px z-21 mb-0 flex items-center gap-10px border border-[var(--accent-border)] rounded-14px bg-[var(--floating-background)] px-14px py-10px text-[var(--text-primary)] [box-shadow:var(--shadow-floating)]"
          >
            <span>已选 {{ selectedPaths.size }} 张</span>
            <button
              class="h-38px cursor-pointer border-0 rounded-14px bg-[var(--accent)] px-16px text-14px font-800 text-[var(--accent-text)]"
              type="button"
              @click="downloadSelected"
            >
              下载选中
            </button>
            <button
              class="h-38px cursor-pointer border border-[var(--accent-border)] rounded-14px bg-[var(--accent-background)] px-16px text-14px font-800 text-[var(--text-soft)]"
              type="button"
              @click="openCollageDialog"
            >
              拼图
            </button>
            <button
              class="h-38px cursor-pointer border border-[var(--accent-border)] rounded-14px bg-[var(--accent-background)] px-16px text-14px font-800 text-[var(--text-soft)]"
              type="button"
              @click="openGameReview"
            >
              测评
            </button>
            <button
              class="h-38px cursor-pointer border border-[var(--accent-border)] rounded-14px bg-[var(--accent-background)] px-16px text-14px font-800 text-[var(--text-soft)]"
              type="button"
              @click="addSelectedToReview"
            >
              加入评测排名
            </button>
            <button
              class="h-38px cursor-pointer border border-[var(--accent-border)] rounded-14px bg-[var(--accent-background)] px-16px text-14px font-800 text-[var(--text-soft)]"
              type="button"
              @click="addSelectedToCollection"
            >
              加入收藏夹
            </button>
            <button
              class="h-38px cursor-pointer border border-[var(--border-strong)] rounded-12px bg-transparent px-16px text-14px text-[var(--text-soft)]"
              type="button"
              @click="clearSelection"
            >
              取消选择
            </button>
          </div>
        </section>

        <div
          v-if="isCollectionDialogOpen"
          class="fixed inset-0 z-10 flex items-center justify-center bg-[var(--backdrop)]"
          @click.self="cancelCollectionDialog"
        >
          <div
            class="w-380px max-w-90vw border border-[var(--border)] rounded-18px bg-[var(--panel-background-solid)] p-24px [box-shadow:var(--shadow-dialog)]"
          >
            <h3 class="m-0 mb-8px">加入收藏夹</h3>
            <p class="m-0 mb-16px text-14px text-[var(--text-muted)]">
              为选中的 {{ selectedPaths.size }} 张图片指定收藏夹
            </p>

            <input
              v-model="collectionNameInput"
              class="mb-18px w-full min-w-0 border border-[var(--border-strong)] rounded-14px bg-[var(--input-background)] px-16px py-14px text-15px text-[var(--text-bright)] outline-none focus:border-[var(--accent-strong)] focus:shadow-[0_0_0_4px_var(--focus-ring)]"
              type="text"
              placeholder="输入新收藏夹名称，例如：黄油"
              autocomplete="off"
              @keyup.enter="confirmCollectionDialog"
            />

            <div v-if="collectionNames.length > 0" class="mb-20px">
              <p class="m-0 mb-10px text-13px text-[var(--text-muted)]">
                选择已有收藏夹
              </p>
              <div class="max-h-220px flex flex-col gap-8px overflow-y-auto pr-4px">
                <button
                  v-for="name in collectionNames"
                  :key="name"
                  class="w-full flex cursor-pointer items-center justify-between border border-[var(--border)] rounded-12px bg-[var(--input-background-soft)] px-14px py-10px text-14px font-600 text-[var(--text-primary)] transition-[border-color,background] duration-150 hover:border-[var(--accent)] hover:bg-[var(--table-header-background)]"
                  :class="{
                    '!border-[var(--accent)] !bg-[var(--accent-background)]':
                      collectionNameInput.trim() === name,
                  }"
                  type="button"
                  @click="collectionNameInput = name"
                >
                  <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ name }}</span>
                  <span
                    class="ml-10px flex-none rounded-full bg-[rgba(59,130,246,0.28)] px-10px py-2px text-12px text-[var(--text-soft)]"
                  >
                    {{ collections[name].length }}
                  </span>
                </button>
              </div>
            </div>

            <div class="flex justify-end gap-10px">
              <button
                class="cursor-pointer border border-[var(--border-strong)] rounded-12px bg-transparent px-12px py-8px text-[var(--text-soft)]"
                type="button"
                @click="cancelCollectionDialog"
              >
                取消
              </button>
              <button
                class="cursor-pointer border-0 rounded-14px bg-[var(--accent)] px-22px py-11px text-15px font-800 text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-68"
                type="button"
                :disabled="!collectionNameInput.trim()"
                @click="confirmCollectionDialog"
              >
                加入
              </button>
            </div>
          </div>
        </div>

        <SettingsDialog
          v-if="isSettingsOpen"
          @close="isSettingsOpen = false"
        />

        <div class="fixed bottom-28px right-28px z-12 flex flex-col gap-10px">
          <button
            v-if="showBackToTop"
            class="h-48px w-48px cursor-pointer border-0 rounded-full bg-[var(--accent)] p-0 text-20px font-800 text-[var(--accent-text)] [box-shadow:var(--shadow-floating)]"
            type="button"
            title="向上滚动一屏"
            @click="scrollByScreen(-1)"
          >
            ⇑
          </button>
          <button
            v-if="showBackToTop"
            class="h-48px w-48px cursor-pointer border-0 rounded-full bg-[var(--accent)] p-0 text-20px font-800 text-[var(--accent-text)] [box-shadow:var(--shadow-floating)]"
            type="button"
            title="向下滚动一屏"
            @click="scrollByScreen(1)"
          >
            ⇓
          </button>
          <button
            v-if="showBackToTop"
            class="h-48px w-48px cursor-pointer border-0 rounded-full bg-[var(--accent)] p-0 text-20px font-800 text-[var(--accent-text)] [box-shadow:var(--shadow-floating)]"
            type="button"
            title="回到顶部"
            @click="scrollToTop"
          >
            ⬆
          </button>
        </div>

        <div
          v-if="toastMessage"
          class="fixed bottom-28px left-1/2 z-20 -translate-x-1/2 border border-[var(--accent-border)] rounded-12px bg-[var(--floating-background)] px-22px py-12px text-14px text-[var(--text-primary)] [box-shadow:var(--shadow-floating)]"
        >
          {{ toastMessage }}
        </div>
      </main>
    </div>

    <CareerCollage v-if="activeTab === 'career'" />

    <ReviewRank v-if="activeTab === 'review'" :images="images" />

    <GameReview
      v-show="activeTab === 'game-review'"
      :games="gameReviewItems"
      @reorder="reorderGameReviewItems"
    />

    <CollageDialog
      v-if="isCollageDialogOpen"
      :urls="collageInitialUrls"
      @close="isCollageDialogOpen = false"
    />
  </div>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 900px;
  min-height: 100vh;
  color: var(--text-primary);
  background: var(--app-background);
  font-family:
    'AlimamaFangYuanTi',
    Inter,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
}

:global(::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

:global(::-webkit-scrollbar-track) {
  background: var(--scrollbar-track);
}

:global(::-webkit-scrollbar-thumb) {
  background: var(--scrollbar-thumb);
  border-radius: 5px;
  border: 2px solid var(--scrollbar-track);
}

:global(::-webkit-scrollbar-thumb:hover) {
  background: var(--scrollbar-thumb-hover);
}

:global(::-webkit-scrollbar-corner) {
  background: transparent;
}
</style>
