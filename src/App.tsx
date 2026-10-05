// 통계 추천·역대 당첨점·주변 판매점 지도를 제공하는 LUCKY 45 모바일 앱 화면
import { useEffect, useMemo, useState } from 'react'
import { RecommendationCarousel } from './components/RecommendationCarousel'
import { StoreMap } from './components/StoreMap'
import { JACKPOT_ODDS, rankRecommendationSets } from './core/analysis'
import { type DrawSyncResult, syncLatestDraw } from './core/draw-data'
import { type HistoryDataset, type WinnerStoreDataset, syncHistoryDataset, syncWinnerStores } from './core/history-data'
import { ballTone } from './core/lotto'
import { createRecommendationSnapshot, evaluateRecommendationHistory, readRecommendationHistory, saveLegacyRecommendationSnapshot, saveRecommendationSnapshot, type RecommendationCategory, type RecommendationSnapshot } from './core/recommendation-history'

type AppMenu = 'ranking' | 'history' | 'nearby'
type Theme = 'light' | 'dark'
type RecommendationTab = RecommendationCategory | 'records'

const THEME_KEY = 'lucky45.theme'
const CATEGORY_LABELS: Record<RecommendationCategory, string> = { top: '상위', bottom: '하위', mixed: '혼합' }

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
  const [recommendationTab, setRecommendationTab] = useState<RecommendationTab>('top')
  const [recommendationHistory, setRecommendationHistory] = useState<RecommendationSnapshot[]>(readRecommendationHistory)

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

  const recommendationSets = useMemo(() => history ? rankRecommendationSets(history.draws) : null, [history])
  const selectedDraw = useMemo(() => history?.draws.find((draw) => draw.round === selectedRound) ?? null, [history, selectedRound])
  const latestRound = history?.draws[0].round ?? drawResult?.draw.round ?? 0
  const recommendationOutcomes = useMemo(
    () => evaluateRecommendationHistory(recommendationHistory, history?.draws ?? []),
    [history, recommendationHistory],
  )

  useEffect(() => {
    if (!history || !recommendationSets) return
    const sourceRound = history.draws[0].round
    const snapshot = createRecommendationSnapshot(recommendationSets, sourceRound + 1, sourceRound)
    let nextHistory = saveRecommendationSnapshot(snapshot)
    if (sourceRound >= 1244) {
      const backtestDraws = history.draws.filter((draw) => draw.round <= 1243)
      const legacy = createRecommendationSnapshot(rankRecommendationSets(backtestDraws), 1244, 1243, new Date().toISOString(), 'legacy')
      legacy.games = legacy.games.filter((game) => game.category === 'top')
      nextHistory = saveLegacyRecommendationSnapshot(legacy)
    }
    setRecommendationHistory(nextHistory)
  }, [history, recommendationSets])

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
        <button className={menu === 'ranking' ? 'is-active' : ''} type="button" onClick={() => setMenu('ranking')}><span>01</span>추천 20</button>
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
          <div className="section-heading section-heading--light"><div><span className="section-label">STARTING GRID</span><h2>추천 조합 20</h2></div><span className="results__count">5 GAMES / PAGE</span></div>
          <div className="recommendation-tabs" role="tablist" aria-label="추천 조합 분류">
            <button className={recommendationTab === 'top' ? 'is-active' : ''} type="button" role="tab" onClick={() => setRecommendationTab('top')}>상위 10</button>
            <button className={recommendationTab === 'bottom' ? 'is-active' : ''} type="button" role="tab" onClick={() => setRecommendationTab('bottom')}>하위 5</button>
            <button className={recommendationTab === 'mixed' ? 'is-active' : ''} type="button" role="tab" onClick={() => setRecommendationTab('mixed')}>혼합 5</button>
            <button className={recommendationTab === 'records' ? 'is-active' : ''} type="button" role="tab" onClick={() => setRecommendationTab('records')}>당첨 이력</button>
          </div>
          {recommendationTab === 'mixed' && <p className="recommendation-description">상위·하위 조합에 나온 번호 중 과거 패턴 점수가 높은 번호를 우선해 새로 조합합니다.</p>}
          {!recommendationSets ? <p className="loading-copy">역대 데이터를 분석하고 있습니다.</p> : recommendationTab !== 'records' ? <RecommendationCarousel
            combinations={recommendationSets[recommendationTab]}
            rankLabel={recommendationTab === 'top' ? 'RANK' : recommendationTab === 'bottom' ? 'LOW' : 'MIX'}
          /> : <div className="recommendation-history">
            <div className="recommendation-summary">
              <span>추천 조합 누적 당첨금</span>
              <strong>{recommendationOutcomes.totalPrize.toLocaleString('ko-KR')}원</strong>
              <small>완료 {recommendationOutcomes.completedRounds}회 · 당첨 {recommendationOutcomes.winningGames}게임</small>
            </div>
            <p className="recommendation-history__notice">앱에서 실제로 생성한 추천 기록의 계산 결과이며 복권 구매·수령 여부와는 별개입니다.</p>
            {recommendationOutcomes.rounds.length === 0 ? <p className="loading-copy">저장된 추천 이력이 없습니다.</p> : recommendationOutcomes.rounds.map((round, roundIndex) => <details className="recommendation-round" open={roundIndex === 0} key={round.snapshot.targetRound}>
              <summary>
                <span><b>{round.snapshot.targetRound}회 추천 {round.snapshot.kind === 'legacy' && <em>기존 상위 10</em>}</b><small>{round.snapshot.kind === 'legacy' ? `${round.snapshot.sourceRound}회까지의 데이터로 생성한 기존 추천` : `${new Date(round.snapshot.generatedAt).toLocaleDateString('ko-KR')} 생성`}</small></span>
                <strong>{round.draw ? `${round.totalPrize.toLocaleString('ko-KR')}원` : '추첨 전'}</strong>
              </summary>
              <div className="recommendation-round__games">{round.games.map((game) => <div className="recommendation-history-game" key={`${game.category}-${game.index}`}>
                <span className="recommendation-history-game__label">{CATEGORY_LABELS[game.category]} {String(game.index).padStart(2, '0')}</span>
                <div>{game.numbers.map((number) => {
                  const mainMatched = round.draw?.numbers.includes(number) ?? false
                  const bonusMatched = round.draw?.bonus === number
                  return <i
                    className={mainMatched || bonusMatched ? `is-match number-ball--${ballTone(number)} ${bonusMatched ? 'is-bonus-match' : ''}` : ''}
                    title={mainMatched ? '당첨번호 일치' : bonusMatched ? '보너스번호 일치' : undefined}
                    key={number}
                  >{number}</i>
                })}</div>
                <strong>{!round.draw ? '추첨 전' : game.rank ? `${game.rank}등 · ${(game.prize ?? 0).toLocaleString('ko-KR')}원` : `미당첨 · ${game.matchCount}개 일치`}</strong>
              </div>)}</div>
            </details>)}
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
