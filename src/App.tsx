// 럭셔리 모터스포츠 분위기의 로또 번호 생성 화면과 상호작용을 제공하는 컴포넌트
import { useEffect, useMemo, useState } from 'react'
import { type DrawSyncResult, syncLatestDraw } from './core/draw-data'
import { ballTone, generateGames } from './core/lotto'

type SelectionMode = 'fixed' | 'excluded'

interface SavedRun {
  id: string
  createdAt: string
  games: number[][]
}

const HISTORY_KEY = 'lucky45.history'

function NumberBall({ number, compact = false }: { number: number; compact?: boolean }) {
  return (
    <span className={`number-ball number-ball--${ballTone(number)} ${compact ? 'number-ball--compact' : ''}`}>
      {number}
    </span>
  )
}

function readHistory(): SavedRun[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(value) ? (value as SavedRun[]).slice(0, 5) : []
  } catch {
    return []
  }
}

function App() {
  const [gameCount, setGameCount] = useState(1)
  const [mode, setMode] = useState<SelectionMode>('fixed')
  const [fixed, setFixed] = useState<number[]>([])
  const [excluded, setExcluded] = useState<number[]>([])
  const [games, setGames] = useState<number[][]>(() => generateGames({ count: 1 }))
  const [history, setHistory] = useState<SavedRun[]>(readHistory)
  const [drawResult, setDrawResult] = useState<DrawSyncResult | null>(null)
  const [drawLoading, setDrawLoading] = useState(true)
  const [message, setMessage] = useState('조건을 정하고 스타트 버튼을 눌러보세요.')

  useEffect(() => {
    let active = true
    syncLatestDraw()
      .then((result) => {
        if (active) setDrawResult(result)
      })
      .finally(() => {
        if (active) setDrawLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const selectionLabel = useMemo(() => {
    if (fixed.length === 0 && excluded.length === 0) return '완전 자동 모드'
    return `고정 ${fixed.length} · 제외 ${excluded.length}`
  }, [excluded.length, fixed.length])

  const toggleNumber = (number: number) => {
    if (mode === 'fixed') {
      if (fixed.includes(number)) {
        setFixed(fixed.filter((value) => value !== number))
        return
      }
      if (fixed.length >= 6) {
        setMessage('고정수는 최대 6개까지 선택할 수 있습니다.')
        return
      }
      setFixed([...fixed, number].sort((a, b) => a - b))
      setExcluded(excluded.filter((value) => value !== number))
      return
    }

    if (excluded.includes(number)) {
      setExcluded(excluded.filter((value) => value !== number))
      return
    }
    if (45 - excluded.length <= 6 - fixed.length) {
      setMessage('번호를 만들 수 있도록 선택 가능한 번호를 남겨주세요.')
      return
    }
    setExcluded([...excluded, number].sort((a, b) => a - b))
    setFixed(fixed.filter((value) => value !== number))
  }

  const runGenerator = () => {
    try {
      const nextGames = generateGames({ count: gameCount, fixed, excluded })
      setGames(nextGames)
      setMessage(`${gameCount}게임의 스타팅 그리드가 준비됐습니다.`)
      navigator.vibrate?.(35)

      const nextHistory = [
        { id: crypto.randomUUID(), createdAt: new Date().toISOString(), games: nextGames },
        ...history,
      ].slice(0, 5)
      setHistory(nextHistory)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '번호 생성에 실패했습니다.')
    }
  }

  const resetSelection = () => {
    setFixed([])
    setExcluded([])
    setMessage('선택 조건을 초기화했습니다.')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LUCKY 45 홈">
          <span className="brand__mark">L45</span>
          <span className="brand__wordmark">LUCKY 45</span>
        </a>
        <span className="topbar__edition">SEOUL · 2026</span>
      </header>

      <section className="hero" id="top">
        <div className="hero__line" aria-hidden="true" />
        <div className="hero__eyebrow">RACING FOR LUCK</div>
        <h1>
          행운의
          <br />
          스타팅 그리드
        </h1>
        <p>여섯 개의 숫자에서 시작하는 가장 짜릿한 주말.</p>
        <div className="hero__meter" aria-hidden="true">
          <span>01</span>
          <div><i /></div>
          <span>45</span>
        </div>
      </section>

      <section className="latest-band" aria-live="polite">
        <div>
          <span className="section-label">LATEST RESULT</span>
          <h2>{drawLoading ? '데이터 동기화 중' : drawResult ? `${drawResult.draw.round}회` : '오프라인'}</h2>
          <p>
            {drawResult
              ? `${drawResult.draw.date} · ${drawResult.source === 'remote' ? '최신 데이터' : '저장 데이터'}`
              : '번호 생성 기능은 정상적으로 사용할 수 있습니다.'}
          </p>
        </div>
        {drawResult && (
          <div className="latest-band__numbers">
            {drawResult.draw.numbers.map((number) => <NumberBall key={number} number={number} compact />)}
            <span className="plus">+</span>
            <NumberBall number={drawResult.draw.bonus} compact />
          </div>
        )}
      </section>

      <section className="garage">
        <div className="section-heading">
          <div>
            <span className="section-label">01 · RACE SETUP</span>
            <h2>게임 설정</h2>
          </div>
          <span className="selection-status">{selectionLabel}</span>
        </div>

        <div className="game-count" aria-label="게임 수 선택">
          {[1, 2, 3, 4, 5].map((count) => (
            <button
              className={gameCount === count ? 'is-active' : ''}
              key={count}
              type="button"
              onClick={() => setGameCount(count)}
            >
              <strong>{String(count).padStart(2, '0')}</strong>
              <span>GAME</span>
            </button>
          ))}
        </div>

        <div className="mode-switch" role="group" aria-label="번호 선택 방식">
          <button className={mode === 'fixed' ? 'is-active' : ''} type="button" onClick={() => setMode('fixed')}>
            고정수 선택
          </button>
          <button className={mode === 'excluded' ? 'is-active' : ''} type="button" onClick={() => setMode('excluded')}>
            제외수 선택
          </button>
          <button type="button" onClick={resetSelection}>초기화</button>
        </div>

        <div className="number-grid">
          {Array.from({ length: 45 }, (_, index) => index + 1).map((number) => {
            const isFixed = fixed.includes(number)
            const isExcluded = excluded.includes(number)
            return (
              <button
                className={`${isFixed ? 'is-fixed' : ''} ${isExcluded ? 'is-excluded' : ''}`}
                key={number}
                type="button"
                onClick={() => toggleNumber(number)}
                aria-pressed={isFixed || isExcluded}
                aria-label={`${number}번 ${isFixed ? '고정수' : isExcluded ? '제외수' : '선택 안 됨'}`}
              >
                {number}
              </button>
            )
          })}
        </div>

        <button className="start-button" type="button" onClick={runGenerator}>
          <span>START YOUR LUCK</span>
          <span aria-hidden="true">→</span>
        </button>
        <p className="status-message" role="status">{message}</p>
      </section>

      <section className="results">
        <div className="section-heading section-heading--light">
          <div>
            <span className="section-label">02 · STARTING GRID</span>
            <h2>행운의 번호</h2>
          </div>
          <span className="results__count">{games.length} ENTRIES</span>
        </div>

        <div className="result-list">
          {games.map((game, gameIndex) => {
            const oddCount = game.filter((number) => number % 2 === 1).length
            return (
              <article className="result-card" key={`${gameIndex}-${game.join('-')}`}>
                <div className="result-card__index">GRID {String(gameIndex + 1).padStart(2, '0')}</div>
                <div className="result-card__numbers">
                  {game.map((number) => <NumberBall key={number} number={number} />)}
                </div>
                <div className="result-card__telemetry">
                  <span>합계 <b>{game.reduce((sum, number) => sum + number, 0)}</b></span>
                  <span>홀짝 <b>{oddCount}:{6 - oddCount}</b></span>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="history-section">
        <div className="section-heading">
          <div>
            <span className="section-label">03 · PIT LOG</span>
            <h2>최근 기록</h2>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="empty-history">번호를 생성하면 최근 기록 5개를 기기에 보관합니다.</p>
        ) : (
          <div className="history-list">
            {history.map((run) => (
              <article key={run.id}>
                <time>{new Date(run.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
                <span>{run.games.map((game) => game.join(' · ')).join(' / ')}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span className="brand__mark">L45</span>
        <p>무작위 번호 생성은 당첨을 보장하지 않습니다. 복권은 계획적으로 즐겨주세요.</p>
        <small>19세 미만 구매 불가 · 데이터 출처 동행복권</small>
      </footer>
    </main>
  )
}

export default App
