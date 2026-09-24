<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatFileSize } from './shared/format'
import type { ImageAsset } from './shared/imageLibrary'
import { FILE_NAME_CONFIG } from './shared/imageNameConfig'
import { addPathsToCollection, removePathFromCollection, type Collections } from './shared/collections'
import CollageDialog from './components/CollageDialog.vue'
import GameDetail from './components/GameDetail.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import CareerCollage from './components/CareerCollage.vue'
import ReviewRank from './components/ReviewRank.vue'
import GameReview from './components/GameReview.vue'
import { addToReviewPool } from './shared/reviewPool'
import { selectedGamesForReview, type GameReviewItem } from './shared/gameReview'
import { tierLabelFromUrl, type TierEntry } from './shared/tierList'
import { getSavedTheme, nextTheme, saveTheme, type Theme } from './shared/theme'

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
  <div class="app-shell">
    <nav class="tab-bar">
      <button :class="{ active: activeTab === 'browser' }" @click="activeTab = 'browser'">图片浏览器</button>
      <button :class="{ active: activeTab === 'career' }" @click="activeTab = 'career'">职业游戏生涯拼图</button>
      <button :class="{ active: activeTab === 'review' }" @click="activeTab = 'review'">游戏评测排名</button>
      <button :class="{ active: activeTab === 'game-review' }" @click="activeTab = 'game-review'">游戏测评</button>
      <button @click="openFreeCollage">自由拼图</button>
      <button
        class="theme-toggle"
        type="button"
        :title="theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'"
        :aria-label="theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'"
        :aria-pressed="theme === 'light'"
        @click="toggleTheme"
      >
        <span class="theme-toggle-icon" aria-hidden="true">{{ theme === 'dark' ? '☀' : '☾' }}</span>
        <span>{{ theme === 'dark' ? '白天' : '黑夜' }}</span>
      </button>
    </nav>

    <div v-show="activeTab === 'browser'">
    <main class="page-shell">
      <section class="hero-panel">
      <h1>steam本地游戏封面获取</h1>
      <p class="description">
        输入 Steam librarycache 文件夹路径，查找 封面图片、背景、宽幅封面图片、徽标。
      </p>

      <form class="path-form" @submit.prevent="scanImages()">
        <label for="directoryPath">librarycache 路径</label>
        <div class="path-row">
          <input
            id="directoryPath"
            v-model="directoryPath"
            type="text"
            placeholder="请选择或输入 Steam librarycache 路径"
            autocomplete="off"
          />
          <button class="secondary-button" type="button" :disabled="isLoading || isSelectingDirectory" @click="selectDirectory">
            {{ isSelectingDirectory ? '选择中...' : '选择文件夹' }}
          </button>
          <button type="submit" :disabled="isLoading || isSelectingDirectory">
            {{ isLoading ? '扫描中...' : '扫描' }}
          </button>
          <button
            class="secondary-button"
            type="button"
            :disabled="isLoading || images.length === 0"
            title="从 Steam 客户端读取本机收藏夹，按 AppID 匹配本地图片并导入"
            @click="importSteamCollections"
          >
            导入 Steam 收藏夹
          </button>
          <button
            class="icon-button"
            type="button"
            title="设置"
            @click="isSettingsOpen = true"
          >
            ⚙
          </button>
        </div>
      </form>
    </section>

    <section class="content-panel" aria-live="polite">
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
      <div v-if="errorMessage" class="state-card error-state">
        {{ errorMessage }}
      </div>

      <div v-else-if="isLoading" class="state-card">
        正在扫描 Steam 缓存图片，请稍候...
      </div>

      <div v-else-if="hasScanned && images.length === 0" class="state-card">
        没有找到 library_hero、header_schinese 或 header 图片。
      </div>

      <template v-else-if="images.length > 0">
        <div class="result-header">
          <h2>Steam 缓存图片扫描结果</h2>
          <span>{{ imageCountLabel }}</span>
        </div>

        <input
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="搜索游戏名、路径或 AppID，例如 雀魂麻将 或 1598780"
          autocomplete="off"
        />

        <label class="dlc-toggle">
          <input v-model="includeDlc" type="checkbox" @change="hasScanned && scanImages()" />
          显示 DLC 图片
        </label>

        <div class="collection-bar">
          <span class="collection-label">自定义收藏夹：</span>
          <span
            class="chip chip-group"
            :class="{ 'active-chip': activeCollection === '全部' }"
            @click="onCollectionChipClick('全部')"
          >
            全部
          </span>
          <span
            v-for="name in collectionNames"
            :key="name"
            class="chip chip-group"
            :class="{ 'active-chip': activeCollection === name }"
          >
            <button class="chip-name" type="button" @click="onCollectionChipClick(name)">
              {{ name }} ({{ collections[name]?.length ?? 0 }})
            </button>
            <button
              v-if="activeCollection === name"
              class="chip-export"
              type="button"
              :disabled="isExporting"
              title="保存此收藏夹图片（已有会自动略过）"
              @click="exportActiveCollection"
            >
              {{ isExporting ? '⏳' : '⬇' }}
            </button>
            <button
              v-if="activeCollection === name"
              class="chip-delete"
              type="button"
              title="删除此收藏夹"
              @click="deleteCollection(name)"
            >
              ✕
            </button>
          </span>
        </div>

        <div class="collection-bar" v-if="steamCollectionNames.length > 0">
          <span class="collection-label">Steam 收藏夹：</span>
          <span
            v-for="name in steamCollectionNames"
            :key="name"
            class="chip chip-group"
            :class="{ 'active-chip': activeCollection === name }"
          >
            <button class="chip-name" type="button" @click="onCollectionChipClick(name)">
              {{ name }} ({{ steamCollections[name]?.length ?? 0 }})
            </button>
            <button
              v-if="activeCollection === name"
              class="chip-export"
              type="button"
              :disabled="isExporting"
              title="保存此收藏夹图片（已有会自动略过）"
              @click="exportSteamCollection(name)"
            >
              {{ isExporting ? '⏳' : '⬇' }}
            </button>
          </span>
        </div>

        <div class="collection-bar" role="tablist" aria-label="按文件名筛选">
          <span class="collection-label">分类：</span>
          <span
            class="chip"
            :class="{ 'active-chip': activeGroup === '全部' }"
            role="tab"
            :aria-selected="activeGroup === '全部'"
            @click="onGroupChipClick('全部')"
          >
            全部 ({{ collectionScopedImages.length }})
          </span>
          <span
            v-for="group in imageGroups"
            :key="group.name"
            class="chip"
            :class="{ 'active-chip': activeGroup === group.name }"
            role="tab"
            :aria-selected="activeGroup === group.name"
            @click="onGroupChipClick(group.name)"
          >
            {{ group.name }} ({{ group.count }})
          </span>
        </div>

        <div v-if="filteredImages.length === 0" class="state-card muted-state">
          没有匹配的图片。
        </div>
        <div v-else class="image-grid">
          <article
            v-for="image in filteredImages"
            :key="image.absolutePath"
            class="image-card"
            :class="{ 'selected-card': isSelected(image.absolutePath) }"
          >
            <label class="select-checkbox" @click.stop>
              <input
                type="checkbox"
                :checked="isSelected(image.absolutePath)"
                @change="toggleSelected(image.absolutePath)"
              />
            </label>
            <div class="preview-frame" @click="toggleSelected(image.absolutePath)">
              <img :src="image.fileUrl" :alt="image.name" loading="lazy" />
            </div>
            <div class="image-meta">
              <strong :title="image.appName || image.relativePath">
                {{ image.appName || image.relativePath }}
              </strong>
              <span class="meta-sub">
                <span>{{ image.appId }} · {{ formatFileSize(image.sizeBytes) }}</span>
                <button
                  v-if="image.appId"
                  class="detail-link"
                  type="button"
                  title="查看详情与成就"
                  @click.stop="openDetail(image.appId, image.appName || image.appId)"
                >
                  👁️
                </button>
              </span>
              <button
                v-if="activeCollection !== '全部'"
                class="ghost-button remove-button"
                type="button"
                @click="removeFromCollection(image.absolutePath, activeCollection)"
              >
                从「{{ activeCollection }}」移除
              </button>
            </div>
          </article>
        </div>
      </template>

      <div v-else class=”state-card muted-state”>
        选择 Steam librarycache 文件夹后自动扫描图片，或输入路径后点击”扫描”。
      </div>
      </div>

      <div v-if="selectedPaths.size > 0" class="selection-bar floating-selection">
        <span>已选 {{ selectedPaths.size }} 张</span>
        <button class="primary-button" type="button" @click="downloadSelected">下载选中</button>
        <button class="secondary-button" type="button" @click="openCollageDialog">拼图</button>
        <button class="secondary-button" type="button" @click="openGameReview">测评</button>
        <button class="secondary-button" type="button" @click="addSelectedToReview">加入评测排名</button>
        <button class="secondary-button" type="button" @click="addSelectedToCollection">加入收藏夹</button>
        <button class="ghost-button" type="button" @click="clearSelection">取消选择</button>
      </div>
    </section>

    <div v-if="isCollectionDialogOpen" class="dialog-backdrop" @click.self="cancelCollectionDialog">
      <div class="dialog">
        <h3>加入收藏夹</h3>
        <p>为选中的 {{ selectedPaths.size }} 张图片指定收藏夹</p>

        <input
          v-model="collectionNameInput"
          class="dialog-input"
          type="text"
          placeholder="输入新收藏夹名称，例如：黄油"
          autocomplete="off"
          @keyup.enter="confirmCollectionDialog"
        />

        <div v-if="collectionNames.length > 0" class="picker">
          <p class="picker-label">选择已有收藏夹</p>
          <div class="picker-list">
            <button
              v-for="name in collectionNames"
              :key="name"
              class="picker-item"
              :class="{ 'picker-item-active': collectionNameInput.trim() === name }"
              type="button"
              @click="collectionNameInput = name"
            >
              <span class="picker-name">{{ name }}</span>
              <span class="picker-count">{{ collections[name].length }}</span>
            </button>
          </div>
        </div>

        <div class="dialog-actions">
          <button class="ghost-button" type="button" @click="cancelCollectionDialog">取消</button>
          <button type="button" :disabled="!collectionNameInput.trim()" @click="confirmCollectionDialog">
            加入
          </button>
        </div>
      </div>
    </div>

    <SettingsDialog
      v-if="isSettingsOpen"
      @close="isSettingsOpen = false"
    />

    <div class="floating-controls">
      <button v-if="showBackToTop" class="round-button" type="button" title="向上滚动一屏" @click="scrollByScreen(-1)">
        ⇑
      </button>
      <button v-if="showBackToTop" class="round-button" type="button" title="向下滚动一屏" @click="scrollByScreen(1)">
        ⇓
      </button>
      <button v-if="showBackToTop" class="round-button" type="button" title="回到顶部" @click="scrollToTop">
        ⬆
      </button>
    </div>

    <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
    </main>
    </div>

    <CareerCollage v-if="activeTab === 'career'" />

    <ReviewRank v-if="activeTab === 'review'" />

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
.app-shell {
  min-height: 100vh;
  color: var(--text-primary);
  background: var(--app-background);
}
.tab-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  gap: 4px;
  padding: 8px 40px;
  border-bottom: 1px solid var(--border);
  background: var(--nav-background);
  backdrop-filter: blur(14px);
}
.tab-bar button {
  padding: 8px 18px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.tab-bar button.active {
  color: var(--accent);
  background: var(--accent-background);
}
.tab-bar .theme-toggle {
  display: inline-flex;
  min-width: 92px;
  margin-left: auto;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--accent-border);
  color: var(--text-soft);
  background: var(--accent-background-soft);
}
.tab-bar .theme-toggle:hover,
.tab-bar .theme-toggle:focus-visible {
  color: var(--accent);
  border-color: var(--accent);
  outline: none;
}
.theme-toggle-icon {
  font-size: 17px;
  line-height: 1;
}
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

