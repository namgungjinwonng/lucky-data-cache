import { buildAdaptiveRecommendations, type AdaptiveRecommendation, type PatternScoreRecord } from './adaptive-recommendations'
import type { HistoricalDraw } from './history-data'

export interface RecommendationWorkerResult {
  result?: AdaptiveRecommendation
  error?: string
}

self.onmessage = async (event: MessageEvent<{ draws: HistoricalDraw[]; cache: PatternScoreRecord[] }>) => {
  try {
    self.postMessage({ result: await buildAdaptiveRecommendations(event.data.draws, event.data.cache) } satisfies RecommendationWorkerResult)
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '추천 조합을 계산하지 못했습니다.' } satisfies RecommendationWorkerResult)
  }
}
