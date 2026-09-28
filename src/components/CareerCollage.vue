<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { OwnedGame, OwnedGamesResult } from '../shared/common/contracts/owned-games'
import { tierGames, type Tier, type Orientation, type TieredGames } from '../shared/career-collage/tiers'

const games = ref<OwnedGame[]>([])
const loading = ref(false)
const errorMessage = ref('')
const isExporting = ref(false)
const orientation = ref<Orientation>('landscape')

const tiered = computed<TieredGames>(() => tierGames(games.value))

const tierOrder: Tier[] = ['xl', 'l', 'm', 's']
const tierLabels: Record<Tier, string> = {
  xl: 'XL · 前 10%',
  l: 'L · 10–30%',
  m: 'M · 30–60%',
  s: 'S · 60–100%',
}

// 每档封面宽度（px），按方向区分
const tierSizes: Record<Orientation, Record<Tier, number>> = {
  landscape: { xl: 220, l: 160, m: 120, s: 80 },
  portrait: { xl: 130, l: 95, m: 70, s: 48 },
}

// 竖版优先 library_600x900，失败回退 library_capsule（部分游戏只有后者）
const PORTRAIT_PRIMARY = 'library_600x900.jpg'
const PORTRAIT_FALLBACK = 'library_capsule.jpg'

