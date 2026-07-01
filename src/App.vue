<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatFileSize } from './shared/format'
import type { ImageAsset } from './shared/imageLibrary'

const DEFAULT_LIBRARYCACHE_PATH = 'C:\\Program Files (x86)\\Steam\\appcache\\librarycache'

const directoryPath = ref(DEFAULT_LIBRARYCACHE_PATH)
const images = ref<ImageAsset[]>([])
const errorMessage = ref('')
const isLoading = ref(false)
const isSelectingDirectory = ref(false)
const hasScanned = ref(false)

const imageCountLabel = computed(() => `${filteredImages.value.length} / ${images.value.length} 张图片`)
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
const filteredImages = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return images.value.filter((image) => {
    const matchesGroup = activeGroup.value === '全部' || image.groupName === activeGroup.value
    const matchesQuery = !query || image.relativePath.toLowerCase().includes(query)
    return matchesGroup && matchesQuery
  })
})

async function scanImages(pathToScan = directoryPath.value): Promise<void> {
  errorMessage.value = ''
  isLoading.value = true
  hasScanned.value = true

  try {
    const result = await window.imageLibrary.scanImages(pathToScan)
    images.value = result.images
    activeGroup.value = '全部'
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
          placeholder="搜索路径或 AppID，例如 1598780"
          autocomplete="off"
        />

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
            {{ group.name }} ({{ group.count }})
          </button>
        </div>

        <div v-if="filteredImages.length === 0" class="state-card muted-state">
          没有匹配的图片。
        </div>
        <div v-else class="image-grid">
          <article v-for="image in filteredImages" :key="image.absolutePath" class="image-card">
            <div class="preview-frame">
              <img :src="image.fileUrl" :alt="image.name" loading="lazy" />
            </div>
            <div class="image-meta">
              <strong :title="image.relativePath">{{ image.relativePath }}</strong>
              <span>{{ formatFileSize(image.sizeBytes) }}</span>
            </div>
          </article>
        </div>
      </template>

      <div v-else class="state-card muted-state">
        选择 Steam librarycache 文件夹后自动扫描图片，或输入路径后点击“扫描”。
      </div>
    </section>
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
