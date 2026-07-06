<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { OwnedGame, OwnedGamesResult } from '../shared/ownedGames'
import { tierGames, type Tier, type Orientation, type TieredGames } from '../shared/careerCollage'

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

function coverUrl(appid: number): string {
  return orientation.value === 'landscape'
    ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
    : `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
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
  const mins = games.value.reduce((sum, g) => sum + g.playtimeForever, 0)
  return Math.round(mins / 60)
})

const playedCount = computed(() => games.value.filter((g) => g.playtimeForever > 0).length)

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
  try {
    const url = coverUrl(appid)
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await createImageBitmap(blob)
  } catch {
    return null
  }
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
  <main class="career-shell">
    <section class="hero-panel">
      <h1>职业游戏生涯拼图</h1>
      <p class="description">按游戏时长分档展示你的 Steam 游戏库。玩得越多，封面越大。</p>

      <div class="career-controls">
        <div class="toggle-group">
          <button :class="{ active: orientation === 'landscape' }" @click="orientation = 'landscape'">横版</button>
          <button :class="{ active: orientation === 'portrait' }" @click="orientation = 'portrait'">竖版</button>
        </div>
        <button class="secondary-button" :disabled="loading" @click="load(true)">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <button class="secondary-button" :disabled="isExporting || playedCount === 0" @click="exportPng">
          {{ isExporting ? '导出中…' : '导出图片' }}
        </button>
        <span class="stats" v-if="games.length > 0">{{ playedCount }} 个游戏 · {{ totalHours }}h</span>
      </div>
    </section>

    <section class="content-panel">
      <div v-if="errorMessage" class="state-card error-state">
        {{ errorMessage }}
        <button class="secondary-button" @click="load(true)">重试</button>
      </div>
      <div v-else-if="loading" class="state-card">加载中…</div>
      <div v-else-if="playedCount === 0" class="state-card">没有已游玩的游戏。</div>
      <template v-else>
        <div v-for="tier in tierOrder" :key="tier" v-show="tiered[tier].length > 0" class="tier-block">
          <h2 class="tier-label">{{ tierLabels[tier] }} · {{ tiered[tier].length }} 个</h2>
          <div class="cover-row">
            <div
              v-for="game in tiered[tier]"
              :key="game.appid"
              class="cover"
              :style="{ width: coverWidth(tier) + 'px' }"
            >
              <img
                :src="coverUrl(game.appid)"
                :alt="game.name"
                loading="lazy"
                @error="(e) => (e.target as HTMLImageElement).classList.add('cover-broken')"
              />
              <div class="cover-meta">
                <strong>{{ game.name || `#${game.appid}` }}</strong>
                <span>{{ formatPlaytime(game.playtimeForever) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.career-shell {
  min-height: 100vh;
  padding: 40px;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34rem),
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
  max-width: 720px;
  color: #b6c3d4;
  line-height: 1.7;
  margin: 0;
}
.career-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
}
.toggle-group {
  display: flex;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 12px;
  overflow: hidden;
}
.toggle-group button {
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: #cbd5e1;
  font-weight: 700;
  cursor: pointer;
}
.toggle-group button.active {
  background: rgba(125, 211, 252, 0.2);
  color: #7dd3fc;
}
.career-controls .secondary-button {
  padding: 8px 16px;
  border: 1px solid rgba(147, 197, 253, 0.34);
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
  font-weight: 700;
  cursor: pointer;
}
.career-controls .secondary-button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.stats {
  color: #93c5fd;
  font-weight: 700;
}
.content-panel {
  margin-top: 24px;
}
.state-card {
  padding: 28px;
  border: 1px dashed rgba(148, 163, 184, 0.34);
  border-radius: 20px;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.58);
  text-align: center;
}
.error-state {
  border-color: rgba(248, 113, 113, 0.52);
  color: #fecaca;
  background: rgba(127, 29, 29, 0.24);
}
.tier-block {
  margin-bottom: 32px;
}
.tier-label {
  margin: 0 0 14px;
  font-size: 18px;
  color: #7dd3fc;
}
.cover-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.cover {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #0f172a;
}
.cover img {
  display: block;
  width: 100%;
  height: auto;
}
.cover-broken {
  visibility: hidden;
}
.cover-meta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  color: #e2e8f0;
}
.cover-meta strong {
  display: block;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cover-meta span {
  font-size: 10px;
  color: #7dd3fc;
}
</style>
