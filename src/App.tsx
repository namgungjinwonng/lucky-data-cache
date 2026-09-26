// 통계 추천·역대 당첨점·주변 판매점 지도를 제공하는 LUCKY 45 모바일 앱 화면
import { useEffect, useMemo, useState } from 'react'
import { StoreMap } from './components/StoreMap'
import { JACKPOT_ODDS, rankCombinations } from './core/analysis'
import { type DrawSyncResult, syncLatestDraw } from './core/draw-data'
import { type HistoryDataset, type WinnerStoreDataset, syncHistoryDataset, syncWinnerStores } from './core/history-data'
import { ballTone } from './core/lotto'

type AppMenu = 'ranking' | 'history' | 'nearby'
type Theme = 'light' | 'dark'

const THEME_KEY = 'lucky45.theme'

function readTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function NumberBall({ number, compact = false }: { number: number; compact?: boolean }) {
  return <span className={`number-ball number-ball--${ballTone(number)} ${compact ? 'number-ball--compact' : ''}`}>{number}</span>
}

function App() {
  const [menu, setMenu] = useState<AppMenu>('ranking')
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [drawResult, setDrawResult] = useState<DrawSyncResult | null>(null)
  const [history, setHistory] = useState<HistoryDataset | null>(null)
  const [selectedRound, setSelectedRound] = useState(0)
  const [winnerStores, setWinnerStores] = useState<WinnerStoreDataset | null>(null)
  const [winnerStatus, setWinnerStatus] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    let active = true
    Promise.allSettled([syncLatestDraw(), syncHistoryDataset()]).then(([latestResult, historyResult]) => {
      if (!active) return
      if (latestResult.status === 'fulfilled') setDrawResult(latestResult.value)
      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value)
        setSelectedRound(historyResult.value.draws[0].round)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (menu !== 'history' || !history || selectedRound < 1) return
    let active = true
    setWinnerStores(null)
    setWinnerStatus('당첨 판매점을 불러오고 있습니다.')
    syncWinnerStores(selectedRound, history.draws[0].round)
      .then((dataset) => {
        if (!active) return
        setWinnerStores(dataset)
        setWinnerStatus(dataset.stores.length > 0 ? '' : '이 회차의 당첨 판매점 정보가 없습니다.')
      })
      .catch((error: unknown) => {
        if (active) setWinnerStatus(error instanceof Error ? error.message : '당첨 판매점을 불러오지 못했습니다.')
      })
    return () => { active = false }
  }, [history, menu, selectedRound])

  const rankings = useMemo(() => history ? rankCombinations(history.draws) : [], [history])
  const selectedDraw = useMemo(() => history?.draws.find((draw) => draw.round === selectedRound) ?? null, [history, selectedRound])
  const latestRound = history?.draws[0].round ?? drawResult?.draw.round ?? 0

  const moveRound = (delta: number) => {
    setSelectedRound((round) => Math.min(latestRound, Math.max(1, round + delta)))
  }

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LUCKY 45 홈">
          <span className="brand__mark">L45</span>
          <span className="brand__wordmark">LUCKY 45</span>
        </a>
        <div className="theme-switch" role="group" aria-label="화면 테마 선택">
          <button className={theme === 'light' ? 'is-active' : ''} type="button" onClick={() => setTheme('light')}>LIGHT</button>
          <button className={theme === 'dark' ? 'is-active' : ''} type="button" onClick={() => setTheme('dark')}>DARK</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero__line" aria-hidden="true" />
        <div className="hero__eyebrow">RACING FOR LUCK</div>
        <h1>데이터로<br />고른 행운</h1>
        <p>역대 {history ? history.draws.length.toLocaleString('ko-KR') : '—'}개 회차의 패턴을 정밀하게 비교한 이번 주 스타팅 그리드.</p>
        <div className="hero__meter" aria-hidden="true"><span>01</span><div><i /></div><span>45</span></div>
      </section>

      <section className="latest-band" aria-live="polite">
        <div>
          <span className="section-label">LATEST RESULT</span>
          <h2>{loading ? '데이터 동기화 중' : drawResult ? `${drawResult.draw.round}회` : '오프라인'}</h2>
          <p>{drawResult ? `${drawResult.draw.date} · ${drawResult.source === 'remote' ? '최신 데이터' : '저장 데이터'}` : '내장 데이터로 분석을 계속합니다.'}</p>
        </div>
        {drawResult && <div className="latest-band__numbers">
          {drawResult.draw.numbers.map((number) => <NumberBall key={number} number={number} compact />)}
          <span className="plus">+</span><NumberBall number={drawResult.draw.bonus} compact />
        </div>}
      </section>

      <nav className="app-menu" aria-label="주요 메뉴">
        <button className={menu === 'ranking' ? 'is-active' : ''} type="button" onClick={() => setMenu('ranking')}><span>01</span>추천 TOP 10</button>
        <button className={menu === 'history' ? 'is-active' : ''} type="button" onClick={() => setMenu('history')}><span>02</span>회차·당첨점</button>
        <button className={menu === 'nearby' ? 'is-active' : ''} type="button" onClick={() => setMenu('nearby')}><span>03</span>주변 판매점</button>
      </nav>

      {menu === 'ranking' && <>
        <section className="analysis-intro">
          <span className="section-label">NEXT · {latestRound ? latestRound + 1 : '—'} ROUND</span>
          <h2>패턴 적합도 순위</h2>
          <p>전체 빈도 24% · 최근 가중 빈도 27% · 번호 쌍 24% · 조합 형태 25%를 결합했습니다.</p>
          <div className="odds-notice"><strong>실제 1등 확률은 모두 동일</strong><span>1 / {JACKPOT_ODDS.toLocaleString('ko-KR')}</span><small>아래 점수는 과거 패턴과의 유사도이며 당첨확률이 아닙니다.</small></div>
        </section>

        <section className="results">
          <div className="section-heading section-heading--light"><div><span className="section-label">STARTING GRID</span><h2>추천 조합 10</h2></div><span className="results__count">WEEKLY FIXED</span></div>
          {rankings.length === 0 ? <p className="loading-copy">역대 데이터를 분석하고 있습니다.</p> : <div className="result-list">
            {rankings.map((item) => {
              const oddCount = item.numbers.filter((number) => number % 2 === 1).length
              return <article className="result-card" key={item.numbers.join('-')}>
                <div className="result-card__top"><span className="result-card__index">RANK {String(item.rank).padStart(2, '0')}</span><strong>{item.score.toFixed(1)}<small> PATTERN</small></strong></div>
                <div className="result-card__numbers">{item.numbers.map((number) => <NumberBall key={number} number={number} />)}</div>
                <div className="result-card__telemetry">
                  <span>합계 <b>{item.numbers.reduce((sum, number) => sum + number, 0)}</b></span>
                  <span>홀짝 참고 <b>{oddCount}:{6 - oddCount}</b></span>
                  <span>최근 <b>{item.components.recent}</b></span>
                  <span>번호쌍 <b>{item.components.pairs}</b></span>
                </div>
              </article>
            })}
          </div>}
        </section>
      </>}

      {menu === 'history' && <section className="history-browser">
        <div className="section-heading"><div><span className="section-label">DRAW ARCHIVE</span><h2>회차별 결과</h2></div><span className="results__count">1 — {latestRound || '—'}</span></div>
        <div className="round-control">
          <button type="button" onClick={() => moveRound(-1)} disabled={selectedRound <= 1}>←</button>
          <label><span>조회 회차</span><input type="number" min="1" max={latestRound} value={selectedRound || ''} onChange={(event) => setSelectedRound(Math.min(latestRound, Math.max(1, Number(event.target.value) || 1)))} /></label>
          <button type="button" onClick={() => moveRound(1)} disabled={selectedRound >= latestRound}>→</button>
        </div>
        {selectedDraw && <article className="draw-detail">
          <div><span>{selectedDraw.date}</span><h3>{selectedDraw.round}회 당첨번호</h3></div>
          <div className="draw-detail__numbers">{selectedDraw.numbers.map((number) => <NumberBall key={number} number={number} />)}<span className="plus plus--dark">+</span><NumberBall number={selectedDraw.bonus} /></div>
          <p>1등 {selectedDraw.winners.toLocaleString('ko-KR')}명 · 1인당 {selectedDraw.firstPrize.toLocaleString('ko-KR')}원</p>
        </article>}
        <div className="winner-heading"><h3>1·2등 당첨 판매점</h3>{winnerStores && <span>{winnerStores.stores.reduce((sum, store) => sum + store.winCount, 0)}건</span>}</div>
        {winnerStatus && <p className="status-message">{winnerStatus}</p>}
        {winnerStores && <div className="winner-list">{winnerStores.stores.map((store) => <article key={`${store.id}-${store.rank}-${store.method}`}>
          <span className={`winner-rank winner-rank--${store.rank}`}>{store.rank}등</span>
          <div><h4>{store.name}{store.winCount > 1 && ` ×${store.winCount}`}</h4><p>{store.address}</p><small>{store.method || '선택 방식 미표기'}{store.phone ? ` · ${store.phone}` : ''}</small></div>
        </article>)}</div>}
      </section>}

      {menu === 'nearby' && <section className="nearby-section">
        <div className="section-heading"><div><span className="section-label">NEARBY GARAGE</span><h2>내 주변 판매점</h2></div></div>
        <p className="section-description">전국 공식 판매점 좌표를 현재 위치와 비교해 가까운 순으로 보여줍니다.</p>
        <StoreMap />
      </section>}

      <footer>
        <span className="brand__mark">L45</span>
        <p>패턴 점수는 당첨을 예측하거나 보장하지 않습니다. 복권은 계획적으로 즐겨주세요.</p>
        <small>19세 미만 구매 불가 · 데이터 출처 동행복권 · 지도 Kakao Maps 또는 OpenStreetMap</small>
      </footer>
    </main>
  )
}

export default App
