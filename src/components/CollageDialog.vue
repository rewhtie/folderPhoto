<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { computeLayout, dominantAspectRatio, moveItem, type CollageImage } from '../shared/collage'
import { pickLocalImages as selectLocalImages } from '../shared/localImagePicker'

const props = defineProps<{ urls: string[] }>()
const emit = defineEmits<{ close: [] }>()

const localUrls = ref<string[]>([])
const allUrls = computed(() => [...props.urls, ...localUrls.value])
const n = computed(() => allUrls.value.length)

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
// 图片加载计数，触发 cellRatio 重算
const loadedCount = ref(0)
// 根据已加载图片众数宽高比计算单元格比例（与 computeLayout 一致）
const cellRatio = computed(() => {
  loadedCount.value // 依赖
  const imgs: { width: number; height: number }[] = []
  for (const [, img] of imgRefMap) {
    if (img.complete && img.naturalHeight > 0) {
      imgs.push({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }
  return dominantAspectRatio(imgs)
})

const defaultRows = computed(() => Math.max(1, Math.ceil(Math.sqrt(n.value))))
const defaultCols = computed(() => Math.max(1, Math.ceil(n.value / defaultRows.value)))

onMounted(() => {
  rows.value = defaultRows.value
  cols.value = defaultCols.value
  orderedIndices.value = Array.from({ length: n.value }, (_, i) => i)
})

// 导入本地图片时 allUrls 增长，把新下标追加到末尾，不动已有顺序
watch(n, (newN, oldN) => {
  if (newN <= oldN) return
  for (let i = oldN; i < newN; i++) {
    orderedIndices.value.push(i)
  }
  if (oldN === 0) {
    rows.value = defaultRows.value
    cols.value = defaultCols.value
  }
})

function registerImg(idx: number, el: unknown): void {
  if (el instanceof HTMLImageElement) {
    imgRefMap.set(idx, el)
  } else {
    imgRefMap.delete(idx)
  }
}

// --- 拖拽 ---
// 注意：dragFrom / dragOverIdx 存的是网格位置（pos），不是原始图片下标（idx）
// v-for="(idx, pos) in orderedIndices" 中 pos 是位置，idx 是值
let dragFrom = -1
const dragOverPos = ref(-1)

function onDragStart(pos: number, e: DragEvent): void {
  dragFrom = pos
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(pos: number, e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dragOverPos.value = pos
}

function onDrop(pos: number, e: DragEvent): void {
  e.preventDefault()
  if (dragFrom === -1 || dragFrom === pos) return
  orderedIndices.value = moveItem(orderedIndices.value, dragFrom, pos)
  dragFrom = -1
  dragOverPos.value = -1
}

function onDragEnd(): void {
  dragFrom = -1
  dragOverPos.value = -1
}

function onImgLoad(): void {
  loadedCount.value++
}

async function pickLocalImages(): Promise<void> {
  const picked = await selectLocalImages()
  if (picked.length === 0) return
  localUrls.value.push(...picked)
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
  <div
    class="fixed inset-0 z-10 flex items-center justify-center bg-[var(--backdrop)]"
    @click.self="emit('close')"
  >
    <div
      class="max-h-90vh w-640px max-w-92vw overflow-y-auto border border-[var(--border)] rounded-18px bg-[var(--panel-background-solid)] p-24px [box-shadow:var(--shadow-dialog)]"
    >
      <h3 class="m-0 mb-8px">拼图</h3>
      <p class="m-0 mb-16px text-14px text-[var(--text-muted)]">
        已选 {{ n }} 张图片（拖拽可调整位置）
      </p>

      <div class="mb-14px">
        <button class="ghost-button" type="button" @click="pickLocalImages">
          导入本地图片
        </button>
      </div>

      <p
        v-if="n === 0"
        class="m-0 mb-16px border border-[var(--border-strong)] rounded-8px border-dashed p-24px text-center text-14px text-[var(--text-muted)]"
      >
        请导入本地图片开始拼图
      </p>

      <div class="mb-18px flex flex-wrap gap-16px">
        <label class="flex items-center gap-6px text-13px text-[var(--text-muted)]">
          行
          <input
            v-model.number="rows"
            type="number"
            min="1"
            max="20"
            class="w-96px border border-[var(--border)] rounded-8px bg-[var(--input-background-soft)] px-10px py-6px text-14px text-[var(--text-primary)]"
          />
        </label>
        <label class="flex items-center gap-6px text-13px text-[var(--text-muted)]">
          列
          <input
            v-model.number="cols"
            type="number"
            min="1"
            max="20"
            class="w-96px border border-[var(--border)] rounded-8px bg-[var(--input-background-soft)] px-10px py-6px text-14px text-[var(--text-primary)]"
          />
        </label>
        <label class="flex items-center gap-6px text-13px text-[var(--text-muted)]">
          总宽
          <input
            v-model.number="totalWidth"
            type="number"
            min="256"
            max="8192"
            step="64"
            class="w-96px border border-[var(--border)] rounded-8px bg-[var(--input-background-soft)] px-10px py-6px text-14px text-[var(--text-primary)]"
          />
        </label>
        <label class="flex items-center gap-6px text-13px text-[var(--text-muted)]">
          格式
          <select
            v-model="format"
            class="w-96px border border-[var(--border)] rounded-8px bg-[var(--input-background-soft)] px-10px py-6px text-14px text-[var(--text-primary)]"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
          </select>
        </label>
        <label
          v-if="format === 'jpeg'"
          class="flex items-center gap-6px text-13px text-[var(--text-muted)]"
        >
          质量
          <input v-model.number="jpgQuality" type="range" min="0.5" max="1" step="0.01" />
          <span>{{ Math.round(jpgQuality * 100) }}%</span>
        </label>
      </div>

      <div
        class="mb-18px grid max-h-50vh gap-4px overflow-y-auto border border-[var(--border-soft)] rounded-8px bg-[var(--image-well-background)] p-4px"
        :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }"
      >
        <img
          v-for="(idx, pos) in orderedIndices"
          :key="idx"
          :ref="(el) => registerImg(idx, el)"
          :src="allUrls[idx]"
          crossOrigin="anonymous"
          draggable="true"
          class="w-full cursor-grab border-2 border-transparent rounded-6px object-cover transition-[opacity,border-color] duration-150 hover:border-[var(--accent-border)] active:cursor-grabbing active:opacity-50"
          :style="{ aspectRatio: cellRatio }"
          :class="{
            '!border-[var(--accent)] shadow-[0_0_0_2px_rgba(125,211,252,0.5)]':
              dragOverPos === pos,
          }"
          @load="onImgLoad"
          @dragstart="onDragStart(pos, $event)"
          @dragover="onDragOver(pos, $event)"
          @dragleave="dragOverPos = -1"
          @drop="onDrop(pos, $event)"
          @dragend="onDragEnd"
        />
      </div>

      <!-- 隐藏 canvas，仅供导出 -->
      <canvas ref="canvasRef" class="hidden"></canvas>

      <p
        v-if="errorMessage"
        class="m-0 mb-12px text-14px text-[var(--danger-text)]"
      >
        {{ errorMessage }}
      </p>

      <div class="flex justify-end gap-10px">
        <button class="ghost-button" type="button" @click="emit('close')">取消</button>
        <button
          class="primary-button"
          type="button"
          :disabled="isExporting || n === 0"
          @click="exportCollage"
        >
          {{ isExporting ? '导出中…' : '导出' }}
        </button>
      </div>
    </div>
  </div>
</template>
