// 공식 동행복권의 회차·당첨점·판매점 데이터를 검증해 GitHub 배포 파일로 갱신하는 스크립트
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const BASE_URL = 'https://www.dhlottery.co.kr'
const MAIN_URL = `${BASE_URL}/selectMainInfo.do`
const HISTORY_URL = `${BASE_URL}/lt645/selectPstLt645InfoNew.do`
const WINNER_URL = `${BASE_URL}/wnprchsplcsrch/selectLtWnShp.do`
const STORE_URL = `${BASE_URL}/prchsplcsrch/selectLtShp.do`
const LATEST_PATH = new URL('../public/data/latest.json', import.meta.url)
const HISTORY_PATH = new URL('../public/data/history.json', import.meta.url)
const STORES_PATH = new URL('../public/data/stores.json', import.meta.url)
const LATEST_WINNERS_PATH = new URL('../public/data/latest-winners.json', import.meta.url)
const WINNERS_DIR = new URL('../data/winners/', import.meta.url)
const USER_AGENT = 'Lucky45DataUpdater/2.0'
const CONCURRENCY = 8

function formatDate(value) {
  if (!/^\d{8}$/.test(value)) throw new Error(`올바르지 않은 추첨일 형식입니다: ${value}`)
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function normalizeDraw(draw) {
  const numbers = [draw.tm1WnNo, draw.tm2WnNo, draw.tm3WnNo, draw.tm4WnNo, draw.tm5WnNo, draw.tm6WnNo]
  if (
    !Number.isInteger(draw.ltEpsd) ||
    new Set(numbers).size !== 6 ||
    numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 45) ||
    !Number.isInteger(draw.bnsWnNo) ||
    numbers.includes(draw.bnsWnNo)
  ) throw new Error(`공식 응답의 ${draw.ltEpsd ?? '알 수 없는'}회 번호가 올바르지 않습니다.`)

  return {
    round: draw.ltEpsd,
    date: formatDate(draw.ltRflYmd),
    numbers: numbers.sort((a, b) => a - b),
    bonus: draw.bnsWnNo,
    firstPrize: Number(draw.rnk1WnAmt) || 0,
    winners: Number(draw.rnk1WnNope) || 0,
  }
}

