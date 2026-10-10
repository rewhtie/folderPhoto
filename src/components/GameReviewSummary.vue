<script setup lang="ts">
import { toPng } from 'html-to-image'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { ImageAsset } from '../shared/common/contracts/image-library'
import { pickLocalImages } from '../shared/common/local-image-picker'
import { recommendationClass } from '../shared/game-review/formatting'
import type { RankedGameReview } from '../shared/game-review/ranking'
import { FILE_NAME_CONFIG } from '../shared/image-library/file-name-config'

const props = defineProps<{
  games: RankedGameReview[]
  totalReviewed: number
}>()

const emit = defineEmits<{ close: [] }>()

const summaryEl = ref<HTMLElement | null>(null)
const isExporting = ref(false)
const exportError = ref('')
const coverOverrides = reactive<Record<string, string>>({})
const imagePickerGame = ref<RankedGameReview | null>(null)
const availableImages = ref<ImageAsset[]>([])
const isLoadingImages = ref(false)
const imagePickerError = ref('')
const topLimit = ref<5 | 10 | 20>(20)
const isTopMenuOpen = ref(false)
const visibleGames = computed(() => props.games.slice(0, topLimit.value))
const topGames = computed(() => visibleGames.value.slice(0, 2))
const remainingGames = computed(() => visibleGames.value.slice(2))
let previousBodyOverflow = ''

function coverUrl(game: RankedGameReview): string {
  return coverOverrides[game.appId] || game.coverUrl
}

function imageTypeLabel(image: ImageAsset): string {
  return FILE_NAME_CONFIG[image.name.toLocaleLowerCase()] ?? image.name
}

async function openImagePicker(game: RankedGameReview): Promise<void> {
  imagePickerGame.value = game
  availableImages.value = []
  imagePickerError.value = ''

  if (game.appId.startsWith('custom-')) {
    const [selected] = await pickLocalImages({ multiple: false })
    if (selected) coverOverrides[game.appId] = selected
    imagePickerGame.value = null
    return
  }

  isLoadingImages.value = true
  try {
    const result = await window.imageLibrary.loadGameImages(game.appId)
    availableImages.value = result.images
    if (result.images.length === 0) imagePickerError.value = '没有找到该游戏的本地图片资源'
  } catch (error) {
    imagePickerError.value = error instanceof Error ? error.message : '读取游戏图片失败'
  } finally {
    isLoadingImages.value = false
  }
}

function selectSummaryImage(image: ImageAsset): void {
  if (!imagePickerGame.value) return
  coverOverrides[imagePickerGame.value.appId] = image.fileUrl
  imagePickerGame.value = null
}

async function selectLocalSummaryImage(): Promise<void> {
  if (!imagePickerGame.value) return
  const [selected] = await pickLocalImages({ multiple: false })
  if (!selected) return
  coverOverrides[imagePickerGame.value.appId] = selected
  imagePickerGame.value = null
}

function rankNumberStyle(rank: number): Record<string, string> {
  const colors = [
    '#f6ca57', '#d3dbe6', '#d69666', '#fb7185', '#f472b6',
    '#c084fc', '#a78bfa', '#818cf8', '#60a5fa', '#38bdf8',
    '#22d3ee', '#2dd4bf', '#34d399', '#4ade80', '#a3e635',
    '#facc15', '#fbbf24', '#fb923c', '#f87171', '#e879f9',
  ]
  return { '--rank-color': colors[rank - 1] ?? '#94a3b8' }
}

function stars(rating: number): string {
  return `${'★'.repeat(rating)}${'☆'.repeat(Math.max(0, 5 - rating))}`
}

function durationLabel(game: RankedGameReview): string {
  return game.duration ? `${game.duration}h` : '0h'
}

