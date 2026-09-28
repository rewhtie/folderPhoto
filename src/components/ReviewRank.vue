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
} from '../shared/tier-list/model'
import type { ImageAsset } from '../shared/common/contracts/image-library'
import { loadGameReviews } from '../shared/game-review/storage'
import { takeReviewPool } from '../shared/review-rank/pool'
import { pickLocalImages } from '../shared/common/local-image-picker'

const props = defineProps<{
  images: ImageAsset[]
}>()

const list = ref<TierList>(emptyTierList())
const isLoadingList = ref(true)
const isImporting = ref(false)
const isImportingReviews = ref(false)
const isExporting = ref(false)
const errorMessage = ref('')
const importMessage = ref('')
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

const tierStyles: Record<string, Record<string, string>> = {
  夯: {
    color: 'transparent',
    background: 'var(--grade-s-plus-gradient)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  顶级: { color: 'var(--grade-s)' },
  人上人: { color: 'var(--grade-a-plus)' },
  NPC: { color: 'var(--grade-a)' },
  拉: { color: 'var(--grade-b)' },
  pool: { color: 'var(--grade-c)' },
}

function tierLabel(tier: string): string {
  return tier === 'pool' ? '待分区' : tier
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void window.imageLibrary?.saveTierList(list.value)
  }, 400)
}

onMounted(async () => {
  // 先取走 pool 里的图（不依赖持久化），保证「加入评测」或导入的图一定能显示
  const incoming = takeReviewPool()

  try {
    let loaded: TierList
    try {
      loaded = await window.imageLibrary.loadTierList()
    } catch {
      loaded = emptyTierList()
    }

    let next = loaded
    for (const entry of incoming) next = addToPool(next, entry)
    list.value = next
    if (incoming.length > 0) {
      isPoolOpen.value = true
      scheduleSave()
    }
  } finally {
    isLoadingList.value = false
  }
})

