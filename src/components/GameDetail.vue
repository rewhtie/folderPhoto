<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImageAsset } from '../shared/common/contracts/image-library'
import { formatFileSize } from '../shared/common/format'

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
  <div class="flex flex-col gap-24px">
    <div class="flex flex-wrap items-start gap-20px">
      <button
        class="inline-flex flex-none cursor-pointer items-center gap-6px border border-[var(--border-strong)] rounded-12px bg-transparent px-18px py-8px text-14px text-[var(--text-soft)] [transition:border-color_0.15s,color_0.15s] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        type="button"
        @click="emit('back')"
      >
        <span class="text-18px">←</span> 返回列表
      </button>
      <div class="flex flex-col gap-4px">
        <h2 class="m-0">{{ appName }}</h2>
        <span class="text-13px text-[var(--text-muted)]">
          {{ appId }} · {{ images.length }} 张图片
        </span>
      </div>
    </div>

    <section>
      <h3 class="m-0 mb-12px">游戏图片</h3>
      <div
        v-if="images.length === 0"
        class="state-card muted-state p-24px text-[var(--text-muted)]"
      >
        该游戏没有图片。
      </div>
      <div
        v-else
        class="grid gap-18px [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]"
      >
        <article
          v-for="image in images"
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
              :title="image.appName || image.name"
            >
              {{ image.appName || image.name }}
            </strong>
            <span
              class="flex items-center justify-between text-12px text-[var(--text-muted)]"
            >
              <span>{{ image.appId }} · {{ formatFileSize(image.sizeBytes) }}</span>
            </span>
          </div>
        </article>
      </div>
    </section>

    <section>
      <h3 class="m-0 mb-12px">成就</h3>
      <div class="mb-16px flex items-center gap-16px">
        <button
          class="secondary-button"
          type="button"
          :disabled="isLoadingAchievements"
          @click="loadAchievements"
        >
          {{ isLoadingAchievements ? '加载中…' : '加载成就' }}
        </button>
        <span
          v-if="achievements.length > 0"
          class="text-14px text-[var(--text-muted)]"
        >
          {{ unlockedCount }} / {{ achievements.length }} 解锁
        </span>
        <button
          v-if="achievements.length > 0 && achievementSource === 'api'"
          class="secondary-button ml-auto px-14px py-6px text-13px"
          type="button"
          @click="openCacheDir"
        >
          📂 打开缓存目录
        </button>
        <span v-if="isCachingIcons" class="text-12px text-[var(--text-muted)]">
          缓存图标中…
        </span>
        <span v-else-if="cacheMessage" class="text-12px text-[var(--text-muted)]">
          {{ cacheMessage }}
        </span>
      </div>

      <p
        v-if="achievementError"
        class="m-0 mb-16px text-14px text-[var(--danger-text)]"
      >
        {{ achievementError }}
      </p>

      <div
        v-if="achievements.length > 0"
        class="grid gap-12px [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]"
      >
        <div
          v-for="a in achievements"
          :key="a.id"
          class="flex items-center gap-10px border border-[var(--border-soft)] rounded-12px bg-[var(--input-background-soft)] px-12px py-16px"
          :class="{ 'opacity-55': !a.achieved }"
        >
          <img
            v-if="a.achieved ? a.iconUrl : (a.iconGrayUrl || a.iconUrl)"
            class="h-48px w-48px flex flex-none items-center justify-center rounded-8px bg-[var(--image-well-background)] object-cover text-20px text-[var(--text-muted)]"
            :src="a.achieved ? a.iconUrl : (a.iconGrayUrl || a.iconUrl)"
            :alt="a.name || a.id"
            loading="lazy"
          />
          <div
            v-else
            class="h-48px w-48px flex flex-none items-center justify-center rounded-8px bg-[var(--image-well-background)] object-cover text-20px text-[var(--text-muted)]"
          >
            {{ a.achieved ? '✓' : '✗' }}
          </div>
          <div class="min-w-0 flex flex-1 flex-col justify-center gap-3px pl-15px">
            <strong class="text-14px">{{ a.name || a.id }}</strong>
            <span
              v-if="a.description"
              class="overflow-hidden text-ellipsis text-12px text-[var(--text-muted)] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]"
            >
              {{ a.description }}
            </span>
            <span
              v-else-if="achievementSource === 'local'"
              class="overflow-hidden text-ellipsis text-12px text-[var(--text-muted)] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]"
            >
              （本地数据，无名称）
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
