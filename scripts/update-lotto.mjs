// 공식 동행복권 응답을 검증해 앱이 사용하는 최신 회차 JSON으로 변환하는 자동 갱신기
import { writeFile } from 'node:fs/promises'

const SOURCE_URL = 'https://dhlottery.co.kr/selectMainInfo.do'
const OUTPUT_PATH = new URL('../public/data/latest.json', import.meta.url)

function formatDate(value) {
  if (!/^\d{8}$/.test(value)) throw new Error(`올바르지 않은 추첨일 형식입니다: ${value}`)
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function normalizeDraw(draw) {
  const numbers = [
    draw.tm1WnNo,
    draw.tm2WnNo,
    draw.tm3WnNo,
    draw.tm4WnNo,
    draw.tm5WnNo,
    draw.tm6WnNo,
  ]

  if (
    !Number.isInteger(draw.ltEpsd) ||
    numbers.length !== 6 ||
    new Set(numbers).size !== 6 ||
    numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 45) ||
    !Number.isInteger(draw.bnsWnNo) ||
    numbers.includes(draw.bnsWnNo)
  ) {
    throw new Error('공식 응답의 회차 또는 당첨번호가 올바르지 않습니다.')
  }

  return {
    schemaVersion: 1,
    round: draw.ltEpsd,
    date: formatDate(draw.ltRflYmd),
    numbers: numbers.sort((a, b) => a - b),
    bonus: draw.bnsWnNo,
    firstPrize: draw.rnk1WnAmt,
    winners: draw.rnk1WnNope,
    sourceUpdatedAt: new Date().toISOString(),
  }
}

const response = await fetch(SOURCE_URL, {
  headers: {
    accept: 'application/json',
    'user-agent': 'Lucky45DataUpdater/1.0',
  },
})

if (!response.ok) {
  throw new Error(`동행복권 데이터 요청 실패: ${response.status}`)
}

const payload = await response.json()
const draws = payload?.data?.result?.pstLtEpstInfo?.lt645

if (!Array.isArray(draws) || draws.length === 0) {
  throw new Error('동행복권 응답에서 최신 로또 회차를 찾지 못했습니다.')
}

const latest = draws.reduce((current, draw) => (draw.ltEpsd > current.ltEpsd ? draw : current))
const normalized = normalizeDraw(latest)

await writeFile(OUTPUT_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
console.log(`${normalized.round}회 데이터를 저장했습니다.`)
