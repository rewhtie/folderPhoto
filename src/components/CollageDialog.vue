<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { computeLayout, moveItem, type CollageImage } from '../shared/collage'

const props = defineProps<{ urls: string[] }>()
const emit = defineEmits<{ close: [] }>()

const n = computed(() => props.urls.length)

const rows = ref(1)
const cols = ref(1)
const totalWidth = ref(2048)
const format = ref<'png' | 'jpeg'>('png')
const jpgQuality = ref(0.92)
const isExporting = ref(false)
const errorMessage = ref('')

const canvasRef = ref<HTMLCanvasElement | null>(null)
const orderedIndices = ref<number[]>([])
// 非响应式，纯导出用：按原始下标存 <img> 元素引用
const imgRefMap = new Map<number, HTMLImageElement>()

const defaultRows = computed(() => Math.max(1, Math.ceil(Math.sqrt(n.value))))
const defaultCols = computed(() => Math.max(1, Math.ceil(n.value / defaultRows.value)))

onMounted(() => {
  rows.value = defaultRows.value
  cols.value = defaultCols.value
  orderedIndices.value = Array.from({ length: n.value }, (_, i) => i)
})

function registerImg(idx: number, el: unknown): void {
  if (el instanceof HTMLImageElement) {
    imgRefMap.set(idx, el)
  } else {
    imgRefMap.delete(idx)
  }
}

// --- 拖拽 ---
let dragFrom = -1
const dragOverIdx = ref(-1)

function onDragStart(idx: number, e: DragEvent): void {
  dragFrom = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
  // 拖拽视觉反馈由 CSS :active 伪类处理（collage-thumb:active { opacity: 0.5 }）
}

function onDragOver(idx: number, e: DragEvent): void {
  e.preventDefault() // 允许 drop
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dragOverIdx.value = idx
}

function onDrop(idx: number, e: DragEvent): void {
  e.preventDefault()
  if (dragFrom === -1 || dragFrom === idx) return
  orderedIndices.value = moveItem(orderedIndices.value, dragFrom, idx)
  dragFrom = -1
}

function onDragEnd(): void {
  dragFrom = -1
  dragOverIdx.value = -1
}

// --- 导出用 draw ---
function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const filtered: HTMLImageElement[] = []
  const imgs: CollageImage[] = []
  for (const idx of orderedIndices.value) {
    const img = imgRefMap.get(idx)
    if (img && img.complete && img.naturalWidth > 0) {
      filtered.push(img)
      imgs.push({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }
  if (imgs.length === 0) return
  const layout = computeLayout(imgs, rows.value, cols.value, clampWidth(totalWidth.value))
  canvas.width = Math.round(layout.canvasWidth)
  canvas.height = Math.round(layout.canvasHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const d of layout.draws) {
    const img = filtered[d.index]
    if (!img) continue
    ctx.drawImage(img, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh)
  }
}

function clampWidth(w: number): number {
  if (!Number.isFinite(w)) return 2048
  return Math.min(8192, Math.max(256, Math.round(w)))
}

async function exportCollage(): Promise<void> {
  const canvas = canvasRef.value
  if (!canvas || isExporting.value) return
  isExporting.value = true
  errorMessage.value = ''
  try {
    draw()
    const mime = format.value === 'png' ? 'image/png' : 'image/jpeg'
    const quality = format.value === 'png' ? undefined : jpgQuality.value
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    )
    if (!blob) {
      errorMessage.value = '导出失败'
      console.error('[collage] toBlob 返回 null（可能 canvas 被跨源图片污染）')
      return
    }
    const buffer = await blob.arrayBuffer()
    const ext = format.value === 'png' ? 'png' : 'jpg'
    const saved = await window.imageLibrary.saveCollage(buffer, `collage.${ext}`)
    if (saved === null) return
    emit('close')
  } catch (err) {
    console.error('[collage] 导出失败:', err)
    errorMessage.value = '导出失败'
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="collage-backdrop" @click.self="emit('close')">
    <div class="collage-dialog">
      <h3>拼图</h3>
      <p>已选 {{ n }} 张图片（拖拽可调整位置）</p>

      <div class="collage-fields">
        <label>
          行
          <input v-model.number="rows" type="number" min="1" max="20" class="collage-input" />
        </label>
        <label>
          列
          <input v-model.number="cols" type="number" min="1" max="20" class="collage-input" />
        </label>
        <label>
          总宽
          <input v-model.number="totalWidth" type="number" min="256" max="8192" step="64" class="collage-input" />
        </label>
        <label>
          格式
          <select v-model="format" class="collage-input">
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
          </select>
        </label>
        <label v-if="format === 'jpeg'">
          质量
          <input v-model.number="jpgQuality" type="range" min="0.5" max="1" step="0.01" />
          <span>{{ Math.round(jpgQuality * 100) }}%</span>
        </label>
      </div>

      <div
        class="collage-grid"
        :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }"
      >
        <img
          v-for="idx in orderedIndices"
          :key="idx"
          :ref="(el) => registerImg(idx, el)"
          :src="urls[idx]"
          crossOrigin="anonymous"
          draggable="true"
          class="collage-thumb"
          :class="{ 'collage-thumb-dragover': dragOverIdx === idx }"
          @dragstart="onDragStart(idx, $event)"
          @dragover="onDragOver(idx, $event)"
          @dragleave="dragOverIdx = -1"
          @drop="onDrop(idx, $event)"
          @dragend="onDragEnd"
        />
      </div>

      <!-- 隐藏 canvas，仅供导出 -->
      <canvas ref="canvasRef" style="display: none"></canvas>

      <p v-if="errorMessage" class="collage-error">{{ errorMessage }}</p>

      <div class="collage-actions">
        <button class="ghost-button" type="button" @click="emit('close')">取消</button>
        <button class="primary-button" type="button" :disabled="isExporting" @click="exportCollage">
          {{ isExporting ? '导出中…' : '导出' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.collage-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.66);
}
.collage-dialog {
  width: 640px;
  max-width: 92vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background: #172033;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
.collage-dialog h3 {
  margin: 0 0 8px;
}
.collage-dialog p {
  margin: 0 0 16px;
  color: #94a3b8;
  font-size: 14px;
}
.collage-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 18px;
}
.collage-fields label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-size: 13px;
}
.collage-input {
  width: 96px;
  padding: 6px 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.6);
  color: #e2e8f0;
  font-size: 14px;
}
.collage-grid {
  display: grid;
  gap: 4px;
  margin-bottom: 18px;
  max-height: 50vh;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: #0f172a;
}
.collage-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: grab;
  transition: opacity 0.15s, border-color 0.15s;
}
.collage-thumb:hover {
  border-color: rgba(125, 211, 252, 0.4);
}
.collage-thumb:active {
  cursor: grabbing;
  opacity: 0.5;
}
.collage-thumb-dragover {
  border-color: #7dd3fc;
  box-shadow: 0 0 0 2px rgba(125, 211, 252, 0.5);
}
.collage-error {
  color: #fca5a5;
  margin: 0 0 12px;
}
.collage-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
