<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  addToPool,
  emptyTierList,
  moveEntry,
  tierLabelFromUrl,
  TIER_ORDER,
  type TierEntry,
  type TierKey,
  type TierList,
} from '../shared/tierList'
import { takeReviewPool } from '../shared/reviewPool'

const list = ref<TierList>(emptyTierList())
const isImporting = ref(false)
const isExporting = ref(false)
const errorMessage = ref('')
const isPoolOpen = ref(false)
const pyramidEl = ref<HTMLElement | null>(null)

// 每档封面宽（px），统一为 NPC 尺寸
const tierWidths: Record<string, number> = {
  夯: 104,
  顶级: 104,
  人上人: 104,
  NPC: 104,
  拉: 104,
  pool: 104,
}

const tierColors: Record<string, string> = {
  夯: '#7dd3fc',
  顶级: '#a5b4fc',
  人上人: '#fcd34d',
  NPC: '#fb923c',
  拉: '#f87171',
  pool: '#94a3b8',
}

function tierLabel(tier: string): string {
  return tier === 'pool' ? '待分区' : tier
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void window.imageLibrary.saveTierList(list.value)
  }, 400)
}

onMounted(async () => {
  // 先取走 pool 里的图（不依赖持久化），保证「加入评测」或导入的图一定能显示
  const incoming = takeReviewPool()

  let loaded: TierList
  try {
    loaded = await window.imageLibrary.loadTierList()
  } catch {
    loaded = emptyTierList()
  }

  let next = loaded
  for (const entry of incoming) next = addToPool(next, entry)
  list.value = next
  if (incoming.length > 0) scheduleSave()
})

async function importLocalImages(): Promise<void> {
  isImporting.value = true
  errorMessage.value = ''
  try {
    const picked = await window.imageLibrary.pickLocalImages()
    if (!picked || picked.length === 0) return
    let next = list.value
    for (const src of picked) {
      next = addToPool(next, { id: src, src, label: tierLabelFromUrl(src, src) })
    }
    list.value = next
    scheduleSave()
  } catch {
    errorMessage.value = '导入图片失败'
  } finally {
    isImporting.value = false
  }
}

// --- 拖拽：dragFrom 存 { tier, idx } ---
let dragFrom: { tier: TierKey; idx: number } | null = null

function onDragStart(tier: TierKey, idx: number, e: DragEvent): void {
  dragFrom = { tier, idx }
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDrop(tier: TierKey, idx: number): void {
  if (!dragFrom) return
  const { tier: fromTier, idx: fromIdx } = dragFrom
  dragFrom = null
  // 目标下标：默认插入末尾；同档时用 hover 的 idx
  const toIdx = idx
  list.value = moveEntry(list.value, fromTier, fromIdx, tier, toIdx)
  scheduleSave()
}

function onDragEnd(): void {
  dragFrom = null
}

// --- 导出 PNG（DOM 截图：直接截取评分区域，高清） ---
import { toPng } from 'html-to-image'

async function exportPng(): Promise<void> {
  if (isExporting.value) return
  if (!pyramidEl.value) return
  isExporting.value = true
  errorMessage.value = ''
  try {
    // 导入的封面若尚未加载完，先等图片就绪再截图
    await waitImagesLoaded(pyramidEl.value)

    const node = pyramidEl.value
    const pixelRatio = 3
    const dataUrl = await toPng(node, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: '#101827',
      width: node.scrollWidth,
      height: node.scrollHeight,
    })

    const resp = await fetch(dataUrl)
    const blob = await resp.blob()
    const buffer = await blob.arrayBuffer()
    await window.imageLibrary.saveCollage(buffer, 'review-rank.png')
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '导出失败'
  } finally {
    isExporting.value = false
  }
}

function waitImagesLoaded(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve()
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
}
</script>