function coverUrl(appid: number, portraitFallback = false): string {
  if (orientation.value === 'landscape') {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
  }
  const file = portraitFallback ? PORTRAIT_FALLBACK : PORTRAIT_PRIMARY
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${file}`
}

function onCoverError(e: Event, game: OwnedGame): void {
  const img = e.target as HTMLImageElement
  // 竖版主图失败 → 尝试回退图；回退图也失败 → 显示占位
  if (orientation.value === 'portrait' && !img.dataset.fallback) {
    img.dataset.fallback = '1'
    img.src = coverUrl(game.appid, true)
    return
  }
  img.style.display = 'none'
  img.nextElementSibling?.classList.replace('hidden', 'flex')
}

function coverWidth(tier: Tier): number {
  return tierSizes[orientation.value][tier]
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 100) return `${hours.toFixed(1)}h`
  return `${Math.round(hours)}h`
}

const totalHours = computed(() => {
  const mins = games.value.filter((g) => !g.isFamily).reduce((sum, g) => sum + g.playtimeForever, 0)
  return Math.round(mins / 60)
})

const playedCount = computed(() => games.value.filter((g) => !g.isFamily && g.playtimeForever > 0).length)
const familyCount = computed(() => games.value.filter((g) => g.isFamily).length)

async function load(force = false): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result: OwnedGamesResult = await window.imageLibrary.fetchOwnedGames(force)
    games.value = result.games
    if (result.error) errorMessage.value = result.error
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// --- PNG 导出 ---
const exportSizes: Record<Orientation, Record<Tier, number>> = {
  landscape: { xl: 440, l: 320, m: 240, s: 160 },
  portrait: { xl: 260, l: 190, m: 140, s: 96 },
}

function aspectRatio(): number {
  return orientation.value === 'landscape' ? 460 / 215 : 600 / 900
}

async function loadBitmap(appid: number): Promise<ImageBitmap | null> {
  const tryFetch = async (url: string): Promise<ImageBitmap | null> => {
    try {
      const resp = await fetch(url)
      if (!resp.ok) return null
      const blob = await resp.blob()
      return await createImageBitmap(blob)
    } catch {
      return null
    }
  }
  const primary = await tryFetch(coverUrl(appid))
  if (primary) return primary
  // 竖版主图失败，尝试回退
  if (orientation.value === 'portrait') {
    return await tryFetch(coverUrl(appid, true))
  }
  return null
}

async function exportPng(): Promise<void> {
  if (isExporting.value) return
  isExporting.value = true
  try {
    const padding = 40
    const canvasWidth = 1920
    const ratio = aspectRatio()
    const ctxCanvas = document.createElement('canvas')
    const ctx = ctxCanvas.getContext('2d')
    if (!ctx) return

    // 先计算总高度
    let y = padding
    const tierSections: { tier: Tier; covers: OwnedGame[]; coverW: number; coverH: number }[] = []
    for (const tier of tierOrder) {
      const covers = tiered.value[tier]
      if (covers.length === 0) continue
      const w = exportSizes[orientation.value][tier]
      const h = w / ratio
      tierSections.push({ tier, covers, coverW: w, coverH: h })
      y += 50 // 档位标签高度
      const usableWidth = canvasWidth - padding * 2
      const perRow = Math.max(1, Math.floor(usableWidth / (w + 10)))
      const rows = Math.ceil(covers.length / perRow)
      y += rows * (h + 10)
    }
    const totalHeight = y + padding
    ctxCanvas.width = canvasWidth
    ctxCanvas.height = totalHeight
    ctx.fillStyle = '#101827'
    ctx.fillRect(0, 0, canvasWidth, totalHeight)

    // 绘制每个档位
    let cursorY = padding
    for (const section of tierSections) {
      ctx.fillStyle = '#7dd3fc'
      ctx.font = 'bold 28px sans-serif'
      ctx.fillText(
        `${tierLabels[section.tier]} · ${section.covers.length} 个`,
        padding,
        cursorY + 28,
      )
      cursorY += 50

      const { coverW: w, coverH: h } = section
      const usableWidth = canvasWidth - padding * 2
      const perRow = Math.max(1, Math.floor(usableWidth / (w + 10)))
      const bitmaps = await Promise.all(section.covers.map((g) => loadBitmap(g.appid)))
      for (let i = 0; i < section.covers.length; i++) {
        const game = section.covers[i]
        const bmp = bitmaps[i]
        const col = i % perRow
        const x = padding + col * (w + 10)
        if (bmp) {
          const srcRatio = bmp.width / bmp.height
          let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height
          if (srcRatio > ratio) {
            sw = bmp.height * ratio
            sx = (bmp.width - sw) / 2
          } else {
            sh = bmp.width / ratio
            sy = (bmp.height - sh) / 2
          }
          ctx.drawImage(bmp, sx, sy, sw, sh, x, cursorY, w, h)
        } else {
          ctx.fillStyle = '#1e293b'
          ctx.fillRect(x, cursorY, w, h)
        }
        // 底部文字条
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(x, cursorY + h - 28, w, 28)
        ctx.fillStyle = '#e2e8f0'
        ctx.font = 'bold 13px sans-serif'
        const name = game.name || `#${game.appid}`
        ctx.fillText(name.slice(0, 20), x + 6, cursorY + h - 14)
        ctx.fillStyle = '#7dd3fc'
        ctx.font = '12px sans-serif'
        ctx.fillText(formatPlaytime(game.playtimeForever), x + 6, cursorY + h - 4)
      }
      const rows = Math.ceil(section.covers.length / perRow)
      cursorY += rows * (h + 10)
    }

    const blob = await new Promise<Blob | null>((resolve) => ctxCanvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const buffer = await blob.arrayBuffer()
    await window.imageLibrary.saveCollage(buffer, 'career-collage.png')
  } finally {
    isExporting.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="min-h-screen bg-[var(--page-background)] p-40px">
    <section
      class="mx-auto max-w-1180px border border-[var(--border)] rounded-24px bg-[var(--panel-background)] p-32px [box-shadow:var(--shadow-panel)]"
    >
      <h1 class="m-0 mb-12px text-32px">职业游戏生涯拼图</h1>
      <p class="m-0 max-w-720px text-[var(--text-secondary)] [line-height:1.7]">
        按游戏时长分档展示你的 Steam 游戏库。玩得越多，封面越大。
      </p>

      <div class="mt-24px flex items-center gap-12px">
        <div
          class="flex overflow-hidden border border-[var(--border-strong)] rounded-12px"
        >
          <button
            class="cursor-pointer border-0 bg-transparent px-16px py-8px font-700 text-[var(--text-soft)]"
            :class="{
              '!bg-[var(--accent-background)] !text-[var(--accent)]':
                orientation === 'landscape',
            }"
            @click="orientation = 'landscape'"
          >
            横版
          </button>
          <button
            class="cursor-pointer border-0 bg-transparent px-16px py-8px font-700 text-[var(--text-soft)]"
            :class="{
              '!bg-[var(--accent-background)] !text-[var(--accent)]':
                orientation === 'portrait',
            }"
            @click="orientation = 'portrait'"
          >
            竖版
          </button>
        </div>
        <button
          class="secondary-button cursor-pointer border border-[var(--accent-border)] rounded-12px bg-[var(--accent-background)] px-16px py-8px font-700 text-[var(--text-soft)] disabled:cursor-wait disabled:opacity-50"
          :disabled="loading"
          @click="load(true)"
        >
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <button
          class="secondary-button cursor-pointer border border-[var(--accent-border)] rounded-12px bg-[var(--accent-background)] px-16px py-8px font-700 text-[var(--text-soft)] disabled:cursor-wait disabled:opacity-50"
          :disabled="isExporting || playedCount === 0"
          @click="exportPng"
        >
          {{ isExporting ? '导出中…' : '导出图片' }}
        </button>
        <span
          v-if="games.length > 0"
          class="font-700 text-[var(--accent-soft)]"
        >
          {{ playedCount }} 个游戏 · {{ totalHours }}h<span v-if="familyCount > 0">
            · {{ familyCount }} 个家庭共享</span
          >
        </span>
      </div>
    </section>

    <section class="mx-auto mt-24px max-w-1180px">
      <div
        v-if="errorMessage"
        class="border border-[var(--danger-border)] rounded-20px border-dashed bg-[var(--danger-background)] p-28px text-center text-[var(--danger-text)]"
      >
        {{ errorMessage }}
        <button class="secondary-button" @click="load(true)">重试</button>
      </div>
      <div
        v-else-if="loading"
        class="border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-28px text-center text-[var(--text-soft)]"
      >
        加载中…
      </div>
      <div
        v-else-if="playedCount === 0"
        class="border border-[var(--border-strong)] rounded-20px border-dashed bg-[var(--panel-background-soft)] p-28px text-center text-[var(--text-soft)]"
      >
        没有已游玩的游戏。
      </div>
      <template v-else>
        <div
          v-for="tier in tierOrder"
          v-show="tiered[tier].length > 0"
          :key="tier"
          class="mb-32px"
        >
          <h2 class="m-0 mb-14px text-18px text-[var(--accent)]">
            {{ tierLabels[tier] }} · {{ tiered[tier].length }} 个
          </h2>
          <div class="flex flex-wrap gap-10px">
            <div
              v-for="game in tiered[tier]"
              :key="game.appid"
              class="relative overflow-hidden rounded-8px bg-[var(--image-well-background)]"
              :style="{ width: coverWidth(tier) + 'px' }"
            >
              <img
                class="block h-auto w-full"
                :src="coverUrl(game.appid)"
                :alt="game.name"
                loading="lazy"
                @error="(e) => onCoverError(e, game)"
              />
              <div
                class="absolute inset-0 hidden items-center justify-center break-all p-4px text-center text-10px text-[var(--text-muted)]"
              >
                {{ game.name?.slice(0, 8) || `#${game.appid}` }}
              </div>
              <div
                class="absolute inset-x-0 bottom-0 px-6px py-4px text-[var(--image-overlay-text)] [background:linear-gradient(transparent,rgba(0,0,0,0.85))]"
                :class="{ '!px-4px !py-2px': tier === 's' }"
              >
                <strong
                  class="block overflow-hidden text-ellipsis whitespace-nowrap text-11px"
                  :class="{ '!text-9px': tier === 's' }"
                >
                  {{ game.name || `#${game.appid}` }}
                </strong>
                <span
                  class="text-10px text-[var(--image-overlay-accent)]"
                  :class="{ '!text-8px': tier === 's' }"
                >
                  {{ formatPlaytime(game.playtimeForever) }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="tiered.family.length > 0" class="mb-32px">
          <h2 class="m-0 mb-14px text-18px text-[var(--text-muted)]">
            家庭共享 · {{ tiered.family.length }} 个 · 时长未知
          </h2>
          <div class="flex flex-wrap gap-10px">
            <div
              v-for="game in tiered.family"
              :key="game.appid"
              class="relative overflow-hidden rounded-8px bg-[var(--image-well-background)] opacity-70"
              :style="{ width: coverWidth('s') + 'px' }"
            >
              <img
                class="block h-auto w-full"
                :src="coverUrl(game.appid)"
                :alt="game.name"
                loading="lazy"
                @error="(e) => onCoverError(e, game)"
              />
              <div
                class="absolute inset-0 hidden items-center justify-center break-all p-4px text-center text-10px text-[var(--text-muted)]"
              >
                {{ game.name?.slice(0, 8) || `#${game.appid}` }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </main>
</template>
