<script setup lang="ts">
import type { GameReviewItem } from '../shared/gameReview'

defineProps<{
  games: GameReviewItem[]
}>()
</script>

<template>
  <main class="review-page">
    <section class="review-header">
      <h1>游戏测评</h1>
      <p>已选择 {{ games.length }} 款游戏，后续可在这里填写测评内容。</p>
    </section>

    <section class="review-content">
      <div v-if="games.length === 0" class="empty-state">
        请先在图片浏览器中选择游戏，再点击“测评”。
      </div>

      <div v-else class="game-list">
        <article v-for="game in games" :key="game.appId" class="game-card">
          <div class="cover-frame">
            <img :src="game.coverUrl" :alt="game.appName" />
          </div>
          <div class="game-info">
            <h2>{{ game.appName }}</h2>
            <span>AppID：{{ game.appId }}</span>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.review-page {
  min-height: 100vh;
  padding: 40px;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34rem),
    linear-gradient(135deg, #101827 0%, #172033 48%, #0f172a 100%);
}

.review-header,
.review-content {
  max-width: 1180px;
  margin: 0 auto;
}

.review-header {
  padding: 32px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}

.review-header h1 {
  margin: 0 0 12px;
  font-size: 36px;
}

.review-header p {
  margin: 0;
  color: #b6c3d4;
  line-height: 1.7;
}

.review-content {
  margin-top: 24px;
}

.game-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}

.game-card {
  display: flex;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.74);
}

.cover-frame {
  display: flex;
  flex: 0 0 120px;
  align-items: center;
  justify-content: center;
  min-height: 90px;
  background: rgba(2, 6, 23, 0.76);
}

.cover-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.game-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 18px;
}

.game-info h2 {
  overflow: hidden;
  margin: 0;
  color: #f8fafc;
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-info span {
  color: #94a3b8;
  font-size: 13px;
}

.empty-state {
  padding: 32px;
  border: 1px dashed rgba(148, 163, 184, 0.34);
  border-radius: 20px;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.58);
  text-align: center;
}

@media (max-width: 720px) {
  .review-page {
    padding: 24px;
  }

  .review-header {
    padding: 24px;
  }
}
</style>
