import { ref } from 'vue'
import type { TierEntry } from './tierList'

// 浏览器页「加入评测」写入，评测页载入时取走并清空，作为跨 Tab 的图片桥
export const reviewPool = ref<TierEntry[]>([])

export function addToReviewPool(entries: TierEntry[]): void {
  const seen = new Set(reviewPool.value.map((e) => e.id))
  for (const entry of entries) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    reviewPool.value.push(entry)
  }
}

export function takeReviewPool(): TierEntry[] {
  const drained = [...reviewPool.value]
  reviewPool.value = []
  return drained
}