async function fetchJson(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    if (attempt >= 3) throw new Error(`${url} 요청 실패: ${error.message}`)
    await new Promise((resolve) => setTimeout(resolve, attempt * 800))
    return fetchJson(url, attempt + 1)
  }
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function mapConcurrent(values, worker) {
  let nextIndex = 0
  const results = new Array(values.length)
  const runners = Array.from({ length: Math.min(CONCURRENCY, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(values[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

async function fetchLatest() {
  const payload = await fetchJson(MAIN_URL)
  const draws = payload?.data?.result?.pstLtEpstInfo?.lt645
  if (!Array.isArray(draws) || draws.length === 0) throw new Error('최신 로또 회차를 찾지 못했습니다.')
  return normalizeDraw(draws.reduce((current, draw) => (draw.ltEpsd > current.ltEpsd ? draw : current)))
}

function validateHistory(draws, latestRound) {
  if (draws.length !== latestRound) throw new Error(`역대 회차 수가 맞지 않습니다: ${draws.length}/${latestRound}`)
  const rounds = new Set(draws.map((draw) => draw.round))
  for (let round = 1; round <= latestRound; round += 1) {
    if (!rounds.has(round)) throw new Error(`${round}회 데이터가 누락됐습니다.`)
  }
}

async function updateHistory(latest) {
  const existing = await readJson(HISTORY_PATH, { draws: [] })
  const drawMap = new Map((existing.draws ?? []).map((draw) => [draw.round, draw]))
  const previousLatest = drawMap.get(latest.round)
  const hasDrawChanges = !previousLatest || JSON.stringify(previousLatest) !== JSON.stringify(latest)
  const missing = Array.from({ length: latest.round }, (_, index) => index + 1).filter((round) => !drawMap.has(round))
  const centers = missing.length > 0
    ? Array.from({ length: Math.ceil(latest.round / 10) }, (_, index) => Math.min(latest.round, (index + 1) * 10))
    : [latest.round]

  const batches = await mapConcurrent(centers, async (center, index) => {
    const payload = await fetchJson(`${HISTORY_URL}?srchDir=center&srchLtEpsd=${center}`)
    if ((index + 1) % 20 === 0) console.log(`역대 회차 ${index + 1}/${centers.length} 묶음 수집`)
    return payload?.data?.list ?? []
  })
  batches.flat().map(normalizeDraw).forEach((draw) => drawMap.set(draw.round, draw))
  drawMap.set(latest.round, latest)

  const stillMissing = Array.from({ length: latest.round }, (_, index) => index + 1).filter((round) => !drawMap.has(round))
  if (stillMissing.length > 0) {
    console.log(`묶음 경계에서 빠진 ${stillMissing.length}개 회차를 다시 수집합니다: ${stillMissing.join(', ')}`)
    const retries = await mapConcurrent(stillMissing, async (round) => {
      const payload = await fetchJson(`${HISTORY_URL}?srchDir=center&srchLtEpsd=${round}`)
      return payload?.data?.list ?? []
    })
    retries.flat().map(normalizeDraw).forEach((draw) => drawMap.set(draw.round, draw))
  }

  const draws = [...drawMap.values()].filter((draw) => draw.round <= latest.round).sort((a, b) => b.round - a.round)
  validateHistory(draws, latest.round)
  const sourceUpdatedAt = missing.length > 0 || hasDrawChanges || !existing.sourceUpdatedAt
    ? new Date().toISOString()
    : existing.sourceUpdatedAt
  const dataset = { schemaVersion: 1, sourceUpdatedAt, draws }
  await writeJson(HISTORY_PATH, dataset)
  return dataset
}

function normalizeWinnerStore(item) {
  const rank = Number(item.wnShpRnk)
  if (![1, 2].includes(rank)) return null
  return {
    id: String(item.ltShpId),
    name: String(item.shpNm).trim(),
    address: String(item.shpAddr ?? '').trim(),
    phone: item.shpTelno && item.shpTelno !== '0000' ? String(item.shpTelno) : '',
    rank,
    method: String(item.atmtPsvYnTxt ?? '').trim(),
    lat: Number(item.shpLat) || null,
    lon: Number(item.shpLot) || null,
  }
}

function aggregateWinnerStores(items) {
  const grouped = new Map()
  items.map(normalizeWinnerStore).filter(Boolean).forEach((store) => {
    const key = `${store.id}-${store.rank}-${store.method}`
    const current = grouped.get(key)
    grouped.set(key, current ? { ...current, winCount: current.winCount + 1 } : { ...store, winCount: 1 })
  })
  return [...grouped.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'ko'))
}

async function updateWinnerStores(latestRound) {
  await mkdir(WINNERS_DIR, { recursive: true })
  const missingRounds = []
  for (let round = 1; round <= latestRound; round += 1) {
    const path = new URL(`${String(round).padStart(4, '0')}.json`, WINNERS_DIR)
    if (!(await readJson(path))) missingRounds.push(round)
  }

  console.log(`당첨 판매점 ${missingRounds.length}개 회차를 수집합니다.`)
  await mapConcurrent(missingRounds, async (round, index) => {
    const params = new URLSearchParams({ srchWnShpRnk: 'all', srchLtEpsd: String(round), srchShpLctn: '' })
    const payload = await fetchJson(`${WINNER_URL}?${params}`)
    const dataset = { schemaVersion: 1, round, sourceUpdatedAt: new Date().toISOString(), stores: aggregateWinnerStores(payload?.data?.list ?? []) }
    await writeJson(new URL(`${String(round).padStart(4, '0')}.json`, WINNERS_DIR), dataset)
    if ((index + 1) % 50 === 0) console.log(`당첨 판매점 ${index + 1}/${missingRounds.length} 회차 수집`)
  })

  const latestDataset = await readJson(new URL(`${String(latestRound).padStart(4, '0')}.json`, WINNERS_DIR))
  if (!latestDataset) throw new Error('최신 회차 당첨 판매점 파일이 없습니다.')
  await writeJson(LATEST_WINNERS_PATH, latestDataset)
}

function normalizeStore(item) {
  const lat = Number(item.shpLat)
  const lon = Number(item.shpLot)
  if (!item.ltShpId || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 32 || lat > 39.5 || lon < 124 || lon > 132) return null
  return {
    id: String(item.ltShpId),
    name: String(item.conmNm ?? '').trim(),
    address: String(item.bplcRdnmDaddr ?? '').trim(),
    phone: item.shpTelno ? String(item.shpTelno) : '',
    lat,
    lon,
  }
}

async function updateStores() {
  const existing = await readJson(STORES_PATH)
  const updatedAt = existing?.sourceUpdatedAt ? new Date(existing.sourceUpdatedAt).getTime() : 0
  if (existing?.stores?.length > 0 && Date.now() - updatedAt < 28 * 24 * 60 * 60 * 1000) {
    console.log(`전국 판매점 ${existing.stores.length}곳은 아직 최신입니다.`)
    return
  }

  const baseParams = {
    l645LtNtslYn: 'Y', l520LtNtslYn: 'N', st5LtNtslYn: 'N', st10LtNtslYn: 'N', st20LtNtslYn: 'N',
    cpexUsePsbltyYn: 'N', pageCount: '5', recordCountPerPage: '10', srchCtpvNm: '', srchSggNm: '',
  }
  const first = await fetchJson(`${STORE_URL}?${new URLSearchParams({ ...baseParams, pageNum: '1' })}`)
  const total = Number(first?.data?.total)
  if (!Number.isInteger(total) || total < 1) throw new Error('전국 판매점 수를 확인하지 못했습니다.')
  const pages = Math.ceil(total / 10)
  const remaining = Array.from({ length: pages - 1 }, (_, index) => index + 2)
  console.log(`전국 판매점 ${total}곳, ${pages}페이지를 수집합니다.`)
  const responses = await mapConcurrent(remaining, async (page, index) => {
    const payload = await fetchJson(`${STORE_URL}?${new URLSearchParams({ ...baseParams, pageNum: String(page) })}`)
    if ((index + 1) % 100 === 0) console.log(`전국 판매점 ${index + 1}/${remaining.length}페이지 수집`)
    return payload?.data?.list ?? []
  })
  const storeMap = new Map([...(first.data.list ?? []), ...responses.flat()].map(normalizeStore).filter(Boolean).map((store) => [store.id, store]))
  if (storeMap.size < total * 0.9) throw new Error(`판매점 수집률이 낮습니다: ${storeMap.size}/${total}`)
  await writeJson(STORES_PATH, { schemaVersion: 1, sourceUpdatedAt: new Date().toISOString(), stores: [...storeMap.values()].sort((a, b) => a.id.localeCompare(b.id)) })
}

const latest = await fetchLatest()
const history = await updateHistory(latest)
await writeJson(LATEST_PATH, { schemaVersion: 1, ...latest, sourceUpdatedAt: history.sourceUpdatedAt })
await updateWinnerStores(latest.round)
await updateStores()
console.log(`${latest.round}회까지 번호·당첨점·전국 판매점 데이터를 저장했습니다.`)