<template>
  <main class="review-shell">
    <section class="hero-panel">
      <h1>游戏评测排名</h1>
      <p class="description">导入游戏图片，拖到对应档位排出你的个人金字塔。</p>
      <div class="review-controls">
        <button type="button" :disabled="isImporting" @click="importLocalImages">
          {{ isImporting ? '导入中…' : '导入图片' }}
        </button>
        <button
          class="secondary"
          type="button"
          :disabled="isExporting"
          @click="exportPng"
        >
          {{ isExporting ? '导出中…' : '导出图片' }}
        </button>
      </div>
    </section>

    <section class="content-panel">
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

      <!-- 金字塔：五档纵向，全宽 -->
      <div ref="pyramidEl" class="pyramid-col">
        <div
          v-for="tier in TIER_ORDER"
          :key="tier"
          class="tier-row"
          @dragover="onDragOver"
          @drop="onDrop(tier, list[tier].length)"
        >
          <h2 class="tier-head" :style="{ color: tierColors[tier] }">
            {{ tierLabel(tier) }} <span class="count">{{ list[tier].length }}</span>
          </h2>
          <div class="cover-row">
            <div
              v-for="(entry, idx) in list[tier]"
              :key="entry.id"
              class="cover"
              :style="{ width: tierWidths[tier] + 'px' }"
              draggable="true"
              @dragstart="onDragStart(tier, idx, $event)"
              @dragover="(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move' }"
              @drop="onDrop(tier, idx)"
              @dragend="onDragEnd"
            >
              <img :src="entry.src" :alt="entry.label" loading="lazy" draggable="false" />
              <div class="cover-meta">{{ entry.label }}</div>
            </div>
            <div v-if="list[tier].length === 0" class="empty-hint">拖到这里</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 右侧待分区抽屉 -->
    <div class="pool-drawer" :class="{ open: isPoolOpen }">
      <button
        class="pool-tab"
        type="button"
        :title="isPoolOpen ? '收起待分区' : '展开待分区'"
        @click="isPoolOpen = !isPoolOpen"
      >
        <span class="pool-tab-text">待分区 {{ list.pool.length }}</span>
        <span class="pool-tab-arrow">{{ isPoolOpen ? '›' : '‹' }}</span>
      </button>
      <aside
        class="pool-col"
        @dragover="onDragOver"
        @drop="onDrop('pool', list.pool.length)"
      >
        <div class="pool-covers">
          <div
            v-for="(entry, idx) in list.pool"
            :key="entry.id"
            class="cover pool-cover"
            draggable="true"
            @dragstart="onDragStart('pool', idx, $event)"
            @dragover="(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move' }"
            @drop="onDrop('pool', idx)"
            @dragend="onDragEnd"
          >
            <img :src="entry.src" :alt="entry.label" loading="lazy" draggable="false" />
            <div class="cover-meta">{{ entry.label }}</div>
          </div>
          <div v-if="list.pool.length === 0" class="empty-hint">拖到这里</div>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.review-shell {
  min-height: 100vh;
  background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34rem),
    linear-gradient(135deg, #101827 0%, #172033 48%, #0f172a 100%);
}
.hero-panel {
  padding: 32px 40px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.78);
}
.content-panel {
  padding: 24px 40px;
}
h1 {
  margin: 0 0 12px;
  font-size: 32px;
}
.description {
  margin: 0;
  color: #b6c3d4;
  line-height: 1.7;
}
.review-controls {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.review-controls button {
  padding: 8px 18px;
  border: 0;
  border-radius: 12px;
  background: #7dd3fc;
  color: #082f49;
  font-weight: 800;
  cursor: pointer;
}
.review-controls button.secondary {
  background: rgba(59, 130, 246, 0.22);
  border: 1px solid rgba(147, 197, 253, 0.34);
  color: #dbeafe;
}
.review-controls button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.pyramid-col {
  min-width: 0;
}

/* --- 右侧待分区抽屉 --- */
.pool-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  transform: translateX(calc(100% - 34px));
  transition: transform 0.22s ease;
}
.pool-drawer.open {
  transform: translateX(0);
}
.pool-tab {
  align-self: center;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 34px;
  padding: 12px 0;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-right: 0;
  border-radius: 12px 0 0 12px;
  background: rgba(15, 23, 42, 0.92);
  color: #cbd5e1;
  cursor: pointer;
  writing-mode: vertical-rl;
}
.pool-tab:hover {
  color: #7dd3fc;
}
.pool-tab-text {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.1em;
}
.pool-tab-arrow {
  font-size: 16px;
}
.pool-col {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-left: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.96);
  overflow-y: auto;
}
.pool-covers {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  align-content: start;
  gap: 10px;
}
.pool-cover {
  width: 100%;
}
.error-text {
  color: #fca5a5;
}
.tier-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.55);
}
.tier-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 0 0 84px;
  margin: 0;
  font-size: 18px;
  text-align: center;
}
.tier-head .count {
  font-size: 13px;
  color: #94a3b8;
}
.cover-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  min-height: 60px;
  flex: 1 1 auto;
  min-width: 0;
}
.cover {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0f172a;
  cursor: grab;
}
.cover:active {
  cursor: grabbing;
}
.cover img {
  display: block;
  width: 100%;
  height: auto;
}
.cover-meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 3px 6px;
  font-size: 11px;
  color: #e2e8f0;
  text-align: center;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-hint {
  align-self: center;
  color: #475569;
  font-size: 13px;
}
</style>