.page-shell {
  min-height: 100vh;
  padding: 40px;
  background:
    var(--page-background);
}

.hero-panel,
.content-panel {
  max-width: 1180px;
  margin: 0 auto;
}

.hero-panel {
  padding: 32px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--panel-background);
  box-shadow: var(--shadow-panel);
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--accent-soft);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 12px;
  font-size: 36px;
}

.description {
  max-width: 720px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.path-form {
  margin-top: 28px;
}

.path-form label {
  display: block;
  margin-bottom: 10px;
  color: var(--text-soft);
  font-weight: 700;
}

.path-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

input {
  flex: 1;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  color: var(--text-bright);
  background: var(--input-background);
  font-size: 15px;
  outline: none;
}

input:focus {
  border-color: var(--accent-strong);
  box-shadow: 0 0 0 4px var(--focus-ring);
}

button {
  padding: 11px 22px;
  border: 0;
  border-radius: 14px;
  color: var(--accent-text);
  background: var(--accent);
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.secondary-button {
  color: var(--text-soft);
  background: var(--accent-background);
  border: 1px solid var(--accent-border);
}

button:disabled {
  cursor: wait;
  opacity: 0.68;
}

.content-panel {
  margin-top: 24px;
}

.state-card {
  padding: 28px;
  border: 1px dashed var(--border-strong);
  border-radius: 20px;
  color: var(--text-soft);
  background: var(--panel-background-soft);
  text-align: center;
}

.error-state {
  border-color: var(--danger-border);
  color: var(--danger-text);
  background: var(--danger-background);
}

.muted-state {
  color: var(--text-muted);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.result-header h2 {
  margin: 0;
}

.result-header span {
  color: var(--accent-soft);
  font-weight: 800;
}

.search-input {
  width: 100%;
  margin-bottom: 16px;
}

.collection-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.collection-label {
  color: var(--text-soft);
  font-weight: 700;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  color: var(--text-soft);
  background: var(--accent-background-soft);
  font-size: 14px;
  font-weight: 700;
}

.chip-group {
  gap: 6px;
  padding: 4px 12px;
}

.chip-name {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  font-weight: 700;
}

.chip-export {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  font-size: 12px;
  background: rgba(8, 47, 73, 0.25);
  color: var(--accent-text);
}

.chip-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  font-size: 12px;
  background: var(--danger-control-background);
  color: var(--danger-control-text);
}

.active-chip {
  color: var(--accent-text);
  background: var(--accent);
}

.active-chip .chip-name {
  color: var(--accent-text);
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  background: var(--accent-background);
  color: var(--text-primary);
}

.selection-bar button {
  height: 38px;
  padding: 0 16px;
  font-size: 14px;
}

.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  padding: 12px 22px;
  border-radius: 12px;
  background: var(--floating-background);
  border: 1px solid var(--accent-border);
  color: var(--text-primary);
  font-size: 14px;
  box-shadow: var(--shadow-floating);
}

.floating-selection {
  position: fixed;
  top: 60px;
  right: 20px;
  z-index: 21;
  margin-bottom: 0;
  background: var(--floating-background);
  box-shadow: var(--shadow-floating);
}

.floating-controls {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.round-button {
  width: 48px;
  height: 48px;
  padding: 0;
  border-radius: 50%;
  font-size: 20px;
  box-shadow: var(--shadow-floating);
}

.ghost-button {
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  color: var(--text-soft);
  background: transparent;
}

.remove-button {
  margin-top: 4px;
  font-size: 12px;
}

.selected-card {
  outline: 2px solid var(--accent);
}

.select-checkbox {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.7);
  cursor: pointer;
}

.select-checkbox input {
  width: 22px;
  height: 22px;
  cursor: pointer;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--backdrop);
}

