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
  achieved: boolean
  unlockTime: number | null
}
const achievements = ref<Achievement[]>([])
const achievementSource = ref<'local' | 'api' | null>(null)
const achievementError = ref('')
const isLoadingAchievements = ref(false)

async function loadAchievements(): Promise<void> {
  if (isLoadingAchievements.value) return
  isLoadingAchievements.value = true
  achievementError.value = ''
  achievements.value = []
  try {
    // 优先尝试 Web API（若已配置）
    const result = await window.imageLibrary.fetchApiAchievements(props.appId)
    if (!result.error && result.achievements.length > 0) {
      achievementSource.value = result.source
      achievements.value = result.achievements
      return
    }
    // API 未配置或失败 → 退回本地
    if (result.error) {
      // 尝试本地
      const local = await window.imageLibrary.loadLocalAchievements(props.directoryPath, props.appId)
      if (local.achievements.length > 0) {
        achievementSource.value = 'local'
        achievements.value = local.achievements
        achievementError.value = '仅显示本地解锁状态，配置 Web API 可显示图标和名称'
        return
      }
      // 本地也没有
      achievementSource.value = null
      achievementError.value = '需要配置 Web API 获取成就'
      return
    }
    achievementSource.value = result.source
    achievements.value = result.achievements
  } catch (err) {
    achievementError.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    isLoadingAchievements.value = false
  }
}

const unlockedCount = computed(() => achievements.value.filter((a) => a.achieved).length)
</script>

<template>
  <div class="game-detail">
    <div class="detail-header">
      <button class="ghost-button" type="button" @click="emit('back')">← 返回</button>
      <h2>{{ appName }}</h2>
      <span class="detail-appid">{{ appId }} · {{ images.length }} 张图片</span>
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
            <strong :title="image.name">{{ image.name }}</strong>
            <span class="meta-sub">{{ formatFileSize(image.sizeBytes) }}</span>
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
            v-if="a.iconUrl"
            :src="a.iconUrl"
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
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.detail-header h2 {
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
  cursor: pointer;
}
.preview-frame img {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: cover;
}
.select-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
}
.image-meta {
  padding: 10px 12px;
}
.image-meta strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-sub {
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
.achievement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.achievement-card {
  display: flex;
  gap: 12px;
  padding: 12px;
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
  gap: 4px;
  min-width: 0;
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
