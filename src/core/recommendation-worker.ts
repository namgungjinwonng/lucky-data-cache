import { rankRecommendationSets, type RecommendationSets } from './analysis'
import type { HistoricalDraw } from './history-data'

export interface RecommendationWorkerResult {
  sets?: RecommendationSets
  error?: string
}

self.onmessage = (event: MessageEvent<HistoricalDraw[]>) => {
  try {
    self.postMessage({ sets: rankRecommendationSets(event.data) } satisfies RecommendationWorkerResult)
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '추천 조합을 계산하지 못했습니다.' } satisfies RecommendationWorkerResult)
  }
}