async function waitForImages(root: HTMLElement): Promise<void> {
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

async function exportSummary(): Promise<void> {
  if (!summaryEl.value || isExporting.value || visibleGames.value.length === 0) return

  isExporting.value = true
  isTopMenuOpen.value = false
  exportError.value = ''
  try {
    await nextTick()
    const node = summaryEl.value
    await waitForImages(node)
    const dataUrl = await toPng(node, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: '#101827',
      width: node.offsetWidth,
      height: node.scrollHeight,
      style: { overflow: 'visible' },
      filter: (element) =>
        !(element instanceof HTMLElement && element.dataset.exportIgnore === 'true'),
    })
    const blob = await (await fetch(dataUrl)).blob()
    await window.imageLibrary.saveCollage(
      await blob.arrayBuffer(),
      `game-review-top-${topLimit.value}.png`,
    )
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出总结失败'
  } finally {
    isExporting.value = false
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (imagePickerGame.value) {
    imagePickerGame.value = null
    return
  }
  emit('close')
}

onMounted(() => {
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousBodyOverflow
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="summary-overlay" role="dialog" aria-modal="true" aria-labelledby="review-summary-title">
      <div class="summary-toolbar" data-export-ignore="true">
        <button class="summary-close" type="button" @click="emit('close')">关闭</button>
        <span v-if="exportError" class="summary-error" role="alert">{{ exportError }}</span>
        <button
          class="summary-export"
          type="button"
          :disabled="isExporting || games.length === 0"
          @click="exportSummary"
        >
          {{ isExporting ? '导出中…' : '导出总结' }}
        </button>
      </div>

      <div class="summary-scroll" @click.self="emit('close')">
        <section ref="summaryEl" class="summary-sheet">
          <header class="summary-header">
            <div>
              <h2 id="review-summary-title" class="summary-title">
                <span>我的游戏 Top</span>
                <span
                  class="top-limit-control"
                  @mouseenter="isTopMenuOpen = true"
                  @mouseleave="isTopMenuOpen = false"
                  @focusin="isTopMenuOpen = true"
                  @focusout="isTopMenuOpen = false"
                >
                  <button
                    class="top-limit-trigger"
                    type="button"
                    :aria-expanded="isTopMenuOpen"
                    aria-haspopup="menu"
                    @click="isTopMenuOpen = !isTopMenuOpen"
                  >
                    {{ topLimit }}
                  </button>
                  <span v-show="isTopMenuOpen" class="top-limit-menu" role="menu">
                    <button
                      v-for="limit in ([5, 10, 20] as const)"
                      :key="limit"
                      type="button"
                      role="menuitemradio"
                      :aria-checked="topLimit === limit"
                      :class="{ selected: topLimit === limit }"
                      @click="topLimit = limit; isTopMenuOpen = false"
                    >
                      Top {{ limit }}
                    </button>
                  </span>
                </span>
              </h2>
              <p>{{ totalReviewed }} 款已评价 · 星级、推荐度、时长综合排序</p>
            </div>
          </header>

          <div v-if="games.length === 0" class="summary-empty">
            还没有可用于总结的测评数据。
          </div>

          <template v-else>
            <div class="summary-podium" :class="{ 'single-game': topGames.length === 1 }">
              <article
                v-for="game in topGames"
                :key="game.appId"
                class="podium-card"
                :class="{ champion: game.rank === 1, runnerUp: game.rank === 2 }"
                role="button"
                tabindex="0"
                :aria-label="`更换${game.appName}的总结图片`"
                @click="openImagePicker(game)"
                @keydown.enter="openImagePicker(game)"
                @keydown.space.prevent="openImagePicker(game)"
              >
                <img v-if="coverUrl(game)" :src="coverUrl(game)" :alt="game.appName" />
                <div v-else class="cover-fallback"></div>
                <div class="cover-shade"></div>
                <span class="rank-number" :style="rankNumberStyle(game.rank)">
                  {{ String(game.rank).padStart(2, '0') }}
                </span>
                <div class="podium-copy">
                  <h3>{{ game.appName }}</h3>
                  <div class="score-line">
                    <span class="grade" :class="recommendationClass(game.recommendation)">
                      {{ game.recommendation || '未评级' }}
                    </span>
                    <span class="stars">{{ stars(game.rating) }}</span>
                    <span class="hours">{{ durationLabel(game) }}</span>
                  </div>
                </div>
              </article>
            </div>

            <div class="summary-grid">
              <article
                v-for="game in remainingGames"
                :key="game.appId"
                class="rank-card"
                role="button"
                tabindex="0"
                :aria-label="`更换${game.appName}的总结图片`"
                @click="openImagePicker(game)"
                @keydown.enter="openImagePicker(game)"
                @keydown.space.prevent="openImagePicker(game)"
              >
                <img v-if="coverUrl(game)" :src="coverUrl(game)" :alt="game.appName" />
                <div v-else class="cover-fallback"></div>
                <div class="cover-shade"></div>
                <span class="rank-number" :style="rankNumberStyle(game.rank)">{{ String(game.rank).padStart(2, '0') }}</span>
                <div class="rank-copy">
                  <h3>{{ game.appName }}</h3>
                  <div class="score-line compact">
                    <span class="grade" :class="recommendationClass(game.recommendation)">
                      {{ game.recommendation || '未评级' }}
                    </span>
                    <span class="stars">{{ stars(game.rating) }}</span>
                    <span class="hours">{{ durationLabel(game) }}</span>
                  </div>
                </div>
              </article>
            </div>
          </template>
        </section>
      </div>

      <div
        v-if="imagePickerGame"
        class="image-picker-backdrop"
        data-export-ignore="true"
        @click.self="imagePickerGame = null"
      >
        <section class="image-picker" role="dialog" aria-modal="true" aria-labelledby="image-picker-title">
          <header class="image-picker-header">
            <div>
              <h3 id="image-picker-title">更换总结图片</h3>
              <p>{{ imagePickerGame.appName }}</p>
            </div>
            <button type="button" @click="imagePickerGame = null">关闭</button>
          </header>

          <div class="image-picker-actions">
            <button type="button" @click="selectLocalSummaryImage">选择本地图片</button>
          </div>

          <div v-if="isLoadingImages" class="image-picker-state">正在读取游戏图片…</div>
          <div v-else-if="imagePickerError" class="image-picker-state error">{{ imagePickerError }}</div>
          <div v-else class="image-options">
            <button
              v-for="image in availableImages"
              :key="image.absolutePath"
              class="image-option"
              type="button"
              @click="selectSummaryImage(image)"
            >
              <span class="image-preview">
                <img :src="image.fileUrl" :alt="image.name" loading="lazy" />
              </span>
              <span class="image-option-copy">
                <strong>{{ imageTypeLabel(image) }}</strong>
                <small>{{ image.name }}</small>
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.summary-overlay {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: #edf2fa;
  background: rgba(2, 6, 23, 0.88);
  backdrop-filter: blur(12px);
}

.summary-toolbar {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 24px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.96);
}

.summary-toolbar button {
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 9px;
  padding: 9px 15px;
  color: #e5edf7;
  background: #172236;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
}

.summary-toolbar button:focus-visible {
  outline: 2px solid #7dd3fc;
  outline-offset: 2px;
}

.summary-toolbar button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.summary-export {
  border-color: rgba(147, 197, 253, 0.42) !important;
  color: #082f49 !important;
  background: #7dd3fc !important;
}

.summary-error {
  margin-right: auto;
  color: #fecaca;
  font-size: 13px;
  font-weight: 700;
}

.summary-scroll {
  overflow-y: auto;
  padding: 28px;
}

.summary-sheet {
  width: min(940px, 100%);
  margin: 0 auto;
  box-sizing: border-box;
  border: 1px solid #2e3b50;
  border-radius: 20px;
  padding: 22px;
  color: #edf2fa;
  background: #101827;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.5);
}

.summary-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.summary-title {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin: 0 0 5px;
  font-size: 27px;
  letter-spacing: -0.03em;
}

.top-limit-control {
  position: relative;
  display: inline-flex;
  align-items: baseline;
}

.top-limit-trigger {
  cursor: pointer;
  border: 0;
  border-bottom: 1px dashed rgba(125, 211, 252, 0.55);
  background: transparent;
  padding: 0 2px;
  color: #7dd3fc;
  font: inherit;
  font-weight: 900;
  line-height: 1;
}

.top-limit-trigger:hover,
.top-limit-trigger:focus-visible {
  border-bottom-color: #facc15;
  color: #facc15;
  outline: none;
}

.top-limit-menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 7px);
  left: 50%;
  display: grid;
  width: 92px;
  gap: 3px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 9px;
  background: #172033;
  padding: 5px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.42);
  transform: translateX(-50%);
}

