// Kakao Maps 또는 OpenStreetMap으로 현재 위치 주변 판매점과 역대 당첨 횟수를 보여주는 컴포넌트
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { syncStores } from '../core/history-data'
import { nearestStores, type NearbyStore } from '../core/location'

interface Position {
  lat: number
  lon: number
}

let kakaoMapsPromise: Promise<KakaoMapsApi> | null = null

function loadKakaoMaps(appKey: string) {
  if (window.kakao?.maps) {
    return new Promise<KakaoMapsApi>((resolve) => window.kakao?.maps.load(() => resolve(window.kakao!.maps)))
  }
  if (kakaoMapsPromise) return kakaoMapsPromise
  kakaoMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`
    script.async = true
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('Kakao Maps SDK가 초기화되지 않았습니다.'))
        return
      }
      window.kakao.maps.load(() => resolve(window.kakao!.maps))
    }
    script.onerror = () => reject(new Error('Kakao Maps SDK를 불러오지 못했습니다.'))
    document.head.appendChild(script)
  })
  return kakaoMapsPromise
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}

function winSummary(store: NearbyStore) {
  return `1등 ${store.rank1Wins}회 · 2등 ${store.rank2Wins}회`
}

export function StoreMap() {
  const mapElement = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const [stores, setStores] = useState<NearbyStore[]>([])
  const [status, setStatus] = useState('위치 권한을 허용하면 가까운 판매점 20곳을 찾습니다.')
  const [loading, setLoading] = useState(false)
  const [mapProvider, setMapProvider] = useState('지도 준비 중')

  const findNearby = () => {
    if (!navigator.geolocation) {
      setStatus('이 기기에서는 위치 기능을 사용할 수 없습니다.')
      return
    }
    setLoading(true)
    setStatus('현재 위치와 판매점 데이터를 확인하고 있습니다.')
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const dataset = await syncStores()
          const current = { lat: coords.latitude, lon: coords.longitude }
          setPosition(current)
          setStores(nearestStores(dataset.stores, current.lat, current.lon, 20))
          setStatus(`${dataset.stores.length.toLocaleString('ko-KR')}개 판매점에서 가까운 순으로 찾았습니다.`)
        } catch (error) {
          setStatus(error instanceof Error ? error.message : '판매점 데이터를 불러오지 못했습니다.')
        } finally {
          setLoading(false)
        }
      },
      (error) => {
        setLoading(false)
        setStatus(error.code === error.PERMISSION_DENIED ? '위치 권한이 필요합니다. 기기 설정에서 허용해주세요.' : '현재 위치를 확인하지 못했습니다.')
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 300_000 },
    )
  }

  useEffect(() => {
    if (!mapElement.current || !position || stores.length === 0) return
    let active = true
    const element = mapElement.current
    const kakaoKey = import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim()

    const renderOpenStreetMap = () => {
      if (!active) return
      leafletMap.current?.remove()
      element.replaceChildren()
      const map = L.map(element, { zoomControl: true }).setView([position.lat, position.lon], 14)
      leafletMap.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
      L.circleMarker([position.lat, position.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#da291c', fillOpacity: 1 }).bindPopup('현재 위치').addTo(map)
      stores.forEach((store, index) => {
        const content = document.createElement('div')
        const title = document.createElement('strong')
        title.textContent = store.name
        content.append(title, document.createElement('br'), document.createTextNode(store.address), document.createElement('br'), document.createTextNode(`${store.distanceKm.toFixed(1)}km · ${winSummary(store)}`))
        L.circleMarker([store.lat, store.lon], { radius: index < 5 ? 8 : 6, color: '#181818', weight: 2, fillColor: '#da291c', fillOpacity: 1 }).bindPopup(content).addTo(map)
      })
      setMapProvider('OpenStreetMap')
    }

    const renderKakaoMap = async () => {
      if (!kakaoKey) {
        renderOpenStreetMap()
        return
      }
      try {
        leafletMap.current?.remove()
        leafletMap.current = null
        const maps = await loadKakaoMaps(kakaoKey)
        if (!active) return
        element.replaceChildren()
        const map = new maps.Map(element, { center: new maps.LatLng(position.lat, position.lon), level: 4 })
        const currentMarker = new maps.Marker({ map, position: new maps.LatLng(position.lat, position.lon), title: '현재 위치' })
        const currentInfo = new maps.InfoWindow({ content: '<div class="kakao-info">현재 위치</div>' })
        maps.event.addListener(currentMarker, 'click', () => currentInfo.open(map, currentMarker))
        stores.forEach((store) => {
          const marker = new maps.Marker({ map, position: new maps.LatLng(store.lat, store.lon), title: store.name })
          const content = `<div class="kakao-info"><strong>${escapeHtml(store.name)}</strong><br>${escapeHtml(store.address)}<br>${store.distanceKm.toFixed(1)}km · ${winSummary(store)}</div>`
          const info = new maps.InfoWindow({ content, removable: true })
          maps.event.addListener(marker, 'click', () => info.open(map, marker))
        })
        setMapProvider('Kakao Maps')
      } catch {
        renderOpenStreetMap()
        setStatus('Kakao 지도 연결에 실패해 OpenStreetMap으로 표시합니다.')
      }
    }

    void renderKakaoMap()
    return () => {
      active = false
      leafletMap.current?.remove()
      leafletMap.current = null
    }
  }, [position, stores])

  return (
    <div className="store-map-panel">
      <button className="start-button" type="button" onClick={findNearby} disabled={loading}>
        <span>{loading ? '위치 확인 중' : '내 위치로 판매점 찾기'}</span><span aria-hidden="true">◎</span>
      </button>
      <p className="status-message" role="status">{status}</p>
      {position && <><div className="map-provider">MAP DATA · {mapProvider}</div><div className="store-map" ref={mapElement} aria-label="내 주변 로또 판매점 지도" /></>}
      {stores.length > 0 && <div className="nearby-list">
        {stores.map((store, index) => <article key={store.id}>
          <span className="nearby-list__rank">{String(index + 1).padStart(2, '0')}</span>
          <div><h3>{store.name}</h3><p>{store.address}</p><div className="winner-counts"><span>1등 {store.rank1Wins}회</span><span>2등 {store.rank2Wins}회</span></div>{store.phone && <a href={`tel:${store.phone}`}>{store.phone}</a>}</div>
          <strong>{store.distanceKm < 1 ? `${Math.round(store.distanceKm * 1000)}m` : `${store.distanceKm.toFixed(1)}km`}</strong>
        </article>)}
      </div>}
      <p className="map-privacy">위치는 기기에서 거리 계산에만 사용됩니다. 지도 표시 시 선택된 지도 제공자에 현재 지도 영역이 요청됩니다.</p>
    </div>
  )
}
