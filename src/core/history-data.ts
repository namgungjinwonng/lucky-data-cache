// GitHub 원격 데이터와 APK 내장 파일에서 역대 회차·당첨점·판매점 데이터를 동기화하는 모듈
export interface HistoricalDraw {
  round: number
  date: string
  numbers: number[]
  bonus: number
  firstPrize: number
  winners: number
}

export interface HistoryDataset {
  schemaVersion: 1
  sourceUpdatedAt: string
  draws: HistoricalDraw[]
}

export interface WinnerStore {
  id: string
  name: string
  address: string
  phone: string
  rank: 1 | 2
  method: string
  lat: number | null
  lon: number | null
  winCount: number
}

export interface WinnerStoreDataset {
  schemaVersion: 1
  round: number
  sourceUpdatedAt: string
  stores: WinnerStore[]
}

export interface LotteryStore {
  id: string
  name: string
  address: string
  phone: string
  lat: number
  lon: number
}

export interface StoreDataset {
  schemaVersion: 1
  sourceUpdatedAt: string
  stores: LotteryStore[]
}

const RAW_ROOT = 'https://raw.githubusercontent.com/namgungjinwonng/lucky-data-cache/main'
const HISTORY_KEY = 'lucky45.drawHistory'
const STORES_KEY = 'lucky45.stores'

function isNumberSet(numbers: unknown): numbers is number[] {
  return Array.isArray(numbers) && numbers.length === 6 && new Set(numbers).size === 6 && numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45)
}

export function isHistoryDataset(value: unknown): value is HistoryDataset {
  if (!value || typeof value !== 'object') return false
  const dataset = value as Partial<HistoryDataset>
  if (dataset.schemaVersion !== 1 || typeof dataset.sourceUpdatedAt !== 'string' || !Array.isArray(dataset.draws) || dataset.draws.length < 1) return false
  const rounds = new Set<number>()
  for (const draw of dataset.draws) {
    if (!Number.isInteger(draw.round) || rounds.has(draw.round) || !isNumberSet(draw.numbers) || !Number.isInteger(draw.bonus) || draw.numbers.includes(draw.bonus)) return false
    rounds.add(draw.round)
  }
  const latest = Math.max(...rounds)
  return rounds.size === latest && Array.from({ length: latest }, (_, index) => index + 1).every((round) => rounds.has(round))
}

function isWinnerDataset(value: unknown, round: number): value is WinnerStoreDataset {
  if (!value || typeof value !== 'object') return false
  const dataset = value as Partial<WinnerStoreDataset>
  return dataset.schemaVersion === 1 && dataset.round === round && Array.isArray(dataset.stores) && dataset.stores.every((store) =>
    typeof store.id === 'string' && typeof store.name === 'string' && [1, 2].includes(store.rank) && Number.isInteger(store.winCount) && store.winCount > 0,
  )
}

function isStoreDataset(value: unknown): value is StoreDataset {
  if (!value || typeof value !== 'object') return false
  const dataset = value as Partial<StoreDataset>
  return dataset.schemaVersion === 1 && Array.isArray(dataset.stores) && dataset.stores.length > 0 && dataset.stores.every((store) =>
    typeof store.id === 'string' && typeof store.name === 'string' && Number.isFinite(store.lat) && Number.isFinite(store.lon),
  )
}

async function fetchJson(url: string) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`데이터 요청 실패 (${response.status})`)
  return response.json() as Promise<unknown>
}

function readCache<T>(key: string, validator: (value: unknown) => value is T) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    return validator(value) ? value : null
  } catch {
    return null
  }
}

export async function syncHistoryDataset(): Promise<HistoryDataset> {
  try {
    const value = await fetchJson(`${RAW_ROOT}/public/data/history.json`)
    if (!isHistoryDataset(value)) throw new Error('역대 회차 데이터가 올바르지 않습니다.')
    localStorage.setItem(HISTORY_KEY, JSON.stringify(value))
    return value
  } catch {
    const cached = readCache(HISTORY_KEY, isHistoryDataset)
    if (cached) return cached
    const bundled = await fetchJson(new URL('./data/history.json', window.location.href).toString())
    if (!isHistoryDataset(bundled)) throw new Error('내장 역대 회차 데이터가 올바르지 않습니다.')
    return bundled
  }
}

export async function syncWinnerStores(round: number, latestRound: number): Promise<WinnerStoreDataset> {
  const cacheKey = `lucky45.winners.${round}`
  try {
    const value = await fetchJson(`${RAW_ROOT}/data/winners/${String(round).padStart(4, '0')}.json`)
    if (!isWinnerDataset(value, round)) throw new Error('당첨점 데이터가 올바르지 않습니다.')
    localStorage.setItem(cacheKey, JSON.stringify(value))
    return value
  } catch {
    const cached = readCache(cacheKey, (value): value is WinnerStoreDataset => isWinnerDataset(value, round))
    if (cached) return cached
    if (round !== latestRound) throw new Error('네트워크 연결 후 과거 당첨점을 확인할 수 있습니다.')
    const bundled = await fetchJson(new URL('./data/latest-winners.json', window.location.href).toString())
    if (!isWinnerDataset(bundled, round)) throw new Error('내장 당첨점 데이터가 올바르지 않습니다.')
    return bundled
  }
}

export async function syncStores(): Promise<StoreDataset> {
  try {
    const value = await fetchJson(`${RAW_ROOT}/public/data/stores.json`)
    if (!isStoreDataset(value)) throw new Error('판매점 데이터가 올바르지 않습니다.')
    localStorage.setItem(STORES_KEY, JSON.stringify(value))
    return value
  } catch {
    const cached = readCache(STORES_KEY, isStoreDataset)
    if (cached) return cached
    const bundled = await fetchJson(new URL('./data/stores.json', window.location.href).toString())
    if (!isStoreDataset(bundled)) throw new Error('내장 판매점 데이터가 올바르지 않습니다.')
    return bundled
  }
}