.top-limit-menu button {
  cursor: pointer;
  border: 0;
  border-radius: 6px;
  background: transparent;
  padding: 7px 8px;
  color: #94a3b8;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  text-align: left;
}

.top-limit-menu button:hover,
.top-limit-menu button:focus-visible,
.top-limit-menu button.selected {
  color: #f8fafc;
  background: rgba(125, 211, 252, 0.14);
  outline: none;
}

.summary-header p {
  margin: 0;
  color: #8492a8;
  font-size: 12px;
}

.summary-empty {
  display: grid;
  min-height: 240px;
  place-items: center;
  border: 1px dashed #344055;
  border-radius: 12px;
  color: #94a3b8;
}

.summary-podium {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  margin: 38px 0 14px;
}

.summary-podium.single-game {
  grid-template-columns: 1fr;
}

.podium-card,
.rank-card {
  position: relative;
  overflow: hidden;
  aspect-ratio: 3 / 1;
  border: 1px solid #3a4658;
  background: #182235;
  cursor: pointer;
}

.podium-card:focus-visible,
.rank-card:focus-visible {
  outline: 2px solid #7dd3fc;
  outline-offset: 3px;
}

.podium-card {
  border-radius: 14px;
  box-shadow: 0 17px 36px rgba(0, 0, 0, 0.34);
}

.podium-card.champion {
  border-color: #66542c;
}

.podium-card img,
.rank-card img,
.cover-fallback {
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0;
  object-fit: cover;
}