.dialog {
  width: 380px;
  max-width: 90vw;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--panel-background-solid);
  box-shadow: var(--shadow-dialog);
}

.dialog h3 {
  margin: 0 0 8px;
}

.dialog p {
  margin: 0 0 16px;
  color: var(--text-muted);
  font-size: 14px;
}

.dialog-input {
  width: 100%;
  margin-bottom: 18px;
}

.picker {
  margin-bottom: 20px;
}

.picker-label {
  margin: 0 0 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 4px;
}

.picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--input-background-soft);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.picker-item:hover {
  border-color: var(--accent);
  background: var(--table-header-background);
}

.picker-item-active {
  border-color: var(--accent);
  background: var(--accent-background);
}

.picker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-count {
  flex: 0 0 auto;
  margin-left: 10px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.28);
  color: var(--text-soft);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}


.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 18px;
}

.image-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  border-radius: 18px;
  background: var(--panel-background);
}

.icon-button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  padding: 9px 15px;
  border-radius: 14px;
  background: var(--accent-background);
  border: 1px solid var(--accent-border);
  color: var(--text-soft);
  font-size: 18px;
  cursor: pointer;
}
.icon-button:hover {
  color: var(--accent);
}

.preview-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  background: var(--image-well-background);
}

.preview-frame img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-meta {
  display: grid;
  gap: 6px;
  padding: 12px;
}

.image-meta strong {
  overflow: hidden;
  color: var(--text-bright);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-meta span {
  color: var(--text-muted);
  font-size: 13px;
}

.meta-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 12px;
}

.detail-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s, color 0.15s;
}
.detail-link:hover {
  opacity: 1;
  color: var(--accent);
}

.dlc-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--text-soft);
  cursor: pointer;
  font-size: 14px;
}

.dlc-toggle input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
</style>
