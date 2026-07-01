<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { formatFileSize } from './shared/format'
import type { ImageAsset } from './shared/imageLibrary'
import { addPathsToCollection, removePathFromCollection, type Collections } from './shared/collections'

const DEFAULT_LIBRARYCACHE_PATH = 'C:\\Program Files (x86)\\Steam\\appcache\\librarycache'

const directoryPath = ref(DEFAULT_LIBRARYCACHE_PATH)
const images = ref<ImageAsset[]>([])
const errorMessage = ref('')
const isLoading = ref(false)
const isSelectingDirectory = ref(false)
const hasScanned = ref(false)

const collections = ref<Collections>({})
const selectedPaths = ref<Set<string>>(new Set())
const activeCollection = ref('全部')
const isCollectionDialogOpen = ref(false)
const collectionNameInput = ref('')
const isExporting = ref(false)
const toastMessage = ref('')
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

  const paths = collections.value[activeCollection.value] ?? []
  if (paths.length === 0) {
    return
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

const imageCountLabel = computed(() => `${filteredImages.value.length} / ${images.value.length} 张图片`)

const GROUP_DISPLAY_LABELS: Record<string, string> = {
  library_hero: '',
  library_hero_blur: '',
  library_hero_schinese: '',
  library_hero_blur_schinese: '',
  header_schinese: '',
  header: '',
  'logo_schinese.png': '徽标',
  library_capsule_schinese: '封面图片',
  'library_600x900_schinese.jpg': '竖版封面(中文)',
  'library_600x900.jpg': '竖版封面',
  library_schinese: '封面',
}

function groupDisplayLabel(groupName: string): string {
  return GROUP_DISPLAY_LABELS[groupName] ?? groupName
}

const imageGroups = computed(() => {
  const counts = new Map<string, number>()

  for (const image of images.value) {
    counts.set(image.groupName, (counts.get(image.groupName) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
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
    activeCollection.value === '全部' ? null : new Set(collections.value[activeCollection.value] ?? [])

  return images.value.filter((image) => {
    const matchesGroup = activeGroup.value === '全部' || image.groupName === activeGroup.value
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

function toggleSelected(path: string): void {
  const next = new Set(selectedPaths.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  selectedPaths.value = next
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
    const result = await window.imageLibrary.scanImages(pathToScan)
    images.value = result.images
    activeGroup.value = '全部'
    clearSelection()
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
  <main class="page-shell">
    <section class="hero-panel">
      <p class="eyebrow">Electron + Vue 3 + TypeScript</p>
      <h1>本地图片资源浏览器</h1>
      <p class="description">
        输入 Steam librarycache 文件夹路径，递归查找 library_hero、header_schinese 和 header 图片，并按文件名分类展示。
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
        </div>
      </form>
    </section>

    <section class="content-panel" aria-live="polite">
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
          placeholder="搜索游戏名、路径或 AppID，例如 NEKOPARA 或 1598780"
          autocomplete="off"
        />

        <div class="collection-bar">
          <span class="collection-label">收藏夹：</span>
          <button
            class="chip"
            :class="{ 'active-chip': activeCollection === '全部' }"
            type="button"
            @click="activeCollection = '全部'"
          >
            全部
          </button>
          <span
            v-for="name in collectionNames"
            :key="name"
            class="chip chip-group"
            :class="{ 'active-chip': activeCollection === name }"
          >
            <button class="chip-name" type="button" @click="activeCollection = name">
              {{ name }} ({{ collections[name].length }})
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

        <div v-if="selectedPaths.size > 0" class="selection-bar floating-selection">
          <span>已选 {{ selectedPaths.size }} 张</span>
          <button class="secondary-button" type="button" @click="addSelectedToCollection">加入收藏夹</button>
          <button class="ghost-button" type="button" @click="clearSelection">取消选择</button>
        </div>

        <div class="tab-list" role="tablist" aria-label="按文件名筛选">
          <button
            class="tab-button"
            :class="{ 'active-tab': activeGroup === '全部' }"
            type="button"
            role="tab"
            :aria-selected="activeGroup === '全部'"
            @click="activeGroup = '全部'"
          >
            全部 ({{ images.length }})
          </button>
          <button
            v-for="group in imageGroups"
            :key="group.name"
            class="tab-button"
            :class="{ 'active-tab': activeGroup === group.name }"
            type="button"
            role="tab"
            :aria-selected="activeGroup === group.name"
            @click="activeGroup = group.name"
          >
            {{ groupDisplayLabel(group.name) }} ({{ group.count }})
          </button>
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
              <span class="meta-sub">{{ image.appId }} · {{ formatFileSize(image.sizeBytes) }}</span>
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

      <div v-else class="state-card muted-state">
        选择 Steam librarycache 文件夹后自动扫描图片，或输入路径后点击“扫描”。
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
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 900px;
  min-height: 100vh;
  color: #e5edf7;
  background: #101827;
  font-family:
    Inter,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
}

.page-shell {
  min-height: 100vh;
  padding: 40px;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34rem),
    linear-gradient(135deg, #101827 0%, #172033 48%, #0f172a 100%);
}

.hero-panel,
.content-panel {
  max-width: 1180px;
  margin: 0 auto;
}

.hero-panel {
  padding: 32px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}

.eyebrow {
  margin: 0 0 10px;
  color: #93c5fd;
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
  color: #b6c3d4;
  line-height: 1.7;
}

.path-form {
  margin-top: 28px;
}

.path-form label {
  display: block;
  margin-bottom: 10px;
  color: #cbd5e1;
  font-weight: 700;
}

.path-row {
  display: flex;
  gap: 12px;
}

input {
  flex: 1;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 14px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.86);
  font-size: 15px;
  outline: none;
}

input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
}

button {
  padding: 0 22px;
  border: 0;
  border-radius: 14px;
  color: #082f49;
  background: #7dd3fc;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}

.secondary-button {
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.22);
  border: 1px solid rgba(147, 197, 253, 0.34);
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
  border: 1px dashed rgba(148, 163, 184, 0.34);
  border-radius: 20px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.58);
  text-align: center;
}

.error-state {
  border-color: rgba(248, 113, 113, 0.52);
  color: #fecaca;
  background: rgba(127, 29, 29, 0.24);
}

.muted-state {
  color: #94a3b8;
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
  color: #93c5fd;
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
  color: #cbd5e1;
  font-weight: 700;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid rgba(147, 197, 253, 0.28);
  border-radius: 999px;
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.14);
  font-size: 14px;
  font-weight: 700;
}

.chip-group {
  gap: 6px;
  padding: 4px 6px 4px 12px;
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
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  font-size: 14px;
  background: rgba(8, 47, 73, 0.25);
  color: #082f49;
}

.chip-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  font-size: 12px;
  background: rgba(127, 29, 29, 0.5);
  color: #fecaca;
}

.active-chip {
  color: #082f49;
  background: #7dd3fc;
}

.active-chip .chip-name {
  color: #082f49;
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 14px;
  border: 1px solid rgba(125, 211, 252, 0.4);
  border-radius: 14px;
  background: rgba(59, 130, 246, 0.16);
  color: #e2e8f0;
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
  background: rgba(23, 32, 51, 0.97);
  border: 1px solid rgba(125, 211, 252, 0.4);
  color: #e2e8f0;
  font-size: 14px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.floating-selection {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 12;
  margin-bottom: 0;
  background: rgba(23, 32, 51, 0.96);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
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
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.ghost-button {
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 12px;
  color: #dbeafe;
  background: transparent;
}

.remove-button {
  margin-top: 4px;
  font-size: 12px;
}

.selected-card {
  outline: 2px solid #7dd3fc;
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
  background: rgba(2, 6, 23, 0.66);
}

.dialog {
  width: 380px;
  max-width: 90vw;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #172033;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.dialog h3 {
  margin: 0 0 8px;
}

.dialog p {
  margin: 0 0 16px;
  color: #94a3b8;
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
  color: #94a3b8;
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
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.picker-item:hover {
  border-color: rgba(125, 211, 252, 0.55);
  background: rgba(30, 41, 59, 0.8);
}

.picker-item-active {
  border-color: #7dd3fc;
  background: rgba(125, 211, 252, 0.18);
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
  color: #dbeafe;
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.tab-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.tab-button {
  padding: 10px 14px;
  border: 1px solid rgba(147, 197, 253, 0.24);
  border-radius: 999px;
  color: #dbeafe;
  background: rgba(59, 130, 246, 0.14);
}

.active-tab {
  color: #082f49;
  background: #7dd3fc;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 18px;
}

.image-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.74);
}

.preview-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  background: rgba(2, 6, 23, 0.76);
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
  color: #f8fafc;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-meta span {
  color: #94a3b8;
  font-size: 13px;
}
</style>
