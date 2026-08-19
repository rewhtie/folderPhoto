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

// 每档封面宽（px），金字塔自上而下递减
const tierWidths: Record<string, number> = {
  夯: 200,
  顶级: 164,
  人上人: 132,
  NPC: 104,
  拉: 80,
  pool: 96,
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
  list.value = await window.imageLibrary.loadTierList()
  // 取走浏览器页送来的图片
  const incoming = takeReviewPool()
  if (incoming.length > 0) {
    let next = list.value
    for (const entry of incoming) next = addToPool(next, entry)
    list.value = next
    scheduleSave()
  }
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

// --- 导出 PNG ---
async function loadBitmap(src: string): Promise<ImageBitmap | null> {
  try {
    const resp = await fetch(src)
    if (!resp.ok) return null
    return await createImageBitmap(await resp.blob())
  } catch {
    return null
  }
}

async function exportPng(): Promise<void> {
  if (isExporting.value) return
  isExporting.value = true
  errorMessage.value = ''
  try {
    const canvasWidth = 1920
    const padding = 40
    const rowH = 140
    const labelH = 40
    const sections = [...TIER_ORDER, 'pool' as const].filter((t) => list.value[t].length > 0)

    let totalH = padding
    for (const tier of sections) {
      totalH += labelH + rowH + 16
    }
    totalH += padding

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = totalH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#101827'
    ctx.fillRect(0, 0, canvasWidth, totalH)

    let y = padding
    for (const tier of sections) {
      const entries = list.value[tier]
      // 档位标签
      ctx.fillStyle = tierColors[tier]
      ctx.fillRect(padding, y, 8, labelH)
      ctx.fillStyle = tier === 'pool' ? '#94a3b8' : tierColors[tier]
      ctx.font = 'bold 22px sans-serif'
      ctx.fillText(`${tierLabel(tier)} · ${entries.length}`, padding + 20, y + 28)
      y += labelH

      // 封面横排
      const w = tierWidths[tier]
      const bitmaps = await Promise.all(entries.map((e) => loadBitmap(e.src)))
      for (let i = 0; i < entries.length; i++) {
        const x = padding + i * (w + 10)
        const bmp = bitmaps[i]
        if (bmp) {
          const ratio = bmp.width / bmp.height
          let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height
          if (ratio > 460 / 215) {
            sw = bmp.height * (460 / 215)
            sx = (bmp.width - sw) / 2
          } else {
            sh = bmp.width / (460 / 215)
            sy = (bmp.height - sh) / 2
          }
          ctx.drawImage(bmp, sx, sy, sw, sh, x, y, w, w / (460 / 215))
        } else {
          ctx.fillStyle = '#1e293b'
          ctx.fillRect(x, y, w, w / (460 / 215))
        }
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(x, y + w / (460 / 215) - 24, w, 24)
        ctx.fillStyle = '#e2e8f0'
        ctx.font = 'bold 12px sans-serif'
        ctx.fillText(entries[i].label.slice(0, 18), x + 6, y + w / (460 / 215) - 12)
      }
      y += rowH + 16
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const buffer = await blob.arrayBuffer()
    await window.imageLibrary.saveCollage(buffer, 'review-rank.png')
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '导出失败'
  } finally {
    isExporting.value = false
  }
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

      <div
        v-for="tier in [...TIER_ORDER, 'pool']"
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
    </section>
  </main>
</template>

<style scoped>
.review-shell {
  min-height: 100vh;
  padding: 40px;
  background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34rem),
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
.content-panel {
  margin-top: 24px;
}
.error-text {
  color: #fca5a5;
}
.tier-row {
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.55);
}
.tier-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 18px;
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