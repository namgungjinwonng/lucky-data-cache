// GitHub 원격 데이터와 기기 캐시에서 최신 당첨 결과를 안전하게 불러오는 모듈
import type { PrizeAmounts } from './history-data'

export interface LatestDraw {
  schemaVersion: 1
  round: number
  date: string
  numbers: number[]
  bonus: number
  firstPrize: number
  winners: number
  prizes?: PrizeAmounts
  sourceUpdatedAt: string
}

export interface DrawSyncResult {
  draw: LatestDraw
  source: 'remote' | 'cache' | 'bundled'
}

const REMOTE_URL =
  'https://raw.githubusercontent.com/namgungjinwonng/lucky-data-cache/main/public/data/latest.json'
const CACHE_KEY = 'lucky45.latestDraw'

export function isLatestDraw(value: unknown): value is LatestDraw {
  if (!value || typeof value !== 'object') return false

  const draw = value as Partial<LatestDraw>
  return (
    draw.schemaVersion === 1 &&
    Number.isInteger(draw.round) &&
    typeof draw.date === 'string' &&
    Array.isArray(draw.numbers) &&
    draw.numbers.length === 6 &&
    new Set(draw.numbers).size === 6 &&
    draw.numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45) &&
    Number.isInteger(draw.bonus) &&
    !draw.numbers.includes(draw.bonus as number) &&
    typeof draw.firstPrize === 'number' &&
    typeof draw.winners === 'number' &&
    (draw.prizes === undefined || (
      typeof draw.prizes === 'object' &&
      [1, 2, 3, 4, 5].every((rank) => Number.isInteger(draw.prizes?.[rank as keyof PrizeAmounts]) && Number(draw.prizes?.[rank as keyof PrizeAmounts]) >= 0)
    )) &&
    typeof draw.sourceUpdatedAt === 'string'
  )
}

async function fetchDraw(url: string) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  })
  if (!response.ok) throw new Error(`당첨 데이터 요청 실패 (${response.status})`)

  const value: unknown = await response.json()
  if (!isLatestDraw(value)) throw new Error('당첨 데이터 형식이 올바르지 않습니다.')
  return value
}

function readCache() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    return isLatestDraw(value) ? value : null
  } catch {
    return null
  }
}

export async function syncLatestDraw(): Promise<DrawSyncResult> {
  try {
    const draw = await fetchDraw(REMOTE_URL)
    localStorage.setItem(CACHE_KEY, JSON.stringify(draw))
    return { draw, source: 'remote' }
  } catch {
    const cached = readCache()
    if (cached) return { draw: cached, source: 'cache' }

    const bundledUrl = new URL('./data/latest.json', window.location.href).toString()
    const draw = await fetchDraw(bundledUrl)
    return { draw, source: 'bundled' }
  }
}
