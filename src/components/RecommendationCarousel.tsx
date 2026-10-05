// 추천 조합을 다섯 게임씩 묶어 좌우 스와이프로 보여주는 결과 캐러셀
import { useEffect, useRef, useState } from 'react'
import type { RankedCombination } from '../core/analysis'
import { ballTone } from '../core/lotto'

interface RecommendationCarouselProps {
  combinations: RankedCombination[]
  rankLabel: string
}

function NumberBall({ number }: { number: number }) {
  return <span className={`number-ball number-ball--${ballTone(number)}`}>{number}</span>
}

export function RecommendationCarousel({ combinations, rankLabel }: RecommendationCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const pages = Array.from({ length: Math.ceil(combinations.length / 5) }, (_, index) => combinations.slice(index * 5, index * 5 + 5))

  useEffect(() => {
    setPage(0)
    viewportRef.current?.scrollTo({ left: 0 })
  }, [combinations, rankLabel])

  const moveToPage = (index: number) => {
    const next = Math.min(pages.length - 1, Math.max(0, index))
    viewportRef.current?.scrollTo({ left: viewportRef.current.clientWidth * next, behavior: 'smooth' })
    setPage(next)
  }

  return <div className="recommendation-carousel">
    <div
      className="recommendation-carousel__viewport"
      ref={viewportRef}
      onScroll={(event) => {
        const width = event.currentTarget.clientWidth
        if (width > 0) setPage(Math.round(event.currentTarget.scrollLeft / width))
      }}
    >
      {pages.map((group, pageIndex) => <div className="recommendation-page" key={`${rankLabel}-${pageIndex}`} aria-label={`${pageIndex + 1}페이지`}>
        {group.map((item) => {
          const oddCount = item.numbers.filter((number) => number % 2 === 1).length
          return <article className="result-card" key={item.numbers.join('-')}>
            <div className="result-card__top"><span className="result-card__index">{rankLabel} {String(item.rank).padStart(2, '0')}</span><strong>{item.score.toFixed(1)}<small> PATTERN</small></strong></div>
            <div className="result-card__numbers">{item.numbers.map((number) => <NumberBall key={number} number={number} />)}</div>
            <div className="result-card__telemetry">
              <span>합계 <b>{item.numbers.reduce((sum, number) => sum + number, 0)}</b></span>
              <span>홀짝 참고 <b>{oddCount}:{6 - oddCount}</b></span>
              <span>최근 <b>{item.components.recent}</b></span>
              <span>번호쌍 <b>{item.components.pairs}</b></span>
            </div>
          </article>
        })}
      </div>)}
    </div>
    {pages.length > 1 && <div className="recommendation-carousel__controls" aria-label="추천 조합 페이지 선택">
      <button type="button" onClick={() => moveToPage(page - 1)} disabled={page === 0} aria-label="이전 5게임">←</button>
      <div>{pages.map((_, index) => <button className={page === index ? 'is-active' : ''} type="button" onClick={() => moveToPage(index)} aria-label={`${index + 1}페이지`} key={index} />)}</div>
      <button type="button" onClick={() => moveToPage(page + 1)} disabled={page === pages.length - 1} aria-label="다음 5게임">→</button>
    </div>}
    <p className="swipe-hint">{pages.length > 1 ? `좌우로 밀어 다음 5게임 보기 · ${page + 1}/${pages.length}` : '5게임'}</p>
  </div>
}
