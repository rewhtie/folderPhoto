<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImageAsset } from '../shared/imageLibrary'
import { formatFileSize } from '../shared/format'

const props = defineProps<{
  appId: string
  appName: string
  images: ImageAsset[]
  directoryPath: string
  isSelected: (path: string) => boolean
  toggleSelected: (path: string) => void
}>()

const emit = defineEmits<{
  back: []
}>()

// --- 成就 ---
interface Achievement {
  id: string
  name: string
  description: string
  iconUrl: string
  iconGrayUrl: string
  achieved: boolean
  unlockTime: number | null
}
const achievements = ref<Achievement[]>([])
const achievementSource = ref<'local' | 'api' | null>(null)
const achievementError = ref('')
const isLoadingAchievements = ref(false)
const isCachingIcons = ref(false)
const cacheMessage = ref('')

async function loadAchievements(): Promise<void> {
  if (isLoadingAchievements.value) return
  isLoadingAchievements.value = true
  achievementError.value = ''
  achievements.value = []
  cacheMessage.value = ''
  try {
    const result = await window.imageLibrary.fetchApiAchievements(props.appId)
    if (result.error) {
      achievementSource.value = null
      achievementError.value = result.error
      return
    }
    achievementSource.value = result.source
    achievements.value = result.achievements
    // 后台缓存图标
    void cacheIcons(result.achievements)
  } catch (err) {
    achievementError.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    isLoadingAchievements.value = false
  }
}

async function cacheIcons(list: Achievement[]): Promise<void> {
  const icons = list
    .filter((a) => a.iconUrl || a.iconGrayUrl)
    .map((a) => ({ id: a.id, iconUrl: a.iconUrl, iconGrayUrl: a.iconGrayUrl }))
  if (icons.length === 0) return
  isCachingIcons.value = true
  try {
    const r = await window.imageLibrary.cacheAchievementIcons(props.appId, props.appName, icons)
    const parts: string[] = []
    if (r.cached > 0) parts.push(`已缓存 ${r.cached} 张`)
    if (r.skipped > 0) parts.push(`${r.skipped} 张已存在`)
    if (r.failed > 0) parts.push(`${r.failed} 张失败`)
    cacheMessage.value = parts.length > 0 ? parts.join('，') : '所有图标已缓存'
  } catch {
    cacheMessage.value = '缓存失败'
  } finally {
    isCachingIcons.value = false
  }
}

function openCacheDir(): void {
  void window.imageLibrary.openAchievementCacheDir(props.appId, props.appName)
}

const unlockedCount = computed(() => achievements.value.filter((a) => a.achieved).length)
</script>

<template>
  <div class="game-detail">
    <div class="detail-header">
      <button class="back-button" type="button" @click="emit('back')">
        <span class="back-arrow">←</span> 返回列表
      </button>
      <div class="detail-title">
        <h2>{{ appName }}</h2>
        <span class="detail-appid">{{ appId }} · {{ images.length }} 张图片</span>
      </div>
    </div>

    <section class="detail-section">
      <h3>游戏图片</h3>
      <div v-if="images.length === 0" class="state-card muted-state">该游戏没有图片。</div>
      <div v-else class="image-grid">
        <article
          v-for="image in images"
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
            <strong :title="image.appName || image.name">
              {{ image.appName || image.name }}
            </strong>
            <span class="meta-sub">
              <span>{{ image.appId }} · {{ formatFileSize(image.sizeBytes) }}</span>
            </span>
          </div>
        </article>
      </div>
    </section>

    <section class="detail-section">
      <h3>成就</h3>
      <div class="achievement-bar">
        <button class="secondary-button" type="button" :disabled="isLoadingAchievements" @click="loadAchievements">
          {{ isLoadingAchievements ? '加载中…' : '加载成就' }}
        </button>
        <span v-if="achievements.length > 0" class="achievement-summary">
          {{ unlockedCount }} / {{ achievements.length }} 解锁
        </span>
        <button
          v-if="achievements.length > 0 && achievementSource === 'api'"
          class="secondary-button open-dir-btn"
          type="button"
          @click="openCacheDir"
        >
          📂 打开缓存目录
        </button>
        <span v-if="isCachingIcons" class="cache-msg">缓存图标中…</span>
        <span v-else-if="cacheMessage" class="cache-msg">{{ cacheMessage }}</span>
      </div>

      <p v-if="achievementError" class="achievement-error">{{ achievementError }}</p>

      <div v-if="achievements.length > 0" class="achievement-grid">
        <div
          v-for="a in achievements"
          :key="a.id"
          class="achievement-card"
          :class="{ 'achievement-locked': !a.achieved }"
        >
          <img
            v-if="a.achieved ? a.iconUrl : (a.iconGrayUrl || a.iconUrl)"
            :src="a.achieved ? a.iconUrl : (a.iconGrayUrl || a.iconUrl)"
            :alt="a.name || a.id"
            loading="lazy"
          />
          <div v-else class="achievement-icon-placeholder">{{ a.achieved ? '✓' : '✗' }}</div>
          <div class="achievement-info">
            <strong>{{ a.name || a.id }}</strong>
            <span v-if="a.description" class="achievement-desc">{{ a.description }}</span>
            <span v-else-if="achievementSource === 'local'" class="achievement-desc">（本地数据，无名称）</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.game-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}
.back-button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 12px;
  color: #dbeafe;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.back-button:hover {
  border-color: #7dd3fc;
  color: #7dd3fc;
}
.back-arrow {
  font-size: 18px;
}
.detail-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detail-title h2 {
  margin: 0;
}
.detail-appid {
  color: #94a3b8;
  font-size: 13px;
}
.detail-section h3 {
  margin: 0 0 12px;
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
  cursor: pointer;
  background: rgba(2, 6, 23, 0.76);
}
.preview-frame img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
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
.selected-card {
  outline: 2px solid #7dd3fc;
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
.meta-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #94a3b8;
  font-size: 12px;
}
.achievement-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.achievement-summary {
  color: #94a3b8;
  font-size: 14px;
}
.achievement-error {
  color: #fca5a5;
  font-size: 14px;
  margin: 0 0 16px;
}
.open-dir-btn {
  margin-left: auto;
  font-size: 13px;
  padding: 6px 14px;
}
.cache-msg {
  color: #94a3b8;
  font-size: 12px;
}
.achievement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.achievement-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
}
.achievement-card img,
.achievement-icon-placeholder {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  border-radius: 8px;
  object-fit: cover;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #94a3b8;
}
.achievement-locked {
  opacity: 0.55;
}
.achievement-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding-left: 15px;
  flex: 1;
  justify-content: center;
}
.achievement-info strong {
  font-size: 14px;
}
.achievement-desc {
  color: #94a3b8;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.state-card {
  padding: 24px;
  color: #94a3b8;
}
</style>