async function importLocalImages(): Promise<void> {
  if (isLoadingList.value) return
  isImporting.value = true
  errorMessage.value = ''
  try {
    const picked = await pickLocalImages()
    if (picked.length === 0) return
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

function tierForRating(rating: number): TierKey | null {
  const tiers: Record<number, TierKey> = {
    5: '夯',
    4: '顶级',
    3: '人上人',
    2: 'NPC',
    1: '拉',
    0: '拉'
  }
  return tiers[rating] ?? null
}

function imageByAppId(): Map<string, ImageAsset> {
  const images = new Map<string, ImageAsset>()
  for (const image of props.images) {
    if (image.appId && !images.has(image.appId)) images.set(image.appId, image)
  }
  return images
}

function appIdByImageUrl(): Map<string, string> {
  const appIds = new Map<string, string>()
  for (const image of props.images) {
    if (image.appId) appIds.set(image.fileUrl, image.appId)
  }
  return appIds
}

function importGameReviews(): void {
  if (isLoadingList.value || isImportingReviews.value) return
  isImportingReviews.value = true
  errorMessage.value = ''
  importMessage.value = ''

  try {
    const reviews = loadGameReviews(window.localStorage)
    const imagesByAppId = imageByAppId()
    const appIdsByUrl = appIdByImageUrl()
    const existingAppIds = new Set<string>()

    for (const tier of [...TIER_ORDER, 'pool'] as TierKey[]) {
      for (const entry of list.value[tier]) {
        const appId = entry.appId ?? appIdsByUrl.get(entry.src)
        if (appId) existingAppIds.add(appId)
      }
    }

    let next: TierList = {
      夯: [...list.value.夯],
      顶级: [...list.value.顶级],
      人上人: [...list.value.人上人],
      NPC: [...list.value.NPC],
      拉: [...list.value.拉],
      pool: [...list.value.pool],
    }
    let imported = 0
    let updated = 0
    let skipped = 0

    for (const [appId, review] of Object.entries(reviews)) {
      const tier = tierForRating(review.rating)
      if (!tier || appId.startsWith('custom-')) {
        skipped += 1
        continue
      }

      for (const key of [...TIER_ORDER, 'pool'] as TierKey[]) {
        next[key] = next[key].filter((entry) => {
          const entryAppId = entry.appId ?? appIdsByUrl.get(entry.src)
          return entryAppId !== appId
        })
      }

      const image = imagesByAppId.get(appId)
      next[tier].push({
        id: `steam-app-${appId}`,
        appId,
        src: review.coverUrl || image?.fileUrl || '',
        label: review.appName,
      })
      if (existingAppIds.has(appId)) updated += 1
      else imported += 1
    }

    list.value = next
    scheduleSave()
    importMessage.value = `新增 ${imported} 个，更新 ${updated} 个，跳过 ${skipped} 个`
  } catch {
    errorMessage.value = '获取游戏测评数据失败'
  } finally {
    isImportingReviews.value = false
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
  <main class="min-h-screen bg-[var(--page-background)]">
    <section class="border-b border-[var(--border)] bg-[var(--panel-background)] px-40px py-32px">
      <h1 class="m-0 mb-12px text-32px">游戏评测排名</h1>
      <p class="m-0 text-[var(--text-secondary)] [line-height:1.7]">
        导入游戏图片，拖到对应档位排出你的个人金字塔。
      </p>
      <div class="mt-24px flex gap-12px">
        <button
          class="cursor-pointer border-0 rounded-12px bg-[var(--accent)] px-18px py-8px font-800 text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-50"
          type="button"
          :disabled="isLoadingList || isImportingReviews"
          @click="importGameReviews"
        >
          {{ isLoadingList ? '加载排名中…' : isImportingReviews ? '获取中…' : '获取游戏测评数据' }}
        </button>
        <button
          class="cursor-pointer border-0 rounded-12px bg-[var(--accent)] px-18px py-8px font-800 text-[var(--accent-text)] disabled:cursor-wait disabled:opacity-50"
          type="button"
          :disabled="isLoadingList || isImporting"
          @click="importLocalImages"
        >
          {{ isImporting ? '导入中…' : '导入图片' }}
        </button>
        <button
          class="cursor-pointer border border-[var(--accent-border)] rounded-12px bg-[var(--accent-background)] px-18px py-8px font-800 text-[var(--text-soft)] disabled:cursor-wait disabled:opacity-50"
          type="button"
          :disabled="isExporting"
          @click="exportPng"
        >
          {{ isExporting ? '导出中…' : '导出图片' }}
        </button>
      </div>
    </section>

    <section class="px-40px py-24px">
      <p v-if="errorMessage" class="text-[var(--danger-text)]">{{ errorMessage }}</p>
      <p
        v-if="importMessage"
        class="text-14px font-700 text-[var(--success-text)]"
        role="status"
      >
        {{ importMessage }}
      </p>

      <!-- 金字塔：五档纵向，全宽 -->
      <div ref="pyramidEl" class="min-w-0">
        <div
          v-for="tier in TIER_ORDER"
          :key="tier"
          class="mb-20px flex items-center gap-16px border border-[var(--border-soft)] rounded-14px bg-[var(--row-background)] px-16px py-14px"
          @dragover="onDragOver"
          @drop="onDrop(tier, list[tier].length)"
        >
          <h2
            class="m-0 flex flex-[0_0_84px] flex-col items-center justify-center gap-4px text-center text-18px"
          >
            <span :style="tierStyles[tier]">{{ tierLabel(tier) }}</span>
            <span class="text-13px text-[var(--text-muted)]">{{ list[tier].length }}</span>
          </h2>
          <div class="min-h-60px min-w-0 flex flex-[1_1_auto] flex-wrap items-start gap-10px">
            <div
              v-for="(entry, idx) in list[tier]"
              :key="entry.id"
              class="relative cursor-grab overflow-hidden rounded-8px bg-[var(--image-well-background)] active:cursor-grabbing"
              :style="{ width: tierWidths[tier] + 'px' }"
              draggable="true"
              @dragstart="onDragStart(tier, idx, $event)"
              @dragover="(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move' }"
              @drop="onDrop(tier, idx)"
              @dragend="onDragEnd"
            >
              <img
                v-if="entry.src"
                class="block h-auto w-full"
                :src="entry.src"
                :alt="entry.label"
                loading="lazy"
                draggable="false"
              />
              <div
                v-else
                class="min-h-68px flex items-center justify-center bg-[var(--image-well-background)] px-8px pb-24px pt-10px text-center text-12px font-800 leading-[1.35] text-[var(--text-soft)] [overflow-wrap:anywhere]"
              >
                {{ entry.label }}
              </div>
              <div
                class="absolute inset-x-0 bottom-0 overflow-hidden text-ellipsis whitespace-nowrap px-6px py-3px text-center text-11px text-[var(--image-overlay-text)] [background:linear-gradient(transparent,rgba(0,0,0,0.85))]"
              >
                {{ entry.label }}
              </div>
            </div>
            <div
              v-if="list[tier].length === 0"
              class="self-center text-13px text-[var(--text-faint)]"
            >
              拖到这里
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 右侧待分区抽屉 -->
    <div
      class="fixed inset-y-0 right-0 z-30 flex translate-x-[calc(100%_-_42px)] transition-transform duration-[220ms]"
      :class="{ '!translate-x-0': isPoolOpen }"
    >
      <button
        class="w-42px flex flex-none cursor-pointer flex-col items-center justify-center self-center gap-8px border border-r-0 border-[var(--border)] rounded-[12px_0_0_12px] bg-[var(--nav-background)] px-4px py-12px text-[var(--text-soft)] hover:text-[var(--accent)]"
        type="button"
        :title="isPoolOpen ? '收起待分区' : '展开待分区'"
        @click="isPoolOpen = !isPoolOpen"
      >
        <span class="flex flex-col items-center text-14px font-800 tracking-[0.1em]" aria-hidden="true">
          <span>待</span>
          <span>分</span>
          <span>区</span>
        </span>
        <span
          class="min-w-22px h-22px inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5px text-12px font-900 leading-none text-[var(--accent-text)]"
          aria-label="待分区数量"
        >
          {{ list.pool.length }}
        </span>
        <span class="text-18px leading-none" aria-hidden="true">{{ isPoolOpen ? '›' : '‹' }}</span>
      </button>
      <aside
        class="flex flex-[0_0_300px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--nav-background)] p-16px"
        @dragover="onDragOver"
        @drop="onDrop('pool', list.pool.length)"
      >
        <div
          class="grid flex-1 content-start gap-10px [grid-template-columns:repeat(auto-fill,minmax(88px,1fr))]"
        >
          <div
            v-for="(entry, idx) in list.pool"
            :key="entry.id"
            class="relative w-full cursor-grab overflow-hidden rounded-8px bg-[var(--image-well-background)] active:cursor-grabbing"
            draggable="true"
            @dragstart="onDragStart('pool', idx, $event)"
            @dragover="(e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'move' }"
            @drop="onDrop('pool', idx)"
            @dragend="onDragEnd"
          >
            <img
              class="block h-auto w-full"
              :src="entry.src"
              :alt="entry.label"
              loading="lazy"
              draggable="false"
            />
            <div
              class="absolute inset-x-0 bottom-0 overflow-hidden text-ellipsis whitespace-nowrap px-6px py-3px text-center text-11px text-[var(--image-overlay-text)] [background:linear-gradient(transparent,rgba(0,0,0,0.85))]"
            >
              {{ entry.label }}
            </div>
          </div>
          <div
            v-if="list.pool.length === 0"
            class="self-center text-13px text-[var(--text-faint)]"
          >
            拖到这里
          </div>
        </div>
      </aside>
    </div>
  </main>
</template>