.cover-fallback {
  background:
    radial-gradient(circle at 72% 14%, rgba(125, 211, 252, 0.26), transparent 34%),
    linear-gradient(135deg, #1e3a5f, #172033 52%, #312e81);
}

.cover-shade {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 70% 12%, rgba(255, 255, 255, 0.16), transparent 35%),
    linear-gradient(90deg, rgba(4, 8, 18, 0.92), rgba(4, 8, 18, 0.58) 58%, rgba(4, 8, 18, 0.1)),
    linear-gradient(to top, rgba(4, 8, 18, 0.84), transparent 70%);
}

.rank-number {
  position: absolute;
  z-index: 2;
  top: 9px;
  left: 11px;
  display: grid;
  min-width: 34px;
  height: 28px;
  box-sizing: border-box;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--rank-color) 52%, transparent);
  border-radius: 7px;
  color: var(--rank-color);
  background: color-mix(in srgb, var(--rank-color) 13%, rgba(5, 9, 19, 0.82));
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.09),
    0 3px 10px rgba(0, 0, 0, 0.3);
  font-family: Georgia, serif;
  font-size: 17px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 0 10px color-mix(in srgb, var(--rank-color) 45%, transparent);
}

.podium-copy,
.rank-copy {
  position: absolute;
  z-index: 2;
  right: 17px;
  bottom: 15px;
  left: 17px;
}

.podium-copy h3,
.rank-copy h3 {
  overflow: hidden;
  margin: 0 0 7px;
  font-size: 19px;
  font-weight: 900;
  text-overflow: ellipsis;
  text-shadow: 0 2px 8px #000;
  white-space: nowrap;
}

.score-line {
  display: flex;
  align-items: center;
  gap: 9px;
}

.grade {
  font-size: 17px;
  font-weight: 950;
}

.stars {
  color: #f7c84b;
  font-size: 12px;
  letter-spacing: -1px;
}

.hours {
  color: #b6c1d2;
  font-size: 11px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.rank-card {
  border-radius: 9px;
}

.rank-copy {
  right: 11px;
  bottom: 9px;
  left: 11px;
}

.rank-copy h3 {
  margin-bottom: 5px;
  font-size: 13px;
}

.score-line.compact {
  gap: 8px;
}

.compact .grade {
  font-size: 13px;
}

.compact .stars,
.compact .hours {
  font-size: 10px;
}

.grade-empty { color: #94a3b8; }
.grade-c { color: #94a3b8; }
.grade-c-plus { color: #5eead4; }
.grade-b { color: #60a5fa; }
.grade-b-plus { color: #22d3ee; }
.grade-a { color: #a78bfa; }
.grade-a-plus { color: #f472b6; }
.grade-s { color: #facc15; text-shadow: 0 0 12px rgba(250, 204, 21, 0.3); }
.grade-s-plus {
  color: transparent;
  background: linear-gradient(90deg, #f87171, #facc15, #4ade80, #38bdf8, #a78bfa, #f472b6);
  background-clip: text;
  -webkit-background-clip: text;
}

.image-picker-backdrop {
  position: fixed;
  z-index: 2;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 6, 23, 0.76);
}

.image-picker {
  display: grid;
  width: min(980px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #172033;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.58);
}

.image-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 12px;
}

.image-picker-header h3 {
  margin: 0 0 4px;
  font-size: 20px;
}

.image-picker-header p {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
}

.image-picker-header button,
.image-picker-actions button {
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 8px;
  padding: 7px 11px;
  color: #e5edf7;
  background: #111a2b;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
}

.image-picker-actions {
  padding: 0 20px 14px;
}

.image-picker-state {
  display: grid;
  min-height: 220px;
  place-items: center;
  margin: 0 20px 20px;
  border: 1px dashed rgba(148, 163, 184, 0.3);
  border-radius: 12px;
  color: #94a3b8;
}

.image-picker-state.error {
  color: #fecaca;
}

.image-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.image-option {
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  color: #e5edf7;
  background: #101827;
  text-align: left;
}

.image-option:hover,
.image-option:focus-visible {
  border-color: #7dd3fc;
  outline: none;
}

.image-preview {
  display: flex;
  height: 130px;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.74);
}

.image-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-option-copy {
  display: grid;
  gap: 3px;
  padding: 10px;
}

.image-option-copy strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-option-copy small {
  overflow: hidden;
  color: #8290a7;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .summary-toolbar { padding-inline: 14px; }
  .summary-scroll { padding: 14px; }
  .summary-sheet { padding: 14px; }
  .summary-podium,
  .summary-grid { grid-template-columns: 1fr; }
}
</style>
