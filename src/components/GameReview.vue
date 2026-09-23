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
    var(--page-background);
}

.review-header,
.review-content {
  max-width: 1180px;
  margin: 0 auto;
}

.review-header {
  padding: 32px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: var(--panel-background);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}

.review-header h1 {
  margin: 0 0 12px;
  font-size: 36px;
}

.review-header p {
  margin: 0;
  color: var(--text-secondary);
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
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.74);
}

.cover-frame {
  display: flex;
  flex: 0 0 120px;
  align-items: center;
  justify-content: center;
  min-height: 90px;
  background: var(--image-well-background);
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
  color: var(--text-bright);
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-info span {
  color: var(--text-muted);
  font-size: 13px;
}

.empty-state {
  padding: 32px;
  border: 1px dashed var(--border-strong);
  border-radius: 20px;
  color: var(--text-muted);
  background: var(--panel-background-soft);
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
